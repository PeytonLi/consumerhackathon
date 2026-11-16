// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

let brain: typeof import("./brain.js");
let hub: typeof import("./hub.js");
let auth: typeof import("./auth.js");
let wallet: typeof import("./wallet.js");
let money: typeof import("./money.js");
beforeAll(async () => {
  process.env.NICKEL_DATA_DIR = mkdtempSync(tmpdir() + "/nickel-fixes-");
  brain = await import("./brain.js");
  hub = await import("./hub.js");
  auth = await import("./auth.js");
  wallet = await import("./wallet.js");
  money = await import("./money.js");
  money.useMoneyBackend(null);
});

const base = "https://nickel.test/";
const turn = (text: string, sender = "Sritej", extra = {}) => brain.handleTurn({ text, sender, baseUrl: base, ...extra });
const nickelsOf = (name: string) => brain.internals.store.nickels[name] ?? 0;

describe("fix pass", () => {
  it("answers pot talk with no open buy-in instead of a comeback", () => {
    const line = "No buy-in yet. Say: Nickel, $5 buy-in.";
    expect(turn("Nickel, I'm in", "Peyton")).toEqual({ addressed: true, line });
    expect(turn("Nickel, who paid", "Peyton").line).toBe(line);
    expect(turn("Nickel, who's in", "Peyton").line).toBe(line);
  });

  it("asks what to remember and does not store idle talk about remembering", () => {
    expect(hub.remember("<b>Alex</b> owes <i>everyone</i> boba", "Maya").text).toBe("Alex owes everyone boba");
    expect(turn("Nickel, remember", "Maya").line).toBe("Remember what? Say: Nickel, remember that Alex owes everyone boba.");
    const before = hub.groupMemory().length;
    expect(turn("Nickel, I can't remember who won", "Maya").line).not.toMatch(/^Noted/);
    expect(turn("Nickel, I don't remember the standings", "Maya").line).not.toMatch(/^Noted/);
    expect(hub.groupMemory()).toHaveLength(before);
  });

  it("takes the duel rival from the round, never from the posted result", () => {
    const id = turn("Nickel, challenge Maya", "Sritej").card!.path.slice(3);
    expect(brain.recordResult(id, { name: "Zed", opponent: "Sritej", won: true, score: "2-0" }).ok).toBe(false);
    expect(nickelsOf("Sritej")).toBe(0);
    expect(nickelsOf("Maya")).toBe(0);
    const before = nickelsOf("Dev");
    const out = brain.recordResult(id, { name: "Sritej", opponent: "Dev", won: true, score: "2-0" });
    expect(out.line).toMatch(/^Sritej beat Maya 2-0 at Rock Paper Scissors/);
    expect(nickelsOf("Dev")).toBe(before);
  });

  it("pits the challenged player against the challenger, not against themselves", () => {
    const id = turn("Nickel, challenge Dev", "Alex").card!.path.slice(3);
    const out = brain.recordResult(id, { name: "Dev", opponent: "Dev", won: true, score: "2-1" });
    expect(out.line).toMatch(/^Dev beat Alex 2-1 at Rock Paper Scissors/);
    expect(nickelsOf("Dev")).toBeGreaterThan(0);
    expect(nickelsOf("Alex")).toBe(-5);
    expect(brain.internals.store.stats.Dev).toEqual({ played: 1, wins: 1, losses: 0 });
    expect(brain.internals.store.stats.Alex).toEqual({ played: 1, wins: 0, losses: 1 });
    const before = nickelsOf("Alex");
    expect(brain.recordResult(id, { name: "Alex", won: true, score: "2-0" }).line).toBe(out.line);
    expect(nickelsOf("Alex")).toBe(before);
  });

  it("only deals Krillion prompts the game page can grade", () => {
    delete process.env.NACE_API_KEY;
    for (let i = 0; i < 12; i++) {
      const round = brain.getRound(turn("nickel play krillion", "Peyton").card!.path.slice(3))!;
      expect(round.prompt).toBe("Countries with exactly 4 letters");
    }
  });

  it("does not confirm a fantasy score it refused to apply", () => {
    const made = turn("Nickel, start a fantasy league for cereal: Tony, Lucky", "Maya");
    const id = made.card!.path.slice(3);
    brain.draftPick(id, "Maya", "Tony");
    expect(turn("nickel Tony +10", "Alex").line).toBe("Tony +10. Maya leads Fantasy Cereal with 10.");
    expect(turn("nickel Tony +500", "Alex").line).toBe("Scores move 100 points at a time at most. Tony stays at 10.");
    expect(brain.getFantasy(id)!.pool.find((p) => p.name === "Tony")!.points).toBe(10);
  });

  it("opens a new league for 'fantasy league for X' even when one is already running", () => {
    const made = turn("Nickel, fantasy league for nba", "Maya");
    expect(made.line).toBe("Fantasy Nba is open. 10 on the board, draft 3 each.");
    expect(brain.getFantasy(made.card!.path.slice(3))!.topic).toBe("Nba");
  });

  it("keeps the insult reaction for insults", () => {
    const wig = turn("Nickel, loser has to wear a wig", "Peyton");
    expect(wig.react).toBeUndefined();
    expect(wig.line).toMatch(/^Last place /);
    const art = turn("Nickel, draw me as the loser", "Peyton");
    expect(art.react).toBeUndefined();
    expect(art.line).toBe("I need your face first. Text me a photo of yourself, or add one on your card.");
    expect(turn("Nickel, show me who won", "Peyton").line).not.toMatch(/^I need your face/);
    expect(turn("Nickel, you suck", "Peyton").react!.tapback).toBe("dislike");
  });

  it("does not learn a name from a complaint, or rename someone it already knows", () => {
    const say = (text: string, senderPhone: string) => brain.handleTurn({ text, senderPhone, baseUrl: base });
    for (const text of ["Nickel, it's rigged", "Nickel, I'm done", "Nickel, this is bullshit"]) say(text, "+15550009001");
    expect(brain.internals.store.names["+15550009001"]).toBeUndefined();
    expect(say("Nickel, I'm Abhi", "+15550009002").line).toMatch(/^Got it, Abhi\./);
    say("Nickel, I'm cooked", "+15550009002");
    expect(brain.internals.store.names["+15550009002"]).toBe("Abhi");
    expect(turn("Nickel, I'm cooked", "Peyton").line).not.toMatch(/^Got it/);
    say("Nickel, call me Abe", "+15550009002");
    expect(brain.internals.store.names["+15550009002"]).toBe("Abe");
  });

  it("moves Nickels, record and queued pot money to the new name when a card is renamed", async () => {
    const profile = brain.profileFor("+15550009003", "Typo");
    const round = turn("Nickel, new wordle", "Typo").card!.path.slice(3);
    brain.recordResult(round, { name: "Typo", tries: "2/6" });
    brain.internals.store.nickels.Typo = 9;
    brain.internals.store.stats.Typo = { played: 2, wins: 1, losses: 1 };
    const pot = turn("Nickel, $5 buy-in", "Typo").card!.path.slice(3).split("?")[0];
    brain.joinPot(pot, "Typo", "paid");
    expect(wallet.cancelPot(pot, "Typo")).toMatchObject({ ok: true, refunded: ["Typo"] });
    await wallet.flushPotMoves();
    const league = turn("Nickel, fantasy league for cereal: Tony", "Typo").card!.path.slice(3);
    brain.draftPick(league, "Typo", "Tony");
    hub.remember("I play on Fridays", "Typo");
    expect(brain.saveProfile(profile.token, { name: "Fixed" }).ok).toBe(true);
    const people = brain.leaderboard().people;
    expect(people.find((p) => p.name === "Typo")).toBeUndefined();
    expect(people.find((p) => p.name === "Fixed")).toMatchObject({ nickels: 9, played: 2, wins: 1, losses: 1 });
    expect(brain.saveProfile(profile.token, { name: "Fixed" }).ok).toBe(true);
    expect(nickelsOf("Fixed")).toBe(9);
    expect(turn("Nickel, my balance", "Typo", { senderPhone: "+15550009003" }).line).toMatch(/^Fixed,/);
    expect(turn("Nickel, wallet", "Typo", { senderPhone: "+15550009003" }).line).toMatch(/^Fixed,/);
    expect(turn("Nickel, challenge Maya", "Typo", { senderPhone: "+15550009003" }).line).toMatch(/^Fixed just/);
    expect(wallet.pendingPotMoves().filter((m) => m.potId === pot)).toEqual([expect.objectContaining({ key: "refund:" + pot + ":Typo", name: "Fixed", cents: 500, kind: "refund" })]);
    const calls: [string, Record<string, unknown>][] = [];
    money.useMoneyBackend({
      query: async () => { throw new Error("unused"); },
      action: async () => { throw new Error("unused"); },
      mutation: async <T,>(name: string, args: Record<string, unknown>) => { calls.push([name, args]); return (name === "payments:ensurePlayer" ? "player-fixed" : { ok: true }) as T; },
    });
    await wallet.flushPotMoves();
    money.useMoneyBackend(null);
    expect(calls).toEqual([
      ["payments:ensurePlayer", { phone: "+15550009003", name: "Fixed" }],
      ["payments:potMove", { chatId: "league:Cupertino Day Ones", playerId: "player-fixed", key: "refund:" + pot + ":Typo", note: "Refund, $5 buy-in cancelled", refundOf: "pot:" + pot + ":player-fixed" }],
    ]);
    expect(wallet.pendingPotMoves().filter((m) => m.potId === pot)).toEqual([]);
    expect(brain.getPot(pot)!.members).toEqual({ Fixed: "paid" });
    expect(brain.getFantasy(league)!.pool[0].owner).toBe("Fixed");
    expect(hub.memoryOf("Fixed")).toContain("I play on Fridays");
    brain.recordResult(round, { name: "Fixed", tries: "1/6" });
    expect(nickelsOf("Fixed")).toBe(9);
  });

  it("rejects impossible and closed results without changing balances", () => {
    const id = turn("Nickel, new wordle", "Quinn").card!.path.slice(3);
    for (const payload of [{ tries: "0/6" }, { tries: "7/6" }, { tries: "garbage" }, { tries: "1/6", seconds: -5 }, { tries: "1/6", rarity: 99 }]) expect(brain.recordResult(id, { name: "Quinn", ...payload }).ok).toBe(false);
    expect(brain.recordResult("krill-87", { name: "Quinn", tries: "1/1" }).ok).toBe(false);
    expect(nickelsOf("Quinn")).toBe(0);
  });

  it("rejects non-string names and picks instead of throwing", () => {
    const id = turn("Nickel, fantasy league for snacks: Chips", "Quinn").card!.path.slice(3);
    expect(brain.saveProfile(brain.profileFor("+15550006666", "").token, { name: 123 } as never).ok).toBe(false);
    expect(brain.draftPick(id, "Quinn", 123 as never).ok).toBe(false);
    expect(brain.scorePick(id, 123 as never, 10, "Quinn").ok).toBe(false);
    expect(brain.recordResult("wordle-212", { name: {} } as never).ok).toBe(false);
  });

  it("captures the Messages bubble before awaiting a reply", () => {
    const script = readFileSync(new URL("../apps/preview/messages.html", import.meta.url), "utf8");
    const send = script.slice(script.indexOf("async function sendGroup"));
    expect(send.indexOf("const mine =")).toBeLessThan(send.indexOf("await fetch"));
    expect(send.match(/const mine =/g)).toHaveLength(1);
  });

  it("sends standalone Krillion Done to the hub while retaining the embedded callback", () => {
    const script = readFileSync(new URL("../apps/preview/play.html", import.meta.url), "utf8");
    expect(script).toContain('practice ? krillion() : parent === window ? location.assign("/h") : tell(null)');
  });

  it("returns a failed pot agreement instead of a success response", () => {
    const script = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(script).toContain('if (!joined.ok) return json(joined, getPot(potApi[1]) ? 409 : 404)');
  });
});

describe("web chat identity", () => {
  let sid = "";
  let phone = "+15550009999";
  beforeAll(() => {
    const profile = brain.profileFor(phone, "Owner");
    const claimed = auth.claimProfile(profile.token, auth.issueClaim(profile.token));
    if (!claimed.ok) throw new Error(claimed.error);
    sid = claimed.sid;
  });
  const ownerMoves = () => [...wallet.pendingPotMoves(), ...wallet.failedPotMoves()].filter((m) => m.name === "Owner");

  const webTurn = async (body: object, cookie = "", headers = {}) => {
    const request = new Request(base + "api/turn", { method: "POST", headers: { host: "nickel.test", "content-type": "application/json", ...(cookie ? { cookie: "nickel_sid=" + cookie } : {}), ...headers }, body: JSON.stringify(body) });
    const gate = await auth.authGate(request, "203.0.113." + Math.floor(Math.random() * 200));
    if (gate instanceof Response) return gate;
    const forwarded = await gate.request.json();
    return { body: forwarded, turn: brain.handleTurn({ ...forwarded, trusted: auth.turnTrusted(gate.request), baseUrl: base }) };
  };

  it("does not trust a missing turn secret", () => {
    delete process.env.NICKEL_TURN_SECRET;
    expect(auth.turnTrusted(new Request(base + "api/turn"))).toBe(false);
  });

  it("rejects anonymous impersonation, photo imports and disguised mutations", async () => {
    process.env.NICKEL_TURN_SECRET = "local-fixes-transport";
    for (const text of ["Nickel, cash out all", "Nickel, play settle the pot", "Nickel, call me Owner, cash out all", "Nickel, forget everything about me", "Nickel, cancel pot"]) {
      const out = await webTurn({ text, sender: "Owner", senderPhone: phone });
      expect(out).toBeInstanceOf(Response);
      expect((out as Response).status).toBe(401);
    }
    const photo = await webTurn({ text: "Nickel", sender: "Owner", senderPhone: phone, photoUrl: "https://example.test/photo.jpg" });
    expect((photo as Response).status).toBe(403);
    expect(ownerMoves()).toEqual([]);
  });

  it("takes authenticated chat identity from the session, not submitted names or introductions", async () => {
    const out = await webTurn({ text: "Nickel, cash out $1", sender: "Victim", senderPhone: "+15550008888" }, sid);
    if (out instanceof Response) throw new Error("Chat was rejected: " + out.status);
    expect(out.body).toMatchObject({ sender: "Owner", senderPhone: phone });
    expect(out.turn.line).toBe("Owner, cash out from your wallet. Whop checks your ID the first time.");
    expect(out.turn.url).toBe("https://nickel.test/wallet?cashout=1");
    expect(ownerMoves()).toEqual([]);
    const intro = await webTurn({ text: "Nickel, call me Victim, $5 buy-in", sender: "Victim" }, sid);
    if (intro instanceof Response) throw new Error("Chat was rejected");
    const pot = brain.getPot(intro.turn.card!.path.slice(3).split("?")[0]);
    expect(pot!.proposer).toBe("Owner");
  });

  it("preserves trusted messaging and harmless anonymous discovery", async () => {
    const discovery = await webTurn({ text: "Nickel, play wordle", sender: "Owner", senderPhone: phone });
    if (discovery instanceof Response) throw new Error("Discovery was rejected");
    expect(discovery.body).toMatchObject({ sender: "", senderPhone: "" });
    expect(discovery.turn.card!.path).toBe("/r/wordle-212");
    const trusted = await webTurn({ text: "Nickel, I'm Newbie. Set me up", senderPhone: "+15550007777" }, "", { "x-nickel-secret": "local-fixes-transport" });
    if (trusted instanceof Response) throw new Error("Messaging was rejected");
    expect(trusted.turn.url).toMatch(/\?k=/);
    delete process.env.NICKEL_TURN_SECRET;
  });

  it("does not let an anonymous result debit a claimed rival", () => {
    const before = nickelsOf("Owner");
    const id = turn("Nickel, challenge Owner", "Guest").card!.path.slice(3);
    expect(brain.recordResult(id, { name: "Guest", won: true, score: "2-0", verified: false }).ok).toBe(false);
    expect(nickelsOf("Owner")).toBe(before);
    expect(ownerMoves()).toEqual([]);
  });
});
