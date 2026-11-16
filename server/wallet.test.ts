// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { defineTestApp } from "convex-test";
import schema from "../convex/schema.js";
import * as moneyModule from "../convex/money.js";
import * as payments from "../convex/payments.js";
import type { Id } from "../convex/_generated/dataModel.js";

let brain: typeof import("./brain.js");
let hub: typeof import("./hub.js");
let wallet: typeof import("./wallet.js");
let money: typeof import("./money.js");

const testApp = defineTestApp({ schema }).defineModules({ money: moneyModule, payments });
const { api } = testApp;
let t: ReturnType<typeof testApp.createTest>;
const seen: string[] = [];
const potMoves: string[] = [];
let trap: ((name: string) => void) | null = null;

beforeAll(async () => {
  process.env.NICKEL_DATA_DIR = mkdtempSync(tmpdir() + "/nickel-wallet-");
  brain = await import("./brain.js");
  hub = await import("./hub.js");
  wallet = await import("./wallet.js");
  money = await import("./money.js");
  t = testApp.createTest();
  money.useMoneyBackend({
    query: (name, args) => t.query(makeFunctionReference<"query", any, any>(name), args),
    action: (name, args) => t.action(makeFunctionReference<"action", any, any>(name), args),
    mutation: async (name, args) => {
      seen.push(name);
      trap?.(name);
      if (name === "payments:potMove") potMoves.push(String(args.key));
      return t.mutation(makeFunctionReference<"mutation", any, any>(name), args);
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  trap = null;
});

const BASE = "https://nickel.test";
const turn = (text: string, sender = "Sritej") => brain.handleTurn({ text, sender, baseUrl: BASE + "/" });
const potId = (reply: { card?: { path: string } }) => reply.card!.path.slice(3).split("?")[0];
const at = (iso: string) => Date.parse(iso);
const clock = (iso: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at(iso)); };
const played = (name: string, iso: string) => brain.internals.store.results.push({ roundId: "wordle-212", name, line: name + " solved it.", at: at(iso) });

const phones: Record<string, string> = {};
const player = (name: string) => {
  phones[name] ??= "+1555010" + String(Object.keys(phones).length).padStart(4, "0");
  return { token: brain.profileFor(phones[name], name).token, name, phone: phones[name] };
};
const idOf = async (name: string) => (await t.mutation(api.payments.ensurePlayer, { phone: player(name).phone, name })) as Id<"players">;
let events = 0;
const fund = async (name: string, cents: number) => {
  const playerId = await idOf(name);
  await t.mutation(api.payments.setLimit, { playerId, dailyLimitCents: 50000, consent: true });
  const id = "msg_" + ++events;
  await t.mutation(testApp.internal.payments.handleWhopEvent, { eventId: id, payload: JSON.stringify({ id, type: "payment.succeeded", data: { id: "pay_" + events, currency: "usd", total: { amount: (cents / 100).toFixed(2), currency: "usd" }, metadata: { playerId, amountCents: cents, kind: "top_up" } } }) });
};
const walletOf = async (name: string) => t.query(api.payments.wallet, { playerId: await idOf(name) });
const balanceOf = async (name: string) => (await walletOf(name)).balanceCents;
const pay = async (id: string, name: string) => {
  const request = new Request(BASE + "/api/pot/" + id, { method: "POST", headers: { host: "nickel.test", "content-type": "application/json" }, body: JSON.stringify({ action: "pay" }) });
  const res = (await money.walletRoute(request, player(name), BASE))!;
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};
const openPot = async (proposer: string, members: string[]) => {
  const id = potId(turn("Nickel, $5 buy-in", proposer));
  for (const name of members) {
    await fund(name, 500);
    expect((await pay(id, name)).body.ok).toBe(true);
  }
  return id;
};
const movesFor = (id: string) => wallet.pendingPotMoves().filter((m) => m.potId === id);

describe("wallet card in chat", () => {
  it("answers add, top up and load with a wallet card and never shows a balance", () => {
    const add = turn("Nickel, add $5", "Dev");
    expect(add.line).toBe("Dev, tap the card to add $5 to your wallet.");
    expect(add.url).toBe("https://nickel.test/wallet?add=500");
    expect(add.card).toEqual({ kicker: "WALLET \u00b7 CUPERTINO DAY ONES", title: "Add $5", sub: "Your Nickel balance. Buy-ins and stakes come out of it.", path: "/wallet?add=500" });
    expect(turn("nickel top up 5", "Dev").card!.path).toBe("/wallet?add=500");
    expect(turn("Nickel, load $2", "Dev").card!.path).toBe("/wallet?add=200");
    expect(turn("Nickel, deposit 2.50", "Dev").card!.path).toBe("/wallet?add=250");
    const big = turn("Nickel, add $600", "Dev");
    expect(big.line).toBe("Top-ups run from $1 to $500 at a time.");
    expect(big.card!.path).toBe("/wallet");
    const mine = turn("Nickel, my wallet", "Dev");
    expect(mine.line).toBe("Dev, your balance is in your wallet. Add $1 or more at a time.");
    expect(mine.card).toMatchObject({ title: "Your wallet", path: "/wallet" });
    expect(seen).toEqual([]);
  });

  it("sends cash outs to the wallet page without moving money", () => {
    for (const text of ["Nickel, cash out $20", "Nickel, withdraw 4", "Nickel, cash out everything"]) {
      const out = turn(text, "Peyton");
      expect(out.line).toBe("Peyton, cash out from your wallet. Whop checks your ID the first time.");
      expect(out.url).toBe("https://nickel.test/wallet?cashout=1");
      expect(out.card).toMatchObject({ title: "Cash out", path: "/wallet?cashout=1" });
    }
    expect(wallet.walletCard(0, true).path).toBe("/wallet?cashout=1");
    expect(seen).toEqual([]);
  });
});

describe("buy-ins from the wallet", () => {
  it("does not mark a short wallet paid, then pays once it is funded", async () => {
    const id = potId(turn("Nickel, $5 buy-in", "Peyton"));
    const agree = turn("Nickel, I'm in", "Dev");
    expect(agree.line).toBe("Dev is in. Tap the card to pay $5 from your Nickel balance. 2 in, $10 pot.");
    expect(agree.card!.path).toBe("/p/" + id + "?u=dev");
    expect(brain.getPot(id)!.members).toEqual({ Peyton: "in", Dev: "in" });
    await fund("Dev", 200);
    const short = await pay(id, "Dev");
    expect(short.status).toBe(402);
    expect(short.body).toMatchObject({ ok: false, reason: "balance", shortCents: 300, error: "Not enough in your Nickel balance. Add money in your wallet." });
    expect(brain.getPot(id)!.members).toEqual({ Peyton: "in", Dev: "in" });
    expect(await balanceOf("Dev")).toBe(200);
    await fund("Dev", 500);
    const paid = await pay(id, "Dev");
    expect(paid.status).toBe(200);
    expect(paid.body.pot.members).toEqual({ Peyton: "in", Dev: "paid" });
    expect(paid.body.pot.paidAt.Dev).toEqual(expect.any(Number));
    expect(await balanceOf("Dev")).toBe(200);
    expect((await pay(id, "Dev")).body.ok).toBe(true);
    expect(await balanceOf("Dev")).toBe(200);
    expect(turn("Nickel, I'm in", "Dev").line).toBe("Dev already paid. 2 in, $10 pot.");
    expect((await walletOf("Dev")).activity.filter((a) => a.reason === "buyin")).toMatchObject([{ amountCents: -500, note: "Cupertino Day Ones" }]);
    expect((await pay("pot-nope", "Dev")).status).toBe(404);
  });

  it("refunds every paid buy-in when the proposer cancels, and nobody who only agreed", async () => {
    const id = brain.internals.store.latestPot!;
    await fund("Peyton", 500);
    expect((await pay(id, "Peyton")).body.ok).toBe(true);
    expect(await balanceOf("Peyton")).toBe(0);
    turn("Nickel, I'm in", "Alex");
    expect(turn("Nickel, cancel the pot", "Dev").line).toBe("Only Peyton can cancel this pot.");
    expect(movesFor(id)).toEqual([]);
    expect(turn("Nickel, cancel the pot", "Peyton").line).toBe("The $5 pot is cancelled. Peyton and Dev each get $5 back in the wallet.");
    expect(movesFor(id).map((m) => [m.key, m.cents, m.kind])).toEqual([["refund:" + id + ":Peyton", 500, "refund"], ["refund:" + id + ":Dev", 500, "refund"]]);
    await wallet.flushPotMoves();
    expect(movesFor(id)).toEqual([]);
    expect(await balanceOf("Peyton")).toBe(500);
    expect(await balanceOf("Dev")).toBe(700);
    expect((await walletOf("Dev")).activity[0]).toMatchObject({ reason: "refund", amountCents: 500, note: "Refund, $5 buy-in cancelled" });
    expect(turn("Nickel, cancel the pot", "Peyton").line).toBe("There is no open pot to cancel.");
    expect(wallet.cancelPot(id, "Peyton")).toEqual({ ok: false, error: "That pot is already cancelled." });
    expect((await pay(id, "Dev")).status).toBe(409);
    expect(hub.settlePot(id)).toEqual({ ok: false, error: "Already settled" });
    await wallet.flushPotMoves();
    expect(await balanceOf("Dev")).toBe(700);
    expect(potMoves.filter((k) => k.startsWith("refund:" + id))).toHaveLength(2);
    expect(wallet.failedPotMoves()).toEqual([]);
    expect(wallet.potView(id)).toMatchObject({ cancelled: true, forfeitCents: 0, forfeits: [] });
  });

  it("pays a pot win into the same wallet, once", async () => {
    const round = potId(turn("Nickel, challenge Dev", "Peyton"));
    brain.recordResult(round, { name: "Peyton", won: true, score: "2-0" } as Parameters<typeof brain.recordResult>[1]);
    const id = potId(turn("Nickel, $5 buy-in", "Peyton"));
    expect(turn("Nickel, I'm in", "Dev").line).toBe("Dev is in. Tap the card to pay $5 from your Nickel balance. 2 in, $10 pot.");
    for (const name of ["Peyton", "Dev"]) expect((await pay(id, name)).body.ok).toBe(true);
    expect(await balanceOf("Peyton")).toBe(0);
    expect(hub.settlePot(id)).toMatchObject({ ok: true, payout: { name: "Peyton", amountCents: 1000, reason: "Won the $10 pot", potId: id } });
    await wallet.flushPotMoves();
    expect(await balanceOf("Peyton")).toBe(1000);
    expect((await walletOf("Peyton")).activity[0]).toMatchObject({ reason: "win", amountCents: 1000, note: "Won the $10 pot" });
    expect(hub.settlePot(id)).toEqual({ ok: false, error: "Already settled" });
    await wallet.flushPotMoves();
    expect(await balanceOf("Peyton")).toBe(1000);
    expect(potMoves.filter((k) => k === "win:" + id)).toHaveLength(1);
    expect(hub.hub(null).people.find((p) => p.name === "Peyton")).toMatchObject({ wonCents: 1000 });
    expect(turn("Nickel, balances").line).toBe("Pot winnings: Peyton $10. Balances stay private in each wallet.");
  });
});

describe("pot money outbox", () => {
  it("keeps a move queued while Convex throws, then lands it once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await openPot("Gil", ["Gil"]);
    trap = (name) => { if (name === "payments:potMove") throw new Error("Convex is down"); };
    expect(wallet.cancelPot(id, "Gil").ok).toBe(true);
    await wallet.flushPotMoves();
    await wallet.flushPotMoves();
    expect(movesFor(id).map((m) => m.key)).toEqual(["refund:" + id + ":Gil"]);
    expect(wallet.failedPotMoves()).toEqual([]);
    expect(await balanceOf("Gil")).toBe(0);
    trap = null;
    await wallet.flushPotMoves();
    expect(movesFor(id)).toEqual([]);
    expect(await balanceOf("Gil")).toBe(500);
    vi.restoreAllMocks();
  });

  it("records refusals once and does not retry them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const id = potId(turn("Nickel, $5 buy-in", "Hal"));
    player("Hal");
    brain.joinPot(id, "Hal", "paid");
    expect(wallet.cancelPot(id, "Hal").ok).toBe(true);
    wallet.creditWin("Nobody", 300, "Won the $3 pot", id);
    wallet.creditWin("Nobody", 300, "Won the $3 pot", id);
    expect(movesFor(id).map((m) => m.key)).toEqual(["refund:" + id + ":Hal", "win:" + id]);
    await wallet.flushPotMoves();
    await wallet.flushPotMoves();
    expect(movesFor(id)).toEqual([]);
    expect(wallet.failedPotMoves().map((m) => [m.key, m.failed])).toEqual([["refund:" + id + ":Hal", "stake"], ["win:" + id, "player"]]);
    const before = potMoves.length;
    await wallet.flushPotMoves();
    expect(potMoves).toHaveLength(before);
    expect(await balanceOf("Hal")).toBe(0);
    vi.restoreAllMocks();
  });
});

describe("midnight forfeits", () => {
  it("moves an idle buy-in to the one who played, once, and charges a rejoin again", async () => {
    clock("2026-03-10T20:00:00Z");
    const id = await openPot("Abe", ["Abe", "Ida"]);
    played("Abe", "2026-03-10T21:00:00Z");
    expect(wallet.sweepForfeits(at("2026-03-11T06:30:00Z"))).toEqual([]);
    const swept = wallet.sweepForfeits(at("2026-03-11T08:30:00Z"));
    expect(swept).toEqual([{ day: "2026-03-10", out: ["Ida"], shares: { Abe: 500 }, keptCents: 0, line: "Ida did not play yesterday. Ida's $5 went to Abe." }]);
    expect(movesFor(id)).toEqual([{ key: "forfeit:" + id + ":2026-03-10:Abe", potId: id, name: "Abe", cents: 500, kind: "forfeit", note: "Collected from Ida, who did not play yesterday" }]);
    await wallet.flushPotMoves();
    expect(await balanceOf("Abe")).toBe(500);
    expect(await balanceOf("Ida")).toBe(0);
    expect((await walletOf("Abe")).activity[0]).toMatchObject({ reason: "win", amountCents: 500, note: "Collected from Ida, who did not play yesterday" });
    expect(brain.getPot(id)!.members).toEqual({ Abe: "paid" });
    expect(wallet.sweepForfeits(at("2026-03-11T08:31:00Z"))).toEqual([]);
    expect(wallet.sweepForfeits(at("2026-03-11T23:00:00Z"))).toEqual([]);
    await wallet.flushPotMoves();
    expect(await balanceOf("Abe")).toBe(500);
    expect(potMoves.filter((k) => k.startsWith("forfeit:" + id))).toHaveLength(1);
    expect(wallet.potView(id)!.forfeits).toHaveLength(1);
    expect(wallet.withForfeitNews({ addressed: false })).toEqual({ addressed: false });
    expect(wallet.withForfeitNews({ addressed: true, line: "Hi." }).line).toBe("Ida did not play yesterday. Ida's $5 went to Abe. Hi.");
    expect(wallet.withForfeitNews({ addressed: true, line: "Hi." }).line).toBe("Hi.");
    vi.setSystemTime(at("2026-03-11T20:00:00Z"));
    expect(turn("Nickel, I'm in", "Ida").line).toBe("Ida is in. Tap the card to pay $5 from your Nickel balance. 2 in, $10 pot.");
    expect((await pay(id, "Ida")).body).toMatchObject({ ok: false, reason: "balance", shortCents: 500 });
    await fund("Ida", 500);
    expect((await pay(id, "Ida")).body.ok).toBe(true);
    expect(await balanceOf("Ida")).toBe(0);
    expect(brain.getPot(id)!.members).toEqual({ Abe: "paid", Ida: "paid" });
  });

  it("splits one idle buy-in three ways and keeps the odd cents in the pot", async () => {
    clock("2026-04-10T20:00:00Z");
    const id = await openPot("Bea", ["Bea", "Cal", "Dot", "Eli"]);
    for (const name of ["Bea", "Cal", "Dot"]) played(name, "2026-04-10T22:00:00Z");
    const swept = wallet.sweepForfeits(at("2026-04-11T08:00:00Z"));
    expect(swept).toMatchObject([{ out: ["Eli"], shares: { Bea: 166, Cal: 166, Dot: 166 }, keptCents: 2, line: "Eli did not play yesterday. Eli's $5 went to Bea, Cal and Dot, $1.66 each. $0.02 stays in the pot." }]);
    await wallet.flushPotMoves();
    expect(await Promise.all(["Bea", "Cal", "Dot", "Eli"].map(balanceOf))).toEqual([166, 166, 166, 0]);
    expect(wallet.potView(id)).toMatchObject({ forfeitCents: 2, members: { Bea: "paid", Cal: "paid", Dot: "paid" } });
    expect(wallet.cancelPot(id, "Bea")).toEqual({ ok: false, error: "This pot holds forfeited money, so it cannot be cancelled. Settle it instead." });
    expect(hub.settlePot(id)).toMatchObject({ ok: true, payout: { amountCents: 1502 } });
  });

  it("caps what one player collects at their own buy-in", async () => {
    clock("2026-05-10T20:00:00Z");
    const id = await openPot("Fay", ["Fay", "Gus", "Hal", "Ivy"]);
    played("Fay", "2026-05-10T22:00:00Z");
    expect(wallet.sweepForfeits(at("2026-05-11T08:00:00Z"))).toMatchObject([{ out: ["Gus", "Hal", "Ivy"], shares: { Fay: 500 }, keptCents: 1000, line: "Gus, Hal and Ivy did not play yesterday. Their $5 buy-ins went to Fay. $10 stays in the pot." }]);
    expect(movesFor(id).map((m) => [m.name, m.cents])).toEqual([["Fay", 500]]);
    await wallet.flushPotMoves();
    expect(await balanceOf("Fay")).toBe(500);
    expect(wallet.potView(id)).toMatchObject({ forfeitCents: 1000, members: { Fay: "paid" } });
  });

  it("forfeits nothing when nobody played", async () => {
    clock("2026-06-10T20:00:00Z");
    const id = await openPot("Jo", ["Jo", "Kit"]);
    expect(wallet.sweepForfeits(at("2026-06-11T08:00:00Z"))).toEqual([]);
    expect(movesFor(id)).toEqual([]);
    expect(brain.getPot(id)!.members).toEqual({ Jo: "paid", Kit: "paid" });
    expect(await Promise.all(["Jo", "Kit"].map(balanceOf))).toEqual([0, 0]);
    expect((await walletOf("Jo")).activity.map((a) => a.reason)).toEqual(["buyin", "topup"]);
  });

  it("processes each missed day once after a long sleep", async () => {
    clock("2026-07-10T20:00:00Z");
    const id = await openPot("Lou", ["Lou", "Max", "Ned"]);
    for (const name of ["Lou", "Max"]) played(name, "2026-07-10T22:00:00Z");
    played("Lou", "2026-07-12T22:00:00Z");
    const swept = wallet.sweepForfeits(at("2026-07-14T08:00:00Z"));
    expect(swept.map((f) => [f.day, f.out, f.shares, f.line])).toEqual([
      ["2026-07-10", ["Ned"], { Lou: 250, Max: 250 }, "Ned did not play on 2026-07-10. Ned's $5 went to Lou and Max, $2.50 each."],
      ["2026-07-12", ["Max"], { Lou: 500 }, "Max did not play on 2026-07-12. Max's $5 went to Lou."],
    ]);
    await wallet.flushPotMoves();
    expect(await Promise.all(["Lou", "Max", "Ned"].map(balanceOf))).toEqual([750, 250, 0]);
    expect(brain.getPot(id)!.members).toEqual({ Lou: "paid" });
    expect(wallet.sweepForfeits(at("2026-07-14T08:00:00Z"))).toEqual([]);
    expect(wallet.sweepForfeits(at("2026-07-14T20:00:00Z"))).toEqual([]);
    await wallet.flushPotMoves();
    expect(await Promise.all(["Lou", "Max", "Ned"].map(balanceOf))).toEqual([750, 250, 0]);
    expect(potMoves.filter((k) => k.startsWith("forfeit:" + id))).toHaveLength(3);
  });
});
