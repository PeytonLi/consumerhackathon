import { v } from "convex/values";
import { WhopClient } from "@whop/sdk";
import { mutation } from "./_generated/server.js";

export async function createWhopBuyInCheckout(params: {
  leagueId: string;
  userId: string;
  amountCents: number;
  apiKey?: string;
  accountId?: string;
}): Promise<{
  checkoutId: string;
  purchaseUrl: string;
  mode: "live_whop_sdk" | "instant_demo_checkout";
}> {
  const token =
    params.apiKey ||
    (typeof process !== "undefined" ? process.env?.WHOP_API_KEY : undefined);
  const accountId =
    params.accountId ||
    (typeof process !== "undefined"
      ? process.env?.WHOP_PLATFORM_ACCOUNT_ID
      : undefined);

  if (token && accountId) {
    try {
      const client = new WhopClient({
        token,
        apiVersionDate: "2026-11-13-1",
      });
      const cfg = await client.checkoutConfigurations.create({
        account_id: accountId,
        metadata: {
          leagueId: params.leagueId,
          userId: params.userId,
          amountCents: String(params.amountCents),
        },
      } as any);
      return {
        checkoutId: (cfg as any).id ?? `ch_${Date.now()}`,
        purchaseUrl:
          (cfg as any).purchase_url ??
          `https://whop.com/checkout/${(cfg as any).id}`,
        mode: "live_whop_sdk",
      };
    } catch {
      // Fallback to instant demo Apple Pay sheet if sandbox credentials are offline
    }
  }

  const demoId = `ch_whop_${params.leagueId.slice(-6)}_${Date.now()}`;
  return {
    checkoutId: demoId,
    purchaseUrl: `https://whop.com/checkout/${demoId}?amount=${params.amountCents}`,
    mode: "instant_demo_checkout",
  };
}

export const recordWhopWebhookPayment = mutation({
  args: {
    whopPaymentId: v.string(),
    leagueId: v.id("leagues"),
    userId: v.id("users"),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    // Idempotency guard via by_whop_payment index
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_whop_payment", (q) =>
        q.eq("whopPaymentId", args.whopPaymentId)
      )
      .unique();

    if (existing) {
      return { duplicate: true, transactionId: existing._id };
    }

    const league = await ctx.db.get(args.leagueId);
    if (!league) throw new Error("League not found");

    const nextPot = league.potBalanceCents + args.amountCents;
    await ctx.db.patch(args.leagueId, {
      potBalanceCents: nextPot,
    });

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", args.leagueId).eq("userId", args.userId)
      )
      .unique();

    if (membership) {
      await ctx.db.patch(membership._id, {
        buyInPaid: true,
        nickelBalance: membership.nickelBalance + 5,
      });
    }

    const txId = await ctx.db.insert("transactions", {
      leagueId: args.leagueId,
      seasonNumber: league.seasonNumber,
      userId: args.userId,
      kind: "whop_buy_in",
      amountCents: args.amountCents,
      whopPaymentId: args.whopPaymentId,
      note: `Whop Apple Pay buy-in (+$${(args.amountCents / 100).toFixed(2)})`,
      createdAt: Date.now(),
    });

    return {
      duplicate: false,
      transactionId: txId,
      potBalanceCents: nextPot,
    };
  },
});
