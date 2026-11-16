// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let brain: typeof import("./brain.js");
beforeAll(async () => {
  vi.stubEnv("NICKEL_DATA_DIR", mkdtempSync(tmpdir() + "/nickel-banter-"));
  vi.stubEnv("CONVEX_URL", "");
  brain = await import("./brain.js");
  brain.profileFor("+15550005555", "Peyton");
});
afterAll(() => vi.unstubAllEnvs());

const turn = (text: string, extra = {}) => brain.handleTurn({ text, sender: "Sritej", trusted: true, baseUrl: "https://nickel.test", ...extra });

describe("banter is not a game invitation", () => {
  it("roasts the person named in the actual reported message despite stale game hints", () => {
    const before = JSON.stringify(brain.internals.store.rounds);
    const reply = turn("Nickel Peyton's being sore and like making fun of us pls make fun of him", { opponent: "Peyton", game: "wordle" });
    expect(reply.line).toContain("Peyton");
    expect(reply.line).not.toMatch(/called out|challenge|Wordle/i);
    expect(reply.card).toBeUndefined();
    expect(reply.url).toBeUndefined();
    expect(JSON.stringify(brain.internals.store.rounds)).toBe(before);
  });

  it("handles direct names and self-roasts without inventing a result", () => {
    for (const text of ["Nickel make fun of Peyton", "Nickel roast Peyton", "Nickel clown Peyton"]) {
      expect(turn(text, { opponent: "Peyton", game: "wordle" }).line).toContain("Peyton");
    }
    expect(turn("Nickel roast me").line).toContain("Sritej");
    expect(brain.internals.store.results).toEqual([]);
  });

  it("asks who a pronoun refers to rather than trusting a stale opponent hint", () => {
    const reply = turn("Nickel make fun of him", { opponent: "Peyton", game: "wordle" });
    expect(reply.line).toContain("Give me a name");
    expect(reply.card).toBeUndefined();
  });

  it("does not let opponent metadata turn unrelated chat into a challenge", () => {
    const before = Object.keys(brain.internals.store.rounds).length;
    const reply = turn("Nickel Peyton is being sore", { opponent: "Peyton", game: "wordle" });
    expect(reply.card).toBeUndefined();
    expect(Object.keys(brain.internals.store.rounds)).toHaveLength(before);
    expect(turn("Nickel challenge Peyton to wordle", { opponent: "Peyton", game: "wordle" }).card?.path).toMatch(/^\/r\/wordle-/);
    expect(turn("Nickel run it", { opponent: "Peyton", game: "krillion" }).card?.path).toMatch(/^\/r\/krill-/);
  });
});
