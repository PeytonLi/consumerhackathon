import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const rewardModeValidator = v.union(
  v.literal("points_only"),
  v.literal("cash_only"),
  v.literal("hybrid")
);

export const themeTypeValidator = v.union(
  v.literal("arcade_mix"),
  v.literal("hockey"),
  v.literal("basketball"),
  v.literal("football"),
  v.literal("ai_models"),
  v.literal("custom")
);

export const cadenceValidator = v.union(
  v.literal("demo_blitz"),
  v.literal("weekly"),
  v.literal("biweekly"),
  v.literal("monthly"),
  v.literal("custom_days")
);

export const gameTypeValidator = v.union(
  v.literal("krillion"),
  v.literal("wordle"),
  v.literal("cup_pong"),
  v.literal("mini_golf"),
  v.literal("salvo")
);

export default defineSchema({
  leagueState: defineTable({ key: v.string(), json: v.string(), updatedAt: v.number() }).index("by_key", ["key"]),

  users: defineTable({
    name: v.string(),
    handle: v.string(),
    phone: v.string(), // Canonical E.164 (+1...)
    telegramId: v.optional(v.string()),
    avatarColor: v.string(),
    campusOrCity: v.string(),
    isShadow: v.boolean(),
    whopUserId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_phone", ["phone"])
    .index("by_handle", ["handle"]),

  leagues: defineTable({
    name: v.string(),
    inviteCode: v.string(),
    keikiConversationId: v.optional(v.string()), // e.g. "imsg:chat:cupertino-day-ones"
    commissionerId: v.id("users"),
    rewardMode: rewardModeValidator, // "points_only" | "cash_only" | "hybrid"
    customRewardLabel: v.optional(v.string()), // e.g. "Last place buys KBBQ + wears Stanford hoodie"
    themeType: themeTypeValidator,
    customThemePrompt: v.optional(v.string()),
    cadence: cadenceValidator,
    cadenceDays: v.number(),
    buyInCents: v.number(),
    potBalanceCents: v.number(),
    payoutSplit: v.array(v.number()), // e.g. [70, 30]
    dailyNickelAllowance: v.number(), // Default 5
    enabledGames: v.array(v.string()),
    seasonNumber: v.number(),
    seasonStartsAt: v.number(),
    seasonEndsAt: v.number(),
    squadStreakDays: v.number(),
    squadMultiplier: v.number(),
  })
    .index("by_invite_code", ["inviteCode"])
    .index("by_keiki_conv", ["keikiConversationId"]),

  memberships: defineTable({
    leagueId: v.id("leagues"),
    userId: v.id("users"),
    role: v.union(v.literal("commissioner"), v.literal("player")),
    nickelBalance: v.number(),
    unclaimedDailyNickels: v.number(),
    poachable: v.boolean(),
    seasonFantasyPoints: v.number(),
    weeklyMatchupPoints: v.number(),
    currentOpponentUserId: v.optional(v.id("users")),
    wins: v.number(),
    losses: v.number(),
    krillionCount: v.number(),
    poachedNickelsTotal: v.number(),
    timesPoached: v.number(),
    statusNote: v.optional(v.string()), // 40-char 24h Instagram-Notes bubble
    reactionEmoji: v.optional(v.string()),
    statusUpdatedAt: v.optional(v.number()),
    powerups: v.array(v.string()), // ["double_down", "bet_shield"]
    buyInPaid: v.boolean(),
    lastPlayedRoundId: v.optional(v.id("rounds")),
  })
    .index("by_league", ["leagueId"])
    .index("by_league_user", ["leagueId", "userId"])
    .index("by_league_points", ["leagueId", "seasonFantasyPoints"])
    .index("by_user", ["userId"]),

  rounds: defineTable({
    leagueId: v.id("leagues"),
    seasonNumber: v.number(),
    dateKey: v.string(),
    isDailyMain: v.boolean(),
    gameType: gameTypeValidator,
    title: v.string(),
    publicConfig: v.any(),
    secretServerState: v.optional(v.any()),
    challengerId: v.optional(v.id("users")),
    opponentId: v.optional(v.id("users")),
    stakeNickels: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("poach_window"),
      v.literal("settled")
    ),
    startsAt: v.number(),
    poachOpensAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_league_status", ["leagueId", "status"])
    .index("by_league_date", ["leagueId", "dateKey"]),

  plays: defineTable({
    roundId: v.id("rounds"),
    leagueId: v.id("leagues"),
    seasonNumber: v.number(),
    userId: v.id("users"),
    status: v.union(v.literal("in_progress"), v.literal("completed")),
    publicSpectatorState: v.any(),
    privateResult: v.optional(v.any()),
    normalizedAnswer: v.optional(v.string()),
    tierLabel: v.optional(v.string()),
    evaluationMs: v.optional(v.number()),
    basePoints: v.number(),
    finalPoints: v.number(),
    collisionWithUserId: v.optional(v.id("users")),
    tiebreakerMetric: v.number(),
    mysteryReward: v.optional(
      v.object({
        nickels: v.number(),
        powerup: v.optional(v.string()),
        rarity: v.union(
          v.literal("common"),
          v.literal("rare"),
          v.literal("golden_krill")
        ),
        opened: v.boolean(),
      })
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_round", ["roundId"])
    .index("by_round_user", ["roundId", "userId"])
    .index("by_league_season", ["leagueId", "seasonNumber"]),

  wagers: defineTable({
    leagueId: v.id("leagues"),
    seasonNumber: v.number(),
    roundId: v.optional(v.id("rounds")),
    creatorId: v.id("users"),
    targetUserId: v.optional(v.id("users")),
    takerId: v.optional(v.id("users")),
    wagerType: v.union(
      v.literal("over_under"),
      v.literal("h2h_challenge"),
      v.literal("krillion_parlay")
    ),
    marketLabel: v.string(),
    metric: v.string(),
    lineValue: v.number(),
    pickSide: v.union(
      v.literal("over"),
      v.literal("under"),
      v.literal("challenger")
    ),
    stakeNickels: v.number(),
    stakeCents: v.optional(v.number()),
    payoutMultiplier: v.number(),
    usedShield: v.boolean(),
    status: v.union(
      v.literal("open"),
      v.literal("locked"),
      v.literal("won"),
      v.literal("lost"),
      v.literal("push"),
      v.literal("shield_saved")
    ),
    createdAt: v.number(),
    settledAt: v.optional(v.number()),
  })
    .index("by_league_status", ["leagueId", "status"])
    .index("by_round", ["roundId"])
    .index("by_league_season", ["leagueId", "seasonNumber"]),

  wrappedSnapshots: defineTable({
    leagueId: v.id("leagues"),
    seasonNumber: v.number(),
    rewardMode: rewardModeValidator,
    generatedAt: v.number(),
    totalNickelsWagered: v.number(),
    totalGamesPlayed: v.number(),
    potPaidCents: v.number(),
    customRewardOutcome: v.optional(v.string()),
    winnerUserIds: v.array(v.id("users")),
    superlatives: v.object({
      biggestHater: v.object({
        userId: v.id("users"),
        userName: v.string(),
        targetName: v.string(),
        fades: v.number(),
        netNickels: v.number(),
      }),
      deepestBrain: v.object({
        userId: v.id("users"),
        userName: v.string(),
        bestAnswer: v.string(),
        krillions: v.number(),
      }),
      nickelBandit: v.object({
        userId: v.id("users"),
        userName: v.string(),
        stolenNickels: v.number(),
      }),
      clutchGod: v.object({
        userId: v.id("users"),
        userName: v.string(),
        avgPoints: v.number(),
      }),
    }),
    playerCards: v.array(
      v.object({
        userId: v.id("users"),
        userName: v.string(),
        rank: v.number(),
        seasonPoints: v.number(),
        archetypeTitle: v.string(),
        archetypeTagline: v.string(),
        payoutCents: v.number(),
      })
    ),
    keikiCarouselSlides: v.array(
      v.object({
        title: v.string(),
        body: v.string(),
        slideNumber: v.number(),
        totalSlides: v.number(),
      })
    ),
  }).index("by_league_season", ["leagueId", "seasonNumber"]),

  transactions: defineTable({
    leagueId: v.id("leagues"),
    seasonNumber: v.number(),
    userId: v.id("users"),
    counterpartyUserId: v.optional(v.id("users")),
    kind: v.union(
      v.literal("whop_buy_in"),
      v.literal("whop_payout"),
      v.literal("daily_claim"),
      v.literal("poach_steal"),
      v.literal("mystery_pack"),
      v.literal("wager_stake"),
      v.literal("wager_win"),
      v.literal("wager_shield_refund")
    ),
    amountCents: v.optional(v.number()),
    amountNickels: v.optional(v.number()),
    whopPaymentId: v.optional(v.string()),
    note: v.string(),
    createdAt: v.number(),
  })
    .index("by_league_season", ["leagueId", "seasonNumber"])
    .index("by_whop_payment", ["whopPaymentId"]),
});
