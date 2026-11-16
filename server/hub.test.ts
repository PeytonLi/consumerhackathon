// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

let brain: typeof import("./brain.js");
let hub: typeof import("./hub.js");
beforeAll(async () => {
  process.env.NICKEL_DATA_DIR = mkdtempSync(tmpdir() + "/nickel-hub-");
  brain = await import("./brain.js");
  hub = await import("./hub.js");
});

const turn = (text: string, sender = "Sritej") => brain.handleTurn({ text, sender, baseUrl: "https://nickel.test/" });
const duel = (challenger: string, rival: string, won: boolean, picks?: string[]) => {
  const id = turn("Nickel, challenge " + rival, challenger).card!.path.slice(3);
  return brain.recordResult(id, { name: challenger, won, score: won ? "2-0" : "0-2", picks } as Parameters<typeof brain.recordResult>[1]);
};

describe("memory", () => {
  it("keeps what people tell it, per person and per group", () => {
    expect(turn("Nickel, remember that Alex owes everyone boba", "Maya").line).toBe("Noted about Alex: Alex owes everyone boba.");
    expect(turn("Nickel, remember we play on Fridays", "Maya").line).toBe("Noted for the group: We play on Fridays.");
    expect(turn("Nickel, remember I hate mushrooms", "Dev").line).toBe("Noted about Dev: I hate mushrooms.");
    expect(turn("nickel remember that alex owes everyone boba!", "Dev").line).toBe("Already have that one.");
    expect(turn("Nickel, remember").addressed).toBe(true);
    expect(hub.memoryOf("Alex")).toEqual(["Alex owes everyone boba"]);
    expect(hub.groupMemory()).toEqual(["We play on Fridays"]);
    expect(turn("Nickel, what do you know about Alex?").line).toBe("Alex: Alex owes everyone boba.");
    expect(turn("Nickel, what do you know about me", "Dev").line).toBe("Dev: I hate mushrooms.");
    expect(turn("Nickel, what do you remember about the group").line).toBe("The group: We play on Fridays.");
    expect(turn("Nickel, what do you know about Peyton").line).toContain("Nothing on Peyton yet.");
  });

  it("strips emojis and markup and files strangers under the group", () => {
    expect(turn("Nickel, remember that Zed brings <b>snacks</b> \u{1F355}\u{1F525}", "Maya").line).toBe("Noted for the group: Zed brings bsnacks/b.");
    expect(turn("Nickel, what do you know about Zed").line).toBe("Zed: Zed brings bsnacks/b.");
    expect(hub.groupMemory()).toContain("Zed brings bsnacks/b");
    expect(hub.memoryOf("Zed")).toEqual(["Zed brings bsnacks/b"]);
    expect(hub.forget("zed brings", "Maya").ok).toBe(true);
  });

  it("lets people remove their own facts and nobody else's", () => {
    expect(turn("Nickel, forget that Alex owes everyone boba", "Dev").line).toBe("That one is not yours to remove. Maya added it.");
    expect(turn("Nickel, forget the moon landing", "Dev").line).toBe("Nothing like that in memory.");
    expect(turn("Nickel, forget that Alex owes everyone boba", "Alex").line).toBe("Forgotten: Alex owes everyone boba.");
    expect(hub.memoryOf("Alex")).toEqual([]);
    expect(turn("Nickel, forget everything about me", "Dev").line).toBe("Forgotten: I hate mushrooms.");
    expect(hub.memoryOf("Dev")).toEqual([]);
  });

  it("caps both lists and drops the oldest", () => {
    for (let i = 0; i < hub.PERSON_FACTS + 3; i++) hub.remember("Peyton fact number " + i, "Peyton");
    for (let i = 0; i < hub.GROUP_FACTS + 3; i++) hub.remember("We did thing " + i, "Peyton");
    expect(hub.memoryOf("Peyton")).toHaveLength(hub.PERSON_FACTS);
    expect(hub.memoryOf("Peyton")[0]).toBe("Peyton fact number 3");
    expect(hub.groupMemory()).toHaveLength(hub.GROUP_FACTS);
    expect(hub.remember("Peyton " + "x".repeat(400), "Peyton").text!.length).toBeLessThanOrEqual(hub.FACT_LENGTH);
    expect(hub.forget("peyton", "Peyton").removed).toHaveLength(hub.PERSON_FACTS);
    expect(hub.groupMemory()).not.toContain("We play on Fridays");
    expect(hub.forget("we did thing", "Peyton").removed).toHaveLength(hub.GROUP_FACTS);
    expect(hub.groupMemory()).toEqual([]);
  });

  it("derives facts from results", () => {
    expect(hub.memoryOf("Dev")).toEqual([]);
    duel("Dev", "Maya", false, ["rock", "paper", "rock"]);
    duel("Maya", "Dev", true, ["rock", "rock"]);
    duel("Maya", "Dev", true, ["Rock", "banana"]);
    duel("Dev", "Maya", false);
    expect(hub.memoryOf("Dev")).toEqual(["Dev has lost 4 in a row", "Dev mostly picks rock", "Dev plays Rock Paper Scissors the most"]);
    expect(hub.memoryOf("Maya")).toEqual(["Maya has won 4 in a row", "Maya always picks rock", "Maya has beaten Dev 4 times", "Maya plays Rock Paper Scissors the most"]);
    expect(hub.groupMemory()[0]).toMatch(/^The group plays most at \d{1,2} (AM|PM)$/);
    expect(hub.groupMemory()[1]).toBe("Rock Paper Scissors is the group's most played game");
    expect(turn("Nickel, what do you know about Dev").line).toContain("Dev has lost 4 in a row");
  });
});

describe("payouts ledger", () => {
  it("refuses to settle a missing or unpaid pot", () => {
    expect(hub.settlePot("pot-nope")).toEqual({ ok: false, error: "Not found" });
    expect(turn("Nickel, settle the pot").line).toBe("No buy-in to settle. Say: Nickel, $5 buy-in.");
    const id = turn("Nickel, $7.50 buy-in", "Maya").card!.path.slice(3).split("?")[0];
    expect(hub.settlePot(id)).toEqual({ ok: false, error: "Nobody has paid in yet" });
    expect(turn("Nickel, settle the pot").line).toBe("Nobody has paid into the pot yet, so there is nothing to settle.");
    expect(hub.balanceOf("Maya")).toBe(0);
  });

  it("pays the paid-in pot to the leader once, in cents", () => {
    const id = Object.keys(hub.hub(null).pots.reduce((all, p) => ({ ...all, [p.id]: p }), {}))[0];
    brain.joinPot(id, "Maya", "paid");
    brain.joinPot(id, "Dev", "paid");
    brain.joinPot(id, "Alex", "in");
    expect(brain.leaderboard().stakes).toBe("$7.5 buy-in");
    expect(turn("Nickel, settle the pot", "Dev").line).toBe("Maya leads the board and takes the $15 pot. Maya's balance is $15. It stays on the Nickel ledger.");
    expect(hub.balanceOf("Maya")).toBe(1500);
    expect(hub.settlePot(id)).toEqual({ ok: false, error: "Already settled" });
    expect(turn("Nickel, settle the pot", "Dev").line).toBe("That pot is already settled. Maya took it.");
    expect(hub.balanceOf("Maya")).toBe(1500);
    expect(brain.leaderboard().stakes).toBeNull();
    expect(turn("Nickel, my balance", "Maya").line).toBe("Maya, your balance is $15. It stays on the Nickel ledger.");
    expect(turn("Nickel, my balance", "Dev").line).toBe("Dev, your balance is $0. It stays on the Nickel ledger.");
    expect(turn("Nickel, my balance", "").line).toBe("Tell me your name first: Nickel, I'm Sritej.");
    expect(turn("Nickel, balances").line).toBe("Balances: Maya $15.");
  });

  it("accumulates across pots", () => {
    const id = turn("Nickel, $5 buy-in", "Dev").card!.path.slice(3).split("?")[0];
    brain.joinPot(id, "Dev", "paid");
    const out = hub.settlePot(id);
    expect(out).toMatchObject({ ok: true, balanceCents: 2000, payout: { name: "Maya", amountCents: 500, reason: "Won the $5 pot", potId: id } });
    expect(Number.isInteger(hub.balanceOf("Maya"))).toBe(true);
  });
});

describe("GET /api/hub payload", () => {
  it("matches the contract shape", () => {
    hub.remember("Maya calls every game rigged", "Dev");
    const out = hub.hub({ token: "me-abc", name: "Maya", face: null, account: "x" } as Parameters<typeof hub.hub>[0]);
    expect(Object.keys(out)).toEqual(["me", "league", "people", "group", "pots", "payouts", "recent", "walletLedger"]);
    expect(out.me).toEqual({ token: "me-abc", name: "Maya", face: null });
    expect(hub.hub(null).me).toBeNull();
    expect(out.league).toEqual({ name: "Cupertino Day Ones", stakes: null, punishment: null });
    expect(Object.keys(out.people[0])).toEqual(["name", "rank", "nickels", "played", "wins", "losses", "title", "face", "last", "balanceCents", "memory"]);
    expect(out.people[0]).toMatchObject({ name: "Maya", rank: 1, nickels: 24, played: 4, wins: 4, losses: 0, title: "Front runner", face: null, balanceCents: 2000 });
    expect(out.people[0].memory).toContain("Maya calls every game rigged");
    expect(out.people[0].memory).toContain("Maya always picks rock");
    expect(out.people.map((p) => p.name)).toEqual(brain.leaderboard().people.map((p) => p.name));
    expect(out.group.memory[0]).toMatch(/^The group plays most at /);
    expect(out.pots).toHaveLength(2);
    expect(Object.keys(out.pots[0])).toEqual(["id", "amountCents", "members", "settled", "winner"]);
    expect(out.pots.find((p) => p.amountCents === 750)).toMatchObject({ members: { Maya: "paid", Dev: "paid", Alex: "in" }, settled: true, winner: "Maya" });
    expect(out.payouts).toHaveLength(2);
    expect(Object.keys(out.payouts[0])).toEqual(["id", "name", "amountCents", "reason", "at"]);
    expect(out.payouts.map((p) => p.amountCents).sort()).toEqual([1500, 500]);
    expect(Object.keys(out.recent[0])).toEqual(["line", "at"]);
    expect(out.recent.map((r) => r.line)).toContain("Maya took the $15 pot.");
    expect(out.recent.some((r) => r.line.startsWith("Maya beat Dev 2-0 at Rock Paper Scissors"))).toBe(true);
    for (let i = 1; i < out.recent.length; i++) expect(out.recent[i - 1].at).toBeGreaterThanOrEqual(out.recent[i].at);
  });
});
