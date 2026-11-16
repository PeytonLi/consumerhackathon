import { v, type ObjectType } from "convex/values";
import { internalMutation, query, type MutationCtx, type QueryCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";
import { ledgerActor, ledgerReason } from "./moneySchema.js";

export const WORLD = "world";
export const HOUSE = "house";
export const playerWallet = (id: Id<"players">) => "player:" + id;
export const potWallet = (id: Id<"groups">) => "pot:" + id;

export async function balanceOf(ctx: QueryCtx, wallet: string): Promise<number> {
  let total = 0;
  for await (const row of ctx.db.query("ledger").withIndex("by_to", (q) => q.eq("to", wallet))) total += row.amountCents;
  for await (const row of ctx.db.query("ledger").withIndex("by_from", (q) => q.eq("from", wallet))) total -= row.amountCents;
  return total;
}

export const moveArgs = {
  from: v.string(),
  to: v.string(),
  amountCents: v.number(),
  reason: ledgerReason,
  key: v.string(),
  actor: ledgerActor,
  groupId: v.optional(v.id("groups")),
  roundId: v.optional(v.string()),
  actorPlayerId: v.optional(v.id("players")),
  approvalId: v.optional(v.string()),
  note: v.optional(v.string()),
};
export type MoveArgs = ObjectType<typeof moveArgs>;

export async function postMove(ctx: MutationCtx, args: MoveArgs) {
  const existing = await ctx.db.query("ledger").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
  if (existing) return { id: existing._id, duplicate: true };
  if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) throw new Error("Amount must be a positive whole number of cents");
  if (args.from === args.to) throw new Error("A move needs two different wallets");
  const mayOverdraw = args.from === WORLD || (args.from === HOUSE && args.reason === "fee");
  if (!mayOverdraw && (await balanceOf(ctx, args.from)) < args.amountCents) throw new Error("Insufficient balance in " + args.from);
  const id = await ctx.db.insert("ledger", { ...args, createdAt: Date.now() });
  return { id, duplicate: false };
}

export const move = internalMutation({ args: moveArgs, handler: (ctx, args) => postMove(ctx, args) });

export function assertServer(secret: string | undefined) {
  if (process.env.NICKEL_MONEY_SECRET && secret !== process.env.NICKEL_MONEY_SECRET) throw new Error("Not allowed");
}

export const walletBalance = query({
  args: { wallet: v.string(), secret: v.optional(v.string()) },
  handler: async (ctx, { wallet, secret }) => {
    assertServer(secret);
    return balanceOf(ctx, wallet);
  },
});
