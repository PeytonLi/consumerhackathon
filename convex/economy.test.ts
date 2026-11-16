import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineTestApp } from "convex-test";
import schema from "./schema.js";
import * as economy from "./economy.js";
import * as money from "./money.js";
import type { Id } from "./_generated/dataModel.js";

const testApp = defineTestApp({ schema }).defineModules({ economy, money });
const api = testApp.api.economy;
const CHAT = "chat-day-ones";
const DAY = 86400000;
const MONDAY = Date.UTC(2026, 10, 16, 17);
const PHONES = { maya: "+14085550001", peyton: "+14085550002", sritej: "+14085550003" } as const;
type Name = keyof typeof PHONES;

async function setup(opts: { mode?: "cash" | "points"; house?: number; noConsent?: Name[]; balance?: Partial<Record<Name, number>> } = {}) {
  const t = testApp.createTest();
  const ids = await t.run(async (ctx) => {
    const players = {} as Record<Name, Id<"players">>;
    for (const name of Object.keys(PHONES) as Name[]) {
      players[name] = await ctx.db.insert("players", { phone: PHONES[name], name: name[0].toUpperCase() + name.slice(1), kyc: "none", status: "active", dailyLimitCents: 100, consentAt: opts.noConsent?.includes(name) ? undefined : 1, createdAt: 0 });
      const cents = opts.balance?.[name] ?? 100;
      if (cents) await money.postMove(ctx, { from: money.WORLD, to: money.playerWallet(players[name]), amountCents: cents, reason: "top_up", key: "top:" + name, actor: "whop" });
    }
    const groupId = await ctx.db.insert("groups", { chatId: CHAT, name: "Day Ones", commissionerId: players.maya, mode: opts.mode ?? "cash", buyInCents: 0, seasonStart: 0, createdAt: 0 });
    for (const playerId of Object.values(players)) await ctx.db.insert("groupMembers", { groupId, playerId, joinedAt: 0 });
    if (opts.house !== 0) await money.postMove(ctx, { from: money.WORLD, to: money.HOUSE, amountCents: opts.house ?? 1000, reason: "adjustment", key: "house", actor: "admin" });
    return { players, groupId };
  });
  const cash = (name: Name) => t.run((ctx) => money.balanceOf(ctx, money.playerWallet(ids.players[name])));
  const nickels = (name: Name) => t.run((ctx) => economy.nickelsOf(ctx, money.playerWallet(ids.players[name])));
  const grant = (name: Name, perk: economy.Perk, key: string) => t.run((ctx) => economy.addPerk(ctx, ids.players[name], perk, 1, "test", key));
  const open = (roundId: string) => t.mutation(api.roundOpened, { chatId: CHAT, roundId });
  const play = (roundId: string, name: Name) => t.mutation(api.played, { chatId: CHAT, roundId, phone: PHONES[name], score: 10 });
  const close = (roundId: string) => t.mutation(api.roundClosed, { chatId: CHAT, roundId });
  const loose = (name: Name) => t.query(api.heists, { phone: PHONES[name] });
  const start = (name: Name, stakeId: string) => {
    vi.advanceTimersByTime(1);
    return t.mutation(api.heistStart, { phone: PHONES[name], stakeId });
  };
  const stop = (name: Name, stakeId: string, ms?: number) => t.mutation(api.heistAttempt, { phone: PHONES[name], stakeId, ms });
  const attempt = async (name: Name, stakeId: string, ms: number) => {
    await start(name, stakeId);
    vi.advanceTimersByTime(ms);
    return stop(name, stakeId, ms);
  };
  const expire = async () => {
    vi.advanceTimersByTime(economy.HEIST_MS + 1000);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  };
  return { t, ...ids, cash, nickels, grant, open, play, close, loose, start, stop, attempt, expire };
}

const stakeOf = async (s: Awaited<ReturnType<typeof setup>>, thief: Name, victim: string) => (await s.loose(thief)).loose.find((l) => l.victim === victim)!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MONDAY);
  process.env.NICKEL_CHEST_SECRET = "chest-test-secret";
  delete process.env.NICKEL_CHEST_DAILY_CENTS;
});
afterEach(() => vi.useRealTimers());

describe("daily table", () => {
  it("puts one nickel and 5 cents on the table and gives both back on play", async () => {
    const s = await setup();
    expect((await s.open("r1"))!.placed).toEqual([{ name: "Maya", cents: 5 }, { name: "Peyton", cents: 5 }, { name: "Sritej", cents: 5 }]);
    expect(await s.cash("maya")).toBe(95);
    expect(await s.open("r1")).toEqual({ placed: [] });
    expect(await s.play("r1", "maya")).toEqual({ kept: true, nickels: 1, cents: 5 });
    expect(await s.play("r1", "maya")).toEqual({ kept: false, nickels: 0, cents: 0 });
    expect(await s.cash("maya")).toBe(100);
    expect(await s.nickels("maya")).toBe(1);
  });

  it("falls back to points only without consent, balance or daily room, and never moves cash in points groups", async () => {
    const s = await setup({ noConsent: ["maya"], balance: { peyton: 3 } });
    await s.t.run(async (ctx) => ctx.db.patch(s.players.sritej, { dailyLimitCents: 4 }));
    expect((await s.open("r1"))!.placed.map((p) => p.cents)).toEqual([0, 0, 0]);
    const p = await setup({ mode: "points" });
    expect((await p.open("r1"))!.placed.map((x) => x.cents)).toEqual([0, 0, 0]);
    expect(await p.cash("maya")).toBe(100);
  });

  it("uses a Lock to protect a missed day", async () => {
    const s = await setup();
    await s.grant("sritej", "lock", "g1");
    await s.open("r1");
    expect(await s.close("r1")).toMatchObject({ loose: ["Maya", "Peyton"], locked: ["Sritej"] });
    expect(await s.cash("sritej")).toBe(100);
    expect((await s.loose("maya")).perks.lock).toBe(0);
    expect((await s.loose("sritej")).perks.lock).toBe(0);
  });
});

describe("heists", () => {
  it("lets only players of the round try once, and the first ghost-beater takes the nickel and the 5 cents", async () => {
    const s = await setup();
    await s.open("r1");
    await s.play("r1", "maya");
    await s.play("r1", "peyton");
    await s.close("r1");
    expect((await s.loose("sritej")).loose).toEqual([]);
    await expect(s.attempt("sritej", (await stakeOf(s, "maya", "Sritej")).id, 5000)).rejects.toThrow(/rob yourself/);
    const target = await stakeOf(s, "maya", "Sritej");
    expect(target).toMatchObject({ nickels: 1, cents: 5, ghostMs: null, peek: false });
    expect(await s.attempt("peyton", target.id, 5400)).toEqual({ won: false, ghostMs: economy.DEFAULT_GHOST_MS, ms: 5400, took: { nickels: 0, cents: 0 } });
    await expect(s.attempt("peyton", target.id, 5000)).rejects.toThrow(/already tried/);
    expect(await s.attempt("maya", target.id, 4900)).toEqual({ won: true, ghostMs: 300, ms: 4900, took: { nickels: 1, cents: 5 } });
    await expect(s.attempt("maya", target.id, 5000)).rejects.toThrow(/not loose/);
    expect(await s.cash("maya")).toBe(105);
    expect(await s.cash("sritej")).toBe(95);
    await expect(s.attempt("maya", "garbage", 5000)).rejects.toThrow(/not loose/);
    await expect(s.attempt("maya", target.id, Number.NaN)).rejects.toThrow();
  });

  it("times every attempt on the server clock from a single start and never shows an unpeeked ghost", async () => {
    const s = await setup();
    await s.grant("peyton", "peek", "g1");
    await s.open("r1");
    await s.play("r1", "maya");
    await s.play("r1", "peyton");
    await s.close("r1");
    const sritej = (await stakeOf(s, "maya", "Sritej")).id;
    expect((await s.loose("maya")).loose.map((l) => l.ghostMs)).toEqual([null]);
    expect((await s.loose("peyton")).loose.map((l) => [l.victim, l.ghostMs])).toEqual([["Sritej", null]]);
    expect(await s.stop("peyton", sritej, 5000)).toEqual({ won: false, ghostMs: 300, ms: null, took: { nickels: 0, cents: 0 } });
    await expect(s.start("peyton", sritej)).rejects.toThrow(/already tried/);
    expect(await s.start("maya", sritej)).toEqual({ ok: true, limitMs: economy.ATTEMPT_MS });
    await expect(s.start("maya", sritej)).rejects.toThrow(/already tried/);
    await expect(s.t.mutation(api.heistPeek, { phone: PHONES.maya, stakeId: sritej })).rejects.toThrow(/already tried/);
    expect((await s.loose("maya")).loose).toEqual([]);
    vi.advanceTimersByTime(economy.ATTEMPT_MS + 1);
    expect(await s.stop("maya", sritej, 5000)).toEqual({ won: false, ghostMs: 300, ms: null, took: { nickels: 0, cents: 0 } });
    await expect(s.stop("maya", sritej, 5000)).rejects.toThrow(/already tried/);
    expect(await s.cash("sritej")).toBe(95);
    vi.advanceTimersByTime(DAY);
    await s.open("r2");
    await s.close("r2");
    const ghosts = (await s.t.run((ctx) => ctx.db.query("stakes").collect())).filter((g) => g.roundId === "r2").map((g) => g.ghostMs);
    expect(ghosts).toEqual([300, 300, 300]);

    const t2 = await setup();
    await t2.open("r1");
    await t2.play("r1", "maya");
    await t2.close("r1");
    const [fromPeyton, fromSritej] = [(await stakeOf(t2, "maya", "Peyton")).id, (await stakeOf(t2, "maya", "Sritej")).id];
    await t2.start("maya", fromSritej);
    vi.advanceTimersByTime(5700);
    expect(await t2.stop("maya", fromSritej, 5000)).toMatchObject({ won: false, ms: 5700 });
    await t2.start("maya", fromPeyton);
    vi.advanceTimersByTime(5150);
    expect(await t2.stop("maya", fromPeyton, 4900)).toMatchObject({ won: true, ms: 4900 });
    const rows = await t2.t.run((ctx) => ctx.db.query("heistAttempts").collect());
    expect(rows.map((a) => [a.ms, a.score, a.won])).toEqual([[5700, 700, false], [4900, 100, true]]);
  });

  it("caps the client's time at the server's elapsed time", async () => {
    const s = await setup();
    await s.open("r1");
    await s.play("r1", "maya");
    await s.close("r1");
    const target = (await stakeOf(s, "maya", "Peyton")).id;
    await s.start("maya", target);
    vi.advanceTimersByTime(4000);
    expect(await s.stop("maya", target, 5000)).toEqual({ won: false, ghostMs: 300, ms: 4000, took: { nickels: 0, cents: 0 } });
  });

  it("uses the victim's median heist score as the ghost, then the group median, then 300", async () => {
    const s = await setup();
    await s.open("r1");
    await s.play("r1", "maya");
    await s.play("r1", "peyton");
    await s.close("r1");
    const target = await stakeOf(s, "maya", "Sritej");
    await s.attempt("maya", target.id, 5400);
    await s.attempt("peyton", target.id, 4400);
    vi.advanceTimersByTime(DAY);
    await s.open("r2");
    await s.close("r2");
    const stakes = await s.t.run((ctx) => ctx.db.query("stakes").collect());
    expect(stakes.find((g) => g.roundId === "r1" && g.playerId === s.players.sritej)?.ghostMs).toBe(economy.DEFAULT_GHOST_MS);
    expect(stakes.filter((g) => g.roundId === "r2").map((g) => g.ghostMs)).toEqual([400, 600, 500]);
  });

  it("reveals the ghost with a Peek and takes two with a Double Steal", async () => {
    const s = await setup();
    await s.grant("maya", "peek", "g1");
    await s.grant("maya", "double_steal", "g2");
    await s.open("r0");
    await s.play("r0", "sritej");
    await s.open("r1");
    vi.advanceTimersByTime(DAY);
    await s.open("r1");
    await s.play("r1", "maya");
    await s.close("r1");
    const target = await stakeOf(s, "maya", "Sritej");
    expect(await s.t.mutation(api.heistPeek, { phone: PHONES.maya, stakeId: target.id })).toEqual({ ghostMs: 300 });
    expect(await stakeOf(s, "maya", "Sritej")).toMatchObject({ peek: true, ghostMs: 300 });
    await expect(s.t.mutation(api.heistPeek, { phone: PHONES.maya, stakeId: (await stakeOf(s, "maya", "Peyton")).id })).rejects.toThrow(/no Peek/);
    expect((await s.attempt("maya", target.id, 5010)).took).toEqual({ nickels: 2, cents: 5 });
    expect(await s.nickels("sritej")).toBe(0);
    expect((await s.loose("maya")).perks).toEqual({ lock: 0, double_steal: 0, peek: 0, shield: 0 });
  });

  it("turns untaken loose nickels into a bounty that pays the next head-to-head winner", async () => {
    const s = await setup();
    for (const r of ["r1", "r2"]) {
      await s.open(r);
      await s.play(r, "maya");
      await s.close(r);
      await s.expire();
      vi.advanceTimersByTime(DAY);
    }
    expect((await s.loose("maya")).loose).toEqual([]);
    expect(await s.t.run((ctx) => economy.bountyOn(ctx, s.groupId, s.players.peyton))).toEqual({ nickels: 2, cents: 10 });
    expect(await s.t.mutation(api.headToHead, { chatId: CHAT, winnerPhone: PHONES.sritej, loserPhone: PHONES.peyton })).toEqual({ nickels: 2, cents: 10 });
    expect(await s.t.mutation(api.headToHead, { chatId: CHAT, winnerPhone: PHONES.sritej, loserPhone: PHONES.peyton })).toEqual({ nickels: 0, cents: 0 });
    expect(await s.cash("sritej")).toBe(100);
    expect(await s.cash("peyton")).toBe(90);
  });
});

describe("daily chest", () => {
  it("rolls 60/30/10 from the seed and the seed is an HMAC of player and day", async () => {
    const counts = { points: 0, perk: 0, cash: 0 };
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 20000; i++) {
      crypto.getRandomValues(bytes);
      const roll = economy.rollChest(bytes);
      counts[roll.kind] += 1;
      expect(roll.points).toBeGreaterThanOrEqual(-3);
      expect(roll.points).toBeLessThanOrEqual(10);
      expect([5, 10, 15, 20, 25]).toContain(roll.amountCents);
    }
    expect(Math.abs(counts.points / 20000 - 0.6)).toBeLessThan(0.02);
    expect(Math.abs(counts.perk / 20000 - 0.3)).toBeLessThan(0.02);
    expect(Math.abs(counts.cash / 20000 - 0.1)).toBeLessThan(0.02);
    const a = await economy.chestSeed("p1", "2026-11-16");
    expect(await economy.chestSeed("p1", "2026-11-16")).toEqual(a);
    expect(await economy.chestSeed("p1", "2026-11-17")).not.toEqual(a);
    process.env.NICKEL_CHEST_SECRET = "other";
    expect(await economy.chestSeed("p1", "2026-11-16")).not.toEqual(a);
  });

  it("opens once a day, shows odds, and a skip blocks nothing but today's chest", async () => {
    const s = await setup();
    const before = await s.t.query(api.chest, { phone: PHONES.maya });
    expect(before).toEqual({ available: true, opened: null, odds: economy.CHEST_ODDS });
    expect(before.odds.reduce((n, o) => n + o.pct, 0)).toBe(100);
    const first = await s.t.mutation(api.chestOpen, { phone: PHONES.maya });
    expect(first.line).toBe("Maya pulled " + (first.result.kind === "points" ? first.result.label : "a " + first.result.label));
    expect(await s.t.mutation(api.chestOpen, { phone: PHONES.maya })).toEqual(first);
    expect(await s.t.query(api.chest, { phone: PHONES.maya })).toMatchObject({ available: false, opened: first.result });
    expect(await s.t.mutation(api.chestSkip, { phone: PHONES.peyton })).toEqual({ ok: true });
    expect(await s.t.query(api.chest, { phone: PHONES.peyton })).toMatchObject({ available: false, opened: null });
    await expect(s.t.mutation(api.chestOpen, { phone: PHONES.peyton })).rejects.toThrow(/skipped/);
    expect(await s.cash("peyton")).toBe(100);
    expect(await s.t.query(api.chestFeed, { chatId: CHAT })).toEqual([first.line]);
    vi.advanceTimersByTime(DAY);
    expect((await s.t.query(api.chest, { phone: PHONES.peyton })).available).toBe(true);
    await expect(s.t.query(api.chest, { phone: "+19999999999" })).rejects.toThrow(/No active player/);
  });

  it("never lets points go below zero", async () => {
    const s = await setup();
    const outcome = await s.t.run(async (ctx) => {
      const player = (await ctx.db.get(s.players.maya))!;
      return economy.openChest(ctx, player);
    });
    expect(await s.nickels("maya")).toBe(Math.max(0, outcome.result.points ?? 0));
  });

  it("keeps cash gain-only, within the house balance, the daily budget and the weekly cap", async () => {
    const s = await setup({ house: 1000 });
    const ids: Id<"players">[] = await s.t.run(async (ctx) => {
      const out = [];
      for (let i = 0; i < 400; i++) out.push(await ctx.db.insert("players", { phone: "+1555" + i, name: "P" + i, kyc: "none", status: "active", dailyLimitCents: 0, createdAt: 0 }));
      return out;
    });
    const results = await s.t.run(async (ctx) => {
      const out = [];
      for (const id of ids) out.push((await economy.openChest(ctx, (await ctx.db.get(id))!)).result);
      return out;
    });
    const paid = results.reduce((n, r) => n + (r.amountCents ?? 0), 0);
    expect(results.filter((r) => r.kind === "cash").length).toBeGreaterThan(0);
    expect(paid).toBeLessThanOrEqual(200);
    expect(await s.t.run((ctx) => money.balanceOf(ctx, money.HOUSE))).toBe(1000 - paid);
    const rows = await s.t.run((ctx) => ctx.db.query("ledger").filter((q) => q.eq(q.field("reason"), "chest")).collect());
    expect(rows.every((r) => r.from === money.HOUSE && r.to.startsWith("player:"))).toBe(true);

    const broke = await setup({ house: 0 });
    const lucky = await broke.t.run(async (ctx) => {
      const out = [];
      for (let i = 0; i < 60; i++) out.push(await ctx.db.insert("players", { phone: "+1666" + i, name: "Q" + i, kyc: "none", status: "active", dailyLimitCents: 0, createdAt: 0 }));
      const kinds = [];
      for (const id of out) kinds.push((await economy.openChest(ctx, (await ctx.db.get(id))!)).result.kind);
      return kinds;
    });
    expect(lucky).not.toContain("cash");

    const weekly = await setup({ house: 5000 });
    process.env.NICKEL_CHEST_DAILY_CENTS = "100000";
    const id = weekly.players.maya;
    let week = 0;
    for (let d = 0; d < 60; d++) {
      const r = await weekly.t.run(async (ctx) => (await economy.openChest(ctx, (await ctx.db.get(id))!)).result);
      week += r.amountCents ?? 0;
      vi.advanceTimersByTime(DAY);
    }
    const rows2 = await weekly.t.run((ctx) => ctx.db.query("chestOpens").collect());
    for (const row of rows2) {
      const windowed = rows2.filter((o) => o.day > economy.dayKey(Date.parse(row.day + "T20:00:00Z") - 7 * DAY) && o.day <= row.day);
      expect(windowed.reduce((n, o) => n + (o.amountCents ?? 0), 0)).toBeLessThanOrEqual(economy.CHEST_WEEKLY_CENTS);
    }
    expect(week).toBeGreaterThan(0);
  });
});

describe("a simulated week for three players", () => {
  it("only ever changes cash totals through house to player chest gains, and no random event debits cash", async () => {
    const s = await setup();
    const names = ["maya", "peyton", "sritej"] as const;
    const skipChest: Record<number, Name[]> = { 2: ["peyton"], 4: ["maya"], 5: ["peyton"] };
    for (let i = 0; ; i++) {
      process.env.NICKEL_CHEST_SECRET = "week-" + i;
      const kinds = [];
      for (let d = 0; d < 7; d++) for (const n of names) if (!skipChest[d]?.includes(n)) kinds.push(economy.rollChest(await economy.chestSeed(s.players[n], economy.dayKey(MONDAY + d * DAY))));
      if (kinds.some((k) => k.kind === "cash") && !kinds.some((k) => k.kind === "perk" && k.perk === "lock")) break;
    }
    await s.grant("sritej", "lock", "g-lock");
    await s.grant("maya", "double_steal", "g-double");
    await s.grant("maya", "peek", "g-peek");

    const audit = () => s.t.run(async (ctx) => {
      const wallets = await Promise.all(names.map((n) => money.balanceOf(ctx, money.playerWallet(s.players[n]))));
      const rows = await ctx.db.query("ledger").collect();
      return { players: wallets.reduce((a, b) => a + b, 0), pot: await money.balanceOf(ctx, money.potWallet(s.groupId)), house: await money.balanceOf(ctx, money.HOUSE), rows };
    });
    const start = await audit();
    let chestCash = 0;
    const check = async () => {
      const now = await audit();
      expect(now.players + now.pot + now.house).toBe(start.players + start.pot + start.house);
      expect(now.players + now.pot).toBe(start.players + start.pot + chestCash);
      expect(start.house - now.house).toBe(chestCash);
      for (const row of now.rows.slice(start.rows.length)) {
        if (row.from.startsWith("player:")) expect([row.reason, row.key.startsWith("daily:"), row.to]).toEqual(["stake", true, money.potWallet(s.groupId)]);
        if (row.reason === "chest") expect([row.from, row.to.startsWith("player:")]).toEqual([money.HOUSE, true]);
        if (row.from === money.HOUSE) expect(row.reason).toBe("chest");
      }
    };
    const chests = async (day: number) => {
      for (const n of names) {
        const before = await audit();
        const mine = await s.cash(n);
        if (skipChest[day]?.includes(n)) await s.t.mutation(api.chestSkip, { phone: PHONES[n] });
        else chestCash += (await s.t.mutation(api.chestOpen, { phone: PHONES[n] })).result.amountCents ?? 0;
        const after = await audit();
        expect(await s.cash(n)).toBeGreaterThanOrEqual(mine);
        expect(after.rows.slice(before.rows.length).every((r) => r.from === money.HOUSE && r.reason === "chest")).toBe(true);
        await check();
      }
    };
    const plays: Name[][] = [["maya", "peyton"], ["maya", "peyton"], ["peyton", "sritej"], ["maya", "peyton", "sritej"], ["maya"], ["sritej"], ["maya", "peyton", "sritej"]];
    for (let d = 0; d < 7; d++) {
      vi.setSystemTime(MONDAY + d * DAY);
      const round = "daily-" + d;
      await chests(d);
      await s.open(round);
      for (const n of plays[d]) await s.play(round, n);
      const closed = await s.close(round);
      await check();
      if (d === 0) expect(closed).toMatchObject({ loose: [], locked: ["Sritej"] });
      if (d === 1) {
        const target = await stakeOf(s, "maya", "Sritej");
        await s.t.mutation(api.heistPeek, { phone: PHONES.maya, stakeId: target.id });
        expect(await s.attempt("maya", target.id, 5000)).toEqual({ won: true, ghostMs: 300, ms: 5000, took: { nickels: 2, cents: 5 } });
      }
      if (d === 2) {
        const target = await stakeOf(s, "peyton", "Maya");
        expect((await s.attempt("peyton", target.id, 5600)).won).toBe(false);
        expect((await s.attempt("sritej", target.id, 5001)).won).toBe(false);
      }
      if (d === 3) expect(await s.t.mutation(api.headToHead, { chatId: CHAT, winnerPhone: PHONES.peyton, loserPhone: PHONES.maya })).toEqual({ nickels: 1, cents: 5 });
      if (d === 4) {
        await expect(s.attempt("sritej", (await stakeOf(s, "maya", "Peyton")).id, 5000)).rejects.toThrow(/Only players/);
        expect((await s.attempt("maya", (await stakeOf(s, "maya", "Peyton")).id, 5100)).took.cents).toBe(5);
        expect((await s.attempt("maya", (await stakeOf(s, "maya", "Sritej")).id, 5000)).took.cents).toBe(5);
      }
      if (d === 6) {
        expect(await s.t.mutation(api.headToHead, { chatId: CHAT, winnerPhone: PHONES.maya, loserPhone: PHONES.peyton })).toEqual({ nickels: 1, cents: 5 });
        expect(await s.t.mutation(api.headToHead, { chatId: CHAT, winnerPhone: PHONES.sritej, loserPhone: PHONES.maya })).toEqual({ nickels: 1, cents: 5 });
      }
      await s.expire();
      await check();
    }

    expect(chestCash).toBeGreaterThan(0);
    const end = await audit();
    expect(end.pot).toBe(0);
    const chestFor = (n: Name) => end.rows.filter((r) => r.reason === "chest" && r.to === money.playerWallet(s.players[n])).reduce((a, r) => a + r.amountCents, 0);
    expect(await s.cash("maya")).toBe(110 + chestFor("maya"));
    expect(await s.cash("peyton")).toBe(95 + chestFor("peyton"));
    expect(await s.cash("sritej")).toBe(95 + chestFor("sritej"));
    expect(await s.t.run((ctx) => economy.nickelsOf(ctx, economy.tableWallet(s.groupId)))).toBe(0);
    const stats = await s.t.query(api.seasonStats, { chatId: CHAT });
    expect(stats.map(({ name, steals, timesRobbed, chestsOpened }) => ({ name, steals, timesRobbed, chestsOpened }))).toEqual([
      { name: "Maya", steals: 3, timesRobbed: 0, chestsOpened: 6 },
      { name: "Peyton", steals: 0, timesRobbed: 1, chestsOpened: 5 },
      { name: "Sritej", steals: 0, timesRobbed: 2, chestsOpened: 7 },
    ]);
  });
});
