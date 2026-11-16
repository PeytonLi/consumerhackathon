import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let brain: typeof import("./brain.js");
beforeAll(async () => {
  vi.stubEnv("NICKEL_DATA_DIR", mkdtempSync(tmpdir() + "/nickel-menu-"));
  vi.stubEnv("CONVEX_URL", "");
  brain = await import("./brain.js");
});
afterAll(() => vi.unstubAllEnvs());

describe("game menu requests", () => {
  it.each(["Nickel, games", "Nickel games pls", "Nickel, games please!", "Nickel pls games", "Nickel, show me the games please", "@Nickel list games", "Nickel game menu", "Nickel arcade plz"])("lists games without starting a round for %s", (text) => {
    const rounds = JSON.stringify(brain.internals.store.rounds);
    const result = brain.handleTurn({ text, sender: "Sritej", baseUrl: "https://nickel.test", game: "wordle", opponent: "Peyton" });
    expect(result.line).toContain("Wordle Blitz, One in a Krillion, Rock Paper Scissors");
    expect(result.line).toContain("Higher or Lower");
    expect(result.url).toBeUndefined();
    expect(result.card).toBeUndefined();
    expect(JSON.stringify(brain.internals.store.rounds)).toBe(rounds);
  });

  it("still starts an explicitly requested game", () => {
    const result = brain.handleTurn({ text: "Nickel play memory please", sender: "Sritej", baseUrl: "https://nickel.test" });
    expect(result.url).toMatch(/\/r\/memory-/);
  });
});
