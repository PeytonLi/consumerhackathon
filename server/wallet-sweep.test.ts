// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

let brain: typeof import("./brain.js");
let wallet: typeof import("./wallet.js");

beforeAll(async () => {
  vi.stubEnv("NICKEL_DATA_DIR", mkdtempSync(tmpdir() + "/nickel-multi-pot-"));
  vi.stubEnv("CONVEX_URL", "");
  brain = await import("./brain.js");
  wallet = await import("./wallet.js");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-10T20:00:00Z"));
});

afterAll(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("sweeps every open pot, not just the most recently proposed one", () => {
  const store = brain.internals.store;
  for (const id of ["pot-older", "pot-latest", "pot-settled"]) {
    store.pots[id] = { id, amountCents: 100, league: "Friends", proposer: "Maya", members: {}, createdAt: Date.now() };
    for (const name of ["Maya", "Peyton"]) {
      expect(wallet.topUp(name, 100).ok).toBe(true);
      expect(wallet.payBuyIn(id, name).ok).toBe(true);
    }
  }
  Object.assign(store.pots["pot-settled"], { settled: true });
  store.latestPot = "pot-latest";
  store.results.push({ roundId: "round-played", name: "Maya", line: "Maya finished", at: Date.now() });
  const now = Date.parse("2026-07-11T08:00:00Z");
  const swept = wallet.sweepForfeits(now);
  expect(swept).toHaveLength(2);
  expect(wallet.walletBalance("Maya")).toBe(200);
  expect(wallet.walletBalance("Peyton")).toBe(0);
  expect(store.pots["pot-older"].members).toEqual({ Maya: "paid" });
  expect(store.pots["pot-latest"].members).toEqual({ Maya: "paid" });
  expect(store.pots["pot-settled"].members).toEqual({ Maya: "paid", Peyton: "paid" });
  expect(wallet.sweepForfeits(now)).toEqual([]);
  expect(wallet.ledgerSum("Maya")).toBe(200);
});
