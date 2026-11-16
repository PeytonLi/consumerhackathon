import { defineTable } from "convex/server";
import { v } from "convex/values";
import { ledgerReason } from "./moneySchema.js";

export const approvalStatus = v.union(v.literal("pending"), v.literal("approved"), v.literal("declined"), v.literal("expired"));
export const payoutStatus = v.union(v.literal("pending"), v.literal("completed"), v.literal("failed"));

export const paymentsTables = {
  whopEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
    accountId: v.optional(v.string()),
    payload: v.string(),
    outcome: v.string(),
    receivedAt: v.number(),
  }).index("by_event", ["eventId"]),

  approvals: defineTable({
    status: approvalStatus,
    approverId: v.id("players"),
    requestedBy: v.id("players"),
    from: v.string(),
    to: v.string(),
    amountCents: v.number(),
    groupId: v.id("groups"),
    reason: ledgerReason,
    note: v.optional(v.string()),
    key: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_approver", ["approverId", "status"]),

  payouts: defineTable({
    playerId: v.id("players"),
    amountCents: v.number(),
    whopTransferId: v.optional(v.string()),
    status: payoutStatus,
    key: v.string(),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
    settledAt: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_transfer", ["whopTransferId"])
    .index("by_player", ["playerId"]),
};
