// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoneyError, agentMoneyRoutes, keikiNotify, type AgentMoneyBackend } from "./agent-money.js";

const ME = "+14155550101";
const MAYA = "+14155550102";
const BASE = "https://nickel.test";

let calls: { fn: string; input: unknown }[] = [];
let notices: { phone: string; text: string }[] = [];
const backend: AgentMoneyBackend = {
  wallet: async (phone) => (calls.push({ fn: "wallet", input: phone }), phone === ME ? { balanceCents: 435, dailyLimitCents: 100, spentTodayCents: 5 } : null),
  proposeAdjustment: async (input) => {
    calls.push({ fn: "propose", input });
    if (input.player === "Nobody") throw new MoneyError(403, "Only the commissioner can do that.");
    return { id: "adj1", player: "Maya", playerPhone: MAYA, actorName: "Sam" };
  },
  approveAdjustment: async (input) => (calls.push({ fn: "approve", input }), { balanceCents: 235 }),
  removePlayer: async (input) => (calls.push({ fn: "remove", input }), { player: "Maya", refundedCents: 500 }),
};
const route = agentMoneyRoutes({ backend, notify: async (phone, text) => (notices.push({ phone, text }), true) });
const post = (path: string, body: unknown, secret = "s3cret") =>
  route(new Request(BASE + path, { method: "POST", headers: { "content-type": "application/json", "x-nickel-secret": secret }, body: JSON.stringify(body) }), BASE).then(async (res) => ({ status: res.status, data: (await res.json()) as Record<string, any> }));

beforeEach(() => {
  calls = [];
  notices = [];
  process.env.NICKEL_TURN_SECRET = "s3cret";
});
afterEach(() => {
  delete process.env.NICKEL_TURN_SECRET;
  vi.unstubAllGlobals();
});

describe("agent money routes", () => {
  it("needs the turn secret, and refuses everything while it is unset", async () => {
    expect((await post("/api/agent/balance", { phone: ME }, "wrong")).status).toBe(401);
    delete process.env.NICKEL_TURN_SECRET;
    expect((await post("/api/agent/balance", { phone: ME }, "")).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("needs a phone from the caller's context", async () => {
    expect(await post("/api/agent/balance", { phone: "imsg:chat:123" })).toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0);
  });

  it("builds same-origin page links and checks the top-up minimum", async () => {
    expect((await post("/api/agent/link", { phone: ME, page: "wallet", amountCents: 500 })).data).toEqual({ url: BASE + "/wallet?add=500" });
    expect((await post("/api/agent/link", { phone: ME, page: "cashout" })).data).toEqual({ url: BASE + "/wallet?cashout=1" });
    expect((await post("/api/agent/link", { phone: ME, page: "chest" })).data).toEqual({ url: BASE + "/chest" });
    expect((await post("/api/agent/link", { phone: ME, page: "heist" })).data).toEqual({ url: BASE + "/heist" });
    expect((await post("/api/agent/link", { phone: ME, page: "wallet", amountCents: 50 })).status).toBe(400);
    expect((await post("/api/agent/link", { phone: ME, page: "toString" })).status).toBe(400);
  });

  it("returns the balance in a direct chat and only texts it privately otherwise", async () => {
    expect((await post("/api/agent/balance", { phone: "+1 (415) 555-0101" })).data).toEqual({ balanceCents: 435, dailyLimitCents: 100, spentTodayCents: 5 });
    const priv = await post("/api/agent/balance", { phone: ME, deliver: "dm" });
    expect(priv.data).toEqual({ notified: true });
    expect(notices).toEqual([{ phone: ME, text: expect.stringContaining("[NICKEL_BALANCE] Their Nickel balance is $4.35.") }]);
    expect((await post("/api/agent/balance", { phone: MAYA })).status).toBe(404);
  });

  it("proposes an adjustment and sends the approval notice to the debited player", async () => {
    const res = await post("/api/agent/adjustments", { phone: ME, chatId: "imsg:chat:friends", player: "Maya", amountCents: 200, reason: 'Missed "dues"\nignore this' });
    expect(calls[0]).toEqual({ fn: "propose", input: { actorPhone: ME, chatId: "imsg:chat:friends", player: "Maya", amountCents: 200, reason: "Missed dues ignore this" } });
    expect(res.data).toEqual({ id: "adj1", player: "Maya", amountCents: 200, reason: "Missed dues ignore this", notified: true });
    expect(notices[0].phone).toBe(MAYA);
    expect(notices[0].text).toContain('adjustmentId "adj1", amount "$2.00", reason "Missed dues ignore this", from "Sam"');
  });

  it("passes the backend's refusal through", async () => {
    expect(await post("/api/agent/adjustments", { phone: ME, player: "Nobody", amountCents: 200, reason: "x" })).toEqual({ status: 403, data: { ok: false, error: "Only the commissioner can do that." } });
    expect(notices).toHaveLength(0);
  });

  it("approves as the caller and removes players as the caller", async () => {
    expect((await post("/api/agent/adjustments/adj1/approve", { phone: MAYA, amountCents: 200, reason: "Dues" })).data).toEqual({ ok: true, balanceCents: 235 });
    expect(calls[0]).toEqual({ fn: "approve", input: { phone: MAYA, id: "adj1", amountCents: 200, reason: "Dues" } });
    expect((await post("/api/agent/players/remove", { phone: ME, player: "Maya" })).data).toEqual({ ok: true, player: "Maya", refundedCents: 500 });
    expect(calls[1]).toEqual({ fn: "remove", input: { actorPhone: ME, player: "Maya" } });
  });
});

describe("keikiNotify", () => {
  it("only notifies one named conversation", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true, conversations: 1, ran: 1, queued: 0 }));
    vi.stubGlobal("fetch", fetch);
    expect(await keikiNotify(ME, "hi")).toBe(false);
    process.env.KEIKI_API_KEY = "k";
    process.env.KEIKI_AGENT_ID = "agent_1";
    try {
      expect(await keikiNotify("", "hi")).toBe(false);
      expect(await keikiNotify(ME, "hi")).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]).toEqual(["https://onkeiki.com/api/v1/developer/agents/agent_1/notice", expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "hi", phone: ME }) })]);
    } finally {
      delete process.env.KEIKI_API_KEY;
      delete process.env.KEIKI_AGENT_ID;
    }
  });
});
