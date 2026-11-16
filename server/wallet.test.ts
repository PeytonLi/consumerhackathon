// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let brain: typeof import("./brain.js");
let hub: typeof import("./hub.js");
let wallet: typeof import("./wallet.js");
beforeAll(async () => {
  delete process.env.STRIPE_SECRET_KEY;
  process.env.NICKEL_DATA_DIR = mkdtempSync(tmpdir() + "/nickel-wallet-");
  brain = await import("./brain.js");
  hub = await import("./hub.js");
  wallet = await import("./wallet.js");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.STRIPE_SECRET_KEY;
});

const turn = (text: string, sender = "Sritej") => brain.handleTurn({ text, sender, baseUrl: "https://nickel.test/" });
const potId = (reply: { card?: { path: string } }) => reply.card!.path.slice(3).split("?")[0];
const balanced = () => {
  const balances = (brain.internals.store as unknown as { balances: Record<string, number> }).balances;
  for (const [name, cents] of Object.entries(balances)) {
    expect(Number.isInteger(cents)).toBe(true);
    expect(cents).toBeGreaterThanOrEqual(0);
    expect(wallet.ledgerSum(name)).toBe(cents);
  }
};
const fund = (name: string, cents: number) => { for (let left = cents; left > 0; left -= 1000) expect(wallet.topUp(name, Math.min(left, 1000)).ok).toBe(true); };
const at = (iso: string) => Date.parse(iso);
const clock = (iso: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at(iso)); };
const played = (name: string, iso: string) => brain.internals.store.results.push({ roundId: "wordle-212", name, line: name + " solved it.", at: at(iso) });
const openPot = (proposer: string, members: string[]) => {
  const id = potId(turn("Nickel, $5 buy-in", proposer));
  for (const name of members) {
    fund(name, 500);
    expect(wallet.payBuyIn(id, name).ok).toBe(true);
  }
  return id;
};

describe("top-ups", () => {
  it("adds $1 to $10 at a time in whole cents and stops at the $50 cap", () => {
    expect(wallet.topUp("Maya", 99)).toEqual({ ok: false, error: "Top-ups run from $1 to $10 at a time." });
    expect(wallet.topUp("Maya", 1001).ok).toBe(false);
    expect(wallet.topUp("Maya", 250.5).ok).toBe(false);
    expect(wallet.topUp("", 500).ok).toBe(false);
    expect(wallet.topUp("Maya", 250)).toEqual({ ok: true, balanceCents: 250 });
    expect(hub.balanceOf("Maya")).toBe(250);
    fund("Maya", 4000);
    expect(wallet.topUp("Maya", 1000)).toEqual({ ok: false, error: "A wallet holds up to $50. You have $42.50, so you can add up to $7.50." });
    expect(wallet.topUp("Maya", 750).ok).toBe(true);
    expect(wallet.topUp("Maya", 100)).toEqual({ ok: false, error: "A wallet holds up to $50. You have $50, so it is full." });
    expect(wallet.ledgerOf("Maya").every((e) => e.type === "topup" && e.reason && e.at > 0)).toBe(true);
    balanced();
  });

  it("answers add, top up and load with the wallet card", () => {
    const add = turn("Nickel, add $5", "Dev");
    expect(add.line).toBe("Dev, tap the card to add $5 to your wallet. You have $0 now. Demo mode, no card is charged.");
    expect(add.url).toBe("https://nickel.test/wallet?u=dev&add=500");
    expect(add.card).toMatchObject({ kicker: "WALLET \u00b7 CUPERTINO DAY ONES", title: "$0 in your wallet", path: "/wallet?u=dev&add=500" });
    expect(turn("nickel top up 5", "Dev").card!.path).toBe("/wallet?u=dev&add=500");
    expect(turn("Nickel, load $2", "Dev").card!.path).toBe("/wallet?u=dev&add=200");
    expect(turn("Nickel, add $20", "Dev").line).toBe("Top-ups run from $1 to $10 at a time.");
    expect(turn("Nickel, add $5", "Maya").line).toBe("A wallet holds up to $50. You have $50, so it is full.");
    expect(turn("Nickel, my wallet", "Dev").line).toBe("Dev, you have $0 in your wallet. Add $1 to $10 at a time.");
    expect(turn("Nickel, add $5", "").line).toBe("Tell me your name first: Nickel, I'm Sritej.");
    expect(hub.balanceOf("Dev")).toBe(0);
    expect(turn("Nickel, my balance", "Maya").line).toBe("Maya, your balance is $50. It stays on the Nickel ledger.");
  });

  it("credits a paid Stripe session once and nothing else", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const sessions: Record<string, object> = {
      cs_test_paid: { id: "cs_test_paid", payment_status: "paid", amount_total: 500, currency: "usd", metadata: { kind: "wallet", member: "Alex" } },
      cs_test_open: { id: "cs_test_open", payment_status: "unpaid", amount_total: 500, currency: "usd", metadata: { kind: "wallet", member: "Alex" } },
      cs_test_pot: { id: "cs_test_pot", payment_status: "paid", amount_total: 500, currency: "usd", metadata: { pot: "pot-abc12", member: "Alex" } },
      cs_test_big: { id: "cs_test_big", payment_status: "paid", amount_total: 5000, currency: "usd", metadata: { kind: "wallet", member: "Alex" } },
    };
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => { calls.push(url); return Response.json(sessions[url.split("/").pop()!] ?? { error: {} }); });
    expect(await wallet.confirmTopUp("cs_test_open")).toBe(false);
    expect(await wallet.confirmTopUp("cs_test_pot")).toBe(false);
    expect(await wallet.confirmTopUp("cs_test_big")).toBe(false);
    expect(await wallet.confirmTopUp("cs_test_missing")).toBe(false);
    expect(await wallet.confirmTopUp("not a session")).toBe(false);
    expect(hub.balanceOf("Alex")).toBe(0);
    expect(await Promise.all([wallet.confirmTopUp("cs_test_paid"), wallet.confirmTopUp("cs_test_paid"), wallet.confirmTopUp("cs_test_paid")])).toEqual([true, false, false]);
    expect(await wallet.confirmTopUp("cs_test_paid")).toBe(false);
    expect(hub.balanceOf("Alex")).toBe(500);
    expect(wallet.ledgerOf("Alex")).toMatchObject([{ type: "topup", amountCents: 500, sessionId: "cs_test_paid" }]);
    expect(calls.every((u) => u.startsWith("https://api.stripe.com/v1/checkout/sessions/cs_test_"))).toBe(true);
    balanced();
  });
});

describe("buy-ins from the wallet", () => {
  it("does not mark a short wallet paid, then pays once it is funded", () => {
    const id = potId(turn("Nickel, $5 buy-in", "Peyton"));
    wallet.topUp("Dev", 200);
    const short = turn("Nickel, I'm in", "Dev");
    expect(short.line).toBe("Dev, your wallet is $3 short of the $5 buy-in. You have $2. Add money, then say you are in again.");
    expect(short.card!.path).toBe("/wallet?u=dev&add=300");
    expect(short.pay).toBeUndefined();
    expect(brain.getPot(id)!.members).toEqual({ Peyton: "in", Dev: "in" });
    expect(wallet.payBuyIn(id, "Dev")).toMatchObject({ ok: false, shortCents: 300, balanceCents: 200 });
    expect(hub.balanceOf("Dev")).toBe(200);
    wallet.topUp("Dev", 500);
    const paid = turn("Nickel, I'm in", "Dev");
    expect(paid.line).toBe("Dev is in and paid $5 from the wallet. 2 in, $10 pot. $2 left in the wallet.");
    expect(paid.url).toMatch(/\/p\/pot-[a-z0-9]+\?u=dev$/);
    expect(brain.getPot(id)!.members).toEqual({ Peyton: "in", Dev: "paid" });
    expect(turn("Nickel, I'm in", "Dev").line).toBe("Dev already paid. 2 in, $10 pot.");
    expect(wallet.payBuyIn(id, "Dev")).toMatchObject({ ok: true, balanceCents: 200 });
    expect(hub.balanceOf("Dev")).toBe(200);
    expect(wallet.ledgerOf("Dev").filter((e) => e.type === "buyin")).toMatchObject([{ amountCents: -500, potId: id, reason: "$5 buy-in" }]);
    expect(wallet.payBuyIn("pot-nope", "Dev").ok).toBe(false);
    balanced();
  });

  it("refunds every paid buy-in when the proposer cancels", () => {
    const id = brain.internals.store.latestPot!;
    wallet.topUp("Peyton", 500);
    expect(wallet.payBuyIn(id, "Peyton").ok).toBe(true);
    expect(hub.balanceOf("Peyton")).toBe(0);
    expect(turn("Nickel, cancel the pot", "Dev").line).toBe("Only Peyton can cancel this pot.");
    expect(hub.balanceOf("Dev")).toBe(200);
    expect(turn("Nickel, cancel the pot", "Peyton").line).toBe("The $5 pot is cancelled. Peyton and Dev each get $5 back in the wallet.");
    expect(hub.balanceOf("Peyton")).toBe(500);
    expect(hub.balanceOf("Dev")).toBe(700);
    expect(wallet.ledgerOf("Dev").at(-1)).toMatchObject({ type: "refund", amountCents: 500, potId: id });
    expect(turn("Nickel, cancel the pot", "Peyton").line).toBe("There is no open pot to cancel.");
    expect(wallet.cancelPot(id, "Peyton")).toEqual({ ok: false, error: "That pot is already cancelled." });
    expect(wallet.payBuyIn(id, "Dev").ok).toBe(false);
    expect(hub.settlePot(id)).toEqual({ ok: false, error: "Already settled" });
    expect(hub.balanceOf("Dev")).toBe(700);
    expect(wallet.potView(id)).toMatchObject({ cancelled: true, forfeitCents: 0, forfeits: [] });
    balanced();
  });

  it("pays a pot win into the same wallet and lists the ledger on the hub", () => {
    const round = potId(turn("Nickel, challenge Dev", "Peyton"));
    brain.recordResult(round, { name: "Peyton", won: true, score: "2-0" } as Parameters<typeof brain.recordResult>[1]);
    const id = potId(turn("Nickel, $5 buy-in", "Peyton"));
    expect(turn("Nickel, I'm in", "Peyton").line).toBe("Peyton is in and paid $5 from the wallet. 1 in, $5 pot. $0 left in the wallet.");
    expect(turn("Nickel, I'm in", "Dev").line).toBe("Dev is in and paid $5 from the wallet. 2 in, $10 pot. $2 left in the wallet.");
    expect(hub.settlePot(id)).toMatchObject({ ok: true, balanceCents: 1000, payout: { name: "Peyton", amountCents: 1000 } });
    expect(wallet.ledgerOf("Peyton").at(-1)).toMatchObject({ type: "win", amountCents: 1000, reason: "Won the $10 pot", potId: id });
    const out = hub.hub({ token: "me-abc", name: "Peyton", face: null });
    expect(Object.keys(out).slice(-2)).toEqual(["walletLedger", "roster"]);
    expect(out.walletLedger.map((e) => e.type)).toEqual(["win", "buyin", "refund", "buyin", "topup"]);
    expect(hub.hub(null).walletLedger).toEqual([]);
    expect(wallet.walletView("Peyton")).toMatchObject({ name: "Peyton", balanceCents: 1000, limits: { minCents: 100, maxCents: 1000, capCents: 5000, quick: [100, 200, 500, 1000] } });
    balanced();
  });
});

describe("cash out", () => {
  it("debits at once as a pending simulated withdrawal and never overdraws", () => {
    expect(hub.balanceOf("Dev")).toBe(200);
    expect(wallet.withdraw("Dev", 201)).toEqual({ ok: false, error: "You have $2. You cannot cash out more than that." });
    expect(wallet.withdraw("Dev", 50).ok).toBe(false);
    expect(wallet.withdraw("Dev", -100).ok).toBe(false);
    expect(wallet.withdraw("Dev", 150.5).ok).toBe(false);
    expect(wallet.withdraw("Nobody", 100).ok).toBe(false);
    expect(hub.balanceOf("Dev")).toBe(200);
    expect([wallet.withdraw("Dev", 200).ok, wallet.withdraw("Dev", 200).ok]).toEqual([true, false]);
    expect(hub.balanceOf("Dev")).toBe(0);
    expect(wallet.ledgerOf("Dev").at(-1)).toMatchObject({ type: "withdrawal", amountCents: -200, status: "pending", simulated: true, reason: "Cash out $2, arrives in 1 to 2 days" });
    expect(wallet.ledgerOf("Dev").filter((e) => e.type === "withdrawal")).toHaveLength(1);
    balanced();
  });

  it("cashes out from the chat", () => {
    expect(turn("Nickel, cash out $20", "Peyton").line).toBe("Peyton, you have $10. You cannot cash out more than that.");
    const some = turn("Nickel, withdraw 4", "Peyton");
    expect(some.line).toBe("Peyton, cash out of $4 is on its way. It arrives in 1 to 2 days. $6 left in your wallet.");
    expect(some.card!.path).toBe("/wallet?u=peyton");
    expect(turn("Nickel, cash out everything", "Peyton").line).toBe("Peyton, cash out of $6 is on its way. It arrives in 1 to 2 days. $0 left in your wallet.");
    expect(turn("Nickel, cash out everything", "Peyton").line).toBe("Peyton, your wallet is empty. There is nothing to cash out.");
    expect(hub.balanceOf("Peyton")).toBe(0);
    balanced();
  });
});

describe("midnight forfeits", () => {
  it("moves an idle buy-in to the one who played, once", () => {
    clock("2026-03-10T20:00:00Z");
    const id = openPot("Abe", ["Abe", "Ida"]);
    played("Abe", "2026-03-10T21:00:00Z");
    expect(wallet.sweepForfeits(at("2026-03-11T06:30:00Z"))).toEqual([]);
    const swept = wallet.sweepForfeits(at("2026-03-11T08:30:00Z"));
    expect(swept).toEqual([{ day: "2026-03-10", out: ["Ida"], shares: { Abe: 500 }, keptCents: 0, line: "Ida did not play yesterday. Ida's $5 went to Abe." }]);
    expect(hub.balanceOf("Abe")).toBe(500);
    expect(hub.balanceOf("Ida")).toBe(0);
    expect(brain.getPot(id)!.members).toEqual({ Abe: "paid" });
    expect(wallet.ledgerOf("Ida").at(-1)).toMatchObject({ type: "forfeit_out", amountCents: 0, stakeCents: 500, potId: id });
    expect(wallet.ledgerOf("Abe").at(-1)).toMatchObject({ type: "forfeit_in", amountCents: 500, potId: id, reason: "Collected $5 from Ida, who did not play yesterday" });
    expect(wallet.sweepForfeits(at("2026-03-11T08:31:00Z"))).toEqual([]);
    expect(wallet.sweepForfeits(at("2026-03-11T23:00:00Z"))).toEqual([]);
    expect(hub.balanceOf("Abe")).toBe(500);
    expect(wallet.potView(id)!.forfeits).toHaveLength(1);
    expect(wallet.withForfeitNews({ addressed: false })).toEqual({ addressed: false });
    expect(wallet.withForfeitNews({ addressed: true, line: "Hi." }).line).toBe("Ida did not play yesterday. Ida's $5 went to Abe. Hi.");
    expect(wallet.withForfeitNews({ addressed: true, line: "Hi." }).line).toBe("Hi.");
    vi.setSystemTime(at("2026-03-11T20:00:00Z"));
    expect(turn("Nickel, I'm in", "Ida").line).toBe("Ida, your wallet is $5 short of the $5 buy-in. You have $0. Add money, then say you are in again.");
    fund("Ida", 500);
    expect(turn("Nickel, I'm in", "Ida").line).toBe("Ida is in and paid $5 from the wallet. 2 in, $10 pot. $0 left in the wallet.");
    balanced();
  });

  it("splits one idle buy-in three ways and keeps the odd cents in the pot", () => {
    clock("2026-04-10T20:00:00Z");
    const id = openPot("Bea", ["Bea", "Cal", "Dot", "Eli"]);
    for (const name of ["Bea", "Cal", "Dot"]) played(name, "2026-04-10T22:00:00Z");
    const swept = wallet.sweepForfeits(at("2026-04-11T08:00:00Z"));
    expect(swept).toMatchObject([{ out: ["Eli"], shares: { Bea: 166, Cal: 166, Dot: 166 }, keptCents: 2, line: "Eli did not play yesterday. Eli's $5 went to Bea, Cal and Dot, $1.66 each. $0.02 stays in the pot." }]);
    expect(["Bea", "Cal", "Dot", "Eli"].map(hub.balanceOf)).toEqual([166, 166, 166, 0]);
    expect(wallet.potView(id)).toMatchObject({ forfeitCents: 2, members: { Bea: "paid", Cal: "paid", Dot: "paid" } });
    expect(wallet.cancelPot(id, "Bea")).toEqual({ ok: false, error: "This pot holds forfeited money, so it cannot be cancelled. Settle it instead." });
    expect(hub.settlePot(id)).toMatchObject({ ok: true, payout: { amountCents: 1502 } });
    balanced();
  });

  it("caps what one player collects at their own buy-in", () => {
    clock("2026-05-10T20:00:00Z");
    const id = openPot("Fay", ["Fay", "Gus", "Hal", "Ivy"]);
    played("Fay", "2026-05-10T22:00:00Z");
    expect(wallet.sweepForfeits(at("2026-05-11T08:00:00Z"))).toMatchObject([{ out: ["Gus", "Hal", "Ivy"], shares: { Fay: 500 }, keptCents: 1000, line: "Gus, Hal and Ivy did not play yesterday. Their $5 buy-ins went to Fay. $10 stays in the pot." }]);
    expect(hub.balanceOf("Fay")).toBe(500);
    expect(wallet.potView(id)).toMatchObject({ forfeitCents: 1000, members: { Fay: "paid" } });
    balanced();
  });

  it("forfeits nothing when nobody played", () => {
    clock("2026-06-10T20:00:00Z");
    const id = openPot("Jo", ["Jo", "Kit"]);
    expect(wallet.sweepForfeits(at("2026-06-11T08:00:00Z"))).toEqual([]);
    expect(brain.getPot(id)!.members).toEqual({ Jo: "paid", Kit: "paid" });
    expect(["Jo", "Kit"].map(hub.balanceOf)).toEqual([0, 0]);
    expect(wallet.ledgerOf("Jo").map((e) => e.type)).toEqual(["topup", "buyin"]);
    balanced();
  });

  it("processes each missed day once after a long sleep", () => {
    clock("2026-07-10T20:00:00Z");
    const id = openPot("Lou", ["Lou", "Max", "Ned"]);
    for (const name of ["Lou", "Max"]) played(name, "2026-07-10T22:00:00Z");
    played("Lou", "2026-07-12T22:00:00Z");
    const swept = wallet.sweepForfeits(at("2026-07-14T08:00:00Z"));
    expect(swept.map((f) => [f.day, f.out, f.shares, f.line])).toEqual([
      ["2026-07-10", ["Ned"], { Lou: 250, Max: 250 }, "Ned did not play on 2026-07-10. Ned's $5 went to Lou and Max, $2.50 each."],
      ["2026-07-12", ["Max"], { Lou: 500 }, "Max did not play on 2026-07-12. Max's $5 went to Lou."],
    ]);
    expect(["Lou", "Max", "Ned"].map(hub.balanceOf)).toEqual([750, 250, 0]);
    expect(brain.getPot(id)!.members).toEqual({ Lou: "paid" });
    expect(wallet.sweepForfeits(at("2026-07-14T08:00:00Z"))).toEqual([]);
    expect(wallet.sweepForfeits(at("2026-07-14T20:00:00Z"))).toEqual([]);
    expect(["Lou", "Max", "Ned"].map(hub.balanceOf)).toEqual([750, 250, 0]);
    balanced();
  });
});
