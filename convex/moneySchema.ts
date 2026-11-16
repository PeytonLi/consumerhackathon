import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ledgerReason = v.union(
  v.literal("top_up"),
  v.literal("buy_in"),
  v.literal("stake"),
  v.literal("play_to_keep"),
  v.literal("steal"),
  v.literal("bounty"),
  v.literal("bet"),
  v.literal("chest"),
  v.literal("adjustment"),
  v.literal("payout"),
  v.literal("refund"),
  v.literal("fee")
);

export const ledgerActor = v.union(
  v.literal("agent"),
  v.literal("commissioner"),
  v.literal("player"),
  v.literal("admin"),
  v.literal("whop")
);

export const moneyTables = {
  players: defineTable({
    phone: v.string(),
    name: v.string(),
    whopAccountId: v.optional(v.string()),
    kyc: v.union(v.literal("none"), v.literal("pending"), v.literal("verified")),
    status: v.union(v.literal("active"), v.literal("frozen"), v.literal("removed")),
    dailyLimitCents: v.number(),
    consentAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_phone", ["phone"]),

  groups: defineTable({
    chatId: v.string(),
    name: v.string(),
    commissionerId: v.id("players"),
    mode: v.union(v.literal("points"), v.literal("cash")),
    buyInCents: v.number(),
    seasonStart: v.number(),
    seasonEnd: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_chat", ["chatId"]),

  groupMembers: defineTable({
    groupId: v.id("groups"),
    playerId: v.id("players"),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
  })
    .index("by_group", ["groupId"])
    .index("by_player", ["playerId"])
    .index("by_group_player", ["groupId", "playerId"]),

  ledger: defineTable({
    from: v.string(),
    to: v.string(),
    amountCents: v.number(),
    reason: ledgerReason,
    groupId: v.optional(v.id("groups")),
    roundId: v.optional(v.string()),
    actor: ledgerActor,
    actorPlayerId: v.optional(v.id("players")),
    approvalId: v.optional(v.string()),
    key: v.string(),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_from", ["from"])
    .index("by_to", ["to"])
    .index("by_group", ["groupId"]),
};
