// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

let brain: typeof import("./brain.js");
beforeAll(async () => {
  process.env.NICKEL_DATA_DIR = mkdtempSync(tmpdir() + "/nickel-");
  brain = await import("./brain.js");
});

const turn = (text: string, sender = "Sritej", extra = {}) => brain.handleTurn({ text, sender, baseUrl: "https://nickel.test/", ...extra });

describe("group chat turns", () => {
  it("stays quiet unless addressed by name", () => {
    expect(turn("who is up for dinner")).toEqual({ addressed: false });
    expect(turn("nickelback tonight")).toEqual({ addressed: false });
  });

  it("turns a challenge into a head-to-head round and a link", () => {
    const reply = turn("Nickel, challenge Maya");
    expect(reply.line).toBe("Sritej just called out Maya. Rock Paper Scissors. Best of 3, 5 Nickels on it.");
    expect(reply.url).toMatch(/^https:\/\/nickel\.test\/r\/rps-[a-z0-9]+$/);
    const round = brain.getRound(reply.card!.path.slice(3))!;
    expect(round.opponent).toBe("Maya");
    expect(brain.cardSvg(brain.roundCard(round))).toContain("Sritej vs Maya");
    const loose = turn("nickel can u set up a wordle challenge between me and peyton", "");
    expect(loose.line).toBe("Peyton, you just got called out. Wordle Blitz. 45 seconds, 5 Nickels on it.");
    expect(loose.card!.title).toBe("You vs Peyton");
    expect(turn("nickel run it", "", { opponent: "alex", game: "krillion" }).line).toBe("Alex, you just got called out. One in a Krillion. 25 seconds, 5 Nickels on it.");
  });

  it("opens today's game when asked to play", () => {
    expect(turn("@nickel play").url).toBe("https://nickel.test/r/wordle-212");
    expect(turn("nickel play krillion").url).toMatch(/\/r\/krill-/);
  });

  it("runs a custom fantasy league on any topic: create, draft, write in, score", () => {
    const made = turn("Nickel, start a fantasy league for boba shops: Boba Guys, Teaspoon, Tpumps", "Maya");
    const id = made.card!.path.slice(3);
    expect(made.line).toBe("Fantasy Boba shops is open. 3 on the board, draft 3 each.");
    expect(brain.getFantasy(id)!.pool.map((p) => p.name)).toEqual(["Boba Guys", "Teaspoon", "Tpumps"]);

    expect(brain.draftPick(id, "Maya", "Teaspoon").ok).toBe(true);
    expect(brain.draftPick(id, "Alex", "teaspoon")).toMatchObject({ ok: false, error: "Maya already has Teaspoon" });
    expect(brain.draftPick(id, "Alex", "Happy Lemon").ok).toBe(true);
    expect(brain.getFantasy(id)!.pool).toHaveLength(4);

    const scored = turn("nickel teaspoon +10", "Alex");
    expect(scored.line).toBe("Teaspoon +10. Maya leads Fantasy Boba shops with 10.");
    expect(brain.fantasyStandings(brain.getFantasy(id)!)[0]).toMatchObject({ member: "Maya", points: 10 });

    brain.draftPick(id, "Maya", "Boba Guys");
    brain.draftPick(id, "Maya", "Tpumps");
    expect(brain.draftPick(id, "Maya", "Sharetea")).toMatchObject({ ok: false, error: "Your roster is full" });
  });

  it("learns names by phone, records results, and reports who won", () => {
    expect(turn("nickel standings").line).toBe("No Nickels have moved yet. First to finish a game takes the lead.");
    expect(turn("Nickel, I'm Sritej", "", { senderPhone: "+1 (480) 233-6330" }).line).toBe("Got it, Sritej. You are in. Say challenge and a name to start one.");
    const duel = turn("nickel challenge peyton", "", { senderPhone: "+14802336330" });
    expect(duel.line).toBe("Sritej just called out Peyton. Rock Paper Scissors. Best of 3, 5 Nickels on it.");
    const id = duel.card!.path.slice(3);
    expect(brain.recordResult(id, { name: "Sritej", opponent: "Peyton", score: "2–1", won: true }).line).toBe("Sritej beat Peyton 2-1 at Rock Paper Scissors. 5 Nickels moved.");
    brain.recordResult(id, { name: "Sritej", opponent: "Peyton", score: "2–1", won: true });
    expect(turn("nickel who won").line).toBe("Sritej beat Peyton 2-1 at Rock Paper Scissors. 5 Nickels moved. Nickels: Sritej +5, Peyton -5.");
    expect(brain.recordResult("wordle-212", { name: "Maya", tries: "3/6", time: "0:22" }).line).toBe("Maya solved Wordle Blitz in 3 (0:22). Plus 5 Nickels.");
    expect(turn("nickel leaderboard").line).toBe("Nickels: Sritej +5, Maya +5, Peyton -5.");
  });

  it("runs a buy-in: propose, agree, pay, status", () => {
    expect(turn("nickel who's in on the pot", "Maya").line).toBe("No buy-in yet. Say: Nickel, $5 buy-in.");
    const made = turn("Nickel, $5 buy-in", "Sritej");
    expect(made.line).toBe('Sritej proposed a $5 buy-in. Say "Nickel, I\'m in" to agree. Nobody pays until you tap the card.');
    expect(made.url).toMatch(/\/p\/pot-[a-z0-9]+\?u=sritej$/);
    const id = made.card!.path.slice(3).split("?")[0];
    const joined = turn("nickel im in", "Maya");
    expect(joined.line).toBe("Maya is in. 2 in, $10 pot. Tap the card to pay your $5.");
    expect(joined.pay).toEqual({ amountCents: 500, memo: "Nickel buy-in, Cupertino Day Ones" });
    expect(turn("nickel i'm in", "").line).toBe("Tell me your name first: Nickel, I'm Sritej. Then say you are in.");
    brain.joinPot(id, "Maya", "paid");
    brain.joinPot(id, "Maya", "in");
    expect(brain.getPot(id)!.members).toEqual({ Sritej: "in", Maya: "paid" });
    expect(turn("nickel who paid", "Alex").line).toBe("$5 buy-in. 2 in, $5 of $10 paid. Still owed: Sritej.");
    expect(brain.potCard(brain.getPot(id)!).sub).toBe("2 in for a $10 pot. 1 paid.");
    expect(turn("nickel $500 buy in", "Alex").line).toBe("Buy-ins run from $1 to $100. Pick a number in there.");
  });

  it("takes the topic and picks the agent supplies", () => {
    const made = turn("nickel fantasy professors", "Dev", { fantasyTopic: "Berkeley professors", fantasyPicks: ["Sahai", "DeNero", "Hug"] });
    expect(brain.getFantasy(made.card!.path.slice(3))).toMatchObject({ topic: "Berkeley professors", rosterSize: 3 });
    expect(brain.fantasyCard(brain.getFantasy(made.card!.path.slice(3))!).sub).toBe("Draft 3 picks each. 3 on the board.");
  });
});
