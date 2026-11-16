// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { createArcade, validateArcade, type ArcadeGame } from "./arcade.js";

function client(game: ArcadeGame, practice = true, options: { failFinishOnce?: boolean; rejectFinishOnce?: boolean; saved?: boolean } = {}) {
  let now = 100000;
  let frame: (() => void) | undefined;
  const elements = new Map<string, any>();
  let retryVisible = false;
  const element = (id: string): any => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: "", textContent: "", disabled: false, style: { setProperty() {} }, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} }, handlers: {} as Record<string, Function>,
      setAttribute() {}, removeAttribute() {}, append() {}, remove() { if (id === "retry-save") retryVisible = false; },
      addEventListener(type: string, fn: Function) { this.handlers[type] = fn; },
      querySelector: (selector: string) => element(selector), querySelectorAll: () => [],
      insertAdjacentHTML(_where: string, html: string) { if (html.includes('id="retry-save"')) retryVisible = true; },
      click() { this.handlers.click?.({ detail: 0 }); },
    });
    return elements.get(id);
  };
  const challenge = createArcade(game).arcade;
  challenge.reactionWaits = [3000, 3000, 3000];
  const requests: any[] = [];
  const fetch = vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (body.arcade?.action === "finish" && requests.filter((r) => r.arcade.action === "finish").length === 1) {
      if (failFinishOnce) throw new Error("Offline");
      if (rejectFinishOnce) return { ok: true, json: async () => ({ ok: false, error: "Invalid trace" }) };
    }
    return { ok: true, json: async () => body.arcade?.action === "start"
      ? { ok: true, serverNow: now, attempt: { startedAt: now, deadline: now + 25000 } }
      : { ok: true, serverNow: now, board: [], result: body.arcade?.action === "finish" || saved ? { score: 0, label: "0 steps", won: false } : null } };
  });
  const { failFinishOnce, rejectFinishOnce, saved } = options;
  const window: any = { ROUND: { id: "test", game, arcade: challenge }, ME: { name: "Alex" }, addEventListener() {} };
  const document = { getElementById: (id: string) => id === "retry-save" && !retryVisible ? null : element(id), createElement: element, body: element("body"), documentElement: element("html"), addEventListener() {} };
  runInNewContext(readFileSync("apps/preview/arcade.js", "utf8"), {
    window, document, location: { search: practice ? "?practice=1" : "", origin: "http://localhost" },
    URLSearchParams, Date: class extends Date { static now() { return now; } },
    navigator: {}, localStorage: { getItem() {}, setItem() {}, removeItem() {} },
    requestAnimationFrame: (fn: () => void) => { frame = fn; return 1; }, cancelAnimationFrame: () => { frame = undefined; },
    setTimeout: () => 1, clearTimeout() {}, fetch, AbortController, parent: window,
  });
  return {
    element, challenge, requests,
    tap: (id: string) => element(id).click(),
    at: (ms: number) => { now = 100000 + ms; const next = frame; frame = undefined; next?.(); },
    settle: async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); },
  };
}

describe("arcade quality and fairness", () => {
  it("does not reveal math answers by their numeric rank or button position", () => {
    let seed = 42;
    const random = vi.spyOn(Math, "random").mockImplementation(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296));
    try {
      const ranks = new Set<number>(), positions = new Set<number>();
      for (let n = 0; n < 30; n++) for (const q of createArcade("math").arcade.questions) {
        expect(new Set(q.choices).size).toBe(3);
        expect(q.choices.every((v) => v >= 0 && Number.isInteger(v))).toBe(true);
        ranks.add([...q.choices].sort((a, b) => a - b).indexOf(q.answer));
        positions.add(q.choices.indexOf(q.answer));
      }
      expect([...ranks].sort()).toEqual([0, 1, 2]);
      expect([...positions].sort()).toEqual([0, 1, 2]);
    } finally { random.mockRestore(); }
  });

  it("does not overweight the adjacent no-tie card in a deterministic sample", () => {
    let seed = 2026;
    const random = vi.spyOn(Math, "random").mockImplementation(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296));
    const counts = Array.from({ length: 14 }, () => Array(14).fill(0));
    try {
      for (let n = 0; n < 3000; n++) {
        const c = createArcade("higherlower").arcade;
        for (let i = 1; i < c.deck.length; i++) {
          expect(c.deck[i]).not.toBe(c.deck[i - 1]);
          counts[c.deck[i - 1]][c.deck[i]]++;
        }
      }
      for (let current = 2; current <= 13; current++) {
        const values = counts[current].slice(2).filter((_, i) => i + 2 !== current);
        expect(Math.max(...values) / Math.min(...values)).toBeLessThan(1.8);
      }
    } finally { random.mockRestore(); }
  });

  it("starts new shot meters at an edge, while accepting old round traces", () => {
    const c = createArcade("freethrow").arcade;
    const at = 100;
    const edge = Math.round((1 - Math.cos(at / 1000 * c.speeds[0] / 2)) * 500);
    expect(edge).toBeLessThan(10);
    expect(validateArcade("freethrow", c, [{ at, value: edge }], 20000)).toMatchObject({ score: 0 });
    expect(validateArcade("freethrow", c, [{ at, value: 500 }], 20000)).toBeTypeOf("string");
    delete c.qualityVersion;
    const legacy = Math.round((Math.sin(at / 1000 * c.speeds[0]) + 1) * 500);
    expect(validateArcade("freethrow", c, [{ at, value: legacy }], 20000)).not.toBeTypeOf("string");
  });

  it("scores reaction time from a displayed cue within the attempt, including delayed frames", () => {
    const c = createArcade("reaction").arcade;
    c.reactionWaits = [3000, 3000, 3000];
    expect(validateArcade("reaction", c, [{ at: 3500, cueAt: 3200, value: 300 }], 15000)).toMatchObject({ score: 233 });
    expect(validateArcade("reaction", c, [{ at: 3500, cueAt: 2999, value: 501 }], 15000)).toBeTypeOf("string");
    expect(validateArcade("reaction", c, [{ at: 4500, cueAt: 4200, value: 300 }], 15000)).toMatchObject({ score: 233 });
    expect(validateArcade("reaction", c, [{ at: 4500, cueAt: 4501, value: 300 }], 15000)).toBeTypeOf("string");
    expect(validateArcade("reaction", c, [{ at: 100, value: 0 }], 15000)).toMatchObject({ score: 0 });
  });

  it("uses the first rendered reaction frame, not the earlier scheduled time", async () => {
    const c = client("reaction", false);
    await c.settle();
    c.tap("start");
    await c.settle();
    c.at(3200);
    expect(c.element("signal-title").textContent).toBe("Tap now");
    c.at(3500);
    c.tap("signal");
    c.at(25000);
    await c.settle();
    expect(c.requests.at(-1).arcade.events).toEqual([{ at: 3500, value: 300, cueAt: 3200 }]);
  });

  it("gives memory a get-ready beat and separates watching from tapping", () => {
    const c = client("memory");
    c.tap("start");
    expect(c.element("memory-caption").textContent).toBe("Get ready…");
    expect(c.element("pad-0").disabled).toBe(true);
    c.at(2050);
    expect(c.element("pad-0").disabled).toBe(true);
    c.at(2100);
    expect(c.element("memory-message").textContent).toBe("Your turn");
    expect(c.element("pad-0").disabled).toBe(false);
    c.tap("pad-" + c.challenge.sequence[0]);
    expect(c.element("memory-best").innerHTML).toContain("1");
  });

  it("holds wrong math answers long enough to read, without allowing double input", () => {
    const c = client("math");
    c.tap("start");
    const q = c.challenge.questions[0];
    const wrong = q.choices.findIndex((value) => value !== q.answer);
    c.at(1000);
    c.tap("answer-" + wrong);
    expect(c.element("answer-mark").textContent).toBe("Answer: " + q.answer);
    c.tap("answer-" + wrong);
    c.at(1500);
    expect(c.element("answer-0").disabled).toBe(true);
    c.at(1650);
    expect(c.element("question-number").textContent).toBe("Question 2 of 20");
  });

  it("expires every practice game with a result and makes no result requests", () => {
    for (const game of ["reaction", "freethrow", "memory", "math", "higherlower"] as const) {
      const c = client(game);
      c.tap("start");
      c.at(25000);
      expect(c.element("stage").innerHTML).toContain("Practice complete");
      expect(c.element("stage").innerHTML).toContain("no points recorded");
      expect(c.requests).toEqual([]);
      c.tap("practice");
      expect(c.element("dock").innerHTML).toContain("Start practice");
    }
  });

  it("keeps an unsaved trace and retries it unchanged after a connection failure", async () => {
    const c = client("math", false, { failFinishOnce: true });
    await c.settle();
    c.tap("start");
    await c.settle();
    c.at(1000);
    c.tap("answer-0");
    c.at(25000);
    await c.settle();
    expect(c.element("save-state").textContent).toContain("Not saved yet");
    expect(c.element("share").hidden).toBe(true);
    c.tap("retry-save");
    await c.settle();
    const finishes = c.requests.filter((r) => r.arcade.action === "finish");
    expect(finishes).toHaveLength(2);
    expect(finishes[1]).toEqual(finishes[0]);
    expect(c.element("save-state").textContent).toBe("Saved to your league");
    expect(c.element("practice").disabled).toBe(false);
  });

  it("offers an explicit zero-result end action for a rejected run", async () => {
    const c = client("math", false, { rejectFinishOnce: true });
    await c.settle();
    c.tap("start");
    await c.settle();
    c.at(25000);
    await c.settle();
    expect(c.element("save-state").textContent).toContain("End this run to record zero");
    expect(c.element("retry-save").textContent).toBe("End run");
    c.tap("retry-save");
    await c.settle();
    expect(c.requests.at(-1).arcade).toMatchObject({ action: "finish", abandoned: true, events: [] });
    expect(c.element("save-state").textContent).toBe("Saved to your league");
  });

  it("reopens a saved zero instead of offering a second official start", async () => {
    const c = client("memory", false, { saved: true });
    await c.settle();
    expect(c.element("stage").innerHTML).toContain("Official result");
    expect(c.element("dock").innerHTML).not.toContain('id="start"');
    expect(c.requests.map((r) => r.arcade.action)).toEqual(["status"]);
  });
});
