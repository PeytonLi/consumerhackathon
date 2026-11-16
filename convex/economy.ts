import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import { HOUSE, assertServer, balanceOf, playerWallet, postMove, potWallet } from "./money.js";

export const MINT = "mint";
export const tableWallet = (id: Id<"groups">) => "table:" + id;
export const DAILY_CENTS = 5;
export const HEIST_MS = 10 * 60 * 1000;
export const TARGET_MS = 5000;
export const DEFAULT_GHOST_MS = 300;
export const ATTEMPT_MS = 15000;
export const NETWORK_MS = 400;
export const CHEST_WEEKLY_CENTS = 50;
export const PERKS = ["lock", "double_steal", "peek", "shield"] as const;
export type Perk = (typeof PERKS)[number];
export type NickelReason = Doc<"nickelLedger">["reason"];
export type ChestResult = { kind: "points" | "perk" | "cash"; label: string; points?: number; perk?: Perk; amountCents?: number };
const PERK_LABEL: Record<Perk, string> = { lock: "Lock", double_steal: "Double Steal", peek: "Peek", shield: "Shield" };
export const CHEST_ODDS = [
  { kind: "points", label: "Nickels, from -3 to +10", pct: 60 },
  { kind: "perk", label: "A perk: Lock, Double Steal, Peek or Shield", pct: 30 },
  { kind: "cash", label: "A 5\u00a2 to 25\u00a2 cash bonus paid by Nickel", pct: 10 },
];
const DAY_MS = 86400000;

export const dayKey = (at: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
const chestBudget = () => {
  const n = Number(process.env.NICKEL_CHEST_DAILY_CENTS);
  return Number.isFinite(n) && n >= 0 ? n : 200;
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export async function nickelsOf(ctx: QueryCtx, wallet: string): Promise<number> {
  let total = 0;
  for await (const row of ctx.db.query("nickelLedger").withIndex("by_to", (q) => q.eq("to", wallet))) total += row.amount;
  for await (const row of ctx.db.query("nickelLedger").withIndex("by_from", (q) => q.eq("from", wallet))) total -= row.amount;
  return total;
}

export async function postNickels(ctx: MutationCtx, args: { from: string; to: string; amount: number; reason: NickelReason; key: string; groupId?: Id<"groups">; roundId?: string; note?: string }) {
  const existing = await ctx.db.query("nickelLedger").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
  if (existing) return { id: existing._id, duplicate: true };
  if (!Number.isInteger(args.amount) || args.amount <= 0) throw new Error("Nickels must be a positive whole number");
  if (args.from === args.to) throw new Error("A move needs two different wallets");
  if (args.from !== MINT && (await nickelsOf(ctx, args.from)) < args.amount) throw new Error("Not enough Nickels in " + args.from);
  const id = await ctx.db.insert("nickelLedger", { ...args, createdAt: Date.now() });
  return { id, duplicate: false };
}

export async function perksOf(ctx: QueryCtx, playerId: Id<"players">): Promise<Record<Perk, number>> {
  const out: Record<Perk, number> = { lock: 0, double_steal: 0, peek: 0, shield: 0 };
  for await (const row of ctx.db.query("perkLog").withIndex("by_player", (q) => q.eq("playerId", playerId))) out[row.perk] += row.delta;
  return out;
}

export async function addPerk(ctx: MutationCtx, playerId: Id<"players">, perk: Perk, delta: 1 | -1, reason: string, key: string): Promise<boolean> {
  if (await ctx.db.query("perkLog").withIndex("by_key", (q) => q.eq("key", key)).unique()) return true;
  if (delta < 0 && (await perksOf(ctx, playerId))[perk] < 1) return false;
  await ctx.db.insert("perkLog", { playerId, perk, delta, reason, key, createdAt: Date.now() });
  return true;
}

async function playerByPhone(ctx: QueryCtx, phone: string) {
  const player = phone ? await ctx.db.query("players").withIndex("by_phone", (q) => q.eq("phone", phone)).first() : null;
  if (!player || player.status !== "active") throw new Error("No active player for this phone");
  return player;
}

async function groupByChat(ctx: QueryCtx, chatId: string) {
  return ctx.db.query("groups").withIndex("by_chat", (q) => q.eq("chatId", chatId)).first();
}

async function activeMembers(ctx: QueryCtx, groupId: Id<"groups">) {
  const out: Doc<"players">[] = [];
  for await (const m of ctx.db.query("groupMembers").withIndex("by_group", (q) => q.eq("groupId", groupId))) {
    const player = m.leftAt ? null : await ctx.db.get(m.playerId);
    if (player?.status === "active") out.push(player);
  }
  return out;
}

async function spentToday(ctx: QueryCtx, playerId: Id<"players">, now: number) {
  const today = dayKey(now);
  let spent = 0;
  for await (const row of ctx.db.query("ledger").withIndex("by_from", (q) => q.eq("from", playerWallet(playerId)))) {
    if ((row.reason === "stake" || row.reason === "bet") && row.createdAt > now - 2 * DAY_MS && dayKey(row.createdAt) === today) spent += row.amountCents;
  }
  return spent;
}

async function canStake(ctx: QueryCtx, player: Doc<"players">, cents: number, now: number) {
  if (player.status !== "active" || !player.consentAt) return false;
  if ((await balanceOf(ctx, playerWallet(player._id))) < cents) return false;
  return (await spentToday(ctx, player._id, now)) + cents <= player.dailyLimitCents;
}

async function ghostFor(ctx: QueryCtx, groupId: Id<"groups">, victimId: Id<"players">) {
  const own = await ctx.db.query("heistAttempts").withIndex("by_player", (q) => q.eq("playerId", victimId)).order("desc").filter((q) => q.neq(q.field("score"), undefined)).take(10);
  if (own.length) return median(own.map((a) => a.score!));
  const group = await ctx.db.query("heistAttempts").withIndex("by_group", (q) => q.eq("groupId", groupId)).order("desc").filter((q) => q.neq(q.field("score"), undefined)).take(50);
  return group.length ? median(group.map((a) => a.score!)) : DEFAULT_GHOST_MS;
}

export async function openRound(ctx: MutationCtx, group: Doc<"groups">, roundId: string, phones?: string[]) {
  const now = Date.now();
  const day = dayKey(now);
  const placed: { name: string; cents: number }[] = [];
  for (const player of await activeMembers(ctx, group._id)) {
    if (phones && !phones.includes(player.phone)) continue;
    const today = await ctx.db.query("stakes").withIndex("by_player_status", (q) => q.eq("playerId", player._id)).filter((q) => q.and(q.eq(q.field("groupId"), group._id), q.eq(q.field("day"), day))).first();
    if (today) continue;
    const key = "daily:" + group._id + ":" + day + ":" + player._id;
    let cents = 0;
    if (group.mode === "cash" && (await canStake(ctx, player, DAILY_CENTS, now))) {
      await postMove(ctx, { from: playerWallet(player._id), to: potWallet(group._id), amountCents: DAILY_CENTS, reason: "stake", key, actor: "agent", groupId: group._id, roundId, actorPlayerId: player._id, note: "Daily nickel on the table" });
      cents = DAILY_CENTS;
    }
    await postNickels(ctx, { from: MINT, to: tableWallet(group._id), amount: 1, reason: "daily", key, groupId: group._id, roundId });
    await ctx.db.insert("stakes", { groupId: group._id, roundId, playerId: player._id, day, nickels: 1, cents, status: "table", createdAt: now });
    placed.push({ name: player.name, cents });
  }
  return { placed };
}

async function giveBack(ctx: MutationCtx, stake: Doc<"stakes">, to: Id<"players">, nickelReason: NickelReason, cashReason: "play_to_keep" | "steal" | "bounty", key: string) {
  await postNickels(ctx, { from: tableWallet(stake.groupId), to: playerWallet(to), amount: stake.nickels, reason: nickelReason, key, groupId: stake.groupId, roundId: stake.roundId });
  if (stake.cents > 0) await postMove(ctx, { from: potWallet(stake.groupId), to: playerWallet(to), amountCents: stake.cents, reason: cashReason, key, actor: "agent", groupId: stake.groupId, roundId: stake.roundId, actorPlayerId: to });
}

export async function markPlayed(ctx: MutationCtx, group: Doc<"groups">, roundId: string, player: Doc<"players">, score: number) {
  const stake = await ctx.db.query("stakes").withIndex("by_round_player", (q) => q.eq("groupId", group._id).eq("roundId", roundId).eq("playerId", player._id)).unique();
  if (!stake || stake.status !== "table") return { kept: false, nickels: 0, cents: 0 };
  await ctx.db.patch(stake._id, { status: "kept", playedAt: Date.now(), score, settledAt: Date.now() });
  await giveBack(ctx, stake, player._id, "play_to_keep", "play_to_keep", "keep:" + stake._id);
  return { kept: true, nickels: stake.nickels, cents: stake.cents };
}

export async function closeRound(ctx: MutationCtx, group: Doc<"groups">, roundId: string) {
  const now = Date.now();
  const loose: string[] = [];
  const locked: string[] = [];
  for (const stake of await ctx.db.query("stakes").withIndex("by_round", (q) => q.eq("groupId", group._id).eq("roundId", roundId)).collect()) {
    if (stake.status !== "table") continue;
    const name = (await ctx.db.get(stake.playerId))?.name ?? "Someone";
    if (await addPerk(ctx, stake.playerId, "lock", -1, "missed day", "lock:" + stake._id)) {
      await ctx.db.patch(stake._id, { status: "locked", settledAt: now });
      await giveBack(ctx, stake, stake.playerId, "lock", "play_to_keep", "lock:" + stake._id);
      locked.push(name);
      continue;
    }
    await ctx.db.patch(stake._id, { status: "loose", ghostMs: await ghostFor(ctx, group._id, stake.playerId), heistEndsAt: now + HEIST_MS });
    loose.push(name);
  }
  if (loose.length) await ctx.scheduler.runAfter(HEIST_MS, internal.economy.settleHeists, { groupId: group._id });
  return { loose, locked, heistEndsAt: loose.length ? now + HEIST_MS : null };
}

export async function settleLoose(ctx: MutationCtx, groupId: Id<"groups">) {
  const now = Date.now();
  let settled = 0;
  for (const stake of await ctx.db.query("stakes").withIndex("by_group_status", (q) => q.eq("groupId", groupId).eq("status", "loose")).collect()) {
    if ((stake.heistEndsAt ?? 0) > now) continue;
    await ctx.db.patch(stake._id, { status: "bounty", settledAt: now });
    settled += 1;
  }
  return settled;
}

export async function payBounty(ctx: MutationCtx, group: Doc<"groups">, winner: Doc<"players">, loser: Doc<"players">) {
  if (winner._id === loser._id) return { nickels: 0, cents: 0 };
  await settleLoose(ctx, group._id);
  let nickels = 0;
  let cents = 0;
  for (const stake of await ctx.db.query("stakes").withIndex("by_player_status", (q) => q.eq("playerId", loser._id).eq("status", "bounty")).collect()) {
    if (stake.groupId !== group._id) continue;
    await ctx.db.patch(stake._id, { status: "paid", bountyWinnerId: winner._id, settledAt: Date.now() });
    await giveBack(ctx, stake, winner._id, "bounty", "bounty", "bounty:" + stake._id);
    nickels += stake.nickels;
    cents += stake.cents;
  }
  return { nickels, cents };
}

export async function bountyOn(ctx: QueryCtx, groupId: Id<"groups">, playerId: Id<"players">) {
  const rows = await ctx.db.query("stakes").withIndex("by_player_status", (q) => q.eq("playerId", playerId).eq("status", "bounty")).collect();
  const mine = rows.filter((s) => s.groupId === groupId);
  return { nickels: mine.reduce((n, s) => n + s.nickels, 0), cents: mine.reduce((n, s) => n + s.cents, 0) };
}

async function heistable(ctx: QueryCtx, player: Doc<"players">, stakeId: string, now: number) {
  const id = ctx.db.normalizeId("stakes", stakeId);
  const stake = id ? await ctx.db.get(id) : null;
  if (!stake || stake.status !== "loose" || (stake.heistEndsAt ?? 0) <= now) throw new Error("That nickel is not loose anymore");
  if (stake.playerId === player._id) throw new Error("You cannot rob yourself");
  const mine = await ctx.db.query("stakes").withIndex("by_round_player", (q) => q.eq("groupId", stake.groupId).eq("roundId", stake.roundId).eq("playerId", player._id)).unique();
  if (!mine?.playedAt) throw new Error("Only players who played this round can steal");
  const attempt = await ctx.db.query("heistAttempts").withIndex("by_stake_player", (q) => q.eq("stakeId", stake._id).eq("playerId", player._id)).first();
  return { stake, attempt };
}

const untried = ({ stake, attempt }: Awaited<ReturnType<typeof heistable>>) => {
  if (attempt) throw new Error("You already tried for this nickel");
  return stake;
};

const peekKey = (stakeId: Id<"stakes">, playerId: Id<"players">) => "peek:" + stakeId + ":" + playerId;

export async function looseFor(ctx: QueryCtx, player: Doc<"players">, now: number) {
  const loose = [];
  for (const m of await ctx.db.query("groupMembers").withIndex("by_player", (q) => q.eq("playerId", player._id)).collect()) {
    if (m.leftAt) continue;
    for (const stake of await ctx.db.query("stakes").withIndex("by_group_status", (q) => q.eq("groupId", m.groupId).eq("status", "loose")).collect()) {
      const ok = await heistable(ctx, player, stake._id, now).then(untried).then(() => true, () => false);
      if (!ok) continue;
      const peek = !!(await ctx.db.query("perkLog").withIndex("by_key", (q) => q.eq("key", peekKey(stake._id, player._id))).unique());
      const victim = await ctx.db.get(stake.playerId);
      loose.push({ id: stake._id as string, victim: victim?.name ?? "Someone", nickels: stake.nickels, cents: stake.cents, ghostMs: peek ? (stake.ghostMs ?? null) : null, endsAt: stake.heistEndsAt!, peek });
    }
  }
  return { loose, perks: await perksOf(ctx, player._id) };
}

export async function peekHeist(ctx: MutationCtx, player: Doc<"players">, stakeId: string) {
  const stake = untried(await heistable(ctx, player, stakeId, Date.now()));
  if (!(await addPerk(ctx, player._id, "peek", -1, "peek", peekKey(stake._id, player._id)))) throw new Error("You have no Peek left");
  return { ghostMs: stake.ghostMs ?? DEFAULT_GHOST_MS };
}

export async function startHeist(ctx: MutationCtx, player: Doc<"players">, stakeId: string) {
  const now = Date.now();
  const stake = untried(await heistable(ctx, player, stakeId, now));
  await ctx.db.insert("heistAttempts", { stakeId: stake._id, groupId: stake.groupId, playerId: player._id, victimId: stake.playerId, ghostMs: stake.ghostMs ?? DEFAULT_GHOST_MS, startedAt: now, createdAt: now });
  return { ok: true, limitMs: ATTEMPT_MS };
}

export async function attemptHeist(ctx: MutationCtx, player: Doc<"players">, stakeId: string, ms?: number) {
  const now = Date.now();
  const { stake, attempt } = await heistable(ctx, player, stakeId, now);
  if (attempt?.won !== undefined) throw new Error("You already tried for this nickel");
  const ghostMs = stake.ghostMs ?? DEFAULT_GHOST_MS;
  if (!attempt?.startedAt || now - attempt.startedAt > ATTEMPT_MS) {
    if (attempt) await ctx.db.patch(attempt._id, { won: false });
    else await ctx.db.insert("heistAttempts", { stakeId: stake._id, groupId: stake.groupId, playerId: player._id, victimId: stake.playerId, ghostMs, won: false, createdAt: now });
    return { won: false, ghostMs, ms: null, took: { nickels: 0, cents: 0 } };
  }
  const elapsed = now - attempt.startedAt;
  const stopped = Math.round(typeof ms === "number" && ms >= elapsed - NETWORK_MS && ms <= elapsed ? ms : elapsed);
  const score = Math.abs(stopped - TARGET_MS);
  const won = score < ghostMs;
  await ctx.db.patch(attempt._id, { ms: stopped, score, won });
  if (!won) return { won, ghostMs, ms: stopped, took: { nickels: 0, cents: 0 } };
  await ctx.db.patch(stake._id, { status: "stolen", thiefId: player._id, settledAt: now });
  await giveBack(ctx, stake, player._id, "steal", "steal", "steal:" + stake._id);
  let nickels = stake.nickels;
  const double = "double:" + stake._id;
  if ((await perksOf(ctx, player._id)).double_steal > 0 && (await nickelsOf(ctx, playerWallet(stake.playerId))) >= 1 && (await addPerk(ctx, player._id, "double_steal", -1, "heist", double))) {
    await postNickels(ctx, { from: playerWallet(stake.playerId), to: playerWallet(player._id), amount: 1, reason: "double_steal", key: double, groupId: stake.groupId, roundId: stake.roundId });
    nickels += 1;
  }
  return { won, ghostMs, ms: stopped, took: { nickels, cents: stake.cents } };
}

export async function chestSeed(playerId: string, day: string): Promise<Uint8Array> {
  const secret = process.env.NICKEL_CHEST_SECRET;
  if (!secret) throw new Error("NICKEL_CHEST_SECRET is not set");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(playerId + day)));
}

export function rollChest(seed: Uint8Array) {
  const view = new DataView(seed.buffer, seed.byteOffset, seed.byteLength);
  const unit = (at: number) => view.getUint32(at) / 2 ** 32;
  const roll = unit(0);
  return {
    kind: (roll < 0.6 ? "points" : roll < 0.9 ? "perk" : "cash") as ChestResult["kind"],
    points: -3 + Math.floor(unit(4) * 14),
    perk: PERKS[Math.floor(unit(8) * PERKS.length)],
    amountCents: 5 * (1 + Math.floor(unit(12) * 5)),
  };
}

async function cashFits(ctx: QueryCtx, player: Doc<"players">, cents: number, day: string, now: number) {
  if (player.status !== "active") return false;
  if ((await balanceOf(ctx, HOUSE)) < cents) return false;
  let today = 0;
  for await (const row of ctx.db.query("chestOpens").withIndex("by_day", (q) => q.eq("day", day))) today += row.amountCents ?? 0;
  if (today + cents > chestBudget()) return false;
  let week = 0;
  for await (const row of ctx.db.query("chestOpens").withIndex("by_player_day", (q) => q.eq("playerId", player._id).gt("day", dayKey(now - 7 * DAY_MS)))) week += row.amountCents ?? 0;
  return week + cents <= CHEST_WEEKLY_CENTS;
}

const pointsLabel = (n: number) => (n > 0 ? "+" + n : String(n)) + (Math.abs(n) === 1 ? " Nickel" : " Nickels");
export const chestLine = (name: string, r: ChestResult) => name + " pulled " + (r.kind === "points" ? r.label : "a " + r.label);
const resultOf = (row: Doc<"chestOpens">): ChestResult => ({ kind: row.kind!, label: row.label!, ...(row.points !== undefined ? { points: row.points } : {}), ...(row.perk ? { perk: row.perk } : {}), ...(row.amountCents ? { amountCents: row.amountCents } : {}) });

async function todaysChest(ctx: QueryCtx, playerId: Id<"players">, day: string) {
  return ctx.db.query("chestOpens").withIndex("by_player_day", (q) => q.eq("playerId", playerId).eq("day", day)).first();
}

export async function chestState(ctx: QueryCtx, player: Doc<"players">, now: number) {
  const row = await todaysChest(ctx, player._id, dayKey(now));
  return { available: !row, opened: row?.status === "opened" ? resultOf(row) : null, odds: CHEST_ODDS };
}

export async function openChest(ctx: MutationCtx, player: Doc<"players">) {
  const now = Date.now();
  const day = dayKey(now);
  const existing = await todaysChest(ctx, player._id, day);
  if (existing?.status === "opened") return { result: resultOf(existing), line: chestLine(player.name, resultOf(existing)) };
  if (existing) throw new Error("You skipped today's chest. A new one shows up tomorrow.");
  const bytes = await chestSeed(player._id, day);
  const seed = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const roll = rollChest(bytes);
  const key = "chest:" + player._id + ":" + day;
  const kind = roll.kind === "cash" && !(await cashFits(ctx, player, roll.amountCents, day, now)) ? "points" : roll.kind;
  let result: ChestResult;
  if (kind === "cash") {
    await postMove(ctx, { from: HOUSE, to: playerWallet(player._id), amountCents: roll.amountCents, reason: "chest", key, actor: "agent", actorPlayerId: player._id, note: "Daily chest bonus" });
    result = { kind, label: roll.amountCents + "\u00a2 bonus", amountCents: roll.amountCents };
  } else if (kind === "perk") {
    await addPerk(ctx, player._id, roll.perk, 1, "chest", key);
    result = { kind, label: PERK_LABEL[roll.perk], perk: roll.perk };
  } else {
    let points = roll.points;
    if (points > 0) await postNickels(ctx, { from: MINT, to: playerWallet(player._id), amount: points, reason: "chest", key });
    if (points < 0) {
      points = -Math.min(-points, Math.max(0, await nickelsOf(ctx, playerWallet(player._id))));
      if (points < 0) await postNickels(ctx, { from: playerWallet(player._id), to: MINT, amount: -points, reason: "chest", key });
    }
    result = { kind, label: pointsLabel(points), points };
  }
  await ctx.db.insert("chestOpens", { playerId: player._id, day, seed, status: "opened", kind: result.kind, label: result.label, points: result.points, perk: result.perk, amountCents: result.amountCents, createdAt: now });
  return { result, line: chestLine(player.name, result) };
}

export async function skipChest(ctx: MutationCtx, player: Doc<"players">) {
  const day = dayKey(Date.now());
  if (!(await todaysChest(ctx, player._id, day))) await ctx.db.insert("chestOpens", { playerId: player._id, day, seed: "", status: "skipped", createdAt: Date.now() });
  return { ok: true as const };
}

export async function seasonStatsFor(ctx: QueryCtx, group: Doc<"groups">) {
  const inSeason = (at: number) => at >= group.seasonStart && (!group.seasonEnd || at <= group.seasonEnd);
  const out = [];
  for (const player of await activeMembers(ctx, group._id)) {
    const stolen = await ctx.db.query("stakes").withIndex("by_thief", (q) => q.eq("thiefId", player._id)).collect();
    const robbed = await ctx.db.query("stakes").withIndex("by_player_status", (q) => q.eq("playerId", player._id).eq("status", "stolen")).collect();
    const chests = await ctx.db.query("chestOpens").withIndex("by_player_day", (q) => q.eq("playerId", player._id)).collect();
    out.push({
      name: player.name,
      steals: stolen.filter((s) => s.groupId === group._id && inSeason(s.settledAt ?? s.createdAt)).length,
      timesRobbed: robbed.filter((s) => s.groupId === group._id && inSeason(s.settledAt ?? s.createdAt)).length,
      chestsOpened: chests.filter((c) => c.status === "opened" && inSeason(c.createdAt)).length,
      nickels: await nickelsOf(ctx, playerWallet(player._id)),
    });
  }
  return out;
}

export async function chestFeedFor(ctx: QueryCtx, group: Doc<"groups">, day: string) {
  const lines: string[] = [];
  for (const player of await activeMembers(ctx, group._id)) {
    const row = await todaysChest(ctx, player._id, day);
    if (row?.status === "opened") lines.push(chestLine(player.name, resultOf(row)));
  }
  return lines;
}

const asPlayer = { secret: v.optional(v.string()), phone: v.string() };
const asGroup = { secret: v.optional(v.string()), chatId: v.string() };

export const chest = query({ args: asPlayer, handler: async (ctx, { secret, phone }) => (assertServer(secret), chestState(ctx, await playerByPhone(ctx, phone), Date.now())) });
export const chestOpen = mutation({ args: asPlayer, handler: async (ctx, { secret, phone }) => (assertServer(secret), openChest(ctx, await playerByPhone(ctx, phone))) });
export const chestSkip = mutation({ args: asPlayer, handler: async (ctx, { secret, phone }) => (assertServer(secret), skipChest(ctx, await playerByPhone(ctx, phone))) });
export const heists = query({ args: asPlayer, handler: async (ctx, { secret, phone }) => (assertServer(secret), looseFor(ctx, await playerByPhone(ctx, phone), Date.now())) });
export const heistPeek = mutation({ args: { ...asPlayer, stakeId: v.string() }, handler: async (ctx, { secret, phone, stakeId }) => (assertServer(secret), peekHeist(ctx, await playerByPhone(ctx, phone), stakeId)) });
export const heistStart = mutation({ args: { ...asPlayer, stakeId: v.string() }, handler: async (ctx, { secret, phone, stakeId }) => (assertServer(secret), startHeist(ctx, await playerByPhone(ctx, phone), stakeId)) });
export const heistAttempt = mutation({ args: { ...asPlayer, stakeId: v.string(), ms: v.optional(v.number()) }, handler: async (ctx, { secret, phone, stakeId, ms }) => (assertServer(secret), attemptHeist(ctx, await playerByPhone(ctx, phone), stakeId, ms)) });

export const roundOpened = mutation({
  args: { ...asGroup, roundId: v.string(), members: v.optional(v.array(v.string())) },
  handler: async (ctx, { secret, chatId, roundId, members }) => {
    assertServer(secret);
    const group = await groupByChat(ctx, chatId);
    return group ? openRound(ctx, group, roundId, members) : null;
  },
});

export const played = mutation({
  args: { ...asGroup, roundId: v.string(), phone: v.string(), score: v.number() },
  handler: async (ctx, { secret, chatId, roundId, phone, score }) => {
    assertServer(secret);
    const group = await groupByChat(ctx, chatId);
    return group ? markPlayed(ctx, group, roundId, await playerByPhone(ctx, phone), score) : null;
  },
});

export const roundClosed = mutation({
  args: { ...asGroup, roundId: v.string() },
  handler: async (ctx, { secret, chatId, roundId }) => {
    assertServer(secret);
    const group = await groupByChat(ctx, chatId);
    return group ? closeRound(ctx, group, roundId) : null;
  },
});

export const headToHead = mutation({
  args: { ...asGroup, winnerPhone: v.string(), loserPhone: v.string() },
  handler: async (ctx, { secret, chatId, winnerPhone, loserPhone }) => {
    assertServer(secret);
    const group = await groupByChat(ctx, chatId);
    return group ? payBounty(ctx, group, await playerByPhone(ctx, winnerPhone), await playerByPhone(ctx, loserPhone)) : null;
  },
});

export const seasonStats = query({
  args: asGroup,
  handler: async (ctx, { secret, chatId }) => {
    assertServer(secret);
    const group = await groupByChat(ctx, chatId);
    return group ? seasonStatsFor(ctx, group) : [];
  },
});

export const chestFeed = query({
  args: { ...asGroup, day: v.optional(v.string()) },
  handler: async (ctx, { secret, chatId, day }) => {
    assertServer(secret);
    const group = await groupByChat(ctx, chatId);
    return group ? chestFeedFor(ctx, group, day ?? dayKey(Date.now())) : [];
  },
});

export const settleHeists = internalMutation({ args: { groupId: v.id("groups") }, handler: (ctx, { groupId }) => settleLoose(ctx, groupId) });
