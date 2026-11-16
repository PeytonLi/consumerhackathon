// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ARCADE, arcadeGame, arcadeSubmission, createArcade, validateArcade, type ArcadeChallenge, type ArcadeEvent, type ArcadeGame } from "./arcade.js";
import { applyExtras, scoreFreeThrow, scoreHigherLower, scoreMath, scoreMemory, scoreReaction } from "./points.js";
import { authGate, claimProfile, issueClaim, sessionCookie } from "./auth.js";

let brain: typeof import("./brain.js");
let dir: string;
beforeAll(async () => {
  process.env.NICKEL_DATA_DIR = dir = mkdtempSync(tmpdir() + "/nickel-arcade-");
  brain = await import("./brain.js");
});

const turn = (text: string, sender = "Sritej") => brain.handleTurn({ text, sender, baseUrl: "https://nickel.test" });
const makeRound = (game: string, challenge = false) => brain.getRound(turn("Nickel, " + (challenge ? "challenge Maya to " : "play ") + game).card!.path.slice(3))!;

function run(game: ArcadeGame, c: ArcadeChallenge): ArcadeEvent[] {
  if (game === "reaction") {
    let at = 0;
    return c.reactionWaits.map((wait) => { at += wait + 250; const event = { at, value: 250 }; at += 250; return event; });
  }
  if (game === "freethrow") {
    let start = 0;
    return c.speeds.map((speed) => {
      const at = start + Math.round(Math.PI / speed * 1000);
      const event = { at, value: Math.round((Math.sin((at - start) / 1000 * speed) + 1) * 500) };
      start = at + 500;
      return event;
    });
  }
  if (game === "memory") return [0, 1, 2].map((i) => ({ at: 1800 + i * 200, value: c.sequence[i] }));
  if (game === "math") return c.questions.map((q, i) => ({ at: 500 + i * 500, value: q.answer }));
  return c.deck.slice(1).map((card, i) => ({ at: 500 + i * 500, value: Math.sign(card - c.deck[i]) }));
}

describe("arcade scores", () => {
  const scoring = [scoreReaction, scoreFreeThrow, scoreMemory, scoreMath, scoreHigherLower];
  it("uses the existing breakdown and cap, including a Nickel for showing up", () => {
    for (const fn of scoring) {
      expect(fn(0)).toEqual([{ label: "showing up", points: 1 }]);
      expect(fn(-2)).toEqual(fn(0));
      expect(fn(NaN)).toEqual(fn(0));
      const points = applyExtras(fn(1000000), { first: true, upset: true, streakDays: 6 });
      expect(points.total).toBe(20);
      expect(points.parts.reduce((n, p) => n + p.points, 0)).toBe(20);
    }
  });
  it("rewards skill for all five games", () => {
    const total = (parts: ReturnType<typeof scoreReaction>) => parts.reduce((n, p) => n + p.points, 0);
    expect(total(scoreReaction(750))).toBe(11);
    expect(total(scoreFreeThrow(500))).toBe(13);
    expect(total(scoreMemory(25))).toBe(13);
    expect(total(scoreMath(20))).toBe(13);
    expect(total(scoreHigherLower(20))).toBe(13);
  });
});

describe("plausibility and authoritative scoring", () => {
  for (const game of Object.keys(ARCADE) as ArcadeGame[]) {
    it("validates a real " + game + " trace and ignores claimed scores", () => {
      const { arcade } = createArcade(game);
      const events = run(game, arcade);
      const result = validateArcade(game, arcade, events, 25000);
      expect(result).not.toBeTypeOf("string");
      expect(result).toMatchObject({ score: ({ reaction: 750, freethrow: 500, memory: 3, math: 20, higherlower: 20 })[game] });
      expect(validateArcade(game, arcade, [...events, { at: 999999, value: 1 }], 999999)).toBeTypeOf("string");
      expect(validateArcade(game, arcade, [{ at: NaN, value: 1 }], 25000)).toBeTypeOf("string");
      expect(validateArcade(game, arcade, [{ at: 2000, value: 1 }], 10)).toBeTypeOf("string");
      expect(validateArcade(game, arcade, Array(101).fill({ at: 2000, value: 1 }), 25000)).toBeTypeOf("string");
    });
  }
  it("rejects inhuman reactions, forged false starts and a fourth trial", () => {
    const { arcade: c } = createArcade("reaction");
    expect(validateArcade("reaction", c, [{ at: c.reactionWaits[0] + 10, value: 10 }], 15000)).toBeTypeOf("string");
    expect(validateArcade("reaction", c, [{ at: c.reactionWaits[0] + 10, value: 0 }], 15000)).toBeTypeOf("string");
    expect(validateArcade("reaction", c, [{ at: 100, value: 0 }], 15000)).toMatchObject({ score: 0 });
    expect(validateArcade("reaction", c, [...run("reaction", c), { at: 14999, value: 200 }], 15000)).toBeTypeOf("string");
  });
  it("checks the free-throw position against its clock and limits five shots", () => {
    const { arcade: c } = createArcade("freethrow");
    expect(validateArcade("freethrow", c, [{ at: 300, value: 500 }], 20000)).toBeTypeOf("string");
    expect(validateArcade("freethrow", c, [{ at: 300, value: 2000 }], 20000)).toBeTypeOf("string");
    expect(validateArcade("freethrow", c, [...run("freethrow", c), { at: 19999, value: 500 }], 20000)).toBeTypeOf("string");
  });
  it("enforces the watch phase and the end of a memory run", () => {
    const { arcade: c } = createArcade("memory");
    expect(validateArcade("memory", c, [{ at: 100, value: c.sequence[0] }], 25000)).toBeTypeOf("string");
    expect(validateArcade("memory", c, [{ at: 1800, value: 5 }], 25000)).toBeTypeOf("string");
    const miss = { at: 1800, value: (c.sequence[0] + 1) % 4 };
    expect(validateArcade("memory", c, [miss], 25000)).toMatchObject({ score: 0 });
    expect(validateArcade("memory", c, [miss, { at: 2200, value: c.sequence[0] }], 25000)).toBeTypeOf("string");
    expect(validateArcade("memory", c, [...run("memory", c), { at: 2400, value: c.sequence[0] }], 25000)).toBeTypeOf("string");
  });
  it("checks the actual math choices and the first wrong higher/lower card", () => {
    const { arcade: c } = createArcade("math");
    expect(validateArcade("math", c, [{ at: 500, value: 99999 }], 20000)).toBeTypeOf("string");
    expect(validateArcade("math", c, run("math", c).concat({ at: 19999, value: 1 }), 20000)).toBeTypeOf("string");
    const miss = { at: 500, value: -Math.sign(c.deck[1] - c.deck[0]) };
    expect(validateArcade("higherlower", c, [miss], 20000)).toMatchObject({ score: 0 });
    expect(validateArcade("higherlower", c, [miss, { at: 1000, value: 1 }], 20000)).toBeTypeOf("string");
    expect(validateArcade("higherlower", c, [{ at: 500, value: 0 }], 20000)).toBeTypeOf("string");
  });
});

describe("chat, lifecycle and existing league results", () => {
  for (const game of Object.keys(ARCADE) as ArcadeGame[]) {
    it("starts and challenges " + game + " from chat", () => {
      const round = makeRound(game);
      expect(round.game).toBe(game);
      expect(round.seconds).toBe(ARCADE[game].seconds);
      const challenge = makeRound(game, true);
      expect(challenge.game).toBe(game);
      expect(challenge.opponent).toBe("Maya");
      expect(brain.roundCard(challenge)).toMatchObject({ title: "Sritej vs Maya", path: "/r/" + challenge.id });
    });
  }
  it("lists games on one line and recognizes the owner-facing aliases", () => {
    const reply = turn("Nickel, games");
    for (const game of Object.values(ARCADE)) expect(reply.line).toContain(game.title);
    expect(reply.line).not.toContain("\n");
    expect(arcadeGame("play basketball")).toBe("freethrow");
    expect(arcadeGame("play cup pong")).toBe("freethrow");
    expect(arcadeGame("higher or lower")).toBe("higherlower");
    expect(makeRound("higher or lower").game).toBe("higherlower");
  });
  it("persists the first start, records once, and restores the result rather than improving it", () => {
    const round = makeRound("math");
    const start = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    try {
      expect(brain.recordResult(round.id, { name: "Alex", arcade: { action: "finish", events: [] } }).ok).toBe(false);
      const first = brain.recordResult(round.id, { name: "Alex", arcade: { action: "start" } });
      clock.mockReturnValue(start + 3000);
      expect(brain.recordResult(round.id, { name: "Alex", arcade: { action: "start" } }).attempt).toEqual(first.attempt);
      expect(JSON.parse(readFileSync(dir + "/store.json", "utf8")).rounds[round.id].arcadeAttempts.Alex.startedAt).toBe(start);
      clock.mockReturnValue(start + 20000);
      const result = brain.recordResult(round.id, { name: "Alex", arcadeOutcome: { score: 9999, label: "forged", won: true }, arcade: { action: "finish", events: run("math", round.arcade as ArcadeChallenge) } });
      expect(result.ok).toBe(true);
      expect(result.result?.score).toBe(20);
      expect(result.points?.total).toBeGreaterThan(1);
      const savedNickels = brain.internals.store.nickels.Alex;
      const reopened = brain.recordResult(round.id, { name: "Alex", arcade: { action: "status" } });
      expect(reopened.result).toEqual(result.result);
      expect(brain.recordResult(round.id, { name: "Alex", arcade: { action: "finish", abandoned: true } }).result).toEqual(result.result);
      expect(brain.internals.store.nickels.Alex).toBe(savedNickels);
      expect(result.board).toEqual([{ name: "Alex", score: 20, label: "20/20 correct" }]);
      expect(turn("Nickel, who won").line).toContain("20/20 correct");
    } finally { clock.mockRestore(); }
  });
  it("compares both challengers' actual scores in who won", () => {
    const round = makeRound("math", true);
    const start = Date.now(), clock = vi.spyOn(Date, "now").mockReturnValue(start);
    try {
      for (const name of ["Sritej", "Maya"]) brain.recordResult(round.id, { name, arcade: { action: "start" } });
      clock.mockReturnValue(start + 20000);
      brain.recordResult(round.id, { name: "Sritej", arcade: { action: "finish", events: run("math", round.arcade as ArcadeChallenge) } });
      const second = brain.recordResult(round.id, { name: "Maya", arcade: { action: "finish", events: [] } });
      expect(second.line).toContain("Sritej beat Maya on score");
      expect(turn("Nickel, who won").line).toContain("Sritej beat Maya on score");
    } finally { clock.mockRestore(); }
  });
  it("can abandon a started run, but a new status request never creates an attempt", () => {
    const round = makeRound("reaction");
    expect(brain.recordResult(round.id, { name: "Dev", arcade: { action: "status" } }).attempt).toBeNull();
    brain.recordResult(round.id, { name: "Dev", arcade: { action: "start" } });
    const result = brain.recordResult(round.id, { name: "Dev", arcade: { action: "finish", abandoned: true } });
    expect(result.result?.score).toBe(0);
    expect(result.points?.total).toBe(1);
  });
  it("does not accept events after the countdown, even when submitted much later", () => {
    const round = { id: "late", game: "math", ...createArcade("math"), arcadeAttempts: { Alex: { startedAt: 0, deadline: 20000 } } };
    const result = arcadeSubmission(round, "Alex", { arcade: { action: "finish", events: [{ at: 20001, value: round.arcade.questions[0].answer }] } }, [], () => {}, 50000);
    expect(result).toMatchObject({ reply: { ok: false } });
  });
  it("uses the authenticated actor for the new lifecycle actions", async () => {
    const p = brain.profileFor("+15555550123", "Maya");
    const claimed = claimProfile(p.token, issueClaim(p.token));
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    const cookie = sessionCookie(claimed.sid, false);
    const request = (body: object) => new Request("http://localhost/api/rounds/math-test/result", { method: "POST", headers: { cookie, host: "localhost", "content-type": "application/json" }, body: JSON.stringify(body) });
    const allowed = await authGate(request({ arcade: { action: "start" } }));
    expect(allowed).not.toBeInstanceOf(Response);
    if (allowed instanceof Response) return;
    expect(await allowed.request.json()).toMatchObject({ name: "Maya", verified: true, arcade: { action: "start" } });
    const spoofed = await authGate(request({ name: "Alex", arcade: { action: "finish", abandoned: true } }));
    expect(spoofed).toBeInstanceOf(Response);
    expect((spoofed as Response).status).toBe(403);
  });
});
