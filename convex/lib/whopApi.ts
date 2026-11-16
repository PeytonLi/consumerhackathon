export type Kyc = "none" | "pending" | "verified";

export interface WhopApi {
  createCheckout(input: { amountCents: number; metadata: Record<string, string | number>; redirectUrl?: string }): Promise<{ id: string; purchaseUrl: string }>;
  createAccount(input: { email: string; externalId: string; title: string }): Promise<{ id: string }>;
  getAccount(id: string): Promise<{ id: string; kyc: Kyc }>;
  accountLink(input: { accountId: string; useCase: "account_onboarding" | "payouts_portal"; returnUrl: string }): Promise<{ url: string }>;
  createTransfer(input: { destinationId: string; amountCents: number; idempotenceKey: string; metadata: Record<string, string> }): Promise<{ id: string; status: "processing" | "succeeded" | "failed" }>;
  suspendAccount(id: string): Promise<void>;
  accessToken(accountId: string): Promise<{ token: string; expiresAt: string }>;
}

export class WhopError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export const definiteFailure = (e: unknown) => e instanceof WhopError && e.status >= 400 && e.status < 500 && ![408, 409, 429].includes(e.status);

export function kycOf(verification: unknown): Kyc {
  const status = (verification as { individual?: { status?: string } | null } | null | undefined)?.individual?.status;
  return status === "approved" ? "verified" : status ? "pending" : "none";
}

export function whopConfig() {
  const env = process.env.WHOP_ENV === "production" ? "production" : "sandbox";
  return {
    env,
    base: env === "production" ? "https://api.whop.com/api/v1" : "https://sandbox-api.whop.com/api/v1",
    apiKey: process.env.WHOP_API_KEY ?? "",
    accountId: process.env.WHOP_ACCOUNT_ID ?? "",
    version: process.env.WHOP_API_VERSION ?? "2026-11-13-1",
  };
}

async function call<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const config = whopConfig();
  if (!config.apiKey || !config.accountId) throw new Error("Whop is not configured: set WHOP_API_KEY and WHOP_ACCOUNT_ID");
  const headers: Record<string, string> = { authorization: "Bearer " + config.apiKey, "api-version-date": config.version, "content-type": "application/json" };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const res = await fetch(config.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new WhopError(res.status, "Whop " + method + " " + path + " failed with " + res.status + ": " + text.slice(0, 300));
  return (text ? JSON.parse(text) : {}) as T;
}

export const httpWhop: WhopApi = {
  async createCheckout({ amountCents, metadata, redirectUrl }) {
    const out = await call<{ id: string; purchase_url: string | null }>("POST", "/checkout_configurations", {
      account_id: whopConfig().accountId,
      mode: "payment",
      metadata,
      redirect_url: redirectUrl,
      variant: { initial_price: amountCents / 100, currency: "usd", billing_type: "one_time", title: "Nickel balance top-up" },
    });
    return { id: out.id, purchaseUrl: out.purchase_url ?? "https://whop.com/checkout/" + out.id + "/" };
  },
  async createAccount({ email, externalId, title }) {
    const out = await call<{ id: string }>("POST", "/accounts", { email, external_id: externalId, title, metadata: { playerId: externalId } });
    return { id: out.id };
  },
  async getAccount(id) {
    const out = await call<{ id: string; verification?: unknown }>("GET", "/accounts/" + encodeURIComponent(id));
    return { id: out.id, kyc: kycOf(out.verification) };
  },
  async accountLink({ accountId, useCase, returnUrl }) {
    return call<{ url: string }>("POST", "/account_links", { account_id: accountId, use_case: useCase, return_url: returnUrl, refresh_url: returnUrl });
  },
  async createTransfer({ destinationId, amountCents, idempotenceKey, metadata }) {
    const out = await call<{ id: string; status: "processing" | "succeeded" | "failed" }>(
      "POST",
      "/transfers",
      { type: "balance", origin_id: whopConfig().accountId, destination_id: destinationId, amount: amountCents / 100, currency: "usd", idempotence_key: idempotenceKey, metadata, notes: "Nickel cash out" },
      idempotenceKey
    );
    return { id: out.id, status: out.status };
  },
  async suspendAccount(id) {
    await call("POST", "/accounts/" + encodeURIComponent(id) + "/suspend");
  },
  async accessToken(accountId) {
    const out = await call<{ token: string; expires_at: string }>("POST", "/access_tokens", { account_id: accountId });
    return { token: out.token, expiresAt: out.expires_at };
  },
};

let active: WhopApi = httpWhop;
export const whop = () => active;
export function useWhop(api: WhopApi) {
  active = api;
}

const encoder = new TextEncoder();

export async function signWhopWebhook(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(id + "." + timestamp + "." + body)));
  let binary = "";
  for (const byte of mac) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function verifyWhopWebhook(body: string, headers: Headers, secret: string | undefined, now = Date.now()): Promise<boolean> {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signature = headers.get("webhook-signature");
  if (!secret || !id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = await signWhopWebhook(secret, id, timestamp, body);
  return signature.split(" ").some((part) => {
    const [version, given] = part.split(",");
    if (version !== "v1" || !given || given.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}
