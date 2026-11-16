import { ConvexError, v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import { HOUSE, WORLD, assertServer, balanceOf, playerWallet, postMove, potWallet } from "./money.js";
import { definiteFailure, kycOf, whop, whopConfig } from "./lib/whopApi.js";

export const MIN_TOP_UP_CENTS = 100;
export const MAX_TOP_UP_CENTS = 50000;
export const MIN_CASH_OUT_CENTS = 100;
export const MAX_DAILY_LIMIT_CENTS = 50000;
export const DEFAULT_DAILY_LIMIT_CENTS = 2000;
export const TOP_UP_FEE_BPS = 270;
export const TOP_UP_FEE_FIXED_CENTS = 30;
export const TRANSFER_FEE_BPS = 300;
const APPROVAL_MS = 24 * 60 * 60 * 1000;

export const topUpFeeCents = (paidCents: number) => Math.round((paidCents * TOP_UP_FEE_BPS) / 10000) + TOP_UP_FEE_FIXED_CENTS;
export const transferFeeCents = (amountCents: number) => Math.round((amountCents * TRANSFER_FEE_BPS) / 10000);

export const holdWallet = (id: Id<"payouts">) => "hold:" + id;
const secret = v.optional(v.string());
const wholeCents = (n: number, min = 1) => Number.isInteger(n) && n >= min;

const HOUR = 60 * 60 * 1000;

function pacificOffset(at: number): number {
  const year = new Date(at).getUTCFullYear();
  const sunday = (month: number, nth: number) => 1 + ((7 - new Date(Date.UTC(year, month, 1)).getUTCDay()) % 7) + 7 * (nth - 1);
  const daylight = at >= Date.UTC(year, 2, sunday(2, 2), 10) && at < Date.UTC(year, 10, sunday(10, 1), 9);
  return (daylight ? -7 : -8) * HOUR;
}

export function laDayStart(now = Date.now()): number {
  const local = new Date(now + pacificOffset(now));
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return midnight - pacificOffset(midnight + 8 * HOUR);
}

async function mustPlayer(ctx: QueryCtx, id: Id<"players">) {
  const player = await ctx.db.get(id);
  if (!player) throw new Error("Unknown player");
  return player;
}

async function membership(ctx: QueryCtx, groupId: Id<"groups">, playerId: Id<"players">) {
  return ctx.db.query("groupMembers").withIndex("by_group_player", (q) => q.eq("groupId", groupId).eq("playerId", playerId)).unique();
}

async function addMember(ctx: MutationCtx, groupId: Id<"groups">, playerId: Id<"players">) {
  const row = await membership(ctx, groupId, playerId);
  if (!row) await ctx.db.insert("groupMembers", { groupId, playerId, joinedAt: Date.now() });
  else if (row.leftAt) await ctx.db.patch(row._id, { leftAt: undefined, joinedAt: Date.now() });
}

async function spentToday(ctx: QueryCtx, playerId: Id<"players">, now = Date.now()) {
  const start = laDayStart(now);
  let total = 0;
  for await (const row of ctx.db.query("ledger").withIndex("by_from", (q) => q.eq("from", playerWallet(playerId)))) if ((row.reason === "stake" || row.reason === "buy_in") && row.createdAt >= start) total += row.amountCents;
  return total;
}

async function playerByWhopAccount(ctx: QueryCtx, accountId: string) {
  return ctx.db.query("players").filter((q) => q.eq(q.field("whopAccountId"), accountId)).first();
}

async function playerByPhone(ctx: QueryCtx, phone: string) {
  return ctx.db.query("players").withIndex("by_phone", (q) => q.eq("phone", phone)).unique();
}

async function commissionedGroup(ctx: QueryCtx, actorPhone: string, chatId: string | undefined) {
  const actor = await playerByPhone(ctx, actorPhone);
  if (!actor) throw new ConvexError("Only the commissioner can do that.");
  if (chatId) {
    const group = await ctx.db.query("groups").withIndex("by_chat", (q) => q.eq("chatId", chatId)).unique();
    if (!group) throw new ConvexError("This chat is not a Nickel group yet.");
    if (group.commissionerId !== actor._id) throw new ConvexError("Only the commissioner can do that.");
    return { actor, group };
  }
  const groups = await ctx.db.query("groups").filter((q) => q.eq(q.field("commissionerId"), actor._id)).collect();
  if (!groups.length) throw new ConvexError("Only the commissioner can do that.");
  if (groups.length > 1) throw new ConvexError("You run more than one group. Ask from that group's chat.");
  return { actor, group: groups[0] };
}

const lastTenDigits = (raw: string) => raw.replace(/\D/g, "").slice(-10);

async function memberNamed(ctx: QueryCtx, groupId: Id<"groups">, who: string) {
  const rows = (await ctx.db.query("groupMembers").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect()).filter((r) => !r.leftAt);
  const members = await Promise.all(rows.map(async (row) => ({ row, player: await mustPlayer(ctx, row.playerId) })));
  const label = who.trim();
  const byPhone = who.replace(/\D/g, "").length >= 10;
  const found = members.filter(({ player }) => (byPhone ? lastTenDigits(player.phone) === lastTenDigits(who) : player.name.trim().toLowerCase() === label.toLowerCase()));
  if (found.length > 1) throw new ConvexError("More than one player is called " + label + ". Use their phone number.");
  if (!found.length) throw new ConvexError(label + " is not in this group.");
  return found[0];
}

async function pendingDebit(ctx: MutationCtx, row: { approverId: Id<"players">; requestedBy: Id<"players">; groupId: Id<"groups">; to: string; amountCents: number; note?: string; key: string }) {
  const now = Date.now();
  return ctx.db.insert("approvals", { ...row, status: "pending", from: playerWallet(row.approverId), reason: "adjustment", createdAt: now, expiresAt: now + APPROVAL_MS });
}

export const ensurePlayer = mutation({
  args: { secret, phone: v.string(), name: v.string() },
  handler: async (ctx, { secret, phone, name }) => {
    assertServer(secret);
    if (!phone.trim()) throw new Error("A player needs a phone or profile key");
    const found = await ctx.db.query("players").withIndex("by_phone", (q) => q.eq("phone", phone)).unique();
    if (found) {
      if (name && name !== found.name) await ctx.db.patch(found._id, { name });
      return found._id;
    }
    return ctx.db.insert("players", { phone, name, kyc: "none", status: "active", dailyLimitCents: DEFAULT_DAILY_LIMIT_CENTS, createdAt: Date.now() });
  },
});

export const ensureGroup = mutation({
  args: { secret, chatId: v.string(), name: v.string(), commissionerId: v.id("players") },
  handler: async (ctx, { secret, chatId, name, commissionerId }) => {
    assertServer(secret);
    await mustPlayer(ctx, commissionerId);
    const found = await ctx.db.query("groups").withIndex("by_chat", (q) => q.eq("chatId", chatId)).unique();
    if (found) return found._id;
    const now = Date.now();
    const id = await ctx.db.insert("groups", { chatId, name, commissionerId, mode: "cash", buyInCents: 0, seasonStart: now, createdAt: now });
    await addMember(ctx, id, commissionerId);
    return id;
  },
});

export const joinGroup = mutation({
  args: { secret, groupId: v.id("groups"), playerId: v.id("players") },
  handler: async (ctx, { secret, groupId, playerId }) => {
    assertServer(secret);
    await mustPlayer(ctx, playerId);
    if (!(await ctx.db.get(groupId))) throw new Error("Unknown group");
    await addMember(ctx, groupId, playerId);
    return { ok: true };
  },
});

export const leaveGroup = mutation({
  args: { secret, groupId: v.id("groups"), playerId: v.id("players") },
  handler: async (ctx, { secret, groupId, playerId }) => {
    assertServer(secret);
    const row = await membership(ctx, groupId, playerId);
    if (row && !row.leftAt) await ctx.db.patch(row._id, { leftAt: Date.now() });
    return { ok: true };
  },
});

export const setLimit = mutation({
  args: { secret, playerId: v.id("players"), dailyLimitCents: v.number(), consent: v.boolean() },
  handler: async (ctx, { secret, playerId, dailyLimitCents, consent }) => {
    assertServer(secret);
    if (!consent) throw new Error("Agree to the money rules before setting a limit");
    if (!wholeCents(dailyLimitCents, 0) || dailyLimitCents > MAX_DAILY_LIMIT_CENTS) throw new Error("Daily limit must be whole cents from 0 to " + MAX_DAILY_LIMIT_CENTS);
    const player = await mustPlayer(ctx, playerId);
    await ctx.db.patch(playerId, { dailyLimitCents, consentAt: player.consentAt ?? Date.now() });
    return { ok: true };
  },
});

export const takeStake = mutation({
  args: { secret, playerId: v.id("players"), groupId: v.id("groups"), amountCents: v.number(), roundId: v.optional(v.string()), key: v.string(), buyIn: v.optional(v.boolean()), note: v.optional(v.string()) },
  handler: async (ctx, { secret, playerId, groupId, amountCents, roundId, key, buyIn, note }) => {
    assertServer(secret);
    const wallet = playerWallet(playerId);
    if (await ctx.db.query("ledger").withIndex("by_key", (q) => q.eq("key", key)).unique()) return { ok: true as const, duplicate: true, balanceCents: await balanceOf(ctx, wallet) };
    if (!wholeCents(amountCents)) throw new Error("Amount must be a positive whole number of cents");
    const player = await mustPlayer(ctx, playerId);
    const member = await membership(ctx, groupId, playerId);
    if (!member || member.leftAt) throw new Error("Not in this group");
    if (!player.consentAt) return { ok: false as const, reason: "consent" as const };
    if ((await spentToday(ctx, playerId)) + amountCents > player.dailyLimitCents) return { ok: false as const, reason: "limit" as const };
    const balanceCents = await balanceOf(ctx, wallet);
    if (balanceCents < amountCents) return { ok: false as const, reason: "balance" as const, balanceCents };
    await postMove(ctx, { from: wallet, to: potWallet(groupId), amountCents, reason: buyIn ? "buy_in" : "stake", key, actor: "agent", actorPlayerId: playerId, groupId, roundId, note: note ?? "Stake" });
    return { ok: true as const, duplicate: false, balanceCents: balanceCents - amountCents };
  },
});

export const settlePot = mutation({
  args: { secret, groupId: v.id("groups"), shares: v.array(v.object({ playerId: v.id("players"), cents: v.number() })), key: v.string() },
  handler: async (ctx, { secret, groupId, shares, key }) => {
    assertServer(secret);
    if (new Set(shares.map((s) => s.playerId)).size !== shares.length) throw new Error("Each player can appear once");
    if (shares.some((s) => !wholeCents(s.cents, 0))) throw new Error("Shares must be whole cents");
    const pending = [];
    for (const share of shares) {
      await mustPlayer(ctx, share.playerId);
      const shareKey = key + ":" + share.playerId;
      if (share.cents > 0 && !(await ctx.db.query("ledger").withIndex("by_key", (q) => q.eq("key", shareKey)).unique())) pending.push({ ...share, key: shareKey });
    }
    const pot = potWallet(groupId);
    const paidCents = pending.reduce((sum, s) => sum + s.cents, 0);
    if (paidCents > (await balanceOf(ctx, pot))) throw new Error("Shares add up to more than the pot holds");
    for (const share of pending) await postMove(ctx, { from: pot, to: playerWallet(share.playerId), amountCents: share.cents, reason: "payout", key: share.key, actor: "agent", groupId, note: "Pot win" });
    return { ok: true, paidCents };
  },
});

export const potMove = mutation({
  args: { secret, chatId: v.string(), playerId: v.id("players"), amountCents: v.optional(v.number()), refundOf: v.optional(v.string()), key: v.string(), note: v.string() },
  handler: async (ctx, { secret, chatId, playerId, amountCents, refundOf, key, note }) => {
    assertServer(secret);
    if (await ctx.db.query("ledger").withIndex("by_key", (q) => q.eq("key", key)).unique()) return { ok: true as const, duplicate: true };
    await mustPlayer(ctx, playerId);
    const group = await ctx.db.query("groups").withIndex("by_chat", (q) => q.eq("chatId", chatId)).unique();
    if (!group) return { ok: false as const, reason: "pot" as const };
    const stake = refundOf ? await ctx.db.query("ledger").withIndex("by_key", (q) => q.eq("key", refundOf)).unique() : null;
    if (refundOf && (!stake || stake.from !== playerWallet(playerId) || stake.to !== potWallet(group._id))) return { ok: false as const, reason: "stake" as const };
    const cents = stake ? stake.amountCents : amountCents ?? 0;
    if (!wholeCents(cents)) throw new Error("Amount must be a positive whole number of cents");
    if ((await balanceOf(ctx, potWallet(group._id))) < cents) return { ok: false as const, reason: "pot" as const };
    await postMove(ctx, { from: potWallet(group._id), to: playerWallet(playerId), amountCents: cents, reason: refundOf ? "refund" : "payout", key, actor: "agent", groupId: group._id, note });
    return { ok: true as const, duplicate: false, amountCents: cents };
  },
});

export const requestAdjustment = mutation({
  args: {
    secret,
    groupId: v.id("groups"),
    byPlayerId: v.id("players"),
    playerId: v.id("players"),
    amountCents: v.number(),
    direction: v.union(v.literal("debit"), v.literal("credit")),
    toPlayerId: v.optional(v.id("players")),
    note: v.optional(v.string()),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    assertServer(args.secret);
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Unknown group");
    if (group.commissionerId !== args.byPlayerId) throw new Error("Only the commissioner can propose an adjustment");
    if (!wholeCents(args.amountCents)) throw new Error("Amount must be a positive whole number of cents");
    const member = await membership(ctx, args.groupId, args.playerId);
    if (!member || member.leftAt) throw new Error("That player is not in this group");
    const target = playerWallet(args.playerId);
    if (args.direction === "credit") {
      if ((await ctx.db.query("ledger").withIndex("by_key", (q) => q.eq("key", args.key)).unique()) === null && (await balanceOf(ctx, HOUSE)) < args.amountCents) return { ok: false as const, reason: "balance" as const };
      await postMove(ctx, { from: HOUSE, to: target, amountCents: args.amountCents, reason: "adjustment", key: args.key, actor: "commissioner", actorPlayerId: args.byPlayerId, groupId: args.groupId, note: args.note });
      return { ok: true as const, status: "approved" as const };
    }
    if (args.toPlayerId === args.playerId) throw new Error("A debit needs a different destination");
    const existing = await ctx.db.query("approvals").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (existing) return { ok: true as const, status: existing.status, approvalId: existing._id };
    if (args.toPlayerId) await mustPlayer(ctx, args.toPlayerId);
    const approvalId = await pendingDebit(ctx, { approverId: args.playerId, requestedBy: args.byPlayerId, groupId: args.groupId, to: args.toPlayerId ? playerWallet(args.toPlayerId) : potWallet(args.groupId), amountCents: args.amountCents, note: args.note, key: args.key });
    return { ok: true as const, status: "pending" as const, approvalId };
  },
});

export const decideApproval = mutation({
  args: { secret, approvalId: v.id("approvals"), playerId: v.id("players"), approve: v.boolean() },
  handler: async (ctx, { secret, approvalId, playerId, approve }) => {
    assertServer(secret);
    const approval = await ctx.db.get(approvalId);
    if (!approval) throw new Error("Unknown approval");
    if (approval.approverId !== playerId) throw new Error("Only the player being charged can decide this");
    if (approval.status !== "pending") return { ok: approval.status === "approved", status: approval.status };
    const now = Date.now();
    if (now > approval.expiresAt) {
      await ctx.db.patch(approvalId, { status: "expired", decidedAt: now });
      return { ok: false, status: "expired" as const };
    }
    if (!approve) {
      await ctx.db.patch(approvalId, { status: "declined", decidedAt: now });
      return { ok: false, status: "declined" as const };
    }
    if ((await balanceOf(ctx, approval.from)) < approval.amountCents) return { ok: false, status: "pending" as const, reason: "balance" as const };
    await postMove(ctx, { from: approval.from, to: approval.to, amountCents: approval.amountCents, reason: approval.reason, key: "approval:" + approvalId, actor: "player", actorPlayerId: playerId, approvalId, groupId: approval.groupId, note: approval.note });
    await ctx.db.patch(approvalId, { status: "approved", decidedAt: now });
    return { ok: true, status: "approved" as const };
  },
});

export const pendingApprovals = query({
  args: { secret, playerId: v.id("players") },
  handler: async (ctx, { secret, playerId }) => {
    assertServer(secret);
    const rows = await ctx.db.query("approvals").withIndex("by_approver", (q) => q.eq("approverId", playerId).eq("status", "pending")).collect();
    return rows.filter((a) => a.expiresAt >= Date.now()).map((a) => ({ id: a._id, amountCents: a.amountCents, groupId: a.groupId, to: a.to, note: a.note ?? "", requestedBy: a.requestedBy, expiresAt: a.expiresAt }));
  },
});

export const wallet = query({
  args: { secret, playerId: v.id("players") },
  handler: async (ctx, { secret, playerId }) => {
    assertServer(secret);
    const player = await mustPlayer(ctx, playerId);
    const me = playerWallet(playerId);
    const rows = [
      ...(await ctx.db.query("ledger").withIndex("by_to", (q) => q.eq("to", me)).order("desc").take(20)),
      ...(await ctx.db.query("ledger").withIndex("by_from", (q) => q.eq("from", me)).order("desc").take(20)),
    ];
    const activity = rows
      .sort((a, b) => b.createdAt - a.createdAt || b._creationTime - a._creationTime)
      .slice(0, 20)
      .map((r) => ({ at: r.createdAt, amountCents: r.to === me ? r.amountCents : -r.amountCents, reason: r.reason === "top_up" ? "topup" : r.reason === "buy_in" ? "buyin" : r.reason === "payout" ? (r.to === me ? "win" : "cashout") : r.reason, note: r.note ?? "" }));
    return { balanceCents: await balanceOf(ctx, me), dailyLimitCents: player.dailyLimitCents, spentTodayCents: await spentToday(ctx, playerId), consent: !!player.consentAt, kyc: player.kyc, activity };
  },
});

export const agentWallet = query({
  args: { secret, phone: v.string() },
  handler: async (ctx, { secret, phone }) => {
    assertServer(secret);
    const player = await playerByPhone(ctx, phone);
    if (!player) return null;
    return { balanceCents: await balanceOf(ctx, playerWallet(player._id)), dailyLimitCents: player.dailyLimitCents, spentTodayCents: await spentToday(ctx, player._id) };
  },
});

export const proposeAdjustment = mutation({
  args: { secret, actorPhone: v.string(), chatId: v.optional(v.string()), player: v.string(), amountCents: v.number(), reason: v.string() },
  handler: async (ctx, { secret, actorPhone, chatId, player, amountCents, reason }) => {
    assertServer(secret);
    if (!wholeCents(amountCents)) throw new ConvexError("Give an amount above zero.");
    if (!reason.trim()) throw new ConvexError("Give a reason.");
    const { actor, group } = await commissionedGroup(ctx, actorPhone, chatId);
    const { player: target } = await memberNamed(ctx, group._id, player);
    const id = await pendingDebit(ctx, { approverId: target._id, requestedBy: actor._id, groupId: group._id, to: potWallet(group._id), amountCents, note: reason, key: "" });
    await ctx.db.patch(id, { key: "adj:" + id });
    return { id: id as string, player: target.name, playerPhone: target.phone, actorName: actor.name };
  },
});

export const approveAdjustment = mutation({
  args: { secret, phone: v.string(), id: v.string(), amountCents: v.number(), reason: v.string() },
  handler: async (ctx, { secret, phone, id, amountCents, reason }) => {
    assertServer(secret);
    const approvalId = ctx.db.normalizeId("approvals", id);
    const approval = approvalId ? await ctx.db.get(approvalId) : null;
    const player = await playerByPhone(ctx, phone);
    if (!approval || !player || approval.approverId !== player._id) throw new ConvexError("That request is not yours to approve.");
    if (approval.status !== "pending") throw new ConvexError("That request was already " + approval.status + ".");
    if (Date.now() > approval.expiresAt) throw new ConvexError("That request expired.");
    if (approval.amountCents !== amountCents || (approval.note ?? "") !== reason) throw new ConvexError("That does not match the request.");
    const member = await membership(ctx, approval.groupId, player._id);
    if (!member || member.leftAt) throw new ConvexError("You are no longer in that group.");
    const balanceCents = await balanceOf(ctx, approval.from);
    if (balanceCents < amountCents) throw new ConvexError("Your Nickel balance is too low for this. Add money first.");
    await postMove(ctx, { from: approval.from, to: approval.to, amountCents, reason: "adjustment", key: "adj:" + approval._id, actor: "player", actorPlayerId: player._id, approvalId: approval._id, groupId: approval.groupId, note: approval.note });
    await ctx.db.patch(approval._id, { status: "approved", decidedAt: Date.now() });
    return { balanceCents: balanceCents - amountCents };
  },
});

export const reconcile = query({
  args: { secret, whopBalanceCents: v.number() },
  handler: async (ctx, { secret, whopBalanceCents }) => {
    assertServer(secret);
    const totals = { players: 0, pots: 0, holds: 0, house: 0, world: 0 };
    const bucket = (wallet: string): keyof typeof totals | null => (wallet === WORLD ? "world" : wallet === HOUSE ? "house" : wallet.startsWith("player:") ? "players" : wallet.startsWith("pot:") ? "pots" : wallet.startsWith("hold:") ? "holds" : null);
    const unknown = new Set<string>();
    for await (const row of ctx.db.query("ledger")) {
      for (const [wallet, sign] of [[row.to, 1], [row.from, -1]] as const) {
        const b = bucket(wallet);
        if (b) totals[b] += sign * row.amountCents;
        else unknown.add(wallet);
      }
    }
    const internalCents = totals.players + totals.pots + totals.holds + totals.house;
    return { ...totals, internalCents, whopBalanceCents, diffCents: whopBalanceCents - internalCents, ok: whopBalanceCents === internalCents, unknownWallets: [...unknown] };
  },
});

export const playerState = internalQuery({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (!player) return null;
    const pending = await ctx.db.query("payouts").withIndex("by_player", (q) => q.eq("playerId", playerId)).filter((q) => q.eq(q.field("status"), "pending")).first();
    return { player, balanceCents: await balanceOf(ctx, playerWallet(playerId)), payoutPending: !!pending };
  },
});

export const setWhopAccount = internalMutation({
  args: { playerId: v.id("players"), whopAccountId: v.optional(v.string()), kyc: v.union(v.literal("none"), v.literal("pending"), v.literal("verified")) },
  handler: async (ctx, { playerId, whopAccountId, kyc }) => {
    const player = await mustPlayer(ctx, playerId);
    await ctx.db.patch(playerId, { whopAccountId: whopAccountId ?? player.whopAccountId, kyc });
  },
});

export const beginPayout = internalMutation({
  args: { playerId: v.id("players"), amountCents: v.number() },
  handler: async (ctx, { playerId, amountCents }) => {
    const wallet = playerWallet(playerId);
    if (!wholeCents(amountCents) || (await balanceOf(ctx, wallet)) < amountCents) return null;
    const now = Date.now();
    const key = "cashout:" + playerId + ":" + now;
    const payoutId = await ctx.db.insert("payouts", { playerId, amountCents, status: "pending", key, createdAt: now });
    await postMove(ctx, { from: wallet, to: holdWallet(payoutId), amountCents, reason: "payout", key: key + ":hold", actor: "player", actorPlayerId: playerId, note: "Cash out" });
    return { payoutId, key };
  },
});

async function finishPayout(ctx: MutationCtx, payout: Doc<"payouts">, outcome: "completed" | "failed", failureReason?: string) {
  if (payout.status !== "pending") return payout.status;
  const hold = holdWallet(payout._id);
  if (outcome === "completed") {
    await postMove(ctx, { from: hold, to: WORLD, amountCents: payout.amountCents, reason: "payout", key: payout.key + ":done", actor: "whop", actorPlayerId: payout.playerId, note: "Cash out sent" });
    const fee = transferFeeCents(payout.amountCents);
    if (fee > 0) await postMove(ctx, { from: HOUSE, to: WORLD, amountCents: fee, reason: "fee", key: payout.key + ":fee", actor: "whop", actorPlayerId: payout.playerId, note: "Transfer fee" });
  } else await postMove(ctx, { from: hold, to: playerWallet(payout.playerId), amountCents: payout.amountCents, reason: "refund", key: payout.key + ":release", actor: "whop", actorPlayerId: payout.playerId, note: "Cash out failed" });
  await ctx.db.patch(payout._id, { status: outcome, settledAt: Date.now(), failureReason });
  return outcome;
}

export const recordTransfer = internalMutation({
  args: { payoutId: v.id("payouts"), transferId: v.optional(v.string()), status: v.union(v.literal("processing"), v.literal("succeeded"), v.literal("failed")), failureReason: v.optional(v.string()) },
  handler: async (ctx, { payoutId, transferId, status, failureReason }) => {
    const payout = await ctx.db.get(payoutId);
    if (!payout) throw new Error("Unknown payout");
    if (transferId && !payout.whopTransferId) await ctx.db.patch(payoutId, { whopTransferId: transferId });
    if (status === "processing") return payout.status;
    return finishPayout(ctx, { ...payout, whopTransferId: payout.whopTransferId ?? transferId }, status === "succeeded" ? "completed" : "failed", failureReason);
  },
});

export const removePlayer = mutation({
  args: { secret, actorPhone: v.string(), chatId: v.optional(v.string()), player: v.string() },
  handler: async (ctx, { secret, actorPhone, chatId, player }): Promise<{ player: string; refundedCents: number }> => {
    assertServer(secret);
    const { actor, group } = await commissionedGroup(ctx, actorPhone, chatId);
    const { player: target, row } = await memberNamed(ctx, group._id, player);
    if (target._id === actor._id) throw new ConvexError("The commissioner cannot remove themselves.");
    const me = playerWallet(target._id);
    const pot = potWallet(group._id);
    let net = 0;
    for await (const move of ctx.db.query("ledger").withIndex("by_group", (q) => q.eq("groupId", group._id))) {
      if (move.from === me && move.to === pot) net += move.amountCents;
      if (move.from === pot && move.to === me) net -= move.amountCents;
    }
    const refundedCents = Math.max(0, Math.min(net, await balanceOf(ctx, pot)));
    if (refundedCents > 0) await postMove(ctx, { from: pot, to: me, amountCents: refundedCents, reason: "refund", key: "remove:" + row._id + ":" + row.joinedAt, actor: "commissioner", actorPlayerId: actor._id, groupId: group._id, note: "Removed from " + group.name });
    await ctx.db.patch(row._id, { leftAt: Date.now() });
    const otherGroups = (await ctx.db.query("groupMembers").withIndex("by_player", (q) => q.eq("playerId", target._id)).collect()).some((m) => !m.leftAt && m._id !== row._id);
    const payoutPending = await ctx.db.query("payouts").withIndex("by_player", (q) => q.eq("playerId", target._id)).filter((q) => q.eq(q.field("status"), "pending")).first();
    const idle = !otherGroups && !payoutPending && (await balanceOf(ctx, me)) === 0;
    if (idle && target.whopAccountId) await ctx.scheduler.runAfter(0, internal.payments.suspendWhopAccount, { accountId: target.whopAccountId });
    return { player: target.name, refundedCents };
  },
});

function cents(total: unknown): number {
  const amount = typeof total === "object" && total ? (total as { amount?: unknown }).amount : total;
  const value = Number(amount);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

async function applyEvent(ctx: MutationCtx, type: string, data: Record<string, any>, accountId: string | undefined): Promise<string> {
  if (type === "payment.succeeded") {
    const meta = (data.metadata ?? {}) as Record<string, unknown>;
    if (meta.kind !== "top_up") return "ignored:not_top_up";
    const platform = whopConfig().accountId;
    if (platform && data.account_id && data.account_id !== platform) return "ignored:other_account";
    const playerId = ctx.db.normalizeId("players", String(meta.playerId ?? ""));
    if (!playerId || !(await ctx.db.get(playerId))) return "ignored:unknown_player";
    const currency = String(data.currency ?? data.total?.currency ?? "usd").toLowerCase();
    if (currency !== "usd") return "ignored:currency";
    const paid = cents(data.total);
    const asked = Number(meta.amountCents);
    const credit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, paid) : paid;
    if (!data.id || credit <= 0) return "ignored:amount";
    const out = await postMove(ctx, { from: WORLD, to: playerWallet(playerId), amountCents: credit, reason: "top_up", key: "whop:" + data.id, actor: "whop", actorPlayerId: playerId, note: "Top up" });
    await postMove(ctx, { from: HOUSE, to: WORLD, amountCents: topUpFeeCents(paid), reason: "fee", key: "whop:" + data.id + ":fee", actor: "whop", actorPlayerId: playerId, note: "Card fee" });
    return out.duplicate ? "duplicate" : "credited";
  }
  if (type === "transfer.completed" || type === "transfer.failed") {
    const byTransfer = data.id ? await ctx.db.query("payouts").withIndex("by_transfer", (q) => q.eq("whopTransferId", String(data.id))).unique() : null;
    const fallbackId = ctx.db.normalizeId("payouts", String(data.metadata?.payoutId ?? ""));
    const payout = byTransfer ?? (fallbackId ? await ctx.db.get(fallbackId) : null);
    if (!payout) return "ignored:unknown_transfer";
    if (!payout.whopTransferId && data.id) await ctx.db.patch(payout._id, { whopTransferId: String(data.id) });
    return "payout:" + (await finishPayout(ctx, payout, type === "transfer.completed" ? "completed" : "failed", data.failure_reason ?? undefined));
  }
  if (type === "account.updated" || type === "verification.succeeded") {
    const id = type === "account.updated" ? data.id : accountId;
    const player = id ? await playerByWhopAccount(ctx, String(id)) : null;
    if (!player) return "ignored:unknown_account";
    const kyc = type === "verification.succeeded" ? "verified" : data.verification !== undefined ? kycOf(data.verification) : player.kyc;
    if (kyc !== player.kyc) await ctx.db.patch(player._id, { kyc });
    return "kyc:" + kyc;
  }
  return "ignored";
}

export const handleWhopEvent = internalMutation({
  args: { eventId: v.string(), payload: v.string() },
  handler: async (ctx, { eventId, payload }) => {
    const existing = await ctx.db.query("whopEvents").withIndex("by_event", (q) => q.eq("eventId", eventId)).unique();
    if (existing) return { duplicate: true, outcome: existing.outcome };
    const event = JSON.parse(payload) as { type?: string; account_id?: string; company_id?: string; data?: Record<string, any> };
    const type = String(event.type ?? "");
    const accountId = event.account_id ?? event.company_id ?? undefined;
    const outcome = await applyEvent(ctx, type, event.data ?? {}, accountId);
    await ctx.db.insert("whopEvents", { eventId, type, accountId, payload, outcome, receivedAt: Date.now() });
    return { duplicate: false, outcome };
  },
});

export const createTopUp = action({
  args: { secret, playerId: v.id("players"), amountCents: v.number(), redirectUrl: v.optional(v.string()) },
  handler: async (ctx, { secret, playerId, amountCents, redirectUrl }): Promise<{ checkoutUrl: string }> => {
    assertServer(secret);
    if (!wholeCents(amountCents, MIN_TOP_UP_CENTS) || amountCents > MAX_TOP_UP_CENTS) throw new Error("Top-ups run from $1 to $" + MAX_TOP_UP_CENTS / 100);
    if (!(await ctx.runQuery(internal.payments.playerState, { playerId }))) throw new Error("Unknown player");
    const checkout = await whop().createCheckout({ amountCents, redirectUrl, metadata: { playerId, amountCents, kind: "top_up" } });
    return { checkoutUrl: checkout.purchaseUrl };
  },
});

export type CashOutResult = { ok: true; url: string } | { ok: true; status: "pending" | "completed"; payoutId: string } | { ok: false; reason: "amount" | "balance" | "email" | "busy" | "transfer" };

export const cashOut = action({
  args: { secret, playerId: v.id("players"), amountCents: v.number(), email: v.optional(v.string()), returnUrl: v.string() },
  handler: async (ctx, { secret, playerId, amountCents, email, returnUrl }): Promise<CashOutResult> => {
    assertServer(secret);
    const state = await ctx.runQuery(internal.payments.playerState, { playerId });
    if (!state) throw new Error("Unknown player");
    if (!wholeCents(amountCents, MIN_CASH_OUT_CENTS)) return { ok: false, reason: "amount" };
    if (state.balanceCents < amountCents) return { ok: false, reason: "balance" };
    const api = whop();
    let accountId = state.player.whopAccountId;
    if (!accountId) {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: "email" };
      try {
        accountId = (await api.createAccount({ email, externalId: playerId, title: state.player.name || "Nickel player" })).id;
      } catch (e) {
        if (definiteFailure(e)) return { ok: false, reason: "email" };
        throw e;
      }
      await ctx.runMutation(internal.payments.setWhopAccount, { playerId, whopAccountId: accountId, kyc: "pending" });
    }
    if (state.player.kyc !== "verified" || !state.player.whopAccountId) {
      const kyc = (await api.getAccount(accountId)).kyc;
      if (kyc !== "verified") {
        await ctx.runMutation(internal.payments.setWhopAccount, { playerId, kyc: "pending" });
        return { ok: true, url: (await api.accountLink({ accountId, useCase: "account_onboarding", returnUrl })).url };
      }
      await ctx.runMutation(internal.payments.setWhopAccount, { playerId, kyc: "verified" });
    }
    if (state.payoutPending) return { ok: false, reason: "busy" };
    const begun = await ctx.runMutation(internal.payments.beginPayout, { playerId, amountCents });
    if (!begun) return { ok: false, reason: "balance" };
    try {
      const transfer = await api.createTransfer({ destinationId: accountId, amountCents, idempotenceKey: begun.key, metadata: { payoutId: begun.payoutId, playerId, kind: "payout" } });
      const status = await ctx.runMutation(internal.payments.recordTransfer, { payoutId: begun.payoutId, transferId: transfer.id, status: transfer.status });
      if (status === "failed") return { ok: false, reason: "transfer" };
      return { ok: true, status: status === "completed" ? "completed" : "pending", payoutId: begun.payoutId };
    } catch (e) {
      if (!definiteFailure(e)) throw e;
      await ctx.runMutation(internal.payments.recordTransfer, { payoutId: begun.payoutId, status: "failed", failureReason: (e as Error).message.slice(0, 300) });
      return { ok: false, reason: "transfer" };
    }
  },
});

export const walletToken = action({
  args: { secret, playerId: v.id("players") },
  handler: async (ctx, { secret, playerId }): Promise<{ token: string; expiresAt: string } | null> => {
    assertServer(secret);
    const state = await ctx.runQuery(internal.payments.playerState, { playerId });
    if (!state?.player.whopAccountId) return null;
    return whop().accessToken(state.player.whopAccountId);
  },
});

export const suspendWhopAccount = internalAction({
  args: { accountId: v.string() },
  handler: async (_ctx, { accountId }) => {
    await whop().suspendAccount(accountId);
  },
});
