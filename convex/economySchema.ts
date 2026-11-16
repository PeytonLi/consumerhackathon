import { defineTable } from "convex/server";
import { v } from "convex/values";

export const perkKind = v.union(v.literal("lock"), v.literal("double_steal"), v.literal("peek"), v.literal("shield"));

export const nickelReason = v.union(
  v.literal("daily"),
  v.literal("play_to_keep"),
  v.literal("lock"),
  v.literal("steal"),
  v.literal("double_steal"),
  v.literal("bounty"),
  v.literal("chest")
);

export const stakeStatus = v.union(
  v.literal("table"),
  v.literal("kept"),
  v.literal("locked"),
  v.literal("loose"),
  v.literal("stolen"),
  v.literal("bounty"),
  v.literal("paid")
);

export const economyTables = {
  nickelLedger: defineTable({
    from: v.string(),
    to: v.string(),
    amount: v.number(),
    reason: nickelReason,
    groupId: v.optional(v.id("groups")),
    roundId: v.optional(v.string()),
    key: v.string(),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_from", ["from"])
    .index("by_to", ["to"]),

  stakes: defineTable({
    groupId: v.id("groups"),
    roundId: v.string(),
    playerId: v.id("players"),
    day: v.string(),
    nickels: v.number(),
    cents: v.number(),
    status: stakeStatus,
    playedAt: v.optional(v.number()),
    score: v.optional(v.number()),
    ghostMs: v.optional(v.number()),
    heistEndsAt: v.optional(v.number()),
    thiefId: v.optional(v.id("players")),
    bountyWinnerId: v.optional(v.id("players")),
    settledAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_round", ["groupId", "roundId"])
    .index("by_round_player", ["groupId", "roundId", "playerId"])
    .index("by_group_status", ["groupId", "status"])
    .index("by_player_status", ["playerId", "status"])
    .index("by_thief", ["thiefId"]),

  heistAttempts: defineTable({
    stakeId: v.id("stakes"),
    groupId: v.id("groups"),
    playerId: v.id("players"),
    victimId: v.id("players"),
    ms: v.number(),
    score: v.number(),
    ghostMs: v.number(),
    won: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_stake_player", ["stakeId", "playerId"])
    .index("by_player", ["playerId"])
    .index("by_group", ["groupId"]),

  perkLog: defineTable({
    playerId: v.id("players"),
    perk: perkKind,
    delta: v.number(),
    reason: v.string(),
    key: v.string(),
    createdAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_player", ["playerId"]),

  chestOpens: defineTable({
    playerId: v.id("players"),
    day: v.string(),
    seed: v.string(),
    status: v.union(v.literal("opened"), v.literal("skipped")),
    kind: v.optional(v.union(v.literal("points"), v.literal("perk"), v.literal("cash"))),
    label: v.optional(v.string()),
    points: v.optional(v.number()),
    perk: v.optional(perkKind),
    amountCents: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_player_day", ["playerId", "day"])
    .index("by_day", ["day"]),
};
