import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { limited } from "./auth.js";

type Kind = "query" | "mutation";
export interface Backend { run(kind: Kind, name: string, args: Record<string, unknown>): Promise<any> }

export function convexBackend(url: string): Backend {
  const client = new ConvexHttpClient(url);
  return { run: (kind, name, args) => (kind === "query" ? client.query(makeFunctionReference<"query">(name), args) : client.mutation(makeFunctionReference<"mutation">(name), args)) };
}

let backend: Backend | null = process.env.CONVEX_URL ? convexBackend(process.env.CONVEX_URL) : null;
export const useBackend = (next: Backend | null) => void (backend = next);

const call = (kind: Kind, name: string, args: Record<string, unknown>) => {
  if (!backend) throw new Error("The Nickel economy is offline");
  return backend.run(kind, "economy:" + name, { ...args, secret: process.env.NICKEL_SYNC_SECRET });
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } });
const reason = (e: unknown) => {
  const text = String(e instanceof Error ? e.message : e);
  return (text.match(/Uncaught Error: ([^\n]+)/)?.[1] ?? text.split("\n")[0]).trim() || "Something went wrong";
};
const digest = (s: string) => createHash("sha256").update(s).digest();

function trustedPhone(request: Request, body: Record<string, unknown>, url: URL): string | null {
  const secret = process.env.NICKEL_TURN_SECRET;
  const given = request.headers.get("x-nickel-secret") ?? "";
  if (!secret || !given || !timingSafeEqual(digest(given), digest(secret))) return null;
  const phone = String(body.phone ?? url.searchParams.get("phone") ?? "").replace(/[^+0-9]/g, "");
  return phone || null;
}

export async function economyRoute(request: Request, sessionPhone: string | null | undefined): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!/^\/api\/(chest|heist)(\/|$)/.test(path)) return null;
  const post = request.method === "POST";
  const body = post ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {};
  const phone = trustedPhone(request, body && typeof body === "object" ? body : {}, url) ?? sessionPhone ?? null;
  if (!phone) return json({ ok: false, error: "Open this from your Nickel link." }, 401);
  if (post && limited("economy:" + phone, 30)) return json({ ok: false, error: "Slow down. Try again in a minute." }, 429);
  const heist = path.match(/^\/api\/heist\/([A-Za-z0-9_-]+)\/(start|attempt|peek)$/);
  try {
    if (path === "/api/chest" && !post) return json(await call("query", "chest", { phone }));
    if (path === "/api/chest/open" && post) {
      const opened = await call("mutation", "chestOpen", { phone });
      return json({ result: opened.result, line: opened.line });
    }
    if (path === "/api/chest/skip" && post) return json(await call("mutation", "chestSkip", { phone }));
    if (path === "/api/heist" && !post) {
      const state = await call("query", "heists", { phone });
      return json({ ...state, loose: state.loose.map((l: { peek: boolean; ghostMs: number | null }) => ({ ...l, ghostMs: l.peek ? l.ghostMs : null })) });
    }
    if (heist && post && heist[2] === "peek") return json(await call("mutation", "heistPeek", { phone, stakeId: heist[1] }));
    if (heist && post && heist[2] === "start") return json(await call("mutation", "heistStart", { phone, stakeId: heist[1] }));
    if (heist && post) {
      const ms = typeof body.ms === "number" && Number.isFinite(body.ms) ? body.ms : undefined;
      return json(await call("mutation", "heistAttempt", { phone, stakeId: heist[1], ...(ms === undefined ? {} : { ms }) }));
    }
  } catch (e) {
    return json({ ok: false, error: reason(e) }, backend ? 409 : 503);
  }
  return json({ ok: false, error: "Not found" }, 404);
}

async function hook<T>(kind: Kind, name: string, args: Record<string, unknown>): Promise<T | null> {
  if (!backend) return null;
  try {
    return (await call(kind, name, args)) as T;
  } catch (e) {
    console.error("Economy " + name + " failed", e);
    return null;
  }
}

export const onRoundOpened = (group: string, roundId: string, members?: string[]) => hook<{ placed: { name: string; cents: number }[] } | null>("mutation", "roundOpened", { chatId: group, roundId, members });
export const onPlayed = (group: string, roundId: string, player: string, score: number) => hook<{ kept: boolean; nickels: number; cents: number } | null>("mutation", "played", { chatId: group, roundId, phone: player, score: Number.isFinite(score) ? score : 0 });
export const onRoundClosed = (group: string, roundId: string) => hook<{ loose: string[]; locked: string[]; heistEndsAt: number | null } | null>("mutation", "roundClosed", { chatId: group, roundId });
export const onHeadToHead = (group: string, winner: string, loser: string) => hook<{ nickels: number; cents: number } | null>("mutation", "headToHead", { chatId: group, winnerPhone: winner, loserPhone: loser });
export const chestFeed = (group: string) => hook<string[]>("query", "chestFeed", { chatId: group });
export const seasonStats = (group: string) => hook<{ name: string; steals: number; timesRobbed: number; chestsOpened: number; nickels: number }[]>("query", "seasonStats", { chatId: group });
