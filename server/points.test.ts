// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POINTS_CAP, applyExtras, explain, parseSeconds, scoreKrillion, scoreResult, scoreRps, scoreWordle, streakDays, streakMultiplier, type PastResult } from "./points.js";

const total = (parts: { points: number }[]) => parts.reduce((n, p) => n + p.points, 0);
const NOON = Date.UTC(2026, 10, 15, 20);
const DAY = 86400000;
const wordleRound = { id: "wordle-1", game: "wordle" as const, title: "Wordle Blitz", seconds: 45 };
const krillRound = { id: "krill-1", game: "krillion" as const, title: "One in a Krillion", seconds: 25 };
const rpsRound = { id: "rps-1", game: "rps" as const, title: "Rock Paper Scissors", stake: 5 };
const empty = () => ({ results: [] as PastResult[], nickels: {} as Record<string, number> });

describe("wordle", () => {
  it("pays for solving, fewer tries, and speed", () => {
    expect(scoreWordle({ solved: true, tries: 3, seconds: 21, limit: 45 })).toEqual([{ label: "solve", points: 5 }, { label: "tries", points: 3 }, { label: "speed", points: 2 }]);
    expect(total(scoreWordle({ solved: true, tries: 6, seconds: 45, limit: 45 }))).toBe(5);
    expect(total(scoreWordle({ solved: true, tries: 1, seconds: 2, limit: 45 }))).toBe(14);
    expect(total(scoreWordle({ solved: true, tries: 2, seconds: 10 }))).toBeGreaterThan(total(scoreWordle({ solved: true, tries: 4, seconds: 10 })));
    expect(total(scoreWordle({ solved: true, tries: 4, seconds: 8 }))).toBeGreaterThan(total(scoreWordle({ solved: true, tries: 4, seconds: 40 })));
  });

  it("gives one Nickel for a miss and survives missing or odd fields", () => {
    expect(scoreWordle({ solved: false, tries: 6, seconds: 45 })).toEqual([{ label: "showing up", points: 1 }]);
    expect(total(scoreWordle({ solved: true }))).toBe(5);
    expect(total(scoreWordle({ solved: true, tries: 99, seconds: 900 }))).toBe(5);
    expect(total(scoreWordle({ solved: true, tries: -4, seconds: -30 }))).toBe(14);
  });
});

describe("krillion", () => {
  it("pays for a valid answer, rarity, and speed", () => {
    expect(scoreKrillion({ valid: true, rarity: 3, seconds: 8, limit: 25 })).toEqual([{ label: "answer", points: 5 }, { label: "rarity", points: 2 }, { label: "speed", points: 2 }]);
    expect(total(scoreKrillion({ valid: true }))).toBe(5);
    expect(total(scoreKrillion({ valid: true, rarity: 5, seconds: 0 }))).toBe(12);
    expect(total(scoreKrillion({ valid: true, rarity: 40, seconds: 25 }))).toBe(9);
    expect(scoreKrillion({ valid: false, rarity: 5, seconds: 1 })).toEqual([{ label: "showing up", points: 1 }]);
  });
});

describe("rock paper scissors", () => {
  it("moves the stake and adds one for a sweep", () => {
    expect(scoreRps({ stake: 5, winnerScore: 2, loserScore: 1 })).toEqual([{ label: "stake", points: 5 }]);
    expect(scoreRps({ stake: 5, winnerScore: 2, loserScore: 0 })).toEqual([{ label: "stake", points: 5 }, { label: "sweep", points: 1 }]);
    expect(scoreRps({ stake: 5 })).toEqual([{ label: "stake", points: 5 }]);
  });
});

describe("extras", () => {
  it("grows the streak multiplier a tenth a day up to one and a half", () => {
    expect([0, 1, 2, 3, 6, 30].map(streakMultiplier)).toEqual([1, 1, 1.1, 1.2, 1.5, 1.5]);
    const base = scoreWordle({ solved: true, tries: 3, seconds: 21 });
    expect(applyExtras(base, { streakDays: 1 })).toEqual({ total: 10, parts: base });
    expect(applyExtras(base, { streakDays: 3 }).parts.at(-1)).toEqual({ label: "streak", points: 2 });
    expect(applyExtras(base, { streakDays: 3 }).total).toBe(12);
  });

  it("adds first in and upset bonuses", () => {
    const base = [{ label: "solve", points: 5 }];
    expect(applyExtras(base, { first: true }).total).toBe(7);
    expect(applyExtras(base, { upset: true }).total).toBe(7);
    expect(applyExtras(base, { first: true, upset: true, streakDays: 3 })).toEqual({
      total: 10,
      parts: [{ label: "solve", points: 5 }, { label: "first in", points: 2 }, { label: "upset", points: 2 }, { label: "streak", points: 1 }],
    });
  });

  it("caps one game and shows the cap in the breakdown", () => {
    const best = applyExtras(scoreWordle({ solved: true, tries: 1, seconds: 0 }), { first: true, upset: true, streakDays: 10 });
    expect(best.total).toBe(POINTS_CAP);
    expect(best.parts.at(-1)).toEqual({ label: "cap", points: -5 });
    expect(total(best.parts)).toBe(best.total);
    expect(applyExtras([{ label: "stake", points: 500 }]).total).toBe(POINTS_CAP);
  });

  it("explains a breakdown in one phrase", () => {
    expect(explain(applyExtras(scoreWordle({ solved: true, tries: 3, seconds: 21 }), { streakDays: 3 }))).toBe("5 + 3 tries + 2 speed + 2 streak = 12 Nickels");
    expect(explain(applyExtras(scoreWordle({ solved: false })))).toBe("1 Nickel for showing up");
    expect(explain(applyExtras(scoreWordle({ solved: true, tries: 6 })))).toBe("5 Nickels");
    expect(explain(applyExtras(scoreWordle({ solved: true, tries: 1, seconds: 0 }), { first: true, upset: true, streakDays: 10 }))).toBe("5 + 5 tries + 4 speed + 2 first in + 2 upset + 7 streak - 5 cap = 20 Nickels");
  });

  it("counts consecutive days played, today included", () => {
    const played = (daysAgo: number, name = "Maya"): PastResult => ({ roundId: "r" + daysAgo, name, at: NOON - daysAgo * DAY });
    expect(streakDays([], "Maya", NOON)).toBe(1);
    expect(streakDays([played(0)], "Maya", NOON)).toBe(1);
    expect(streakDays([played(1), played(2)], "Maya", NOON)).toBe(3);
    expect(streakDays([played(2), played(3)], "Maya", NOON)).toBe(1);
    expect(streakDays([played(1, "Dev")], "Maya", NOON)).toBe(1);
    expect(streakDays([{ ...played(1, "Dev"), loser: "Maya" }, { ...played(2, "Dev"), players: ["Dev", "Maya"] }], "Maya", NOON)).toBe(3);
  });
});

describe("scoring a posted result", () => {
  it("reads seconds from the number or the clock string", () => {
    expect(parseSeconds({ seconds: 21 })).toBe(21);
    expect(parseSeconds({ time: "0:22" })).toBe(22);
    expect(parseSeconds({ time: "1:05" })).toBe(65);
    expect(parseSeconds({})).toBeUndefined();
  });

  it("scores a wordle with first in and streak and writes the sentence", () => {
    const state = { results: [{ roundId: "old-1", name: "Maya", at: NOON - DAY }, { roundId: "old-2", name: "Maya", at: NOON - 2 * DAY }], nickels: {} };
    const scored = scoreResult(wordleRound, { tries: "3/6", seconds: 21 }, { name: "Maya", rival: "" }, state, NOON);
    expect(scored.line).toBe("Maya solved Wordle Blitz in 3 tries and 21 seconds: 5 + 3 tries + 2 speed + 2 first in + 2 streak = 14 Nickels.");
    expect(scored.total).toBe(14);
    expect(scored.record).toMatchObject({ players: ["Maya"], solved: true, base: 10 });
  });

  it("gives first in only to the first solve and an upset for outscoring someone ahead", () => {
    const state = empty();
    const maya = scoreResult(wordleRound, { tries: "5/6", time: "0:40" }, { name: "Maya", rival: "" }, state, NOON);
    expect(maya.points.parts.map((p) => p.label)).toEqual(["solve", "tries", "first in"]);
    state.results.push({ roundId: wordleRound.id, name: "Maya", at: NOON, ...maya.record });
    state.nickels.Maya = 30;
    const dev = scoreResult(wordleRound, { tries: "2/6", time: "0:12" }, { name: "Dev", rival: "" }, state, NOON);
    expect(dev.points.parts.map((p) => p.label)).toEqual(["solve", "tries", "speed", "upset"]);
    expect(dev.line).toBe("Dev solved Wordle Blitz in 2 tries and 12 seconds: 5 + 4 tries + 3 speed + 2 upset = 14 Nickels.");
    state.nickels.Maya = -30;
    expect(scoreResult(wordleRound, { tries: "2/6", time: "0:12" }, { name: "Dev", rival: "" }, state, NOON).total).toBe(12);
    const miss = scoreResult(wordleRound, { tries: "X/6", time: "0:45" }, { name: "Alex", rival: "" }, empty(), NOON);
    expect(miss.line).toBe("Alex missed Wordle Blitz: 1 Nickel for showing up.");
    expect(miss.record.solved).toBe(false);
  });

  it("scores krillion with and without rarity", () => {
    expect(scoreResult(krillRound, { tries: "1/1", seconds: 8, rarity: 3 }, { name: "Maya", rival: "" }, empty(), NOON).line).toBe("Maya locked in One in a Krillion with a Rare answer in 8 seconds: 5 + 2 rarity + 2 speed + 2 first in = 11 Nickels.");
    expect(scoreResult(krillRound, { tries: "1/1" }, { name: "Maya", rival: "" }, empty(), NOON).line).toBe("Maya locked in One in a Krillion: 5 + 2 first in = 7 Nickels.");
    expect(scoreResult(krillRound, { tries: "X/1", seconds: 25, rarity: 0 }, { name: "Maya", rival: "" }, empty(), NOON).line).toBe("Maya wiped out on One in a Krillion: 1 Nickel for showing up.");
  });

  it("moves the stake in a duel and pays extras to the winner only", () => {
    const plain = scoreResult(rpsRound, { won: true, score: "2–1" }, { name: "Sritej", rival: "Peyton" }, empty(), NOON);
    expect(plain).toMatchObject({ total: 5, moved: 5, line: "Sritej beat Peyton 2-1 at Rock Paper Scissors. 5 Nickels moved." });
    const upset = scoreResult(rpsRound, { won: false, score: "0-2" }, { name: "Maya", rival: "Dev" }, { results: [], nickels: { Maya: 40, Dev: 3 } }, NOON);
    expect(upset).toMatchObject({ total: 8, moved: 6, line: "Dev beat Maya 2-0 at Rock Paper Scissors: 5 + 1 sweep + 2 upset = 8 Nickels. Maya drops 6." });
    expect(upset.record.players).toEqual(["Maya", "Dev"]);
    expect(scoreResult({ ...rpsRound, stake: 80 }, { won: true, score: "2-0" }, { name: "Maya", rival: "Dev" }, empty(), NOON)).toMatchObject({ total: POINTS_CAP, moved: 81 });
  });
});
