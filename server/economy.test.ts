import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { defineTestApp } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../convex/schema.js";
import * as economyModule from "../convex/economy.js";
import * as money from "../convex/money.js";
import { economyRoute, onHeadToHead, onPlayed, onRoundClosed, onRoundOpened, chestFeed, seasonStats, useBackend } from "./economy.js";

const testApp = defineTestApp({ schema }).defineModules({ economy: economyModule, money });
const t = testApp.createTest();
const CHAT = "chat-1";
const MAYA = "+14085550001";
const DEV = "+14085550002";
const base = "https://nickel.test";
const get = (path: string, phone: string | null, headers: Record<string, string> = {}) => economyRoute(new Request(base + path, { headers }), phone);
const post = (path: string, phone: string | null, body: unknown = {}, headers: Record<string, string> = {}) => economyRoute(new Request(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }), phone);

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 10, 16, 17));
  process.env.NICKEL_CHEST_SECRET = "server-test";
  process.env.NICKEL_TURN_SECRET = "turn-secret";
  useBackend({ run: (kind, name, args) => (kind === "query" ? t.query(makeFunctionReference<"query">(name), args) : t.mutation(makeFunctionReference<"mutation">(name), args)) });
  await t.run(async (ctx) => {
    const maya = await ctx.db.insert("players", { phone: MAYA, name: "Maya", kyc: "none", status: "active", dailyLimitCents: 100, consentAt: 1, createdAt: 0 });
    const dev = await ctx.db.insert("players", { phone: DEV, name: "Dev", kyc: "none", status: "active", dailyLimitCents: 100, consentAt: 1, createdAt: 0 });
    const groupId = await ctx.db.insert("groups", { chatId: CHAT, name: "Day Ones", commissionerId: maya, mode: "cash", buyInCents: 0, seasonStart: 0, createdAt: 0 });
    for (const playerId of [maya, dev]) {
      await ctx.db.insert("groupMembers", { groupId, playerId, joinedAt: 0 });
      await money.postMove(ctx, { from: money.WORLD, to: money.playerWallet(playerId), amountCents: 50, reason: "top_up", key: "top:" + playerId, actor: "whop" });
    }
  });
});
afterAll(() => {
  useBackend(null);
  vi.useRealTimers();
  delete process.env.NICKEL_TURN_SECRET;
});

describe("economy routes", () => {
  it("ignores other paths and needs a session or the server secret", async () => {
    expect(await get("/api/wallet", MAYA)).toBeNull();
    expect((await get("/api/chest", null))!.status).toBe(401);
    expect((await get("/api/chest?phone=" + encodeURIComponent(MAYA), null))!.status).toBe(401);
    expect((await get("/api/chest?phone=" + encodeURIComponent(MAYA), null, { "x-nickel-secret": "wrong" }))!.status).toBe(401);
    expect((await (await get("/api/chest?phone=" + encodeURIComponent(MAYA), null, { "x-nickel-secret": "turn-secret" }))!.json()).available).toBe(true);
  });

  it("opens and skips the chest for the session's player", async () => {
    const state = await (await get("/api/chest", MAYA))!.json();
    expect(state).toMatchObject({ available: true, opened: null });
    expect(state.odds.map((o: { pct: number }) => o.pct)).toEqual([60, 30, 10]);
    const opened = await (await post("/api/chest/open", MAYA, { phone: DEV }))!.json();
    expect(["points", "perk", "cash"]).toContain(opened.result.kind);
    expect(opened.line.startsWith("Maya pulled ")).toBe(true);
    expect((await (await get("/api/chest", MAYA))!.json()).opened).toEqual(opened.result);
    expect((await (await get("/api/chest", DEV))!.json()).available).toBe(true);
    expect(await (await post("/api/chest/skip", DEV, {}, { "x-nickel-secret": "turn-secret" }))!.json()).toEqual({ ok: true });
    expect(await chestFeed(CHAT)).toEqual([opened.line]);
  });

  it("runs a round through the hooks and a heist through the routes", async () => {
    expect((await onRoundOpened(CHAT, "r1"))!.placed).toHaveLength(2);
    expect(await onPlayed(CHAT, "r1", MAYA, 12)).toEqual({ kept: true, nickels: 1, cents: 5 });
    expect(await onRoundClosed(CHAT, "r1")).toMatchObject({ loose: ["Dev"], locked: [] });
    const list = await (await get("/api/heist", MAYA))!.json();
    expect(list.loose).toEqual([expect.objectContaining({ victim: "Dev", nickels: 1, cents: 5, ghostMs: null, peek: false })]);
    expect((await post("/api/heist/" + list.loose[0].id + "/attempt", MAYA, {}))!.status).toBe(400);
    expect((await post("/api/heist/" + list.loose[0].id + "/peek", MAYA))!.status).toBe(409);
    const won = await (await post("/api/heist/" + list.loose[0].id + "/attempt", MAYA, { ms: 5050 }))!.json();
    expect(won).toEqual({ won: true, ghostMs: 300, took: { nickels: 1, cents: 5 } });
    const again = await post("/api/heist/" + list.loose[0].id + "/attempt", MAYA, { ms: 5000 });
    expect([again!.status, (await again!.json()).error]).toEqual([409, "That nickel is not loose anymore"]);
    expect(await onHeadToHead(CHAT, MAYA, DEV)).toEqual({ nickels: 0, cents: 0 });
    expect(await onRoundOpened("unknown-chat", "r1")).toBeNull();
    expect((await seasonStats(CHAT))!.map((s) => [s.name, s.steals, s.timesRobbed])).toEqual([["Maya", 1, 0], ["Dev", 0, 1]]);
  });
});
