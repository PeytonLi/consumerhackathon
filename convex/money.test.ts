import { describe, expect, it } from "vitest";
import { defineTestApp } from "convex-test";
import schema from "./schema.js";
import * as money from "./money.js";

const testApp = defineTestApp({ schema }).defineModules({ money });

describe("money ledger", () => {
  it("moves cents between wallets, refuses overdrafts, and ignores replays", async () => {
    const t = testApp.createTest();
    const playerId = await t.run((ctx) => ctx.db.insert("players", { phone: "+14085550101", name: "Peyton", kyc: "none", status: "active", dailyLimitCents: 100, createdAt: 0 }));
    const me = money.playerWallet(playerId);
    const topUp = { from: money.WORLD, to: me, amountCents: 500, reason: "top_up" as const, key: "whop:pay_1", actor: "whop" as const };
    expect((await t.mutation(testApp.internal.money.move, topUp)).duplicate).toBe(false);
    expect((await t.mutation(testApp.internal.money.move, topUp)).duplicate).toBe(true);
    await t.mutation(testApp.internal.money.move, { from: me, to: money.HOUSE, amountCents: 5, reason: "chest", key: "k2", actor: "agent" });
    expect(await t.query(testApp.api.money.walletBalance, { wallet: me })).toBe(495);
    await expect(t.mutation(testApp.internal.money.move, { from: me, to: money.HOUSE, amountCents: 1000, reason: "stake", key: "k3", actor: "agent" })).rejects.toThrow(/Insufficient/);
    await expect(t.mutation(testApp.internal.money.move, { from: me, to: money.HOUSE, amountCents: 1.5, reason: "stake", key: "k4", actor: "agent" })).rejects.toThrow(/whole number/);
  });
});
