import { describe, expect, it } from "vitest";
import { defineTestApp } from "convex-test";
import schema from "./schema.js";
import * as nickel from "./nickel.js";
import * as whop from "./whop.js";
import {
  buildVaultFaceIdApprovalCard,
  buildVaultPresentationCard,
  syncVaultLiveActivity,
} from "./vault.js";
import { createNickelKeikiAgent } from "../packages/keiki-agent/src/index.js";

const testApp = defineTestApp({ schema }).defineModules({
  nickel,
  whop,
});

describe("Nickel Convex Backend, Keiki Vault, Retention Psychology, System One & Modular Rewards", () => {
  it("1. Seeds demo league and enforces Server-Side Play-to-Unblur until viewer plays", async () => {
    const t = testApp.createTest();
    const seeded = await t.mutation(testApp.api.nickel.seedDemoLeagues, {});
    expect(seeded.alreadySeeded).toBe(false);

    // Before Sritej plays today's round, Peyton/Alex/Maya's answers & notes MUST be blurred/redacted
    const beforeFeed = await t.query(testApp.api.nickel.getStoriesFeed, {
      leagueId: seeded.leagueId,
      roundId: seeded.roundId!,
      viewerUserId: seeded.sritejId!,
    });

    expect(beforeFeed.viewerUnlocked).toBe(false);
    const peytonBefore = beforeFeed.stories.find((s) => s.name === "Peyton")!;
    expect(peytonBefore.hasPlayed).toBe(true);
    expect(peytonBefore.isBlurred).toBe(true);
    expect(peytonBefore.privateResult).toBeNull();
    expect(peytonBefore.statusNote).toBeNull();

    // Now Sritej plays his 25-second One in a Krillion Dive ("Narwhal") inside the Keiki Vault webview
    const dive = await t.mutation(testApp.api.nickel.submitKrillionDive, {
      roundId: seeded.roundId!,
      userId: seeded.sritejId!,
      answer: "Narwhal",
      durationMs: 9200,
    });

    expect(dive.valid).toBe(true);
    expect(dive.tierLabel).toBe("Deep Cut");
    expect(dive.depthMeters).toBe(850);
    expect(dive.finalPoints).toBeGreaterThan(80);

    // Immediately after Sritej completes his turn, the Stories Feed unblurs everyone!
    const afterFeed = await t.query(testApp.api.nickel.getStoriesFeed, {
      leagueId: seeded.leagueId,
      roundId: seeded.roundId!,
      viewerUserId: seeded.sritejId!,
    });

    expect(afterFeed.viewerUnlocked).toBe(true);
    const peytonAfter = afterFeed.stories.find((s) => s.name === "Peyton")!;
    expect(peytonAfter.isBlurred).toBe(false);
    expect((peytonAfter.privateResult as any).answer).toBe("Coelacanth");
    expect(peytonAfter.statusNote).toBe("1000m dive easy money");
  });

  it("2. Splits points 50/50 when two group members submit duplicate One in a Krillion answers", async () => {
    const t = testApp.createTest();
    const seeded = await t.mutation(testApp.api.nickel.seedDemoLeagues, {});

    // Alex already answered "Oman" (Rare = 60 base -> 84 w/ 1.4x squad multiplier).
    // If Sritej also submits "Oman", both collide and split points in half!
    const collisionDive = await t.mutation(
      testApp.api.nickel.submitKrillionDive,
      {
        roundId: seeded.roundId!,
        userId: seeded.sritejId!,
        answer: "Oman",
        durationMs: 7500,
      }
    );

    expect(collisionDive.collided).toBe(true);
    expect(collisionDive.finalPoints).toBe(42);
  });

  it("3. Enforces serializable OCC on Nickel Poaching so AFK Nickels can only be stolen once", async () => {
    const t = testApp.createTest();
    const seeded = await t.mutation(testApp.api.nickel.seedDemoLeagues, {});

    // Jordan starts poachable with 5 unclaimed Nickels
    const firstSteal = await t.mutation(
      testApp.api.nickel.poachUnclaimedNickels,
      {
        leagueId: seeded.leagueId,
        thiefUserId: seeded.sritejId!,
        victimUserId: seeded.jordanId!,
      }
    );
    expect(firstSteal.ok).toBe(true);
    expect(firstSteal.stolenNickels).toBe(5);

    // Second thief attempting to poach Jordan gets rejected cleanly
    const secondSteal = await t.mutation(
      testApp.api.nickel.poachUnclaimedNickels,
      {
        leagueId: seeded.leagueId,
        thiefUserId: seeded.peytonId!,
        victimUserId: seeded.jordanId!,
      }
    );
    expect(secondSteal.ok).toBe(false);
    expect(secondSteal.reason).toContain("Already poached");
  });

  it("4. Switches modularly between Points-Only, Cash-Only (Whop), and Hybrid modes", async () => {
    const t = testApp.createTest();
    const seeded = await t.mutation(testApp.api.nickel.seedDemoLeagues, {});

    const pointsOnly = await t.mutation(testApp.api.nickel.setRewardMode, {
      leagueId: seeded.leagueId,
      rewardMode: "points_only",
      customRewardLabel: "Last place wears Stanford jersey for a week",
    });
    expect(pointsOnly.mode).toBe("points_only");
    expect(pointsOnly.showWhopCheckout).toBe(false);
    expect(pointsOnly.seasonPrizeHeadline).toContain("Stanford jersey");

    const cashOnly = await t.mutation(testApp.api.nickel.setRewardMode, {
      leagueId: seeded.leagueId,
      rewardMode: "cash_only",
    });
    expect(cashOnly.mode).toBe("cash_only");
    expect(cashOnly.showWhopCheckout).toBe(true);
    expect(cashOnly.potDisplay).toContain("$25.00");

    const hybrid = await t.mutation(testApp.api.nickel.setRewardMode, {
      leagueId: seeded.leagueId,
      rewardMode: "hybrid",
    });
    expect(hybrid.mode).toBe("hybrid");
    expect(hybrid.showWhopCheckout).toBe(true);
    expect(hybrid.showNickelPoints).toBe(true);
  });

  it("5. Evaluates duplicate-safe Wordle Blitz masks, Bet Shield refunds, Whop idempotency, and Nickel Wrapped", async () => {
    expect(nickel.evaluateWordleMask("ABBEY", "BABES")).toBe("YYGGB");
    expect(nickel.evaluateWordleMask("CRISP", "CRISP")).toBe("GGGGG");

    const t = testApp.createTest();
    const seeded = await t.mutation(testApp.api.nickel.seedDemoLeagues, {});

    // Place a shielded wager on Jordan going Over 65.5 pts
    await t.mutation(testApp.api.nickel.createWager, {
      leagueId: seeded.leagueId,
      roundId: seeded.roundId!,
      creatorId: seeded.sritejId!,
      targetUserId: seeded.jordanId!,
      wagerType: "over_under",
      marketLabel: "Jordan · Krillion Dive",
      metric: "points",
      lineValue: 65.5,
      pickSide: "over",
      stakeNickels: 5,
      useBetShield: true,
    });

    // Jordan submits a Plankton answer ("Whale" = 10 base -> 14 pts < 65.5), triggering Bet Shield refund
    await t.mutation(testApp.api.nickel.submitKrillionDive, {
      roundId: seeded.roundId!,
      userId: seeded.jordanId!,
      answer: "Whale",
      durationMs: 12000,
    });

    // Verify Whop webhook idempotency
    const pay1 = await t.mutation(testApp.api.whop.recordWhopWebhookPayment, {
      whopPaymentId: "pay_whop_test_999",
      leagueId: seeded.leagueId,
      userId: seeded.sritejId!,
      amountCents: 500,
    });
    expect(pay1.duplicate).toBe(false);
    expect(pay1.potBalanceCents).toBe(3000);

    const pay2 = await t.mutation(testApp.api.whop.recordWhopWebhookPayment, {
      whopPaymentId: "pay_whop_test_999",
      leagueId: seeded.leagueId,
      userId: seeded.sritejId!,
      amountCents: 500,
    });
    expect(pay2.duplicate).toBe(true);

    // Generate Season Nickel Wrapped + Keiki 4-slide 690x920 carousel
    const wrapped = await t.mutation(
      testApp.api.nickel.settleSeasonAndGenerateWrapped,
      {
        leagueId: seeded.leagueId,
      }
    );
    expect(wrapped.keikiCarouselSlides).toHaveLength(4);
    expect(wrapped.superlatives.deepestBrain.bestAnswer).toBe("Coelacanth");
    expect(wrapped.playerCards.length).toBe(5);
  });

  it("6. Builds Keiki Vault presentation webview cards, Face ID approval cards, and iOS Live Activities", async () => {
    const pres = buildVaultPresentationCard({
      intentId: "nickel-dive-krill5-9",
      baseUrl: "https://nickel.app",
      leagueCode: "KRILL5",
      roundId: "round_9",
      userHandle: "sritej",
      tab: "arena",
      caption: "Nickel · One in a Krillion (25s)",
      subcaption: "Open in Keiki Vault · Play & Unblur Chat",
    });

    expect(pres.presentation.type).toBe("app");
    expect(pres.presentation.live).toBe(true);
    expect(pres.presentation.url).toContain("surface=keiki_vault");

    const faceIdCard = buildVaultFaceIdApprovalCard({
      kind: "whop_buy_in",
      leagueName: "Cupertino Day Ones",
      actorName: "Sritej",
      amountDisplay: "$5.00 + 5 Daily Nickels",
      rewardMode: "hybrid",
      details: [
        { label: "Season Timeline", value: "Every 2 Weeks (Bi-Weekly)" },
        { label: "Payout Split", value: "70% 1st / 30% 2nd via Whop" },
      ],
      noteText: "Secured by **Keiki Vault Face ID** (P-256 Secure Enclave).",
      approveLabel: "Approve $5.00 Buy-In",
    });

    expect(faceIdCard.v).toBe(1);
    expect(faceIdCard.blocks[0]).toEqual({
      kind: "header",
      title: "Join Cupertino Day Ones Pot ($5.00 + 5 Daily Nickels)",
      subtitle: "Sritej · Mode: HYBRID",
    });

    const liveAct = await syncVaultLiveActivity({
      recipientPhone: "+14085550101",
      logicalId: "round-krill5-9",
      title: "Cupertino Day Ones · 3/5 Played",
      body: "Jordan's 5 Nickels unlock for poaching in 14m!",
      revision: 1,
      phase: "working",
      progress: 0.6,
    });
    expect(liveAct.payload.progress).toBe(0.6);
    expect(liveAct.payload.phase).toBe("working");

    const agent = createNickelKeikiAgent();
    expect(agent).toBeDefined();
  });
});
