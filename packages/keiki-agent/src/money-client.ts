export type MoneyPage = "wallet" | "cashout" | "chest" | "heist";

export type LinkRequest = { phone: string; page: MoneyPage; amountCents?: number };
export type LinkResponse = { url: string };

export type BalanceRequest = { phone: string; deliver?: "dm" };
export type WalletSummary = { balanceCents: number; dailyLimitCents: number; spentTodayCents: number };
export type BalanceResponse = WalletSummary | { notified: boolean };

export type ProposeAdjustmentRequest = { phone: string; chatId?: string; player: string; amountCents: number; reason: string };
export type ProposeAdjustmentResponse = { id: string; player: string; amountCents: number; reason: string; notified: boolean };

export type ApproveAdjustmentRequest = { phone: string; amountCents: number; reason: string };
export type ApproveAdjustmentResponse = { ok: true; balanceCents: number };

export type RemovePlayerRequest = { phone: string; chatId?: string; player: string };
export type RemovePlayerResponse = { ok: true; player: string; refundedCents: number };

export class MoneyApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function secureBase(raw: string): string {
  const base = raw.replace(/\/+$/, "");
  if (!/^https:\/\/[^/]/.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new MoneyApiError(500, "Nickel's server address must be https.");
  return base;
}

export function moneyClient(options: { baseUrl: string; secret: string; fetch?: typeof fetch }) {
  const base = secureBase(options.baseUrl);
  if (!options.secret) throw new MoneyApiError(500, "Nickel's server secret is not set.");
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    const res = await (options.fetch ?? fetch)(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-nickel-secret": options.secret },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
    if (!res.ok) throw new MoneyApiError(res.status, typeof data?.error === "string" ? data.error : "Nickel could not do that right now.");
    return data as T;
  };
  return {
    link: (body: LinkRequest) => post<LinkResponse>("/api/agent/link", body),
    balance: (body: BalanceRequest) => post<BalanceResponse>("/api/agent/balance", body),
    proposeAdjustment: (body: ProposeAdjustmentRequest) => post<ProposeAdjustmentResponse>("/api/agent/adjustments", body),
    approveAdjustment: (id: string, body: ApproveAdjustmentRequest) => post<ApproveAdjustmentResponse>("/api/agent/adjustments/" + encodeURIComponent(id) + "/approve", body),
    removePlayer: (body: RemovePlayerRequest) => post<RemovePlayerResponse>("/api/agent/players/remove", body),
  };
}

export type MoneyClient = ReturnType<typeof moneyClient>;
