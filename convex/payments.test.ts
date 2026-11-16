import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineTestApp } from "convex-test";
import schema from "./schema.js";
import * as money from "./money.js";
import * as payments from "./payments.js";
import http from "./http.js";
import { httpWhop, signWhopWebhook, useWhop, verifyWhopWebhook, WhopError, type Kyc, type WhopApi } from "./lib/whopApi.js";
import type { Id } from "./_generated/dataModel.js";

const testApp = defineTestApp({ schema }).defineModules({ money, payments, http: { default: http } });
const { api } = testApp;
const SECRET = "ws_test_secret_0123456789";
const MAYA = "+14085550101";
const DEV = "+14085550102";

function fakeWhop() {
  const calls: { method: string; input: unknown }[] = [];
  const state = { kyc: "none" as Kyc, transferStatus: "processing" as "processing" | "succeeded" | "failed", transferError: null as WhopError | null, transfers: 0 };
  const api: WhopApi = {
    async createCheckout(input) { calls.push({ method: "createCheckout", input }); return { id: "ch_1", purchaseUrl: "https://sandbox.whop.com/checkout/ch_1/" }; },
    async createAccount(input) { calls.push({ method: "createAccount", input }); return { id: "biz_player1" }; },
    async getAccount(id) { calls.push({ method: "getAccount", input: id }); return { id, kyc: state.kyc }; },
    async accountLink(input) { calls.push({ method: "accountLink", input }); return { url: "https://sandbox.whop.com/onboarding/biz_player1" }; },
    async createTransfer(input) {
      calls.push({ method: "createTransfer", input });
      if (state.transferError) throw state.transferError;
      state.transfers += 1;
      return { id: "ctt_" + state.transfers, status: state.transferStatus };
    },
    async suspendAccount(id) { calls.push({ method: "suspendAccount", input: id }); },
    async accessToken(accountId) { calls.push({ method: "accessToken", input: accountId }); return { token: "jwt_" + accountId, expiresAt: "2026-11-16T00:00:00Z" }; },
  };
  return { api, calls, state };
}

async function webhook(t: ReturnType<typeof testApp.createTest>, event: Record<string, unknown>, opts: { secret?: string; at?: number } = {}) {
  const body = JSON.stringify({ api_version: "v1", timestamp: new Date().toISOString(), ...event });
  const ts = String(Math.floor((opts.at ?? Date.now()) / 1000));
  const signature = await signWhopWebhook(opts.secret ?? SECRET, String(event.id), ts, body);
  return t.fetch("/whop/webhook", { method: "POST", headers: { "content-type": "application/json", "webhook-id": String(event.id), "webhook-timestamp": ts, "webhook-signature": "v1," + signature }, body });
}

const paid = (id: string, playerId: string, dollars: string, extra: Record<string, unknown> = {}) => ({
  id: "msg_" + id,
  type: "payment.succeeded",
  data: { id: "pay_" + id, status: "paid", currency: "usd", total: { amount: dollars, currency: "usd", decimals: 2, display_decimals: 2 }, metadata: { playerId, amountCents: Math.round(Number(dollars) * 100), kind: "top_up" }, ...extra },
});

async function setup(t: ReturnType<typeof testApp.createTest>) {
  const maya = await t.mutation(api.payments.ensurePlayer, { phone: "+14085550101", name: "Maya" });
  const dev = await t.mutation(api.payments.ensurePlayer, { phone: "+14085550102", name: "Dev" });
  const group = await t.mutation(api.payments.ensureGroup, { chatId: "chat-1", name: "Day Ones", commissionerId: maya });
  await t.mutation(api.payments.joinGroup, { groupId: group, playerId: dev });
  return { maya, dev, group };
}

const balance = (t: ReturnType<typeof testApp.createTest>, wallet: string) => t.query(api.money.walletBalance, { wallet });

let whop: ReturnType<typeof fakeWhop>;
beforeEach(() => {
  vi.stubEnv("WHOP_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("WHOP_ACCOUNT_ID", "biz_platform");
  whop = fakeWhop();
  useWhop(whop.api);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  useWhop(httpWhop);
});

describe("payments: players, groups, limits", () => {
  it("creates players and groups once and keeps the commissioner in the group", async () => {
    const t = testApp.createTest();
    const { maya, group } = await setup(t);
    expect(await t.mutation(api.payments.ensurePlayer, { phone: "+14085550101", name: "Maya" })).toBe(maya);
    expect(await t.mutation(api.payments.ensureGroup, { chatId: "chat-1", name: "Other", commissionerId: maya })).toBe(group);
    const members = await t.run((ctx) => ctx.db.query("groupMembers").collect());
    expect(members).toHaveLength(2);
  });

  it("computes the Los Angeles day across standard and daylight time", () => {
    expect(payments.laDayStart(Date.parse("2026-11-15T07:59:00Z"))).toBe(Date.parse("2026-11-14T08:00:00Z"));
    expect(payments.laDayStart(Date.parse("2026-11-15T08:00:00Z"))).toBe(Date.parse("2026-11-15T08:00:00Z"));
    expect(payments.laDayStart(Date.parse("2026-07-01T12:00:00Z"))).toBe(Date.parse("2026-07-01T07:00:00Z"));
    expect(payments.laDayStart(Date.parse("2026-03-08T12:00:00Z"))).toBe(Date.parse("2026-03-08T08:00:00Z"));
    expect(payments.laDayStart(Date.parse("2026-11-01T20:00:00Z"))).toBe(Date.parse("2026-11-01T07:00:00Z"));
    expect(payments.laDayStart(Date.parse("2027-01-01T07:30:00Z"))).toBe(Date.parse("2026-12-31T08:00:00Z"));
  });

  it("needs consent and a daily limit before a stake, and checks the balance", async () => {
    const t = testApp.createTest();
    const { maya, group } = await setup(t);
    const stake = (amountCents: number, key: string) => t.mutation(api.payments.takeStake, { playerId: maya, groupId: group, amountCents, roundId: "r1", key });
    expect(await stake(100, "s1")).toEqual({ ok: false, reason: "consent" });
    await expect(t.mutation(api.payments.setLimit, { playerId: maya, dailyLimitCents: 500, consent: false })).rejects.toThrow(/Agree/);
    await expect(t.mutation(api.payments.setLimit, { playerId: maya, dailyLimitCents: 10.5, consent: true })).rejects.toThrow(/whole cents/);
    expect(await t.mutation(api.payments.setLimit, { playerId: maya, dailyLimitCents: 500, consent: true })).toEqual({ ok: true });
    expect(await stake(100, "s1")).toEqual({ ok: false, reason: "balance" });
    expect((await webhook(t, paid("1", maya, "10.00"))).status).toBe(200);
    expect(await stake(300, "s1")).toMatchObject({ ok: true, duplicate: false, balanceCents: 700 });
    expect(await stake(300, "s1")).toMatchObject({ ok: true, duplicate: true, balanceCents: 700 });
    expect(await stake(300, "s2")).toEqual({ ok: false, reason: "limit" });
    expect(await stake(200, "s3")).toMatchObject({ ok: true, balanceCents: 500 });
    expect(await balance(t, money.potWallet(group))).toBe(500);
    const wallet = await t.query(api.payments.wallet, { playerId: maya });
    expect(wallet).toMatchObject({ balanceCents: 500, dailyLimitCents: 500, spentTodayCents: 500, consent: true, kyc: "none" });
    expect(wallet.activity.map((a) => a.amountCents).sort((a, b) => a - b)).toEqual([-300, -200, 1000]);
    const outsider = await t.mutation(api.payments.ensurePlayer, { phone: "+14085550199", name: "Zed" });
    await expect(t.mutation(api.payments.takeStake, { playerId: outsider, groupId: group, amountCents: 100, key: "s4" })).rejects.toThrow(/Not in this group/);
  });
});

describe("payments: Whop top-ups and webhooks", () => {
  it("opens a platform checkout with the player in the metadata", async () => {
    const t = testApp.createTest();
    const { maya } = await setup(t);
    expect(await t.action(api.payments.createTopUp, { playerId: maya, amountCents: 2500, redirectUrl: "https://nickel.test/wallet" })).toEqual({ checkoutUrl: "https://sandbox.whop.com/checkout/ch_1/" });
    expect(whop.calls[0]).toEqual({ method: "createCheckout", input: { amountCents: 2500, redirectUrl: "https://nickel.test/wallet", metadata: { playerId: maya, amountCents: 2500, kind: "top_up" } } });
    await expect(t.action(api.payments.createTopUp, { playerId: maya, amountCents: 99 })).rejects.toThrow(/Top-ups/);
  });

  it("verifies signatures, stores events once, and credits each payment once", async () => {
    const t = testApp.createTest();
    const { maya } = await setup(t);
    expect((await webhook(t, paid("1", maya, "10.00"), { secret: "ws_wrong" })).status).toBe(401);
    expect((await webhook(t, paid("1", maya, "10.00"), { at: Date.now() - 10 * 60 * 1000 })).status).toBe(401);
    const first = await webhook(t, paid("1", maya, "10.00"));
    expect(await first.json()).toEqual({ duplicate: false, outcome: "credited" });
    expect(await (await webhook(t, paid("1", maya, "10.00"))).json()).toEqual({ duplicate: true, outcome: "credited" });
    expect(await (await webhook(t, { ...paid("1", maya, "10.00"), id: "msg_retry" })).json()).toEqual({ duplicate: false, outcome: "duplicate" });
    expect(await (await webhook(t, paid("2", maya, "12.00", { metadata: { playerId: maya, amountCents: 1000, kind: "top_up" } }))).json()).toMatchObject({ outcome: "credited" });
    expect(await (await webhook(t, paid("3", maya, "5.00", { metadata: { kind: "membership" } }))).json()).toMatchObject({ outcome: "ignored:not_top_up" });
    expect(await (await webhook(t, paid("4", maya, "5.00", { account_id: "biz_other" }))).json()).toMatchObject({ outcome: "ignored:other_account" });
    expect(await balance(t, money.playerWallet(maya))).toBe(2000);
    expect(await t.run((ctx) => ctx.db.query("whopEvents").collect())).toHaveLength(5);
  });

  it("checks the Standard Webhooks signature exactly as Whop documents it", async () => {
    const body = '{"id":"msg_1"}';
    const now = 1786381404000;
    const sig = await signWhopWebhook(SECRET, "msg_1", "1786381404", body);
    const headers = (signature: string, ts = "1786381404") => new Headers({ "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": signature });
    expect(await verifyWhopWebhook(body, headers("v1," + sig), SECRET, now)).toBe(true);
    expect(await verifyWhopWebhook(body, headers("v1,bad v1," + sig), SECRET, now)).toBe(true);
    expect(await verifyWhopWebhook(body + " ", headers("v1," + sig), SECRET, now)).toBe(false);
    expect(await verifyWhopWebhook(body, headers("v2," + sig), SECRET, now)).toBe(false);
    expect(await verifyWhopWebhook(body, headers("v1," + sig), undefined, now)).toBe(false);
    expect(await verifyWhopWebhook(body, headers("v1," + sig), SECRET, now + 301000)).toBe(false);
  });
});

describe("payments: pots and approvals", () => {
  it("settles a pot to players once and refuses to overspend it", async () => {
    const t = testApp.createTest();
    const { maya, dev, group } = await setup(t);
    for (const p of [maya, dev]) {
      await t.mutation(api.payments.setLimit, { playerId: p, dailyLimitCents: 1000, consent: true });
      await webhook(t, paid("p" + p, p, "5.00"));
      await t.mutation(api.payments.takeStake, { playerId: p, groupId: group, amountCents: 500, key: "stake:" + p });
    }
    await expect(t.mutation(api.payments.settlePot, { groupId: group, shares: [{ playerId: maya, cents: 1100 }], key: "season1" })).rejects.toThrow(/more than the pot/);
    expect(await t.mutation(api.payments.settlePot, { groupId: group, shares: [{ playerId: maya, cents: 700 }, { playerId: dev, cents: 300 }], key: "season1" })).toEqual({ ok: true, paidCents: 1000 });
    expect(await t.mutation(api.payments.settlePot, { groupId: group, shares: [{ playerId: maya, cents: 700 }, { playerId: dev, cents: 300 }], key: "season1" })).toEqual({ ok: true, paidCents: 0 });
    expect(await balance(t, money.playerWallet(maya))).toBe(700);
    expect(await balance(t, money.potWallet(group))).toBe(0);
  });

  it("only debits a player after that player approves; house credits need no approval", async () => {
    const t = testApp.createTest();
    const { maya, dev, group } = await setup(t);
    await webhook(t, paid("d", dev, "10.00"));
    const ask = { groupId: group, byPlayerId: maya, playerId: dev, amountCents: 300, direction: "debit" as const, note: "Late fee", key: "adj1" };
    await expect(t.mutation(api.payments.requestAdjustment, { ...ask, byPlayerId: dev, playerId: maya })).rejects.toThrow(/commissioner/);
    const req = await t.mutation(api.payments.requestAdjustment, ask);
    expect(req).toMatchObject({ ok: true, status: "pending" });
    const approvalId = req.approvalId!;
    expect(await balance(t, money.playerWallet(dev))).toBe(1000);
    expect(await t.query(api.payments.pendingApprovals, { playerId: dev })).toHaveLength(1);
    await expect(t.mutation(api.payments.decideApproval, { approvalId, playerId: maya, approve: true })).rejects.toThrow(/Only the player/);
    expect(await t.mutation(api.payments.decideApproval, { approvalId, playerId: dev, approve: true })).toEqual({ ok: true, status: "approved" });
    expect(await t.mutation(api.payments.decideApproval, { approvalId, playerId: dev, approve: true })).toEqual({ ok: true, status: "approved" });
    expect(await balance(t, money.playerWallet(dev))).toBe(700);
    expect(await balance(t, money.potWallet(group))).toBe(300);

    const declined = await t.mutation(api.payments.requestAdjustment, { ...ask, key: "adj2", toPlayerId: maya });
    expect(await t.mutation(api.payments.decideApproval, { approvalId: declined.approvalId!, playerId: dev, approve: false })).toEqual({ ok: false, status: "declined" });
    const stale = await t.mutation(api.payments.requestAdjustment, { ...ask, key: "adj3" });
    await t.run((ctx) => ctx.db.patch(stale.approvalId!, { expiresAt: Date.now() - 1 }));
    expect(await t.mutation(api.payments.decideApproval, { approvalId: stale.approvalId!, playerId: dev, approve: true })).toEqual({ ok: false, status: "expired" });
    expect(await balance(t, money.playerWallet(dev))).toBe(700);

    const credit = { ...ask, direction: "credit" as const, key: "adj4" };
    expect(await t.mutation(api.payments.requestAdjustment, credit)).toEqual({ ok: false, reason: "balance" });
    await t.mutation(testApp.internal.money.move, { from: money.WORLD, to: money.HOUSE, amountCents: 1000, reason: "fee", key: "seed-house", actor: "admin" });
    expect(await t.mutation(api.payments.requestAdjustment, credit)).toEqual({ ok: true, status: "approved" });
    expect(await balance(t, money.playerWallet(dev))).toBe(1000);
  });
});

describe("payments: cash out through a Whop subaccount", () => {
  it("onboards first, then holds the money until Whop confirms the transfer", async () => {
    const t = testApp.createTest();
    const { maya } = await setup(t);
    await webhook(t, paid("1", maya, "20.00"));
    const cash = (amountCents: number, email?: string) => t.action(api.payments.cashOut, { playerId: maya, amountCents, email, returnUrl: "https://nickel.test/wallet" });
    expect(await cash(5000)).toEqual({ ok: false, reason: "balance" });
    expect(await cash(50)).toEqual({ ok: false, reason: "amount" });
    expect(await cash(1000)).toEqual({ ok: false, reason: "email" });
    const createAccount = whop.api.createAccount;
    whop.api.createAccount = async () => { throw new WhopError(400, "The email you provided does not accept incoming mail."); };
    expect(await cash(1000, "maya@nomail.invalid")).toEqual({ ok: false, reason: "email" });
    whop.api.createAccount = createAccount;
    expect(await cash(1000, "maya@example.com")).toEqual({ ok: true, url: "https://sandbox.whop.com/onboarding/biz_player1" });
    expect(whop.calls.find((c) => c.method === "createAccount")?.input).toEqual({ email: "maya@example.com", externalId: maya, title: "Maya" });
    expect((await t.query(api.payments.wallet, { playerId: maya })).kyc).toBe("pending");
    expect(await t.action(api.payments.walletToken, { playerId: maya })).toEqual({ token: "jwt_biz_player1", expiresAt: "2026-11-16T00:00:00Z" });

    expect(await (await webhook(t, { id: "msg_acct", type: "account.updated", data: { id: "biz_player1", verification: { individual: { status: "approved" }, business: null } } })).json()).toMatchObject({ outcome: "kyc:verified" });
    whop.state.kyc = "verified";
    const out = await cash(1200);
    expect(out).toMatchObject({ ok: true, status: "pending" });
    const transfer = whop.calls.find((c) => c.method === "createTransfer")!.input as { destinationId: string; amountCents: number; idempotenceKey: string };
    expect(transfer).toMatchObject({ destinationId: "biz_player1", amountCents: 1200 });
    expect(await balance(t, money.playerWallet(maya))).toBe(800);
    const payoutId = (out as { payoutId: string }).payoutId;
    expect(await balance(t, "hold:" + payoutId)).toBe(1200);
    expect(await cash(500)).toEqual({ ok: false, reason: "busy" });

    expect(await (await webhook(t, { id: "msg_t1", type: "transfer.completed", data: { id: "ctt_1", status: "succeeded", metadata: { payoutId } } })).json()).toMatchObject({ outcome: "payout:completed" });
    expect(await (await webhook(t, { id: "msg_t1b", type: "transfer.failed", data: { id: "ctt_1", status: "failed" } })).json()).toMatchObject({ outcome: "payout:completed" });
    expect(await balance(t, "hold:" + payoutId)).toBe(0);
    expect(await balance(t, money.playerWallet(maya))).toBe(800);
    const done = await t.run((ctx) => ctx.db.query("payouts").collect());
    expect(done[0]).toMatchObject({ status: "completed", whopTransferId: "ctt_1", key: transfer.idempotenceKey });

    const again = (await cash(300)) as { payoutId: string };
    expect(await balance(t, money.playerWallet(maya))).toBe(500);
    expect(await (await webhook(t, { id: "msg_t2", type: "transfer.failed", data: { id: "ctt_2", status: "failed", failure_reason: "No payout method" } })).json()).toMatchObject({ outcome: "payout:failed" });
    expect(await balance(t, money.playerWallet(maya))).toBe(800);
    expect(await balance(t, "hold:" + again.payoutId)).toBe(0);

    whop.state.transferError = new WhopError(422, "Insufficient platform balance");
    expect(await cash(400)).toEqual({ ok: false, reason: "transfer" });
    expect(await balance(t, money.playerWallet(maya))).toBe(800);

    whop.state.transferError = null;
    whop.state.transferStatus = "succeeded";
    expect(await cash(100)).toMatchObject({ ok: true, status: "completed" });
    expect(await balance(t, money.playerWallet(maya))).toBe(700);
  });
});

describe("payments: removal and reconciliation", () => {
  it("refunds a removed player's stake and suspends an idle subaccount only", async () => {
    vi.useFakeTimers();
    const t = testApp.createTest();
    const { maya, dev, group } = await setup(t);
    const remove = (actorPhone: string, player: string, chatId: string) => t.mutation(api.payments.removePlayer, { actorPhone, chatId, player });
    const suspended = async () => (await t.finishAllScheduledFunctions(vi.runAllTimers), whop.calls.filter((c) => c.method === "suspendAccount").map((c) => c.input));
    await t.run((ctx) => ctx.db.patch(dev, { whopAccountId: "biz_dev", kyc: "verified" }));
    await t.mutation(api.payments.setLimit, { playerId: dev, dailyLimitCents: 1000, consent: true });
    await webhook(t, paid("d", dev, "4.00"));
    await t.mutation(api.payments.takeStake, { playerId: dev, groupId: group, amountCents: 400, key: "dev-stake" });
    await expect(remove(DEV, "Maya", "chat-1")).rejects.toThrow(/commissioner/);
    await expect(remove(MAYA, "Maya", "chat-1")).rejects.toThrow("The commissioner cannot remove themselves.");
    const other = await t.mutation(api.payments.ensureGroup, { chatId: "chat-2", name: "Work", commissionerId: maya });
    await t.mutation(api.payments.joinGroup, { groupId: other, playerId: dev });
    expect(await remove(MAYA, "Dev", "chat-1")).toEqual({ player: "Dev", refundedCents: 400 });
    expect(await balance(t, money.playerWallet(dev))).toBe(400);
    await expect(remove(MAYA, "Dev", "chat-1")).rejects.toThrow("Dev is not in this group.");
    expect(await balance(t, money.playerWallet(dev))).toBe(400);
    await expect(t.mutation(api.payments.takeStake, { playerId: dev, groupId: group, amountCents: 100, key: "late" })).rejects.toThrow(/Not in this group/);
    expect(await suspended()).toEqual([]);

    await t.mutation(api.payments.takeStake, { playerId: dev, groupId: other, amountCents: 400, key: "dev-stake-2" });
    await t.mutation(api.payments.settlePot, { groupId: other, shares: [{ playerId: maya, cents: 400 }], key: "other-season" });
    expect(await remove(MAYA, "+1 (408) 555-0102", "chat-2")).toEqual({ player: "Dev", refundedCents: 0 });
    expect(await suspended()).toEqual(["biz_dev"]);
  });

  it("compares the ledger against the Whop platform balance", async () => {
    const t = testApp.createTest();
    const { maya, group } = await setup(t);
    await webhook(t, paid("1", maya, "10.00"));
    await t.mutation(api.payments.setLimit, { playerId: maya, dailyLimitCents: 1000, consent: true });
    await t.mutation(api.payments.takeStake, { playerId: maya, groupId: group, amountCents: 250, key: "k" });
    await t.mutation(testApp.internal.money.move, { from: money.WORLD, to: money.HOUSE, amountCents: 100, reason: "fee", key: "house", actor: "admin" });
    expect(await t.query(api.payments.reconcile, { whopBalanceCents: 1043 })).toEqual({ players: 750, pots: 250, holds: 0, house: 43, world: -1043, internalCents: 1043, whopBalanceCents: 1043, diffCents: 0, ok: true, unknownWallets: [] });
    expect(await t.query(api.payments.reconcile, { whopBalanceCents: 1013 })).toMatchObject({ diffCents: -30, ok: false });
  });
});

describe("payments: Whop fees", () => {
  it("credits the gross top-up and books the card fee to the house once", async () => {
    const t = testApp.createTest();
    const { maya } = await setup(t);
    expect([payments.topUpFeeCents(1000), payments.topUpFeeCents(2000), payments.transferFeeCents(1000)]).toEqual([57, 84, 30]);
    await webhook(t, paid("1", maya, "20.00"));
    expect(await (await webhook(t, { ...paid("1", maya, "20.00"), id: "msg_retry" })).json()).toMatchObject({ outcome: "duplicate" });
    expect(await balance(t, money.playerWallet(maya))).toBe(2000);
    expect(await balance(t, money.HOUSE)).toBe(-84);
    expect(await t.query(api.payments.reconcile, { whopBalanceCents: 2000 - 84 })).toMatchObject({ players: 2000, house: -84, diffCents: 0, ok: true });
  });

  it("books the transfer fee to the house when a cash out completes, never when it fails", async () => {
    const t = testApp.createTest();
    const { maya } = await setup(t);
    await t.run((ctx) => ctx.db.patch(maya, { whopAccountId: "biz_player1", kyc: "verified" }));
    whop.state.kyc = "verified";
    await webhook(t, paid("1", maya, "20.00"));
    const cash = (amountCents: number) => t.action(api.payments.cashOut, { playerId: maya, amountCents, returnUrl: "https://nickel.test/wallet" });
    await cash(500);
    expect(await (await webhook(t, { id: "msg_f", type: "transfer.failed", data: { id: "ctt_1", status: "failed" } })).json()).toMatchObject({ outcome: "payout:failed" });
    expect(await balance(t, money.HOUSE)).toBe(-84);
    const out = (await cash(1000)) as { payoutId: string };
    const done = { id: "msg_t", type: "transfer.completed", data: { id: "ctt_2", status: "succeeded", metadata: { payoutId: out.payoutId } } };
    await webhook(t, done);
    await webhook(t, { ...done, id: "msg_t_retry" });
    expect(await balance(t, money.HOUSE)).toBe(-84 - 30);
    expect(await balance(t, money.playerWallet(maya))).toBe(1000);
    expect(await t.query(api.payments.reconcile, { whopBalanceCents: 2000 - 84 - 1000 - 30 })).toMatchObject({ holds: 0, diffCents: 0, ok: true });
  });
});

describe("payments: agent money calls", () => {
  it("reads a wallet by phone", async () => {
    const t = testApp.createTest();
    const { maya, group } = await setup(t);
    expect(await t.query(api.payments.agentWallet, { phone: "+14085550199" })).toBeNull();
    await webhook(t, paid("1", maya, "10.00"));
    await t.mutation(api.payments.setLimit, { playerId: maya, dailyLimitCents: 500, consent: true });
    await t.mutation(api.payments.takeStake, { playerId: maya, groupId: group, amountCents: 300, key: "s1" });
    expect(await t.query(api.payments.agentWallet, { phone: MAYA })).toEqual({ balanceCents: 700, dailyLimitCents: 500, spentTodayCents: 300 });
  });

  it("lets only the commissioner propose, and finds the player by name or phone", async () => {
    const t = testApp.createTest();
    const { maya, dev, group } = await setup(t);
    const propose = (actorPhone: string, player: string, chatId?: string) => t.mutation(api.payments.proposeAdjustment, { actorPhone, player, amountCents: 200, reason: "Missed dues", ...(chatId && { chatId }) });
    await expect(propose(DEV, "Maya", "chat-1")).rejects.toThrow("Only the commissioner can do that.");
    await expect(propose(DEV, "Maya")).rejects.toThrow("Only the commissioner can do that.");
    await expect(propose("+14085550199", "Dev")).rejects.toThrow("Only the commissioner can do that.");
    await expect(propose(MAYA, "Dev", "chat-unknown")).rejects.toThrow("This chat is not a Nickel group yet.");
    await expect(propose(MAYA, "Zed", "chat-1")).rejects.toThrow("Zed is not in this group.");
    await expect(t.mutation(api.payments.proposeAdjustment, { actorPhone: MAYA, player: "Dev", amountCents: 0, reason: "x" })).rejects.toThrow("Give an amount above zero.");
    const made = await propose(MAYA, " dev ", "chat-1");
    expect(made).toEqual({ id: expect.any(String), player: "Dev", playerPhone: DEV, actorName: "Maya" });
    expect(await propose(MAYA, "(408) 555-0102")).toMatchObject({ player: "Dev" });
    const row = await t.run((ctx) => ctx.db.get(made.id as Id<"approvals">));
    expect(row).toMatchObject({ status: "pending", approverId: dev, requestedBy: maya, from: money.playerWallet(dev), to: money.potWallet(group), amountCents: 200, note: "Missed dues", key: "adj:" + made.id });
    expect(await t.query(api.payments.pendingApprovals, { playerId: dev })).toHaveLength(2);
    expect(await t.run((ctx) => ctx.db.query("ledger").collect())).toHaveLength(0);

    const twin = await t.mutation(api.payments.ensurePlayer, { phone: "+14085550103", name: "Dev" });
    await t.mutation(api.payments.joinGroup, { groupId: group, playerId: twin });
    await expect(propose(MAYA, "Dev", "chat-1")).rejects.toThrow("More than one player is called Dev. Use their phone number.");
    await t.mutation(api.payments.ensureGroup, { chatId: "chat-2", name: "Work", commissionerId: maya });
    await expect(propose(MAYA, DEV)).rejects.toThrow("You run more than one group. Ask from that group's chat.");
    expect(await propose(MAYA, DEV, "chat-1")).toMatchObject({ player: "Dev" });
  });

  it("debits only after the charged player approves the exact request, and only once", async () => {
    const t = testApp.createTest();
    const { dev, group } = await setup(t);
    await webhook(t, paid("d", dev, "10.00"));
    const propose = (amountCents: number, reason: string) => t.mutation(api.payments.proposeAdjustment, { actorPhone: MAYA, chatId: "chat-1", player: "Dev", amountCents, reason });
    const { id } = await propose(200, "Missed dues");
    const approve = (phone: string, over: { id?: string; amountCents?: number; reason?: string } = {}) => t.mutation(api.payments.approveAdjustment, { phone, id, amountCents: 200, reason: "Missed dues", ...over });
    await expect(approve(MAYA)).rejects.toThrow("That request is not yours to approve.");
    await expect(approve(DEV, { id: "nope" })).rejects.toThrow("That request is not yours to approve.");
    await expect(approve(DEV, { amountCents: 2000 })).rejects.toThrow("That does not match the request.");
    await expect(approve(DEV, { reason: "Something else" })).rejects.toThrow("That does not match the request.");
    expect(await balance(t, money.playerWallet(dev))).toBe(1000);
    expect(await approve(DEV)).toEqual({ balanceCents: 800 });
    await expect(approve(DEV)).rejects.toThrow("That request was already approved.");
    expect(await t.mutation(api.payments.decideApproval, { approvalId: id as Id<"approvals">, playerId: dev, approve: true })).toEqual({ ok: true, status: "approved" });
    expect(await balance(t, money.playerWallet(dev))).toBe(800);
    expect(await balance(t, money.potWallet(group))).toBe(200);
    const moves = await t.run((ctx) => ctx.db.query("ledger").filter((q) => q.eq(q.field("reason"), "adjustment")).collect());
    expect(moves).toEqual([expect.objectContaining({ key: "adj:" + id, from: money.playerWallet(dev), to: money.potWallet(group), amountCents: 200, actor: "player", approvalId: id })]);

    const big = await propose(5000, "Big");
    await expect(approve(DEV, { id: big.id, amountCents: 5000, reason: "Big" })).rejects.toThrow("Your Nickel balance is too low for this. Add money first.");
    expect(await t.run((ctx) => ctx.db.get(big.id as Id<"approvals">))).toMatchObject({ status: "pending" });
    const stale = await propose(100, "Old");
    await t.run((ctx) => ctx.db.patch(stale.id as Id<"approvals">, { expiresAt: Date.now() - 1 }));
    await expect(approve(DEV, { id: stale.id, amountCents: 100, reason: "Old" })).rejects.toThrow("That request expired.");
    const gone = await propose(100, "Gone");
    await t.run(async (ctx) => {
      const row = await ctx.db.query("groupMembers").withIndex("by_group_player", (q) => q.eq("groupId", group).eq("playerId", dev)).unique();
      await ctx.db.patch(row!._id, { leftAt: Date.now() });
    });
    await expect(approve(DEV, { id: gone.id, amountCents: 100, reason: "Gone" })).rejects.toThrow("You are no longer in that group.");
    expect(await balance(t, money.playerWallet(dev))).toBe(800);
  });
});
