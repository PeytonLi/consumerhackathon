// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let brain: typeof import("./brain.js");
let nace: typeof import("./nace.js");
beforeAll(async () => {
  process.env.NICKEL_DATA_DIR = mkdtempSync(tmpdir() + "/nickel-nace-");
  brain = await import("./brain.js");
  nace = await import("./nace.js");
});

type Asked = { state: unknown; questions: Record<string, { type: string; criteria?: unknown }> };
const asked: Asked[] = [];
let network: ReturnType<typeof vi.fn>;

function drex(overrides: Record<string, number | string> = {}) {
  return async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}") as Asked;
    asked.push(body);
    const answers = Object.fromEntries(Object.entries(body.questions).map(([id, q]) => {
      const set = overrides[id];
      if (q.type === "noul") return [id, { type: "noul", noul: typeof set === "number" ? set : 0.02, confidence: 0.98 }];
      if (q.type === "score") {
        const levels = q.criteria as string[];
        const pick = typeof set === "number" ? set : 0;
        return [id, { type: "score", score: pick, legend: levels, confidence: 0.9, probabilities: Object.fromEntries(levels.map((_, i) => [String(i), i === pick ? 0.9 : 0.1 / (levels.length - 1)])) }];
      }
      const labels = Object.keys(q.criteria as Record<string, unknown>);
      const [label, sure] = typeof set === "string" ? set.split("@") : [labels[labels.length - 1], ""];
      const p = sure ? Number(sure) : 0.9;
      return [id, { type: "choice", choice: label, confidence: p, probabilities: Object.fromEntries(labels.map((l) => [l, l === label ? p : (1 - p) / (labels.length - 1)])) }];
    }));
    return new Response(JSON.stringify({ model: "drex-test", answers, usage: { input_tokens: 100, output_tokens: 100 }, evaluation_time_ms: 5, request_id: "req_test" }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

const reply = (handler: (url: unknown, init?: { body?: string; signal?: AbortSignal }) => Promise<Response>) => network.mockImplementation(handler);
const turn = (text: string, sender = "Sritej") => nace.assistTurn((t) => brain.handleTurn({ text: t, sender, baseUrl: "https://nickel.test/" }), text, sender);
const plain = (text: string, sender = "Sritej") => brain.handleTurn({ text, sender, baseUrl: "https://nickel.test/" });
const isComeback = (line?: string) => brain.COMEBACKS.some((c) => line?.startsWith(c + " Try:"));

beforeEach(() => {
  asked.length = 0;
  network = vi.fn();
  vi.stubGlobal("fetch", network);
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.NACE_API_KEY = "nace_sk_test";
  delete process.env.NACE_TIMEOUT_MS;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.NACE_API_KEY;
});

describe("without Nace", () => {
  it("makes no calls and leaves every path as it was when the key is missing", async () => {
    delete process.env.NACE_API_KEY;
    expect(await nace.gradeKrillion("Pizza toppings", "anchovies")).toBeNull();
    const payload = { name: "Maya", tries: "1/1", rarity: 4, answer: "anchovies" };
    expect(await nace.gradedResult({ game: "krillion", prompt: "Pizza toppings" }, payload)).toBe(payload);
    brain.internals.store.quips = 0;
    const expected = plain("nickel whos on top rn");
    brain.internals.store.quips = 0;
    expect(await turn("nickel whos on top rn")).toEqual(expected);
    expect(isComeback(expected.line)).toBe(true);
    expect(await nace.punishmentAllowed("gets a tattoo of the winner")).toBe(true);
    expect(nace.naceStats().enabled).toBe(false);
    expect(network).not.toHaveBeenCalled();
  });
});

describe("krillion grading", () => {
  it("asks Drex once for validity and rarity and maps the level to the existing tiers", async () => {
    reply(drex({ valid: 0.97, rarity: 3 }));
    expect(await nace.gradeKrillion("Pizza toppings", " Potato ")).toEqual({ valid: true, rarity: 4, tier: "Deep Cut" });
    expect(network).toHaveBeenCalledTimes(1);
    expect(String(network.mock.calls[0][0])).toBe("https://console.nace.ai/v1/systemone");
    expect(asked[0].state).toEqual({ prompt: "Pizza toppings", answer: "Potato" });
    expect(asked[0].questions.valid.type).toBe("noul");
    expect(asked[0].questions.rarity.type).toBe("score");
    expect((asked[0].questions.rarity.criteria as string[]).length).toBe(5);
  });

  it("serves a repeat answer from the cache without a second call", async () => {
    reply(drex({ valid: 0.9, rarity: 4 }));
    const first = await nace.gradeKrillion("Animals that live in the ocean", "Vaquita");
    const again = await nace.gradeKrillion("animals that live in the ocean", "vaquita ");
    expect(first).toEqual({ valid: true, rarity: 5, tier: "One in a Krillion" });
    expect(again).toBe(first);
    expect(network).toHaveBeenCalledTimes(1);
    expect(nace.naceStats().uses.krillion.cacheHits).toBeGreaterThan(0);
  });

  it("wipes out an answer Drex calls invalid, and a wrong letter count without a call", async () => {
    reply(drex({ valid: 0.04, rarity: 4 }));
    expect(await nace.gradeKrillion("Pizza toppings", "bicycle")).toEqual({ valid: false, rarity: 0, tier: "Wipeout" });
    expect(network).toHaveBeenCalledTimes(1);
    expect(await nace.gradeKrillion("Countries with exactly 4 letters", "France")).toEqual({ valid: false, rarity: 0, tier: "Wipeout" });
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("overrides the rarity the page claims when a result is recorded", async () => {
    reply(drex({ valid: 0.95, rarity: 0 }));
    const made = plain("nickel play krillion", "Maya");
    const round = brain.getRound(made.card!.path.slice(3))!;
    round.prompt = "Pizza toppings";
    const graded = await nace.gradedResult(round, { name: "Maya", tries: "1/1", seconds: 25, rarity: 5, answer: "pepperoni" } as never);
    expect(graded).toMatchObject({ tries: "1/1", rarity: 1 });
    expect(brain.recordResult(round.id, graded).line).not.toContain("One in a Krillion answer");
    reply(drex({ valid: 0.1 }));
    expect(await nace.gradedResult(round, { name: "Alex", tries: "1/1", rarity: 5, answer: "nonsense answer" } as never)).toMatchObject({ tries: "X/1", rarity: 0 });
    const wordle = { name: "Alex", tries: "3/6", answer: "crisp" };
    expect(await nace.gradedResult({ game: "wordle" }, wordle as never)).toBe(wordle);
    const bare = { name: "Alex", tries: "1/1", rarity: 2 };
    expect(await nace.gradedResult(round, bare)).toBe(bare);
  });

  it("falls back to the page's own grade when Drex errors or is too slow", async () => {
    reply(async () => new Response(JSON.stringify({ error: { type: "overloaded", message: "busy" }, request_id: "req_x" }), { status: 529, headers: { "content-type": "application/json" } }));
    const payload = { name: "Dev", tries: "1/1", rarity: 3, answer: "olives" };
    expect(await nace.gradedResult({ game: "krillion", prompt: "Pizza toppings" }, payload)).toBe(payload);
    expect(network).toHaveBeenCalledTimes(1);
    process.env.NACE_TIMEOUT_MS = "40";
    reply((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    const started = Date.now();
    expect(await nace.gradeKrillion("Pizza toppings", "pineapple")).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
    reply(async () => { throw new TypeError("network down"); });
    expect(await nace.gradeKrillion("Pizza toppings", "ham")).toBeNull();
    expect(nace.naceStats().uses.krillion.fallbacks).toBeGreaterThanOrEqual(3);
  });
});

describe("intent routing", () => {
  it("re-dispatches a message the regexes missed to the matching command", async () => {
    reply(drex({ intent: "leaderboard" }));
    const out = await turn("nickel whos on top rn");
    expect(out.url).toBe("https://nickel.test/l");
    expect(out.react).toBeUndefined();
    expect(Object.keys(asked[0].questions.intent.criteria as object)).toEqual(["challenge", "play", "fantasy", "buy_in", "leaderboard", "punishment", "player_card", "invite", "memory", "payments", "none"]);
    reply(drex({ intent: "challenge", game: "krillion" }));
    expect((await turn("nickel run it back me and maya")).line).toBe("Sritej just called out Maya. One in a Krillion. 25 seconds, 5 Nickels on it.");
    reply(drex({ intent: "invite" }));
    expect((await turn("nickel how do my roommates get in on this")).line).toMatch(/^Everyone: text /);
    reply(drex({ intent: "buy_in" }));
    expect((await turn("nickel lets put 10 on it")).line).toBe("Sritej proposed a $10 buy-in. Say \"Nickel, I'm in\" to agree. The buy-in comes out of your wallet.");
    reply(drex({ intent: "payments" }));
    expect((await turn("nickel how much have i made")).line).toBe("Sritej, you have won $0 from pots. Your balance is private, so check it in your wallet: say \"Nickel, wallet\".");
    reply(drex({ intent: "memory" }));
    expect((await turn("nickel what have you got on alex")).line).toMatch(/^(Alex: |Nothing on Alex yet)/);
    reply(drex({ intent: "player_card" }));
    expect((await turn("nickel i want to change my pic")).url).toMatch(/\/me\/me-/);
  });

  it("maps every intent to a command the existing branches understand", () => {
    const read = (intent: string) => ({ intent, game: "unspecified", insult: false, excuse: false, nonsense: false }) as import("./nace.js").MessageRead;
    expect(nace.commandFor(read("play"), "nickel im bored")).toBe("nickel play");
    expect(nace.commandFor({ ...read("play"), game: "rps" }, "nickel im bored")).toBe("nickel play rock paper scissors");
    expect(nace.commandFor(read("challenge"), "nickel me and peyton", "Sritej")).toBe("nickel challenge Peyton");
    expect(nace.commandFor(read("challenge"), "nickel someone fight me", "Sritej")).toBe("nickel play");
    expect(nace.commandFor(read("fantasy"), "nickel one of those draft things about tacos")).toBe("nickel start a fantasy league for tacos");
    expect(nace.commandFor(read("leaderboard"), "x")).toBe("nickel leaderboard");
    expect(nace.commandFor(read("punishment"), "x")).toBe("nickel punishment");
    expect(nace.commandFor(read("memory"), "nickel spill")).toBe("nickel what do you know about us");
    expect(nace.commandFor(read("payments"), "nickel what is everyone up")).toBe("nickel balances");
    expect(nace.commandFor(read("none"), "nickel thanks")).toBeNull();
    for (const intent of ["play", "leaderboard", "punishment", "player_card", "invite", "memory", "payments", "buy_in"]) {
      expect(isComeback(plain(nace.commandFor(read(intent), "nickel hello")!).line)).toBe(false);
    }
  });

  it("does not ask Drex about commands the regexes already understand", async () => {
    reply(drex({ intent: "punishment", insult: 0.99 }));
    expect((await turn("Nickel, challenge Maya")).line).toBe("Sritej just called out Maya. Rock Paper Scissors. Best of 3, 5 Nickels on it.");
    expect((await turn("nickel leaderboard")).url).toBe("https://nickel.test/l");
    expect((await turn("nickel you suck")).react!.tapback).toBe("dislike");
    expect(await turn("who is up for dinner")).toEqual({ addressed: false });
    expect(network).not.toHaveBeenCalled();
  });

  it("keeps the comeback when Drex is unsure, fails, or times out", async () => {
    reply(drex({ intent: "leaderboard@0.3" }));
    expect(isComeback((await turn("nickel hmm what")).line)).toBe(true);
    reply(async () => new Response("{}", { status: 500 }));
    brain.internals.store.quips = 0;
    const expected = plain("nickel whos on top rn");
    brain.internals.store.quips = 0;
    expect(await turn("nickel whos on top rn")).toEqual(expected);
    process.env.NACE_TIMEOUT_MS = "40";
    reply((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    expect(isComeback((await turn("nickel whos on top rn")).line)).toBe(true);
  });
});

describe("earned reactions", () => {
  it("claps back at an insult and laughs at an excuse the keyword list missed", async () => {
    reply(drex({ insult: 0.93 }));
    const rude = await turn("nickel you are a joke of a bot");
    expect(rude.react).toEqual({ emoji: "\u{1F595}", tapback: "dislike" });
    expect(brain.CLAPBACKS).toContain(rude.line);
    reply(drex({ excuse: 0.9 }));
    const excuse = await turn("nickel my wifi died thats why i lost");
    expect(excuse.react!.tapback).toBe("laugh");
    expect(brain.EXCUSES).toContain(excuse.line);
    expect(asked[0].questions.insult.type).toBe("noul");
    expect(asked[0].questions.excuse.type).toBe("noul");
    expect(asked[0].questions.nonsense.type).toBe("noul");
  });

  it("uses one quip per turn, so a rerouted turn does not skip a line", async () => {
    reply(drex({ insult: 0.93 }));
    brain.internals.store.quips = 2;
    const rude = await turn("nickel ur mid");
    expect(rude.line).toBe(brain.CLAPBACKS[2]);
    expect(brain.internals.store.quips).toBe(3);
  });

  it("never reacts to a routed command or to a sensible message it cannot handle", async () => {
    reply(drex({ intent: "play", insult: 0.99, excuse: 0.99 }));
    expect((await turn("nickel im bored give us something to do")).react).toBeUndefined();
    reply(drex({ nonsense: 0.05 }));
    brain.internals.store.quips = 0;
    const sensible = await turn("nickel what is the weather like");
    expect(isComeback(sensible.line)).toBe(true);
    expect(sensible.react).toBeUndefined();
    reply(drex({ insult: 0.6, excuse: 0.6 }));
    brain.internals.store.quips = 1;
    expect((await turn("nickel interesting")).react).toBeUndefined();
  });

  it("keeps the question mark for real nonsense, and only every other time", async () => {
    reply(drex({ nonsense: 0.95 }));
    brain.internals.store.quips = 0;
    const huh = [await turn("nickel asdf qwerty"), await turn("nickel zxcv")];
    expect(huh.map((r) => r.react?.tapback)).toEqual(["question", undefined]);
    expect(huh.every((r) => isComeback(r.line))).toBe(true);
  });
});

describe("punishment safety", () => {
  it("allows a harmless punishment and asks all five checks in one call", async () => {
    reply(drex());
    expect(await nace.punishmentAllowed("wears a full suit to every class for a week")).toBe(true);
    expect(network).toHaveBeenCalledTimes(1);
    expect(Object.keys(asked[0].questions)).toEqual(["illegal", "dangerous", "permanent", "sexual", "alcohol"]);
    expect(asked[0].state).toContain("last place wears a full suit");
  });

  it("rejects a punishment that trips any one check", async () => {
    for (const flag of ["illegal", "dangerous", "permanent", "sexual", "alcohol"]) {
      reply(drex({ [flag]: 0.9 }));
      expect(await nace.punishmentAllowed("does something that is " + flag)).toBe(false);
    }
  });

  it("lets the researched punishment through when Drex is unavailable, as before", async () => {
    reply(async () => new Response("{}", { status: 503 }));
    expect(await nace.punishmentAllowed("runs a 5K in jeans")).toBe(true);
  });
});
