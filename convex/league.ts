import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => (await ctx.db.query("leagueState").withIndex("by_key", (q) => q.eq("key", key)).unique())?.json ?? null,
});

export const put = mutation({
  args: { key: v.string(), json: v.string(), secret: v.optional(v.string()) },
  handler: async (ctx, { key, json, secret }) => {
    if (process.env.NICKEL_SYNC_SECRET && secret !== process.env.NICKEL_SYNC_SECRET) throw new Error("Not allowed");
    const row = await ctx.db.query("leagueState").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (row) await ctx.db.patch(row._id, { json, updatedAt: Date.now() });
    else await ctx.db.insert("leagueState", { key, json, updatedAt: Date.now() });
    return null;
  },
});
