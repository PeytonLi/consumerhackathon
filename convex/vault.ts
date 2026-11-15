import type {
  ToolAppPresentation,
  VaultNotificationContent,
  VaultNotificationRequest,
} from "@onkeiki/agents";
import { createCloudClient } from "@onkeiki/agents/cloud";

export interface VaultCard {
  v: 1;
  blocks: Array<
    | { kind: "header"; title: string; subtitle?: string }
    | { kind: "fields"; fields: Array<{ label: string; value: string }> }
    | { kind: "text"; text: string }
    | { kind: "image"; url: string; alt?: string }
    | { kind: "note"; text: string }
    | { kind: "divider" }
  >;
  theme?: {
    accent?: string;
    logoUrl?: string;
    logoDarkUrl?: string;
    approveLabel?: string;
    declineLabel?: string;
  };
}

/**
 * Builds the `presentation: { type: "app" }` payload that opens our HTTPS
 * web app directly inside the Keiki Vault iMessage extension (`com.keiki.vault.messages`).
 */
export function buildVaultPresentationCard(params: {
  intentId: string;
  baseUrl: string;
  leagueCode: string;
  roundId?: string;
  userHandle?: string;
  tab?: "arena" | "wagers" | "league" | "wrapped";
  caption: string;
  subcaption: string;
}): {
  status: "ready";
  url: string;
  presentation: ToolAppPresentation;
} {
  const cleanBase = params.baseUrl.replace(/\/+$/, "");
  const query = new URLSearchParams({
    league: params.leagueCode,
    surface: "keiki_vault",
    ...(params.roundId ? { round: params.roundId } : {}),
    ...(params.userHandle ? { u: params.userHandle } : {}),
    ...(params.tab ? { tab: params.tab } : {}),
  });
  const url = `${cleanBase}/?${query.toString()}`;

  return {
    status: "ready",
    url,
    presentation: {
      type: "app",
      id: params.intentId.slice(0, 128),
      url,
      live: true,
      caption: params.caption.slice(0, 60),
      subcaption: params.subcaption.slice(0, 80),
    },
  };
}

/**
 * Builds a native Keiki Vault Face ID Approval Card (`v: 1, blocks: [...]`),
 * unlocked by the iPhone Secure Enclave P-256 key, for approving a Whop Buy-In,
 * a high-stakes 1v1 Nickel Challenge, or a Season Finale Pot Payout.
 */
export function buildVaultFaceIdApprovalCard(params: {
  kind: "whop_buy_in" | "high_stakes_duel" | "season_payout";
  leagueName: string;
  actorName: string;
  amountDisplay: string;
  rewardMode: "points_only" | "cash_only" | "hybrid";
  details: Array<{ label: string; value: string }>;
  noteText: string;
  approveLabel: string;
  declineLabel?: string;
}): VaultCard {
  const titleMap = {
    whop_buy_in: `Join ${params.leagueName} Pot (${params.amountDisplay})`,
    high_stakes_duel: `Accept 1v1 Duel (${params.amountDisplay})`,
    season_payout: `Approve Season Payout (${params.amountDisplay})`,
  };

  return {
    v: 1,
    blocks: [
      {
        kind: "header",
        title: titleMap[params.kind],
        subtitle: `${params.actorName} · Mode: ${params.rewardMode.toUpperCase()}`,
      },
      {
        kind: "fields",
        fields: params.details,
      },
      { kind: "divider" },
      {
        kind: "note",
        text: params.noteText,
      },
    ],
    theme: {
      accent: "#10B981",
      approveLabel: params.approveLabel,
      declineLabel: params.declineLabel ?? "Decline",
    },
  };
}

/**
 * Builds & optionally dispatches a Keiki Vault iOS Lock Screen / Dynamic Island
 * Live Activity (`cloud.vault.activity.start` / `update` / `end`).
 */
export async function syncVaultLiveActivity(params: {
  agentId?: string;
  apiKey?: string;
  recipientPhone: string;
  logicalId: string;
  title: string;
  body: string;
  revision: number;
  phase: VaultNotificationContent["phase"];
  progress: number;
}): Promise<{
  payload: VaultNotificationRequest;
  dispatched: boolean;
}> {
  const expiresAt = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
  const payload: VaultNotificationRequest = {
    agentId: params.agentId ?? "agent_nickel_demo",
    recipient: params.recipientPhone,
    id: params.logicalId,
    title: params.title.slice(0, 120),
    body: params.body.slice(0, 500),
    revision: params.revision,
    phase: params.phase,
    progress: Math.max(0, Math.min(1, params.progress)),
    expiresAt,
  };

  if (params.apiKey && params.agentId) {
    try {
      const cloud = createCloudClient({ apiKey: params.apiKey });
      if (params.revision <= 1) {
        await cloud.vault.activity.start(payload);
      } else if (params.phase === "completed" || params.phase === "cancelled") {
        await cloud.vault.activity.end(payload);
      } else {
        await cloud.vault.activity.update(payload);
      }
      return { payload, dispatched: true };
    } catch {
      return { payload, dispatched: false };
    }
  }

  return { payload, dispatched: false };
}
