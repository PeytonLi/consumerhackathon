// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterAll, expect, it, vi } from "vitest";

afterAll(() => vi.unstubAllEnvs());

it("does not count legacy missed games as wins in streaks or group memory", async () => {
  vi.stubEnv("NICKEL_DATA_DIR", mkdtempSync(tmpdir() + "/nickel-history-"));
  vi.stubEnv("CONVEX_URL", "");
  const brain = await import("./brain.js");
  const hub = await import("./hub.js");
  const profile = brain.profileFor("+15550003333", "Maya");
  brain.saveProfile(profile.token, { name: "Maya" });
  brain.internals.store.results.push(
    { roundId: "legacy-wordle", name: "Maya", line: "Maya missed Wordle Blitz", at: 1000 },
    { roundId: "legacy-krillion", name: "Maya", line: "Maya wiped out on One in a Krillion", at: 2000 },
  );
  expect(hub.hub(null).roster.members.find((m) => m.name === "Maya")?.streak).toEqual({ won: false, count: 2 });
  expect(hub.memoryOf("Maya")).toContain("Maya has lost 2 in a row");
  expect(hub.memoryOf("Maya")).not.toContain("Maya has won 2 in a row");
});
