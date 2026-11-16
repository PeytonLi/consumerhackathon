import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface AuthState {
  sessions: Record<string, { token: string; at: number }>;
  claims: Record<string, { hash: string; at: number }>;
}
export interface AuthStore {
  auth?: AuthState;
  profiles: Record<string, { token: string; name: string; phone?: string }>;
}
export interface Session { token: string; name: string }

export const SESSION_COOKIE = "nickel_sid";
const SESSION_MS = 180 * 24 * 60 * 60 * 1000;
const CLAIM_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 60 * 1000;
const LIMITS = { session: 60, ip: 120, claim: 10 };
const SIZES = { result: 4000, pot: 2000, wallet: 2000, fantasy: 2000, claim: 2000, profile: 400000, turn: 64000 };

const local: AuthStore = { profiles: {} };
let source: () => AuthStore = () => local;
let persist: () => void = () => {};

export function attachAuth(get: () => AuthStore, save: () => void) {
  source = get;
  persist = save;
}

const state = () => (source().auth ??= { sessions: {}, claims: {} });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const same = (a: string, b: string) => timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
const cleanName = (raw: unknown) => {
  const clean = (typeof raw === "string" ? raw : "").replace(/[^A-Za-z]/g, "").slice(0, 14);
  return clean ? clean[0].toUpperCase() + clean.slice(1).toLowerCase() : "";
};

export function issueClaim(token: string): string {
  const code = randomBytes(24).toString("hex");
  state().claims[token] = { hash: digest(code), at: Date.now() };
  persist();
  return code;
}

export const claimPath = (token: string) => "/me/" + token + "?k=" + issueClaim(token);

export function claimOpen(token: string, code: string, now = Date.now()): boolean {
  const claim = state().claims[token];
  return !!claim && !!code && now - claim.at < CLAIM_MS && same(claim.hash, digest(code));
}

export function claimProfile(token: string, code: string, now = Date.now()): { ok: true; sid: string } | { ok: false; error: string } {
  if (!source().profiles[token] || !claimOpen(token, code, now)) return { ok: false, error: "This card link was already used or has expired. Text \"Nickel, set me up\" in the group for a fresh one." };
  const auth = state();
  delete auth.claims[token];
  for (const key of Object.keys(auth.sessions)) if (auth.sessions[key].token === token || now - auth.sessions[key].at >= SESSION_MS) delete auth.sessions[key];
  const sid = randomBytes(32).toString("hex");
  auth.sessions[digest(sid)] = { token, at: now };
  persist();
  return { ok: true, sid };
}

export function sessionFor(sid: string, now = Date.now()): Session | null {
  const found = /^[a-f0-9]{64}$/.test(sid) ? state().sessions[digest(sid)] : undefined;
  const profile = found && now - found.at < SESSION_MS ? source().profiles[found.token] : undefined;
  return profile ? { token: profile.token, name: profile.name } : null;
}

export const sessionFromCookie = (cookie: string | null) => sessionFor(cookie?.match(/(?:^|;\s*)nickel_sid=([a-f0-9]{64})/)?.[1] ?? "");

export function endSessions(token: string) {
  const auth = state();
  for (const key of Object.keys(auth.sessions)) if (auth.sessions[key].token === token) delete auth.sessions[key];
  persist();
}

const isClaimed = (token: string, now = Date.now()) => Object.values(state().sessions).some((s) => s.token === token && now - s.at < SESSION_MS);

export function claimStatus(session: Session | null, token: string, code: string | null): "owner" | "open" | "locked" {
  if (session?.token === token) return "owner";
  return claimOpen(token, code ?? "") ? "open" : "locked";
}

export const sessionCookie = (sid: string, secure: boolean) => SESSION_COOKIE + "=" + sid + "; Path=/; Max-Age=" + SESSION_MS / 1000 + "; HttpOnly; SameSite=Lax" + (secure ? "; Secure" : "");

const hits = new Map<string, { n: number; reset: number }>();

export function limited(key: string, max: number, now = Date.now()): boolean {
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  const hit = hits.get(key);
  if (!hit || hit.reset <= now) {
    hits.set(key, { n: 1, reset: now + WINDOW_MS });
    return false;
  }
  hit.n += 1;
  return hit.n > max;
}

export function clientIp(request: Request, socket: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  const behindProxy = !socket || /^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::ffff:(127\.|10\.|192\.168\.)|f[cd])/.test(socket);
  return (behindProxy && forwarded) || socket || "unknown";
}

let warned = false;

export function turnTrusted(request: Request): boolean {
  const secret = process.env.NICKEL_TURN_SECRET;
  if (!secret) {
    if (!warned) console.warn("NICKEL_TURN_SECRET is not set: every /api/turn caller can request a claim link.");
    warned = true;
    return true;
  }
  const given = request.headers.get("x-nickel-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return same(given, secret);
}

const deny = (status: number, error: string, headers: Record<string, string> = {}) => Response.json({ ok: false, error }, { status, headers: { "access-control-allow-origin": "*", ...headers } });

function sameSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = [request.headers.get("host"), request.headers.get("x-forwarded-host")];
  if (process.env.NICKEL_BASE_URL) allowed.push(process.env.NICKEL_BASE_URL.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  return allowed.includes(origin.replace(/^https?:\/\//, ""));
}

export async function authGate(request: Request, socket = ""): Promise<{ request: Request; session: Session | null } | Response> {
  const session = sessionFromCookie(request.headers.get("cookie"));
  if (request.method !== "POST") return { request, session };
  const path = new URL(request.url).pathname;
  const profileEdit = path.match(/^\/api\/me\/([a-z0-9-]+)$/);
  const route = path === "/api/claim" ? "claim" : path === "/api/turn" ? "turn" : /^\/api\/rounds\/[a-z0-9-]+\/result$/.test(path) ? "result" : /^\/api\/pot\/[a-z0-9-]+$/.test(path) ? "pot" : path === "/api/wallet" ? "wallet" : /^\/api\/fantasy\/[a-z0-9-]+\/(draft|score)$/.test(path) ? "fantasy" : profileEdit ? "profile" : "";
  if (!route) return { request, session };

  if (Number(request.headers.get("content-length") ?? 0) > SIZES[route]) return deny(413, "That is too much data.");
  const text = await request.text();
  if (text.length > SIZES[route]) return deny(413, "That is too much data.");
  const forward = (body: string) => new Request(request.url, { method: "POST", headers: { "content-type": "application/json", cookie: request.headers.get("cookie") ?? "", host: request.headers.get("host") ?? "", "x-nickel-secret": request.headers.get("x-nickel-secret") ?? "", authorization: request.headers.get("authorization") ?? "" }, body });
  if (route === "turn") return { request: forward(text), session };

  if (!sameSite(request)) return deny(403, "Open this from the Nickel link.");
  const ip = clientIp(request, socket);
  const cookieId = request.headers.get("cookie")?.match(/(?:^|;\s*)nickel_sid=([a-f0-9]{64})/)?.[1];
  if (limited("ip:" + ip, LIMITS.ip) || (session && cookieId && limited("sid:" + digest(cookieId), LIMITS.session))) return deny(429, "Slow down. Try again in a minute.", { "retry-after": "60" });

  let parsed: unknown = null;
  try { parsed = JSON.parse(text || "{}"); } catch {}
  const body: Record<string, unknown> = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};

  if (route === "claim") {
    if (limited("claim:" + ip, LIMITS.claim)) return deny(429, "Slow down. Try again in a minute.", { "retry-after": "60" });
    const claimed = claimProfile(String(body.token ?? ""), String(body.code ?? ""));
    if (!claimed.ok) return deny(403, claimed.error);
    const headers = new Headers({ "access-control-allow-origin": "*" });
    headers.append("set-cookie", sessionCookie(claimed.sid, !/^(localhost|127\.0\.0\.1)(:|$)/.test(request.headers.get("host") ?? "")));
    headers.append("set-cookie", "nickel_me=; Path=/; Max-Age=0; SameSite=Lax");
    return Response.json({ ok: true }, { headers });
  }

  const profiles = Object.values(source().profiles);
  if (profileEdit) {
    if (session?.token !== profileEdit[1]) return deny(403, "This card is set up on another phone. Text \"Nickel, set me up\" in the group for a fresh link.");
    const wanted = cleanName(body.name);
    if (wanted && profiles.some((p) => p.token !== session.token && p.name === wanted && (p.phone || isClaimed(p.token)))) return deny(409, wanted + " already has a player card. Pick another name.");
    return { request: forward(JSON.stringify(body)), session };
  }

  const field = route === "result" ? "name" : "member";
  const given = cleanName(body[field]);
  const actor = session?.name ?? "";
  if (actor && given && given !== actor) return deny(403, "This phone plays as " + actor + ".");
  if (!actor && given && profiles.some((p) => p.name === given && isClaimed(p.token))) return deny(403, given + " has a player card on another phone. Pick your own name, or text \"Nickel, set me up\" for your card.");
  if (actor) body[field] = actor;
  if (route === "result") body.verified = !!actor;
  return { request: forward(JSON.stringify(body)), session };
}
