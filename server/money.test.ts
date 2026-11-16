// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { defineTestApp } from "convex-test";
import schema from "../convex/schema.js";
import * as moneyModule from "../convex/money.js";
import * as payments from "../convex/payments.js";
import { httpWhop, useWhop, type WhopApi } from "../convex/lib/whopApi.js";

let brain: typeof import("./brain.js");
let money: typeof import("./money.js");
beforeAll(async () => {
  process.env.NICKEL_DATA_DIR = mkdtempSync(tmpdir() + "/nickel-money-");
  brain = await import("./brain.js");
  money = await import("./money.js");
});

const testApp = defineTestApp({ schema }).defineModules({ money: moneyModule, payments });
const BASE = "https://nickel.test";
let t: ReturnType<typeof testApp.createTest>;
let calls: { method: string; input: unknown }[];

const fake: WhopApi = {
  async createCheckout(input) { calls.push({ method: "createCheckout", input }); return { id: "ch_1", purchaseUrl: "https://sandbox.whop.com/checkout/ch_1/" }; },
  async createAccount(input) { calls.push({ method: "createAccount", input }); return { id: "biz_me" }; },
  async getAccount(id) { return { id, kyc: "none" }; },
  async accountLink() { return { url: "https://sandbox.whop.com/onboarding/biz_me" }; },
  async createTransfer() { return { id: "ctt_1", status: "processing" }; },
  async suspendAccount() {},
  async accessToken(accountId) { return { token: "jwt_" + accountId, expiresAt: "2026-11-16T00:00:00Z" }; },
};

beforeEach(() => {
  t = testApp.createTest();
  calls = [];
  useWhop(fake);
  money.useMoneyBackend({
    query: (name, args) => t.query(makeFunctionReference<"query", any, any>(name), args),
    mutation: (name, args) => t.mutation(makeFunctionReference<"mutation", any, any>(name), args),
    action: (name, args) => t.action(makeFunctionReference<"action", any, any>(name), args),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  useWhop(httpWhop);
});

const request = (path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) =>
  new Request(BASE + path, init.body === undefined ? { headers: { host: "nickel.test", ...init.headers } } : { method: "POST", headers: { host: "nickel.test", "content-type": "application/json", ...init.headers }, body: JSON.stringify(init.body) });
const route = async (path: string, session: { token: string; name: string } | null, init?: Parameters<typeof request>[1]) => {
  const res = (await money.walletRoute(request(path, init), session, BASE))!;
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};
const signedIn = (phone: string, name: string) => {
  const profile = brain.profileFor(phone, name);
  return { token: profile.token, name };
};
const credit = (id: string, playerId: string, cents: number) =>
  t.mutation(testApp.internal.payments.handleWhopEvent, { eventId: "msg_" + id, payload: JSON.stringify({ id: "msg_" + id, type: "payment.succeeded", data: { id: "pay_" + id, currency: "usd", total: { amount: (cents / 100).toFixed(2), currency: "usd" }, metadata: { playerId, amountCents: cents, kind: "top_up" } } }) });

describe("wallet routes", () => {
  it("ignores other paths and refuses callers without a session or the server secret", async () => {
    expect(await money.walletRoute(request("/api/leaderboard"), null, BASE)).toBeNull();
    expect(await money.walletRoute(request("/api/pot/pot-x", { body: { action: "agree" } }), null, BASE)).toBeNull();
    expect((await route("/api/wallet", null)).status).toBe(401);
    expect((await route("/api/wallet?phone=%2B14085550101", null, { headers: { "x-nickel-secret": "s3cret" } })).status).toBe(401);
    vi.stubEnv("NICKEL_TURN_SECRET", "s3cret");
    expect((await route("/api/wallet?phone=%2B14085550101", null, { headers: { "x-nickel-secret": "wrong" } })).status).toBe(401);
  });

  it("serves the session player's wallet, limit, and top-up checkout", async () => {
    const me = signedIn("+14085550111", "Maya");
    expect((await route("/api/wallet", me)).body).toEqual({ balanceCents: 0, dailyLimitCents: 2000, spentTodayCents: 0, consent: false, kyc: "none", activity: [] });
    expect((await route("/api/wallet/limit", me, { body: { dailyLimitCents: 1500 } })).status).toBe(400);
    expect((await route("/api/wallet/limit", me, { body: { dailyLimitCents: 1500, consent: true }, headers: { origin: "https://evil.test" } })).status).toBe(403);
    expect((await route("/api/wallet/limit", me, { body: { dailyLimitCents: 1500, consent: true } })).body).toEqual({ ok: true });
    expect((await route("/api/wallet/topup", me, { body: { amountCents: 50 } })).status).toBe(400);
    expect((await route("/api/wallet/topup", me, { body: { amountCents: 2500, playerId: "someone-else" } })).body).toEqual({ checkoutUrl: "https://sandbox.whop.com/checkout/ch_1/" });
    const checkout = calls[0].input as { metadata: { playerId: string }; redirectUrl: string };
    expect(checkout.redirectUrl).toBe(BASE + "/wallet.html");
    await credit("1", checkout.metadata.playerId, 2500);
    const wallet = (await route("/api/wallet", me)).body;
    expect(wallet).toMatchObject({ balanceCents: 2500, dailyLimitCents: 1500, consent: true });
    expect(wallet.activity).toEqual([expect.objectContaining({ amountCents: 2500, reason: "top_up", note: "Top up" })]);

    vi.stubEnv("NICKEL_TURN_SECRET", "s3cret");
    const keiki = await route("/api/wallet?phone=%2B14085550111", null, { headers: { "x-nickel-secret": "s3cret" } });
    expect(keiki.body.balanceCents).toBe(2500);
  });

  it("cashes out through Whop onboarding and hands out a subaccount token", async () => {
    const me = signedIn("+14085550112", "Dev");
    expect((await route("/api/wallet/token", me)).status).toBe(404);
    await route("/api/wallet/topup", me, { body: { amountCents: 1000 } });
    await credit("2", (calls[0].input as { metadata: { playerId: string } }).metadata.playerId, 1000);
    expect((await route("/api/wallet/cashout", me, { body: { amountCents: 500 } })).body).toMatchObject({ ok: false, reason: "email" });
    expect((await route("/api/wallet/cashout", me, { body: { amountCents: 5000, email: "dev@example.com" } })).body).toMatchObject({ ok: false, reason: "balance" });
    expect((await route("/api/wallet/cashout", me, { body: { amountCents: 500, email: "dev@example.com" } })).body).toEqual({ url: "https://sandbox.whop.com/onboarding/biz_me" });
    expect((await route("/api/wallet/token", me)).body).toEqual({ token: "jwt_biz_me", expiresAt: "2026-11-16T00:00:00Z" });
    expect((await route("/api/wallet", me)).body.kyc).toBe("pending");
  });

  it("pays a pot from the prepaid balance, once", async () => {
    const me = signedIn("+14085550113", "Alex");
    const potId = brain.handleTurn({ text: "nickel $5 buy-in", sender: "Alex", baseUrl: BASE }).card!.path.split("?")[0].slice(3);
    const pay = () => route("/api/pot/" + potId, me, { body: { member: "Alex", action: "pay" } });
    expect((await route("/api/pot/" + potId, null, { body: { member: "Alex", action: "pay" } })).status).toBe(401);
    expect((await pay()).body).toMatchObject({ ok: false, reason: "consent" });
    await route("/api/wallet/limit", me, { body: { dailyLimitCents: 2000, consent: true } });
    expect((await pay()).body).toMatchObject({ ok: false, reason: "balance", wallet: "/wallet.html" });
    await route("/api/wallet/topup", me, { body: { amountCents: 800 } });
    await credit("3", (calls[0].input as { metadata: { playerId: string } }).metadata.playerId, 800);
    const paid = await pay();
    expect(paid.body.ok).toBe(true);
    expect(paid.body.pot.members.Alex).toBe("paid");
    expect((await pay()).body.ok).toBe(true);
    expect((await route("/api/wallet", me)).body).toMatchObject({ balanceCents: 300, spentTodayCents: 500 });
  });
});
