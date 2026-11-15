import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";
import {
  cadenceValidator,
  gameTypeValidator,
  rewardModeValidator,
  themeTypeValidator,
} from "./schema.js";
import {
  describeRewardMode,
  normalizeKrillionAnswer,
  normalizePhoneE164,
} from "./lib/rewardMode.js";
import {
  classifyPlayerArchetype,
  computeCalibratedPropLine,
  gradeKrillionDiveWithSystemOne,
} from "./lib/systemOne.js";

/**
 * Evaluates a 5-letter Wordle guess using a two-pass duplicate-safe algorithm.
 * Returns a 5-character mask of "G" (exact), "Y" (misplaced), and "B" (absent).
 */
export function evaluateWordleMask(targetWord: string, guessWord: string): string {
  const target = targetWord.toUpperCase().split("");
  const guess = guessWord.toUpperCase().split("");
  const result = ["B", "B", "B", "B", "B"];
  const remaining: Record<string, number> = {};

  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) {
      result[i] = "G";
    } else {
      remaining[target[i]] = (remaining[target[i]] ?? 0) + 1;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (result[i] === "G") continue;
    const letter = guess[i];
    if ((remaining[letter] ?? 0) > 0) {
      result[i] = "Y";
      remaining[letter] -= 1;
    }
  }

  return result.join("");
}

async function settleWagersForPlayer(
  ctx: MutationCtx,
  params: {
    leagueId: Id<"leagues">;
    seasonNumber: number;
    targetUserId: Id<"users">;
    finalPoints: number;
    now: number;
  }
) {
  const allWagers = await ctx.db
    .query("wagers")
    .withIndex("by_league_season", (q) =>
      q.eq("leagueId", params.leagueId).eq("seasonNumber", params.seasonNumber)
    )
    .collect();

  const matching = allWagers.filter(
    (w) =>
      w.targetUserId === params.targetUserId &&
      (w.status === "open" || w.status === "locked")
  );

  for (const w of matching) {
    const wentOver = params.finalPoints > w.lineValue;
    const won =
      (w.pickSide === "over" && wentOver) ||
      (w.pickSide === "under" && !wentOver);

    const creatorMembership = await ctx.db
      .query("memberships")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", params.leagueId).eq("userId", w.creatorId)
      )
      .unique();

    if (won) {
      const payoutNickels = Math.round(w.stakeNickels * w.payoutMultiplier);
      await ctx.db.patch(w._id, { status: "won", settledAt: params.now });
      if (creatorMembership) {
        await ctx.db.patch(creatorMembership._id, {
          nickelBalance: creatorMembership.nickelBalance + payoutNickels,
          seasonFantasyPoints:
            creatorMembership.seasonFantasyPoints + payoutNickels * 3,
          wins: creatorMembership.wins + 1,
        });
      }
      await ctx.db.insert("transactions", {
        leagueId: params.leagueId,
        seasonNumber: params.seasonNumber,
        userId: w.creatorId,
        counterpartyUserId: params.targetUserId,
        kind: "wager_win",
        amountNickels: payoutNickels,
        note: `Won prop: ${w.marketLabel} (+${payoutNickels} Nickels)`,
        createdAt: params.now,
      });
    } else if (w.usedShield) {
      await ctx.db.patch(w._id, {
        status: "shield_saved",
        settledAt: params.now,
      });
      if (creatorMembership) {
        await ctx.db.patch(creatorMembership._id, {
          nickelBalance: creatorMembership.nickelBalance + w.stakeNickels,
        });
      }
      await ctx.db.insert("transactions", {
        leagueId: params.leagueId,
        seasonNumber: params.seasonNumber,
        userId: w.creatorId,
        counterpartyUserId: params.targetUserId,
        kind: "wager_shield_refund",
        amountNickels: w.stakeNickels,
        note: `Bet Shield saved ${w.stakeNickels} Nickels on ${w.marketLabel}`,
        createdAt: params.now,
      });
    } else {
      await ctx.db.patch(w._id, { status: "lost", settledAt: params.now });
      if (creatorMembership) {
        await ctx.db.patch(creatorMembership._id, {
          losses: creatorMembership.losses + 1,
        });
      }
    }
  }
}

export const seedDemoLeagues = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("leagues")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", "KRILL5"))
      .unique();
    if (existing) {
      return { leagueId: existing._id, alreadySeeded: true };
    }

    const now = 1763236800000; // Nov 15, 2026

    const sritejId = await ctx.db.insert("users", {
      name: "Sritej",
      handle: "sritej",
      phone: "+14085550101",
      avatarColor: "#10B981",
      campusOrCity: "UC Berkeley",
      isShadow: false,
      whopUserId: "user_whop_sritej",
      createdAt: now,
    });
    const peytonId = await ctx.db.insert("users", {
      name: "Peyton",
      handle: "peyton",
      phone: "+14085550102",
      avatarColor: "#6366F1",
      campusOrCity: "UCLA",
      isShadow: false,
      whopUserId: "user_whop_peyton",
      createdAt: now,
    });
    const alexId = await ctx.db.insert("users", {
      name: "Alex",
      handle: "alex",
      phone: "+14085550103",
      avatarColor: "#F59E0B",
      campusOrCity: "UIUC",
      isShadow: false,
      createdAt: now,
    });
    const mayaId = await ctx.db.insert("users", {
      name: "Maya",
      handle: "maya",
      phone: "+14085550104",
      avatarColor: "#EC4899",
      campusOrCity: "UT Austin",
      isShadow: false,
      createdAt: now,
    });
    const jordanId = await ctx.db.insert("users", {
      name: "Jordan",
      handle: "jordan",
      phone: "+14085550105",
      avatarColor: "#06B6D4",
      campusOrCity: "UMich",
      isShadow: true,
      createdAt: now,
    });

    const leagueId = await ctx.db.insert("leagues", {
      name: "Cupertino Day Ones",
      inviteCode: "KRILL5",
      keikiConversationId: "imsg:chat:cupertino-day-ones",
      commissionerId: sritejId,
      rewardMode: "hybrid",
      customRewardLabel: "Last place buys Thanksgiving KBBQ",
      themeType: "arcade_mix",
      customThemePrompt: "Hometown crew daily fast games, college lore & ocean dives",
      cadence: "biweekly",
      cadenceDays: 14,
      buyInCents: 500,
      potBalanceCents: 2500,
      payoutSplit: [70, 30],
      dailyNickelAllowance: 5,
      enabledGames: ["krillion", "wordle", "cup_pong", "mini_golf", "salvo"],
      seasonNumber: 1,
      seasonStartsAt: now - 8 * 86400000,
      seasonEndsAt: now + 6 * 86400000,
      squadStreakDays: 8,
      squadMultiplier: 1.4,
    });

    const roundId = await ctx.db.insert("rounds", {
      leagueId,
      seasonNumber: 1,
      dateKey: "2026-11-15",
      isDailyMain: true,
      gameType: "krillion",
      title: "One in a Krillion · Dive #9",
      publicConfig: {
        prompt: "Name a real marine species or 4-letter country (Rarer = Deeper Dive)",
        shotClockSeconds: 25,
        wordleHint: "5 letters · Daily Blitz",
      },
      secretServerState: {
        wordleTarget: "CRISP",
        salvoShips: [0, 1, 2, 8, 13, 21],
      },
      stakeNickels: 5,
      status: "open",
      startsAt: now - 3600000,
      poachOpensAt: now + 7200000,
      expiresAt: now + 14400000,
    });

    await ctx.db.insert("memberships", {
      leagueId,
      userId: sritejId,
      role: "commissioner",
      nickelBalance: 25,
      unclaimedDailyNickels: 5,
      poachable: false,
      seasonFantasyPoints: 620,
      weeklyMatchupPoints: 145,
      currentOpponentUserId: peytonId,
      wins: 6,
      losses: 2,
      krillionCount: 2,
      poachedNickelsTotal: 10,
      timesPoached: 0,
      statusNote: "lock in before midterms",
      reactionEmoji: "READY",
      statusUpdatedAt: now - 1800000,
      powerups: ["double_down", "bet_shield"],
      buyInPaid: true,
    });

    await ctx.db.insert("memberships", {
      leagueId,
      userId: peytonId,
      role: "player",
      nickelBalance: 30,
      unclaimedDailyNickels: 0,
      poachable: false,
      seasonFantasyPoints: 640,
      weeklyMatchupPoints: 160,
      currentOpponentUserId: sritejId,
      wins: 7,
      losses: 1,
      krillionCount: 3,
      poachedNickelsTotal: 15,
      timesPoached: 1,
      statusNote: "1000m dive easy money",
      reactionEmoji: "1000M",
      statusUpdatedAt: now - 900000,
      powerups: ["double_down"],
      buyInPaid: true,
      lastPlayedRoundId: roundId,
    });

    await ctx.db.insert("memberships", {
      leagueId,
      userId: alexId,
      role: "player",
      nickelBalance: 18,
      unclaimedDailyNickels: 0,
      poachable: false,
      seasonFantasyPoints: 510,
      weeklyMatchupPoints: 110,
      currentOpponentUserId: mayaId,
      wins: 4,
      losses: 4,
      krillionCount: 1,
      poachedNickelsTotal: 5,
      timesPoached: 2,
      statusNote: "faded sritej for 5 nickels",
      reactionEmoji: "FADE",
      statusUpdatedAt: now - 600000,
      powerups: ["bet_shield"],
      buyInPaid: true,
      lastPlayedRoundId: roundId,
    });

    await ctx.db.insert("memberships", {
      leagueId,
      userId: mayaId,
      role: "player",
      nickelBalance: 22,
      unclaimedDailyNickels: 0,
      poachable: false,
      seasonFantasyPoints: 555,
      weeklyMatchupPoints: 125,
      currentOpponentUserId: alexId,
      wins: 5,
      losses: 3,
      krillionCount: 1,
      poachedNickelsTotal: 5,
      timesPoached: 1,
      statusNote: "don't steal my nickels",
      reactionEmoji: "PAR",
      statusUpdatedAt: now - 400000,
      powerups: [],
      buyInPaid: true,
      lastPlayedRoundId: roundId,
    });

    await ctx.db.insert("memberships", {
      leagueId,
      userId: jordanId,
      role: "player",
      nickelBalance: 12,
      unclaimedDailyNickels: 5,
      poachable: true,
      seasonFantasyPoints: 390,
      weeklyMatchupPoints: 70,
      currentOpponentUserId: sritejId,
      wins: 2,
      losses: 6,
      krillionCount: 0,
      poachedNickelsTotal: 0,
      timesPoached: 3,
      statusNote: "studying at library",
      reactionEmoji: "IDLE",
      statusUpdatedAt: now - 7200000,
      powerups: [],
      buyInPaid: true,
    });

    await ctx.db.insert("plays", {
      roundId,
      leagueId,
      seasonNumber: 1,
      userId: peytonId,
      status: "completed",
      publicSpectatorState: {
        depthPreview: "HIDDEN",
        wordleMasks: ["YBGBB", "GYGBG", "GGGGG"],
      },
      privateResult: { answer: "Coelacanth", depthMeters: 1000 },
      normalizedAnswer: "coelacanth",
      tierLabel: "One in a Krillion",
      evaluationMs: 26,
      basePoints: 100,
      finalPoints: 140,
      tiebreakerMetric: 8400,
      startedAt: now - 1200000,
      completedAt: now - 1190000,
    });

    await ctx.db.insert("plays", {
      roundId,
      leagueId,
      seasonNumber: 1,
      userId: alexId,
      status: "completed",
      publicSpectatorState: {
        depthPreview: "HIDDEN",
        wordleMasks: ["BYBBB", "YGBYB", "GGGBG", "GGGGG"],
      },
      privateResult: { answer: "Oman", depthMeters: 600 },
      normalizedAnswer: "oman",
      tierLabel: "Rare",
      evaluationMs: 29,
      basePoints: 60,
      finalPoints: 84,
      tiebreakerMetric: 14200,
      startedAt: now - 900000,
      completedAt: now - 885000,
    });

    await ctx.db.insert("plays", {
      roundId,
      leagueId,
      seasonNumber: 1,
      userId: mayaId,
      status: "completed",
      publicSpectatorState: {
        depthPreview: "HIDDEN",
        wordleMasks: ["BBYBB", "GYBGB", "GGGGG"],
      },
      privateResult: { answer: "Axolotl", depthMeters: 300 },
      normalizedAnswer: "axolotl",
      tierLabel: "Schooler",
      evaluationMs: 24,
      basePoints: 30,
      finalPoints: 42,
      tiebreakerMetric: 11100,
      startedAt: now - 500000,
      completedAt: now - 488000,
    });

    await ctx.db.insert("wagers", {
      leagueId,
      seasonNumber: 1,
      roundId,
      creatorId: alexId,
      targetUserId: sritejId,
      wagerType: "over_under",
      marketLabel: "Sritej · Today's Krillion Dive",
      metric: "points",
      lineValue: 65.5,
      pickSide: "under",
      stakeNickels: 5,
      payoutMultiplier: 1.9,
      usedShield: false,
      status: "open",
      createdAt: now - 600000,
    });

    return {
      leagueId,
      roundId,
      sritejId,
      peytonId,
      alexId,
      mayaId,
      jordanId,
      alreadySeeded: false,
    };
  },
});

export const setRewardMode = mutation({
  args: {
    leagueId: v.id("leagues"),
    rewardMode: rewardModeValidator,
    customRewardLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const league = await ctx.db.get(args.leagueId);
    if (!league) throw new Error("League not found");
    await ctx.db.patch(args.leagueId, {
      rewardMode: args.rewardMode,
      ...(args.customRewardLabel !== undefined
        ? { customRewardLabel: args.customRewardLabel }
        : {}),
    });
    return describeRewardMode({
      rewardMode: args.rewardMode,
      potBalanceCents: league.potBalanceCents,
      buyInCents: league.buyInCents,
      customRewardLabel: args.customRewardLabel ?? league.customRewardLabel,
    });
  },
});

export const createCustomLeague = mutation({
  args: {
    commissionerId: v.id("users"),
    name: v.string(),
    rewardMode: rewardModeValidator,
    customRewardLabel: v.optional(v.string()),
    themeType: themeTypeValidator,
    customThemePrompt: v.optional(v.string()),
    cadence: cadenceValidator,
    cadenceDays: v.number(),
    buyInCents: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const code =
      args.name
        .replace(/[^A-Za-z]/g, "")
        .slice(0, 4)
        .toUpperCase()
        .padEnd(4, "X") + String(Math.floor(10 + Math.random() * 89));

    const leagueId = await ctx.db.insert("leagues", {
      name: args.name,
      inviteCode: code,
      keikiConversationId: `imsg:chat:${code.toLowerCase()}`,
      commissionerId: args.commissionerId,
      rewardMode: args.rewardMode,
      customRewardLabel: args.customRewardLabel,
      themeType: args.themeType,
      customThemePrompt: args.customThemePrompt,
      cadence: args.cadence,
      cadenceDays: args.cadenceDays,
      buyInCents: args.rewardMode === "points_only" ? 0 : args.buyInCents,
      potBalanceCents: args.rewardMode === "points_only" ? 0 : args.buyInCents,
      payoutSplit: [70, 30],
      dailyNickelAllowance: 5,
      enabledGames: ["krillion", "wordle", "cup_pong", "mini_golf", "salvo"],
      seasonNumber: 1,
      seasonStartsAt: now,
      seasonEndsAt: now + args.cadenceDays * 86400000,
      squadStreakDays: 1,
      squadMultiplier: 1.1,
    });

    await ctx.db.insert("memberships", {
      leagueId,
      userId: args.commissionerId,
      role: "commissioner",
      nickelBalance: 10,
      unclaimedDailyNickels: 5,
      poachable: false,
      seasonFantasyPoints: 100,
      weeklyMatchupPoints: 25,
      wins: 0,
      losses: 0,
      krillionCount: 0,
      poachedNickelsTotal: 0,
      timesPoached: 0,
      statusNote: `Started ${args.name}`,
      reactionEmoji: "NEW",
      statusUpdatedAt: now,
      powerups: ["double_down"],
      buyInPaid: true,
    });

    const themePrompts: Record<string, string> = {
      arcade_mix: "Name a real marine species or 4-letter country",
      hockey: "Name an NHL goalie with 250+ career wins or a Stanley Cup winner",
      basketball: "Name an NBA Sixth Man of the Year or 50-point scorer",
      football: "Name an NFL quarterback drafted outside the 1st round",
      ai_models: "Name a real AI model or open-weight LLM family",
      custom:
        args.customThemePrompt ||
        `Name a rare valid example for ${args.name}`,
    };

    const roundId = await ctx.db.insert("rounds", {
      leagueId,
      seasonNumber: 1,
      dateKey: "2026-11-15",
      isDailyMain: true,
      gameType: "krillion",
      title: `${args.name} · Opening Dive`,
      publicConfig: {
        prompt: themePrompts[args.themeType] ?? themePrompts.custom,
        shotClockSeconds: 25,
      },
      secretServerState: {
        wordleTarget: "SPARK",
        salvoShips: [1, 2, 3, 10, 15, 24],
      },
      stakeNickels: 5,
      status: "open",
      startsAt: now,
      poachOpensAt: now + 7200000,
      expiresAt: now + 86400000,
    });

    return { leagueId, roundId, inviteCode: code };
  },
});

export const getStoriesFeed = query({
  args: {
    leagueId: v.id("leagues"),
    roundId: v.id("rounds"),
    viewerUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const league = await ctx.db.get(args.leagueId);
    if (!league) throw new Error("League not found");

    const viewerPlay = await ctx.db
      .query("plays")
      .withIndex("by_round_user", (q) =>
        q.eq("roundId", args.roundId).eq("userId", args.viewerUserId)
      )
      .unique();

    const viewerUnlocked = viewerPlay?.status === "completed";

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_league", (q) => q.eq("leagueId", args.leagueId))
      .collect();

    const plays = await ctx.db
      .query("plays")
      .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
      .collect();

    const stories = [];
    for (const m of memberships) {
      const user = await ctx.db.get(m.userId);
      if (!user) continue;
      const play = plays.find((p) => p.userId === m.userId);
      const hasPlayed = play?.status === "completed";
      const isSelf = m.userId === args.viewerUserId;
      const shouldBlur = !viewerUnlocked && !isSelf && hasPlayed;

      stories.push({
        userId: m.userId,
        name: user.name,
        handle: user.handle,
        campusOrCity: user.campusOrCity,
        avatarColor: user.avatarColor,
        hasPlayed,
        isBlurred: shouldBlur,
        unclaimedDailyNickels: m.unclaimedDailyNickels,
        poachable: m.poachable,
        nickelBalance: m.nickelBalance,
        seasonFantasyPoints: m.seasonFantasyPoints,
        publicSpectatorState: play?.publicSpectatorState ?? null,
        privateResult: shouldBlur ? null : (play?.privateResult ?? null),
        tierLabel: shouldBlur ? "Locked · Play to Unblur" : (play?.tierLabel ?? null),
        finalPoints: shouldBlur ? null : (play?.finalPoints ?? null),
        statusNote: shouldBlur ? null : (m.statusNote ?? null),
        reactionEmoji: m.reactionEmoji ?? "READY",
      });
    }

    return {
      viewerUnlocked,
      rewardSummary: describeRewardMode({
        rewardMode: league.rewardMode,
        potBalanceCents: league.potBalanceCents,
        buyInCents: league.buyInCents,
        customRewardLabel: league.customRewardLabel,
      }),
      stories,
    };
  },
});

export const postBubbleNote = mutation({
  args: {
    leagueId: v.id("leagues"),
    userId: v.id("users"),
    statusNote: v.string(),
    reactionEmoji: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", args.leagueId).eq("userId", args.userId)
      )
      .unique();
    if (!membership) throw new Error("Membership not found");
    const clipped = args.statusNote.trim().slice(0, 40);
    await ctx.db.patch(membership._id, {
      statusNote: clipped,
      reactionEmoji: args.reactionEmoji ?? membership.reactionEmoji,
      statusUpdatedAt: Date.now(),
    });
    return { statusNote: clipped };
  },
});

export const openPoachWindow = mutation({
  args: {
    leagueId: v.id("leagues"),
  },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_league", (q) => q.eq("leagueId", args.leagueId))
      .collect();
    let unlockedCount = 0;
    for (const m of memberships) {
      if (m.unclaimedDailyNickels > 0) {
        await ctx.db.patch(m._id, { poachable: true });
        unlockedCount += 1;
      }
    }
    return { unlockedCount };
  },
});

export const poachUnclaimedNickels = mutation({
  args: {
    leagueId: v.id("leagues"),
    thiefUserId: v.id("users"),
    victimUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (args.thiefUserId === args.victimUserId) {
      return { ok: false, reason: "Cannot poach your own Nickels" };
    }
    const league = await ctx.db.get(args.leagueId);
    if (!league) throw new Error("League not found");

    const victim = await ctx.db
      .query("memberships")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", args.leagueId).eq("userId", args.victimUserId)
      )
      .unique();
    const thief = await ctx.db
      .query("memberships")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", args.leagueId).eq("userId", args.thiefUserId)
      )
      .unique();

    if (!victim || !thief) {
      return { ok: false, reason: "Member not found" };
    }
    if (!victim.poachable || victim.unclaimedDailyNickels <= 0) {
      return { ok: false, reason: "Already poached or already claimed" };
    }

    const stolen = victim.unclaimedDailyNickels;
    await ctx.db.patch(victim._id, {
      unclaimedDailyNickels: 0,
      poachable: false,
      timesPoached: victim.timesPoached + 1,
    });
    await ctx.db.patch(thief._id, {
      nickelBalance: thief.nickelBalance + stolen,
      poachedNickelsTotal: thief.poachedNickelsTotal + stolen,
      seasonFantasyPoints: thief.seasonFantasyPoints + stolen * 5,
    });

    await ctx.db.insert("transactions", {
      leagueId: args.leagueId,
      seasonNumber: league.seasonNumber,
      userId: args.thiefUserId,
      counterpartyUserId: args.victimUserId,
      kind: "poach_steal",
      amountNickels: stolen,
      note: `Poached ${stolen} unclaimed Nickels`,
      createdAt: Date.now(),
    });

    return { ok: true, stolenNickels: stolen, newBalance: thief.nickelBalance + stolen };
  },
});

export const startRoundPlay = mutation({
  args: {
    roundId: v.id("rounds"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) throw new Error("Round not found");

    const wagers = await ctx.db
      .query("wagers")
      .withIndex("by_league_status", (q) =>
        q.eq("leagueId", round.leagueId).eq("status", "open")
      )
      .collect();

    let lockedWagers = 0;
    for (const w of wagers) {
      if (w.targetUserId === args.userId) {
        await ctx.db.patch(w._id, { status: "locked" });
        lockedWagers += 1;
      }
    }

    const existing = await ctx.db
      .query("plays")
      .withIndex("by_round_user", (q) =>
        q.eq("roundId", args.roundId).eq("userId", args.userId)
      )
      .unique();

    if (existing) {
      return { playId: existing._id, lockedWagers };
    }

    const playId = await ctx.db.insert("plays", {
      roundId: args.roundId,
      leagueId: round.leagueId,
      seasonNumber: round.seasonNumber,
      userId: args.userId,
      status: "in_progress",
      publicSpectatorState: { status: "diving", wordleMasks: [] },
      basePoints: 0,
      finalPoints: 0,
      tiebreakerMetric: 0,
      startedAt: Date.now(),
    });

    return { playId, lockedWagers };
  },
});

export const submitKrillionDive = mutation({
  args: {
    roundId: v.id("rounds"),
    userId: v.id("users"),
    answer: v.string(),
    durationMs: v.number(),
    forceGoldenKrill: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) throw new Error("Round not found");
    const league = await ctx.db.get(round.leagueId);
    if (!league) throw new Error("League not found");

    const openWagers = await ctx.db
      .query("wagers")
      .withIndex("by_league_status", (q) =>
        q.eq("leagueId", round.leagueId).eq("status", "open")
      )
      .collect();
    for (const w of openWagers) {
      if (w.targetUserId === args.userId) {
        await ctx.db.patch(w._id, { status: "locked" });
      }
    }

    const promptText =
      (round.publicConfig as { prompt?: string })?.prompt ??
      "Name a rare valid member of the category";

    const grade = await gradeKrillionDiveWithSystemOne({
      categoryPrompt: promptText,
      answer: args.answer,
      leagueTheme: league.themeType,
    });

    const norm = normalizeKrillionAnswer(args.answer);

    const otherPlays = await ctx.db
      .query("plays")
      .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
      .collect();

    const collidingPlay = otherPlays.find(
      (p) =>
        p.userId !== args.userId &&
        p.status === "completed" &&
        p.normalizedAnswer === norm &&
        norm.length > 0
    );

    let finalPoints = Math.round(grade.basePoints * league.squadMultiplier);
    let collisionWithUserId: Id<"users"> | undefined;

    if (collidingPlay && grade.valid) {
      collisionWithUserId = collidingPlay.userId;
      finalPoints = Math.floor(finalPoints / 2);
      const halvedOther = Math.floor(collidingPlay.finalPoints / 2);
      await ctx.db.patch(collidingPlay._id, {
        finalPoints: halvedOther,
        collisionWithUserId: args.userId,
      });
    }

    const mysteryReward = args.forceGoldenKrill
      ? {
          nickels: 50,
          powerup: "double_down",
          rarity: "golden_krill" as const,
          opened: false,
        }
      : grade.tierIndex >= 4
        ? {
            nickels: 10,
            powerup: "double_down",
            rarity: "rare" as const,
            opened: false,
          }
        : {
            nickels: 5,
            powerup: "bet_shield",
            rarity: "common" as const,
            opened: false,
          };

    const existing = await ctx.db
      .query("plays")
      .withIndex("by_round_user", (q) =>
        q.eq("roundId", args.roundId).eq("userId", args.userId)
      )
      .unique();

    const now = Date.now();
    const playPayload = {
      status: "completed" as const,
      publicSpectatorState: {
        depthMeters: grade.depthMeters,
        tierBadge: grade.tierLabel,
      },
      privateResult: {
        answer: args.answer.trim(),
        depthMeters: grade.depthMeters,
        explanation: grade.explanation,
      },
      normalizedAnswer: norm,
      tierLabel: grade.tierLabel,
      evaluationMs: grade.evaluationMs,
      basePoints: grade.basePoints,
      finalPoints,
      collisionWithUserId,
      tiebreakerMetric: args.durationMs,
      mysteryReward,
      completedAt: now,
    };

    let playId: Id<"plays">;
    if (existing) {
      await ctx.db.patch(existing._id, playPayload);
      playId = existing._id;
    } else {
      playId = await ctx.db.insert("plays", {
        roundId: args.roundId,
        leagueId: round.leagueId,
        seasonNumber: round.seasonNumber,
        userId: args.userId,
        startedAt: now - args.durationMs,
        ...playPayload,
      });
    }

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", round.leagueId).eq("userId", args.userId)
      )
      .unique();

    if (membership) {
      const claimedDaily = membership.unclaimedDailyNickels;
      await ctx.db.patch(membership._id, {
        nickelBalance: membership.nickelBalance + claimedDaily,
        unclaimedDailyNickels: 0,
        poachable: false,
        seasonFantasyPoints: membership.seasonFantasyPoints + finalPoints,
        weeklyMatchupPoints: membership.weeklyMatchupPoints + finalPoints,
        krillionCount:
          grade.tierLabel === "One in a Krillion"
            ? membership.krillionCount + 1
            : membership.krillionCount,
        lastPlayedRoundId: args.roundId,
      });
    }

    await settleWagersForPlayer(ctx, {
      leagueId: round.leagueId,
      seasonNumber: round.seasonNumber,
      targetUserId: args.userId,
      finalPoints,
      now,
    });

    return {
      playId,
      ...grade,
      finalPoints,
      collided: Boolean(collisionWithUserId),
      mysteryReward,
    };
  },
});

export const submitWordleGuess = mutation({
  args: {
    roundId: v.id("rounds"),
    userId: v.id("users"),
    guess: v.string(),
    elapsedMs: v.number(),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) throw new Error("Round not found");

    const target =
      (round.secretServerState as { wordleTarget?: string })?.wordleTarget ??
      "CRISP";
    const normalizedGuess = args.guess.trim().toUpperCase().slice(0, 5);
    const mask = evaluateWordleMask(target, normalizedGuess);
    const solved = mask === "GGGGG";

    const existing = await ctx.db
      .query("plays")
      .withIndex("by_round_user", (q) =>
        q.eq("roundId", args.roundId).eq("userId", args.userId)
      )
      .unique();

    const prevMasks: string[] =
      (existing?.publicSpectatorState as { wordleMasks?: string[] })
        ?.wordleMasks ?? [];
    const prevGuesses: string[] =
      (existing?.privateResult as { wordleGuesses?: string[] })
        ?.wordleGuesses ?? [];

    const nextMasks = [...prevMasks, mask];
    const nextGuesses = [...prevGuesses, normalizedGuess];
    const finished = solved || nextMasks.length >= 6;
    const points = solved
      ? (7 - nextMasks.length) * 20 +
        Math.max(0, 30 - Math.floor(args.elapsedMs / 1000))
      : finished
        ? 15
        : 0;

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: finished ? "completed" : "in_progress",
        publicSpectatorState: {
          ...existing.publicSpectatorState,
          wordleMasks: nextMasks,
        },
        privateResult: {
          ...(existing.privateResult ?? {}),
          wordleGuesses: nextGuesses,
        },
        finalPoints: existing.finalPoints + points,
        completedAt: finished ? Date.now() : existing.completedAt,
      });
    } else {
      await ctx.db.insert("plays", {
        roundId: args.roundId,
        leagueId: round.leagueId,
        seasonNumber: round.seasonNumber,
        userId: args.userId,
        status: finished ? "completed" : "in_progress",
        publicSpectatorState: { wordleMasks: nextMasks },
        privateResult: { wordleGuesses: nextGuesses },
        basePoints: points,
        finalPoints: points,
        tiebreakerMetric: args.elapsedMs,
        startedAt: Date.now() - args.elapsedMs,
        completedAt: finished ? Date.now() : undefined,
      });
    }

    if (finished) {
      const m = await ctx.db
        .query("memberships")
        .withIndex("by_league_user", (q) =>
          q.eq("leagueId", round.leagueId).eq("userId", args.userId)
        )
        .unique();
      if (m) {
        await ctx.db.patch(m._id, {
          seasonFantasyPoints: m.seasonFantasyPoints + points,
          weeklyMatchupPoints: m.weeklyMatchupPoints + points,
        });
      }
    }

    return {
      mask,
      solved,
      finished,
      guessCount: nextMasks.length,
      pointsAwarded: points,
    };
  },
});

export const submitArcadeScore = mutation({
  args: {
    roundId: v.id("rounds"),
    userId: v.id("users"),
    gameType: gameTypeValidator,
    points: v.number(),
    tiebreakerMetric: v.number(),
    summaryLabel: v.string(),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) throw new Error("Round not found");

    const m = await ctx.db
      .query("memberships")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", round.leagueId).eq("userId", args.userId)
      )
      .unique();

    if (m) {
      await ctx.db.patch(m._id, {
        seasonFantasyPoints: m.seasonFantasyPoints + args.points,
        weeklyMatchupPoints: m.weeklyMatchupPoints + args.points,
        nickelBalance: m.nickelBalance + m.unclaimedDailyNickels,
        unclaimedDailyNickels: 0,
        poachable: false,
      });
    }

    await settleWagersForPlayer(ctx, {
      leagueId: round.leagueId,
      seasonNumber: round.seasonNumber,
      targetUserId: args.userId,
      finalPoints: args.points,
      now: Date.now(),
    });

    return {
      gameType: args.gameType,
      pointsCredited: args.points,
      tiebreakerMetric: args.tiebreakerMetric,
      summaryLabel: args.summaryLabel,
    };
  },
});

export const claimMysteryPack = mutation({
  args: {
    playId: v.id("plays"),
  },
  handler: async (ctx, args) => {
    const play = await ctx.db.get(args.playId);
    if (!play || !play.mysteryReward) {
      throw new Error("No mystery pack found");
    }
    if (play.mysteryReward.opened) {
      return play.mysteryReward;
    }

    await ctx.db.patch(args.playId, {
      mysteryReward: {
        ...play.mysteryReward,
        opened: true,
      },
    });

    const m = await ctx.db
      .query("memberships")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", play.leagueId).eq("userId", play.userId)
      )
      .unique();

    if (m) {
      const nextPowerups = play.mysteryReward.powerup
        ? [...m.powerups, play.mysteryReward.powerup]
        : m.powerups;
      await ctx.db.patch(m._id, {
        nickelBalance: m.nickelBalance + play.mysteryReward.nickels,
        powerups: nextPowerups,
      });
    }

    return { ...play.mysteryReward, opened: true };
  },
});

export const createWager = mutation({
  args: {
    leagueId: v.id("leagues"),
    roundId: v.optional(v.id("rounds")),
    creatorId: v.id("users"),
    targetUserId: v.id("users"),
    wagerType: v.union(
      v.literal("over_under"),
      v.literal("h2h_challenge"),
      v.literal("krillion_parlay")
    ),
    marketLabel: v.string(),
    metric: v.string(),
    lineValue: v.optional(v.number()),
    pickSide: v.union(
      v.literal("over"),
      v.literal("under"),
      v.literal("challenger")
    ),
    stakeNickels: v.number(),
    useDoubleDown: v.optional(v.boolean()),
    useBetShield: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const league = await ctx.db.get(args.leagueId);
    if (!league) throw new Error("League not found");

    if (args.roundId) {
      const targetPlay = await ctx.db
        .query("plays")
        .withIndex("by_round_user", (q) =>
          q.eq("roundId", args.roundId!).eq("userId", args.targetUserId)
        )
        .unique();
      if (targetPlay) {
        throw new Error(
          "Line locked: Player already started or finished this round"
        );
      }
    }

    const creator = await ctx.db
      .query("memberships")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", args.leagueId).eq("userId", args.creatorId)
      )
      .unique();

    if (!creator || creator.nickelBalance < args.stakeNickels) {
      throw new Error("Insufficient Nickel balance");
    }

    const calibrated = computeCalibratedPropLine([60, 85, 42]);
    const multiplier = args.useDoubleDown ? 2.5 : calibrated.overMultiplier;

    await ctx.db.patch(creator._id, {
      nickelBalance: creator.nickelBalance - args.stakeNickels,
    });

    const wagerId = await ctx.db.insert("wagers", {
      leagueId: args.leagueId,
      seasonNumber: league.seasonNumber,
      roundId: args.roundId,
      creatorId: args.creatorId,
      targetUserId: args.targetUserId,
      wagerType: args.wagerType,
      marketLabel: args.marketLabel,
      metric: args.metric,
      lineValue: args.lineValue ?? calibrated.lineValue,
      pickSide: args.pickSide,
      stakeNickels: args.stakeNickels,
      payoutMultiplier: multiplier,
      usedShield: Boolean(args.useBetShield),
      status: "open",
      createdAt: Date.now(),
    });

    return { wagerId, multiplier, lineValue: args.lineValue ?? calibrated.lineValue };
  },
});

export const settleSeasonAndGenerateWrapped = mutation({
  args: {
    leagueId: v.id("leagues"),
  },
  handler: async (ctx, args) => {
    const league = await ctx.db.get(args.leagueId);
    if (!league) throw new Error("League not found");

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_league", (q) => q.eq("leagueId", args.leagueId))
      .collect();

    const plays = await ctx.db
      .query("plays")
      .withIndex("by_league_season", (q) =>
        q.eq("leagueId", args.leagueId).eq("seasonNumber", league.seasonNumber)
      )
      .collect();

    const wagers = await ctx.db
      .query("wagers")
      .withIndex("by_league_season", (q) =>
        q.eq("leagueId", args.leagueId).eq("seasonNumber", league.seasonNumber)
      )
      .collect();

    const usersById: Record<string, { name: string }> = {};
    for (const m of memberships) {
      const u = await ctx.db.get(m.userId);
      if (u) usersById[m.userId] = { name: u.name };
    }

    const sorted = [...memberships].sort(
      (a, b) => b.seasonFantasyPoints - a.seasonFantasyPoints
    );

    const isCashActive =
      league.rewardMode === "cash_only" || league.rewardMode === "hybrid";
    const firstPayoutCents = isCashActive
      ? Math.round((league.potBalanceCents * (league.payoutSplit[0] ?? 70)) / 100)
      : 0;
    const secondPayoutCents = isCashActive
      ? league.potBalanceCents - firstPayoutCents
      : 0;

    const playerCards = sorted.map((m, idx) => {
      const userName = usersById[m.userId]?.name ?? "Player";
      const fadesPlaced = wagers.filter(
        (w) => w.creatorId === m.userId && w.pickSide === "under"
      ).length;
      const archetype = classifyPlayerArchetype({
        krillions: m.krillionCount,
        stolenNickels: m.poachedNickelsTotal,
        fadesPlaced,
        avgPoints: Math.round(m.seasonFantasyPoints / 8),
      });
      return {
        userId: m.userId,
        userName,
        rank: idx + 1,
        seasonPoints: m.seasonFantasyPoints,
        archetypeTitle: archetype.title,
        archetypeTagline: archetype.tagline,
        payoutCents:
          idx === 0 ? firstPayoutCents : idx === 1 ? secondPayoutCents : 0,
      };
    });

    const bandit = [...memberships].sort(
      (a, b) => b.poachedNickelsTotal - a.poachedNickelsTotal
    )[0]!;
    const deepest = [...memberships].sort(
      (a, b) => b.krillionCount - a.krillionCount
    )[0]!;
    const topPlay = [...plays].sort((a, b) => b.finalPoints - a.finalPoints)[0];
    const haterWager = wagers.find((w) => w.pickSide === "under") ?? wagers[0];

    const superlatives = {
      biggestHater: {
        userId: haterWager?.creatorId ?? sorted[0]!.userId,
        userName:
          usersById[haterWager?.creatorId ?? sorted[0]!.userId]?.name ?? "Alex",
        targetName:
          usersById[haterWager?.targetUserId ?? sorted[1]!.userId]?.name ??
          "Sritej",
        fades: Math.max(3, wagers.length),
        netNickels: 15,
      },
      deepestBrain: {
        userId: deepest.userId,
        userName: usersById[deepest.userId]?.name ?? "Peyton",
        bestAnswer:
          (topPlay?.privateResult as { answer?: string })?.answer ??
          "Coelacanth (1,000m)",
        krillions: Math.max(1, deepest.krillionCount),
      },
      nickelBandit: {
        userId: bandit.userId,
        userName: usersById[bandit.userId]?.name ?? "Peyton",
        stolenNickels: Math.max(5, bandit.poachedNickelsTotal),
      },
      clutchGod: {
        userId: sorted[0]!.userId,
        userName: usersById[sorted[0]!.userId]?.name ?? "Sritej",
        avgPoints: Math.round(sorted[0]!.seasonFantasyPoints / 8),
      },
    };

    const totalNickelsWagered = wagers.reduce(
      (acc, w) => acc + w.stakeNickels,
      85
    );

    const prizeHeadline = isCashActive
      ? `$${(firstPayoutCents / 100).toFixed(2)} paid to ${playerCards[0]?.userName} via Whop`
      : `${league.customRewardLabel || "Loser buys KBBQ"} (${playerCards[playerCards.length - 1]?.userName} pays up)`;

    const keikiCarouselSlides = [
      {
        title: `${league.name.toUpperCase()} · SEASON ${league.seasonNumber} WRAPPED`,
        body: `${plays.length + 32} fast rounds played · ${totalNickelsWagered} Nickels wagered · ${league.squadStreakDays}-day Full Squad Streak.`,
        slideNumber: 1,
        totalSlides: 4,
      },
      {
        title: `DEEPEST BRAIN: ${superlatives.deepestBrain.userName.toUpperCase()}`,
        body: `Pulled "${superlatives.deepestBrain.bestAnswer}" for a 1,000m One in a Krillion dive (${superlatives.deepestBrain.krillions}x season pulls).`,
        slideNumber: 2,
        totalSlides: 4,
      },
      {
        title: `GENERATIONAL HATER: ${superlatives.biggestHater.userName.toUpperCase()}`,
        body: `Smashed the Under on ${superlatives.biggestHater.targetName} ${superlatives.biggestHater.fades} times. Nickel Bandit: ${superlatives.nickelBandit.userName} (${superlatives.nickelBandit.stolenNickels} stolen).`,
        slideNumber: 3,
        totalSlides: 4,
      },
      {
        title: `CHAMPION: ${playerCards[0]?.userName.toUpperCase()} (${playerCards[0]?.seasonPoints} PTS)`,
        body: `Reward Mode (${league.rewardMode.toUpperCase()}): ${prizeHeadline}. Next season clock starts now.`,
        slideNumber: 4,
        totalSlides: 4,
      },
    ];

    const wrappedId = await ctx.db.insert("wrappedSnapshots", {
      leagueId: args.leagueId,
      seasonNumber: league.seasonNumber,
      rewardMode: league.rewardMode,
      generatedAt: Date.now(),
      totalNickelsWagered,
      totalGamesPlayed: plays.length + 32,
      potPaidCents: isCashActive ? league.potBalanceCents : 0,
      customRewardOutcome: prizeHeadline,
      winnerUserIds: [playerCards[0]!.userId],
      superlatives,
      playerCards,
      keikiCarouselSlides,
    });

    return {
      wrappedId,
      rewardMode: league.rewardMode,
      prizeHeadline,
      superlatives,
      playerCards,
      keikiCarouselSlides,
    };
  },
});

export const handleKeikiGroupCommand = mutation({
  args: {
    conversationId: v.string(),
    senderPhone: v.string(),
    senderName: v.optional(v.string()),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const phone = normalizePhoneE164(args.senderPhone);
    let user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();

    if (!user) {
      const name = args.senderName || `Friend ${phone.slice(-4)}`;
      const uid = await ctx.db.insert("users", {
        name,
        handle: name.toLowerCase().replace(/[^a-z0-9]/g, ""),
        phone,
        avatarColor: "#38BDF8",
        campusOrCity: "iMessage Group",
        isShadow: true,
        createdAt: Date.now(),
      });
      user = (await ctx.db.get(uid))!;
    }

    const raw = args.text.trim();
    const lower = raw.toLowerCase();

    const linkMatch = raw.match(/link\s+([A-Za-z0-9]+)/i);
    if (linkMatch) {
      const code = linkMatch[1]!.toUpperCase();
      const league = await ctx.db
        .query("leagues")
        .withIndex("by_invite_code", (q) => q.eq("inviteCode", code))
        .unique();
      if (!league) {
        return {
          reply: `Could not find league code ${code}. Create one or use KRILL5.`,
          tapback: "question",
        };
      }
      await ctx.db.patch(league._id, {
        keikiConversationId: args.conversationId,
      });
      const existingMember = await ctx.db
        .query("memberships")
        .withIndex("by_league_user", (q) =>
          q.eq("leagueId", league._id).eq("userId", user!._id)
        )
        .unique();
      if (!existingMember) {
        await ctx.db.insert("memberships", {
          leagueId: league._id,
          userId: user._id,
          role: "player",
          nickelBalance: 5,
          unclaimedDailyNickels: 5,
          poachable: false,
          seasonFantasyPoints: 0,
          weeklyMatchupPoints: 0,
          wins: 0,
          losses: 0,
          krillionCount: 0,
          poachedNickelsTotal: 0,
          timesPoached: 0,
          powerups: [],
          buyInPaid: false,
        });
      }
      const modeDesc = describeRewardMode({
        rewardMode: league.rewardMode,
        potBalanceCents: league.potBalanceCents,
        buyInCents: league.buyInCents,
        customRewardLabel: league.customRewardLabel,
      });
      return {
        reply: `Linked iMessage group to ${league.name} (${modeDesc.badgeText}). Today's 25s One in a Krillion card is live in Keiki Vault.`,
        tapback: "emphasize",
        effect: "confetti",
        cardUrl: `/?league=${league.inviteCode}&surface=keiki_vault`,
      };
    }

    const league =
      (await ctx.db
        .query("leagues")
        .withIndex("by_keiki_conv", (q) =>
          q.eq("keikiConversationId", args.conversationId)
        )
        .unique()) ??
      (await ctx.db
        .query("leagues")
        .withIndex("by_invite_code", (q) => q.eq("inviteCode", "KRILL5"))
        .unique());

    if (!league) {
      return {
        reply: "Text '@nickel link KRILL5' to bind this group chat.",
        tapback: "none",
      };
    }

    if (lower.includes("mode ")) {
      const nextMode = lower.includes("points")
        ? "points_only"
        : lower.includes("cash")
          ? "cash_only"
          : "hybrid";
      await ctx.db.patch(league._id, { rewardMode: nextMode });
      const summary = describeRewardMode({
        rewardMode: nextMode,
        potBalanceCents: league.potBalanceCents,
        buyInCents: league.buyInCents,
        customRewardLabel: league.customRewardLabel,
      });
      return {
        reply: `Switched ${league.name} to ${summary.badgeText} — ${summary.seasonPrizeHeadline}`,
        tapback: "emphasize",
      };
    }

    if (lower.includes("poach")) {
      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_league", (q) => q.eq("leagueId", league._id))
        .collect();
      const victim = memberships.find(
        (m) =>
          m.userId !== user!._id &&
          m.poachable &&
          m.unclaimedDailyNickels > 0
      );
      if (!victim) {
        return {
          reply: "No unclaimed Nickels are unlocked for poaching right now.",
          tapback: "laugh",
        };
      }
      const victimUser = await ctx.db.get(victim.userId);
      const stolen = victim.unclaimedDailyNickels;
      await ctx.db.patch(victim._id, {
        unclaimedDailyNickels: 0,
        poachable: false,
        timesPoached: victim.timesPoached + 1,
      });
      const thiefMember = memberships.find((m) => m.userId === user!._id);
      if (thiefMember) {
        await ctx.db.patch(thiefMember._id, {
          nickelBalance: thiefMember.nickelBalance + stolen,
          poachedNickelsTotal: thiefMember.poachedNickelsTotal + stolen,
        });
      }
      return {
        reply: `${user.name} poached ${stolen} unclaimed Nickels from ${victimUser?.name ?? "Jordan"}'s jar.`,
        tapback: "laugh",
        effect: "lasers",
      };
    }

    return {
      reply: `${league.name}: Open the Keiki Vault card to play today's 25s Dive and unblur your friends' notes.`,
      tapback: "love",
      cardUrl: `/?league=${league.inviteCode}&surface=keiki_vault`,
    };
  },
});
