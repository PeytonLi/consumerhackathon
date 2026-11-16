import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { limited, turnTrusted, type Session } from "./auth.js";
import { getPot, internals, joinPot } from "./brain.js";

type Args = Record<string, unknown>;
export interface MoneyBackend {
  query<T>(name: string, args: Args): Promise<T>;
  mutation<T>(name: string, args: Args): Promise<T>;
  action<T>(name: string, args: Args): Promise<T>;
}

export function convexBackend(url = process.env.CONVEX_URL): MoneyBackend | null {
  if (!url) return null;
  const client = new ConvexHttpClient(url);
  const secret = process.env.NICKEL_SYNC_SECRET;
  return {
    query: (name, args) => client.query(makeFunctionReference<"query">(name), { ...args, secret }),
    mutation: (name, args) => client.mutation(makeFunctionReference<"mutation">(name), { ...args, secret }),
    action: (name, args) => client.action(makeFunctionReference<"action">(name), { ...args, secret }),
  };
}

let backend: MoneyBackend | null | undefined;
export function useMoneyBackend(next: MoneyBackend | null) {
  backend = next;
  players.clear();
}

const players = new Map<string, string>();
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const fail = (status: number, error: string, extra: Args = {}) => json({ ok: false, error, ...extra }, status);
const WHY: Record<string, string> = {
  consent: "Set a daily limit in your wallet before you put money in.",
  limit: "That would pass your daily limit.",
  balance: "Not enough in your Nickel balance. Add money in your wallet.",
  amount: "Cash outs start at $1.",
  email: "Add your email to set up cash outs.",
  busy: "Your last cash out is still on its way.",
  transfer: "Whop could not send that cash out. Your money is back in your balance.",
};

function sameSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = [request.headers.get("host"), request.headers.get("x-forwarded-host")];
  if (process.env.NICKEL_BASE_URL) allowed.push(process.env.NICKEL_BASE_URL.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  return allowed.includes(origin.replace(/^https?:\/\//, ""));
}

async function identify(request: Request, session: Session | null, body: Args): Promise<{ key: string; name: string } | null> {
  if (session) {
    const profile = internals.store.profiles[session.token];
    return { key: profile?.phone || "profile:" + session.token, name: session.name };
  }
  if (!process.env.NICKEL_TURN_SECRET || !turnTrusted(request)) return null;
  const phone = String(body.phone ?? new URL(request.url).searchParams.get("phone") ?? "").replace(/[^+0-9]/g, "");
  if (!/^\+?\d{7,15}$/.test(phone)) return null;
  const profile = Object.values(internals.store.profiles).find((p) => p.phone === phone);
  return { key: phone, name: profile?.name || internals.store.names[phone] || "" };
}

async function playerId(api: MoneyBackend, who: { key: string; name: string }): Promise<string> {
  const cached = players.get(who.key);
  if (cached) return cached;
  const id = await api.mutation<string>("payments:ensurePlayer", { phone: who.key, name: who.name });
  players.set(who.key, id);
  return id;
}

async function readBody(request: Request): Promise<Args> {
  if (request.method !== "POST") return {};
  const text = await request.clone().text();
  if (text.length > 2000) return { tooLarge: true };
  try {
    const parsed = JSON.parse(text || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const cents = (raw: unknown) => (typeof raw === "number" && Number.isInteger(raw) ? raw : NaN);

export async function walletRoute(request: Request, session: Session | null, base: string): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const pot = path.match(/^\/api\/pot\/([a-z0-9-]+)$/);
  if (!path.startsWith("/api/wallet") && !(pot && request.method === "POST")) return null;
  const api = backend === undefined ? (backend = convexBackend()) : backend;
  const body = await readBody(request);
  if (pot && body.action !== "pay") return null;
  if (body.tooLarge) return fail(413, "That is too much data.");
  if (request.method === "POST" && session && !sameSite(request)) return fail(403, "Open this from the Nickel link.");
  const who = await identify(request, session, body);
  if (!who) return fail(401, pot ? "Set up your player card to pay from your Nickel balance." : "Open your wallet from your Nickel player card.");
  if (limited("wallet:" + who.key, 30)) return fail(429, "Slow down. Try again in a minute.");
  if (!api) return fail(503, "Money is not set up on this server yet.");
  const me = await playerId(api, who);

  try {
    if (pot) return payPot(api, me, who, pot[1]);
    if (path === "/api/wallet" && request.method === "GET") return json(await api.query("payments:wallet", { playerId: me }));
    if (path === "/api/wallet/token" && request.method === "GET") {
      const token = await api.action<{ token: string; expiresAt: string } | null>("payments:walletToken", { playerId: me });
      return token ? json(token) : fail(404, "Cash out once to set up your Whop account.");
    }
    if (request.method !== "POST") return fail(405, "Not allowed");
    if (path === "/api/wallet/topup") {
      const amountCents = cents(body.amountCents);
      if (!(amountCents >= 100 && amountCents <= 50000)) return fail(400, "Top-ups run from $1 to $500.");
      return json(await api.action("payments:createTopUp", { playerId: me, amountCents, redirectUrl: base + "/wallet.html" }));
    }
    if (path === "/api/wallet/limit") {
      const dailyLimitCents = cents(body.dailyLimitCents);
      if (body.consent !== true) return fail(400, "Agree to the money rules first.");
      if (!(dailyLimitCents >= 0 && dailyLimitCents <= 50000)) return fail(400, "Daily limits run from $0 to $500.");
      return json(await api.mutation("payments:setLimit", { playerId: me, dailyLimitCents, consent: true }));
    }
    if (path === "/api/wallet/cashout") {
      const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : undefined;
      const out = await api.action<{ ok: boolean; url?: string; status?: string; reason?: string }>("payments:cashOut", { playerId: me, amountCents: cents(body.amountCents) || 0, email, returnUrl: base + "/wallet.html" });
      if (out.url) return json({ url: out.url });
      return out.ok ? json({ ok: true, status: out.status }) : fail(out.reason === "transfer" ? 502 : 400, WHY[out.reason ?? ""] ?? "Cash out failed.", { reason: out.reason });
    }
    return fail(404, "Not found");
  } catch (e) {
    console.error("Wallet request failed", path, e);
    return fail(500, "Something went wrong with your wallet. Try again.");
  }
}

async function payPot(api: MoneyBackend, me: string, who: { key: string; name: string }, potId: string): Promise<Response> {
  const pot = getPot(potId);
  if (!pot) return fail(404, "Not found");
  const name = who.name;
  if (!name) return fail(400, "Set your name on your player card first.");
  const groupId = await api.mutation<string>("payments:ensureGroup", { chatId: "league:" + pot.league, name: pot.league, commissionerId: me });
  await api.mutation("payments:joinGroup", { groupId, playerId: me });
  const out = await api.mutation<{ ok: boolean; reason?: string }>("payments:takeStake", { playerId: me, groupId, amountCents: pot.amountCents, roundId: "pot:" + pot.id, key: "pot:" + pot.id + ":" + me });
  if (!out.ok) return fail(402, WHY[out.reason ?? ""] ?? "That did not go through.", { reason: out.reason, pot, wallet: "/wallet.html" });
  const joined = joinPot(pot.id, name, "paid");
  return json({ ok: joined.ok, pot: getPot(pot.id) });
}
