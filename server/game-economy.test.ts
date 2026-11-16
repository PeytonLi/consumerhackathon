// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

vi.mock("./economy.js", () => ({
  onRoundOpened: vi.fn(),
  onPlayed: vi.fn(),
  onRoundClosed: vi.fn(),
}));

import { onPlayed, onRoundClosed, onRoundOpened } from "./economy.js";
import { attachGameEconomy, dailyWindow, flushGameEconomy, openDailyEconomy, recordEconomyPlay, type GameEconomyStore } from "./game-economy.js";

const PHONE = "+14085550001";
let store: GameEconomyStore;
let save: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T20:00:00-08:00"));
  vi.stubEnv("NICKEL_DATA_DIR", mkdtempSync(tmpdir() + "/nickel-economy-"));
  vi.stubEnv("CONVEX_URL", "");
  vi.clearAllMocks();
  vi.mocked(onRoundOpened).mockResolvedValue({ placed: [] });
  vi.mocked(onPlayed).mockResolvedValue({ kept: true, nickels: 1, cents: 0 });
  vi.mocked(onRoundClosed).mockResolvedValue({ loose: [], locked: [], heistEndsAt: null });
  store = {};
  save = vi.fn();
  attachGameEconomy(() => store, save);
});

afterEach(async () => {
  await flushGameEconomy();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("daily game economy", () => {
  it.each([
    ["2026-07-15T12:00:00Z", "2026-07-16T04:00:00Z"],
    ["2026-11-15T12:00:00Z", "2026-11-16T05:00:00Z"],
    ["2026-03-08T09:30:00Z", "2026-03-09T04:00:00Z"],
    ["2026-11-01T08:30:00Z", "2026-11-02T05:00:00Z"],
  ])("closes at 9 PM Pacific across DST: %s", (now, close) => {
    expect(dailyWindow(Date.parse(now)).closesAt).toBe(Date.parse(close));
  });

  it("uses wallet group mapping and a single table across games, results, and launches", async () => {
    openDailyEconomy("Day Ones", PHONE);
    recordEconomyPlay("Day Ones", PHONE, 8);
    recordEconomyPlay("Day Ones", PHONE, 12);
    await flushGameEconomy();
    openDailyEconomy("Day Ones", PHONE);
    await flushGameEconomy();
    expect(onRoundOpened).toHaveBeenCalledExactlyOnceWith("league:Day Ones", "daily:2026-11-15", [PHONE]);
    expect(onPlayed).toHaveBeenCalledExactlyOnceWith("league:Day Ones", "daily:2026-11-15", PHONE, 8);
    expect(save).toHaveBeenCalled();
  });

  it("does not create identities, opt players in, or accept anonymous and profile keys", async () => {
    for (const phone of ["", "Maya", "profile:me-test"]) {
      openDailyEconomy("Day Ones", phone);
      recordEconomyPlay("Day Ones", phone, 5);
    }
    recordEconomyPlay("Day Ones", PHONE, NaN);
    await flushGameEconomy();
    expect(store.gameEconomy).toBeUndefined();
    expect(onRoundOpened).not.toHaveBeenCalled();
    expect(onPlayed).not.toHaveBeenCalled();
  });

  it("only opens explicitly participating phones, never the rest of the group", async () => {
    openDailyEconomy("Day Ones", PHONE);
    await flushGameEconomy();
    const rival = "+14085550002";
    openDailyEconomy("Day Ones", rival);
    await flushGameEconomy();
    expect(onRoundOpened).toHaveBeenNthCalledWith(1, "league:Day Ones", "daily:2026-11-15", [PHONE]);
    expect(onRoundOpened).toHaveBeenNthCalledWith(2, "league:Day Ones", "daily:2026-11-15", [rival]);
    expect(onPlayed).not.toHaveBeenCalled();
  });

  it("retries offline opens and pending plays without blocking callers", async () => {
    vi.mocked(onRoundOpened).mockResolvedValueOnce(null);
    vi.mocked(onPlayed).mockResolvedValueOnce(null);
    expect(recordEconomyPlay("Day Ones", PHONE, 7)).toBeUndefined();
    await flushGameEconomy();
    expect(onPlayed).not.toHaveBeenCalled();
    await flushGameEconomy();
    const recovered = JSON.parse(JSON.stringify(store));
    attachGameEconomy(() => recovered, save);
    await flushGameEconomy();
    expect(onRoundOpened).toHaveBeenCalledTimes(2);
    expect(onPlayed).toHaveBeenCalledTimes(2);
    expect(Object.values(recovered.gameEconomy)[0]).toMatchObject({ members: { [PHONE]: { opened: true } }, plays: { [PHONE]: { done: true } } });
  });

  it("closes once after restart and sleep, retrying failed closes", async () => {
    openDailyEconomy("Day Ones", PHONE);
    await flushGameEconomy();
    const recovered = JSON.parse(JSON.stringify(store));
    attachGameEconomy(() => recovered, save);
    vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
    vi.mocked(onRoundClosed).mockResolvedValueOnce(null);
    await flushGameEconomy();
    await flushGameEconomy();
    await flushGameEconomy();
    expect(onRoundClosed).toHaveBeenCalledTimes(2);
    expect(onRoundClosed).toHaveBeenLastCalledWith("league:Day Ones", "daily:2026-11-15");
    expect(onRoundOpened).toHaveBeenCalledTimes(1);
  });

  it("never reopens expired uncertain opens on a later day", async () => {
    vi.mocked(onRoundOpened).mockResolvedValueOnce(null);
    recordEconomyPlay("Day Ones", PHONE, 4);
    await flushGameEconomy();
    vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
    await flushGameEconomy();
    expect(onRoundOpened).toHaveBeenCalledTimes(1);
    expect(onPlayed).toHaveBeenCalledOnce();
    expect(onRoundClosed).toHaveBeenCalledOnce();
  });

  it("does not create a table or pay a late result at or after the cutoff", async () => {
    vi.setSystemTime(new Date("2026-11-15T21:00:00-08:00"));
    recordEconomyPlay("Day Ones", PHONE, 4);
    openDailyEconomy("Day Ones", PHONE);
    await flushGameEconomy();
    expect(onRoundOpened).not.toHaveBeenCalled();
    expect(onPlayed).not.toHaveBeenCalled();
  });
});

describe("real result hooks", () => {
  it("only queues newly recorded, authenticated results, not status/start/invalid/unverified replays", async () => {
    const brain = await import("./brain.js");
    attachGameEconomy(() => store, save);
    const make = (text: string) => {
      const reply = brain.handleTurn({ text, sender: "Maya", baseUrl: "https://nickel.test" });
      return brain.getRound(reply.card!.path.slice(3))!;
    };
    const arcade = make("Nickel, play reaction");
    brain.recordResult(arcade.id, { name: "Maya", verified: true, arcade: { action: "status" } }, PHONE);
    await flushGameEconomy();
    expect(onRoundOpened).not.toHaveBeenCalled();
    brain.recordResult(arcade.id, { name: "Maya", verified: true, practice: true, arcade: { action: "start" } }, PHONE);
    await flushGameEconomy();
    expect(onRoundOpened).not.toHaveBeenCalled();
    brain.recordResult(arcade.id, { name: "Maya", verified: true, arcade: { action: "start" } }, PHONE);
    brain.recordResult(arcade.id, { name: "Maya", verified: true, arcade: { action: "start" } }, PHONE);
    await flushGameEconomy();
    expect(onRoundOpened).toHaveBeenCalledOnce();
    brain.recordResult(arcade.id, { name: "Maya", verified: true, arcade: { action: "finish", events: [{ at: -1, value: 0 }] } }, PHONE);
    const wordle = make("Nickel, new wordle");
    brain.recordResult(wordle.id, { name: "Maya", verified: true, tries: "9/6" }, PHONE);
    brain.recordResult(wordle.id, { name: "Maya", verified: false, tries: "2/6" }, PHONE);
    brain.recordResult(wordle.id, { name: "Maya", verified: true, tries: "2/6" }, PHONE);
    await flushGameEconomy();
    expect(onPlayed).not.toHaveBeenCalled();
    const official = make("Nickel, new wordle");
    brain.recordResult(official.id, { name: "Maya", verified: true, tries: "2/6" }, PHONE);
    brain.recordResult(official.id, { name: "Maya", verified: true, tries: "2/6" }, PHONE);
    await flushGameEconomy();
    expect(onPlayed).toHaveBeenCalledOnce();
    expect(onPlayed).toHaveBeenCalledWith("league:Cupertino Day Ones", "daily:2026-11-15", PHONE, expect.any(Number));

    vi.setSystemTime(new Date("2026-11-16T12:00:00-08:00"));
    brain.recordResult(arcade.id, { name: "Maya", verified: true, arcade: { action: "start" } }, PHONE);
    await flushGameEconomy();
    expect(onRoundOpened).toHaveBeenCalledOnce();
    for (const [text, path] of [["Nickel chest", "/chest"], ["Nickel, heist", "/heist"]]) {
      expect(brain.handleTurn({ text, sender: "Maya", baseUrl: "https://nickel.test" })).toMatchObject({ addressed: true, url: "https://nickel.test" + path });
    }
    expect(onPlayed).toHaveBeenCalledOnce();
  });

  it("credits only the authenticated submitter of a challenge, not the named rival", async () => {
    const brain = await import("./brain.js");
    attachGameEconomy(() => store, save);
    const reply = brain.handleTurn({ text: "Nickel, challenge Dev to rps", sender: "Maya", baseUrl: "https://nickel.test" });
    const id = reply.card!.path.slice(3);
    expect(onRoundOpened).not.toHaveBeenCalled();
    brain.recordResult(id, { name: "Maya", won: true, score: "2-1", verified: true }, PHONE);
    brain.recordResult(id, { name: "Maya", won: true, score: "2-1", verified: true }, PHONE);
    await flushGameEconomy();
    expect(onRoundOpened).toHaveBeenCalledExactlyOnceWith("league:Cupertino Day Ones", "daily:2026-11-15", [PHONE]);
    expect(onPlayed).toHaveBeenCalledOnce();
    expect(vi.mocked(onPlayed).mock.calls[0][2]).toBe(PHONE);
  });

  it("counts an authenticated custom answer once, without waiting for a later reveal", async () => {
    const custom = await import("./custom.js");
    attachGameEconomy(() => store, save);
    const game = custom.createGame(custom.planGame("lowest unique", "unique"), "Maya");
    expect(onRoundOpened).not.toHaveBeenCalled();
    expect(custom.submitAnswer(game.id, "Maya", "2", 1, true, PHONE)).toEqual({ ok: true });
    expect(custom.submitAnswer(game.id, "Maya", "3", 1, true, PHONE).ok).toBe(false);
    expect(custom.submitAnswer(game.id, "Dev", "4", 1, false, "+14085550002").ok).toBe(true);
    await flushGameEconomy();
    expect(onPlayed).toHaveBeenCalledExactlyOnceWith("league:Cupertino Day Ones", "daily:2026-11-15", PHONE, 0);
    custom.settleGame(game.id);
    await flushGameEconomy();
    expect(onPlayed).toHaveBeenCalledOnce();
  });
});
