// @vitest-environment node
import { Effect } from "effect";
import type { ToolContext } from "@onkeiki/agents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addMoneyTool, approveAdjustmentTool, balanceTool, caller, cashOutTool, heistTool, openChestTool, proposeAdjustmentTool, removePlayerTool } from "./money-tools.js";

const ME = "+14155550101";
const GROUP = "imsg:chat:friends";

type Seen = { url: string; secret: string | null; body: Record<string, unknown> };
let seen: Seen[] = [];
let reply: (path: string, body: Record<string, unknown>) => { status?: number; data: unknown } = () => ({ data: {} });

beforeEach(() => {
  seen = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    seen.push({ url, secret: new Headers(init.headers).get("x-nickel-secret"), body });
    const out = reply(new URL(url).pathname, body);
    return Response.json(out.data, { status: out.status ?? 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

function ctx(opts: { direct: boolean; phone?: string; userId?: string; channelId?: string; messageId?: string; base?: string }): ToolContext {
  const secrets: Record<string, string> = { NICKEL_BASE_URL: opts.base ?? "https://nickel.test", NICKEL_TURN_SECRET: "s3cret" };
  return {
    phone: opts.phone ?? (opts.direct ? ME : GROUP),
    user: { phone: ME, timezone: null, currency: null, metadata: {}, firstSeenAt: new Date(0) },
    channel: { channel: "amb", inboundText: "", isDirect: opts.direct, userId: opts.userId ?? ME, channelId: opts.channelId, messageId: opts.messageId ?? "msg-1" },
    secrets: { get: (name: string) => Effect.succeed(secrets[name] ?? null), getAll: () => Effect.succeed(secrets) },
  } as unknown as ToolContext;
}
const dm = ctx({ direct: true });
const group = ctx({ direct: false, phone: GROUP });

const run = <I, O>(tool: { execute: (input: I, ctx: ToolContext) => Effect.Effect<O> }, input: I, context: ToolContext) =>
  Effect.runPromise(tool.execute(input, context)) as Promise<Record<string, any>>;

const pages: Record<string, string> = { wallet: "/wallet", cashout: "/wallet?cashout=1", chest: "/chest", heist: "/heist" };
const linkServer = (path: string, body: Record<string, unknown>) =>
  path === "/api/agent/link" ? { data: { url: "https://nickel.test" + (body.page === "wallet" && body.amountCents ? "/wallet?add=" + body.amountCents : pages[String(body.page)]) } } : { status: 404, data: { ok: false, error: "Not found." } };

describe("identity", () => {
  it("takes the caller's phone from the signed context, never from tool input", async () => {
    reply = linkServer;
    const sneaky = ctx({ direct: false, phone: GROUP, userId: "+1 (415) 555-0102" });
    await run(addMoneyTool, { amountDollars: 5, phone: "+19999999999" } as never, sneaky);
    expect(seen[0].body).toEqual({ phone: "+14155550102", page: "wallet", amountCents: 500 });
    expect(seen[0].secret).toBe("s3cret");
    expect(caller(sneaky)).toEqual({ direct: false, phone: "+14155550102" , chatId: GROUP });
    expect(caller(dm)).toEqual({ direct: true, phone: ME });
  });

  it("refuses when the context carries no phone, and never treats a group id as a phone", async () => {
    const noPhone = ctx({ direct: false, phone: "imsg:chat:5551234567", userId: "U123" });
    expect(caller(noPhone).phone).toBeNull();
    expect(await run(balanceTool, {}, noPhone)).toMatchObject({ ok: false });
    expect(seen).toHaveLength(0);
  });

  it("refuses to send the secret anywhere but https", async () => {
    expect(await run(addMoneyTool, {}, ctx({ direct: true, base: "http://nickel.example" }))).toMatchObject({ ok: false, error: "Nickel's server address must be https." });
    expect(seen).toHaveLength(0);
  });
});

describe("add_money", () => {
  it("sends the wallet as a Vault card in a direct chat", async () => {
    reply = linkServer;
    const out = await run(addMoneyTool, { amountDollars: 5 }, dm);
    expect(seen[0].url).toBe("https://nickel.test/api/agent/link");
    expect(out).toMatchObject({ ok: true, line: "Add $5.00 here.", url: "https://nickel.test/wallet?add=500" });
    expect(out.presentation).toMatchObject({ type: "app", url: "https://nickel.test/wallet?add=500", live: false, caption: "Add money", subcaption: "$5.00" });
    expect(out.presentation.id).toMatch(/^nickel-wallet-msg-1$/);
  });

  it("sends a plain wallet link in a group", async () => {
    reply = linkServer;
    const out = await run(addMoneyTool, {}, group);
    expect(out).toEqual({ ok: true, line: "Add money here.", url: "https://nickel.test/wallet" });
  });

  it("never puts a checkout url in a group, even if the server returns one", async () => {
    reply = () => ({ data: { url: "https://whop.com/checkout/ch_123" } });
    for (const context of [group, dm]) {
      const out = await run(addMoneyTool, { amountDollars: 5 }, context);
      expect(out).toMatchObject({ ok: false });
      expect(JSON.stringify(out)).not.toContain("whop.com");
    }
    reply = () => ({ data: { url: "https://nickel.test/checkout?session=1" } });
    expect(JSON.stringify(await run(addMoneyTool, {}, group))).not.toContain("checkout");
  });

  it("enforces the $1 minimum before calling the server", async () => {
    expect(await run(addMoneyTool, { amountDollars: 0.5 }, dm)).toEqual({ ok: false, error: "The minimum is $1." });
    expect(seen).toHaveLength(0);
  });
});

describe("balance", () => {
  it("returns the numbers in a direct chat", async () => {
    reply = () => ({ data: { balanceCents: 435, dailyLimitCents: 100, spentTodayCents: 5 } });
    const out = await run(balanceTool, {}, dm);
    expect(seen[0].body).toEqual({ phone: ME });
    expect(out).toEqual({ ok: true, balanceCents: 435, dailyLimitCents: 100, spentTodayCents: 5, line: "You have $4.35." });
  });

  it("texts it privately from a group and says no number there", async () => {
    reply = (_p, body) => ({ data: body.deliver === "dm" ? { notified: true } : { balanceCents: 435, dailyLimitCents: 100, spentTodayCents: 5 } });
    const out = await run(balanceTool, {}, group);
    expect(seen[0].body).toEqual({ phone: ME, deliver: "dm" });
    expect(out).toEqual({ ok: true, privateOnly: true, sentPrivately: true, line: "I texted you your balance." });
    expect(JSON.stringify(out)).not.toMatch(/4\.35|435/);
  });

  it("relays a server error as one line", async () => {
    reply = () => ({ status: 404, data: { ok: false, error: "You don't have a Nickel balance yet. Ask me to add money." } });
    expect(await run(balanceTool, {}, dm)).toEqual({ ok: false, error: "You don't have a Nickel balance yet. Ask me to add money." });
  });
});

describe("cash_out, open_chest, heist", () => {
  it("keeps cash out to direct chats", async () => {
    reply = linkServer;
    expect(await run(cashOutTool, {}, group)).toEqual({ ok: true, privateOnly: true, line: "Text me directly to cash out." });
    expect(seen).toHaveLength(0);
    const out = await run(cashOutTool, {}, dm);
    expect(seen[0].body).toEqual({ phone: ME, page: "cashout" });
    expect(out.presentation).toMatchObject({ type: "app", url: "https://nickel.test/wallet?cashout=1", live: false, caption: "Cash out" });
  });

  it("opens the chest and the heist as cards in a direct chat and links in a group", async () => {
    reply = linkServer;
    expect((await run(openChestTool, {}, dm)).presentation).toMatchObject({ url: "https://nickel.test/chest", caption: "Daily chest", live: false });
    expect(await run(openChestTool, {}, group)).toEqual({ ok: true, line: "Your chest is ready.", url: "https://nickel.test/chest" });
    expect((await run(heistTool, {}, dm)).presentation).toMatchObject({ url: "https://nickel.test/heist", caption: "Heist" });
    expect(await run(heistTool, {}, group)).toEqual({ ok: true, line: "Stop the clock at 5.000.", url: "https://nickel.test/heist" });
  });

  it("rejects a link to a page other than the one asked for", async () => {
    reply = () => ({ data: { url: "https://nickel.test/w" } });
    expect(await run(heistTool, {}, group)).toMatchObject({ ok: false });
  });
});

describe("commissioner tools", () => {
  it("proposes an adjustment as the caller, scoped to the group", async () => {
    reply = (_p, body) => ({ data: { id: "adj1", player: "Maya", amountCents: body.amountCents, reason: body.reason, notified: true } });
    const out = await run(proposeAdjustmentTool, { player: " Maya ", amountDollars: 2, reason: "Missed dues " }, group);
    expect(seen[0].url).toBe("https://nickel.test/api/agent/adjustments");
    expect(seen[0].body).toEqual({ phone: ME, chatId: GROUP, player: "Maya", amountCents: 200, reason: "Missed dues" });
    expect(out).toEqual({ ok: true, adjustmentId: "adj1", line: "Sent to Maya to approve $2.00." });
  });

  it("passes the server's commissioner refusal through", async () => {
    reply = () => ({ status: 403, data: { ok: false, error: "Only the commissioner can do that." } });
    expect(await run(proposeAdjustmentTool, { player: "Maya", amountDollars: 2, reason: "Dues" }, group)).toEqual({ ok: false, error: "Only the commissioner can do that." });
  });

  it("approves only in the debited player's direct chat behind Face ID", async () => {
    expect(approveAdjustmentTool.policy).toMatchObject({ approval: "ask", approvalProof: "verified", card: { v: 1 } });
    reply = () => ({ data: { ok: true, balanceCents: 185 } });
    expect(await run(approveAdjustmentTool, { adjustmentId: "adj1", amount: "$2.50", reason: "Dues", from: "Sam" }, group)).toMatchObject({ ok: false });
    expect(seen).toHaveLength(0);
    const out = await run(approveAdjustmentTool, { adjustmentId: "adj1", amount: "$2.50", reason: "Dues", from: "Sam" }, dm);
    expect(seen[0].url).toBe("https://nickel.test/api/agent/adjustments/adj1/approve");
    expect(seen[0].body).toEqual({ phone: ME, amountCents: 250, reason: "Dues" });
    expect(out).toEqual({ ok: true, balanceCents: 185, line: "Done. You have $1.85." });
  });

  it("removes a player as the caller behind Face ID", async () => {
    expect(removePlayerTool.policy).toMatchObject({ approval: "ask", approvalProof: "verified", card: { v: 1 } });
    reply = () => ({ data: { ok: true, player: "Maya", refundedCents: 500 } });
    const out = await run(removePlayerTool, { player: "Maya" }, dm);
    expect(seen[0].body).toEqual({ phone: ME, player: "Maya" });
    expect(out).toEqual({ ok: true, line: "Maya is out. $5.00 goes back to them." });
  });
});
