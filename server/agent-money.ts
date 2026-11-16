import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { anyApi, type FunctionReference } from "convex/server";
import { turnTrusted } from "./auth.js";
import type { MoneyPage, WalletSummary } from "../packages/keiki-agent/src/money-client.js";

export class MoneyError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface AgentMoneyBackend {
  wallet(phone: string): Promise<WalletSummary | null>;
  proposeAdjustment(input: { actorPhone: string; chatId?: string; player: string; amountCents: number; reason: string }): Promise<{ id: string; player: string; playerPhone: string; actorName: string }>;
  approveAdjustment(input: { phone: string; id: string; amountCents: number; reason: string }): Promise<{ balanceCents: number }>;
  removePlayer(input: { actorPhone: string; chatId?: string; player: string }): Promise<{ player: string; refundedCents: number }>;
}

export type Notify = (phone: string, text: string) => Promise<boolean>;

const json = (data: unknown, status = 200) => Response.json(data, { status });
const deny = (status: number, error: string) => json({ ok: false, error }, status);
const usd = (cents: number) => "$" + (cents / 100).toFixed(2);
const cleanPhone = (raw: unknown) => (typeof raw === "string" && /^\+?[0-9][0-9 ().-]{6,20}$/.test(raw.trim()) ? raw.replace(/[^+0-9]/g, "") : "");
const cleanText = (raw: unknown, max: number) => (typeof raw === "string" ? raw.replace(/[\s"\`[\]{}<>\\]+/g, " ").trim().slice(0, max) : "");
const cents = (raw: unknown, min: number) => (typeof raw === "number" && Number.isInteger(raw) && raw >= min && raw <= 100000 ? raw : null);

const PAGES: Record<MoneyPage, (amountCents: number | null) => string> = {
  wallet: (amount) => "/wallet" + (amount ? "?add=" + amount : ""),
  cashout: () => "/wallet?cashout=1",
  chest: () => "/chest",
  heist: () => "/heist",
};

export function agentMoneyRoutes(deps: { backend: AgentMoneyBackend; notify: Notify }) {
  return async function agentMoney(request: Request, base: string): Promise<Response> {
    if (request.method !== "POST") return deny(405, "Use POST.");
    if (!process.env.NICKEL_TURN_SECRET || !turnTrusted(request)) return deny(401, "Not allowed.");
    const path = new URL(request.url).pathname;
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const phone = cleanPhone(body.phone);
    if (!phone) return deny(400, "Nickel can't tell who is asking.");
    const chatId = typeof body.chatId === "string" && body.chatId ? body.chatId.slice(0, 200) : undefined;
    try {
      if (path === "/api/agent/link") {
        const page = PAGES[body.page as MoneyPage];
        if (!Object.hasOwn(PAGES, String(body.page))) return deny(400, "Unknown page.");
        const amount = body.amountCents === undefined ? null : cents(body.amountCents, 100);
        if (body.amountCents !== undefined && amount === null) return deny(400, "The minimum is $1.");
        return json({ url: base.replace(/\/+$/, "") + page(body.page === "wallet" ? amount : null) });
      }

      if (path === "/api/agent/balance") {
        const wallet = await deps.backend.wallet(phone);
        if (!wallet) return deny(404, "You don't have a Nickel balance yet. Ask me to add money.");
        if (body.deliver === "dm") return json({ notified: await deps.notify(phone, "[NICKEL_BALANCE] Their Nickel balance is " + usd(wallet.balanceCents) + ". Text it to them in one short line.") });
        return json({ balanceCents: wallet.balanceCents, dailyLimitCents: wallet.dailyLimitCents, spentTodayCents: wallet.spentTodayCents });
      }

      if (path === "/api/agent/adjustments") {
        const amountCents = cents(body.amountCents, 1);
        const reason = cleanText(body.reason, 80);
        const player = cleanText(body.player, 40);
        if (amountCents === null) return deny(400, "Give an amount above zero.");
        if (!reason || !player) return deny(400, "Give a player and a reason.");
        const made = await deps.backend.proposeAdjustment({ actorPhone: phone, ...(chatId && { chatId }), player, amountCents, reason });
        const from = cleanText(made.actorName, 40);
        const notice = "[NICKEL_ADJUSTMENT] " + from + " wants to take " + usd(amountCents) + " from their Nickel balance into the group pot, for: " + reason + ". Call approve_adjustment with adjustmentId \"" + made.id + "\", amount \"" + usd(amountCents) + "\", reason \"" + reason + "\", from \"" + from + "\".";
        return json({ id: made.id, player: made.player, amountCents, reason, notified: await deps.notify(made.playerPhone, notice) });
      }

      const approve = path.match(/^\/api\/agent\/adjustments\/([A-Za-z0-9_-]{1,64})\/approve$/);
      if (approve) {
        const amountCents = cents(body.amountCents, 1);
        if (amountCents === null) return deny(400, "That amount does not match the request.");
        const done = await deps.backend.approveAdjustment({ phone, id: approve[1], amountCents, reason: cleanText(body.reason, 80) });
        return json({ ok: true, balanceCents: done.balanceCents });
      }

      if (path === "/api/agent/players/remove") {
        const player = cleanText(body.player, 40);
        if (!player) return deny(400, "Name the player.");
        const out = await deps.backend.removePlayer({ actorPhone: phone, ...(chatId && { chatId }), player });
        return json({ ok: true, player: out.player, refundedCents: out.refundedCents });
      }
    } catch (e) {
      if (e instanceof MoneyError) return deny(e.status, e.message);
      console.error("Agent money failed", e);
      return deny(500, "Nickel could not do that right now.");
    }
    return deny(404, "Not found.");
  };
}

export function convexMoneyBackend(url = process.env.CONVEX_URL): AgentMoneyBackend {
  const client = url ? new ConvexHttpClient(url) : null;
  const call = async <T>(kind: "query" | "mutation", name: string, args: Record<string, unknown>): Promise<T> => {
    if (!client) throw new MoneyError(503, "Money is not set up yet.");
    const ref = anyApi.payments[name] as FunctionReference<typeof kind>;
    try {
      const full = { ...args, secret: process.env.NICKEL_MONEY_SECRET };
      return (kind === "query" ? await client.query(ref as FunctionReference<"query">, full) : await client.mutation(ref as FunctionReference<"mutation">, full)) as T;
    } catch (e) {
      throw new MoneyError(409, e instanceof ConvexError && typeof e.data === "string" ? e.data : "That did not go through.");
    }
  };
  return {
    wallet: (phone) => call("query", "agentWallet", { phone }),
    proposeAdjustment: (input) => call("mutation", "proposeAdjustment", input),
    approveAdjustment: (input) => call("mutation", "approveAdjustment", input),
    removePlayer: (input) => call("mutation", "removePlayer", input),
  };
}

export const keikiNotify: Notify = async (phone, text) => {
  const key = process.env.KEIKI_API_KEY;
  const agent = process.env.KEIKI_AGENT_ID;
  if (!key || !agent || !phone) return false;
  const res = await fetch((process.env.KEIKI_PLATFORM_URL ?? "https://onkeiki.com").replace(/\/+$/, "") + "/api/v1/developer/agents/" + encodeURIComponent(agent) + "/notice", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({ text, phone }),
  }).catch(() => null);
  const data = res?.ok ? ((await res.json().catch(() => null)) as { ran?: number; queued?: number } | null) : null;
  return (data?.ran ?? 0) + (data?.queued ?? 0) > 0;
};

export const agentMoney = agentMoneyRoutes({ backend: convexMoneyBackend(), notify: keikiNotify });
