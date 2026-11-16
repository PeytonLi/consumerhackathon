import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { verifyWhopWebhook } from "./lib/whopApi.js";
import {
  buildVaultFaceIdApprovalCard,
  buildVaultPresentationCard,
} from "./vault.js";

const http = httpRouter();

http.route({
  path: "/keiki/tools/open_vault_card",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    const body = (await request.json().catch(() => ({}))) as {
      args?: {
        leagueCode?: string;
        gameType?: string;
        tab?: "arena" | "wagers" | "league" | "wrapped";
      };
      context?: {
        phone?: string;
        user?: { name?: string };
      };
    };

    const leagueCode = (body.args?.leagueCode ?? "KRILL5").toUpperCase();
    const gameType = body.args?.gameType ?? "krillion";
    const userHandle =
      body.context?.user?.name?.toLowerCase().replace(/[^a-z0-9]/g, "") ??
      "sritej";
    const origin = new URL(request.url).origin;

    const payload = buildVaultPresentationCard({
      intentId: `vault-${leagueCode}-${gameType}-${Date.now()}`,
      baseUrl: origin,
      leagueCode,
      userHandle,
      tab: body.args?.tab ?? "arena",
      caption: `Nickel · ${gameType.toUpperCase()} (25s)`,
      subcaption: "Keiki Vault Webview · Play & Unblur Chat",
    });

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/keiki/tools/preview_vault_approval",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    const body = (await request.json().catch(() => ({}))) as {
      args?: {
        kind?: "whop_buy_in" | "high_stakes_duel" | "season_payout";
        leagueName?: string;
        actorName?: string;
        amountDisplay?: string;
        rewardMode?: "points_only" | "cash_only" | "hybrid";
      };
    };

    const card = buildVaultFaceIdApprovalCard({
      kind: body.args?.kind ?? "whop_buy_in",
      leagueName: body.args?.leagueName ?? "Cupertino Day Ones",
      actorName: body.args?.actorName ?? "Sritej",
      amountDisplay: body.args?.amountDisplay ?? "$5.00 + 5 Nickels",
      rewardMode: body.args?.rewardMode ?? "hybrid",
      details: [
        { label: "Surface", value: "Keiki Vault (com.keiki.vault)" },
        { label: "Settlement", value: "Bi-Weekly via Whop + Convex" },
      ],
      noteText:
        "Signed via **Keiki Vault Face ID** (P-256 Secure Enclave key).",
      approveLabel: "Approve with Face ID",
    });

    return new Response(JSON.stringify({ card }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/whop/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    if (!(await verifyWhopWebhook(body, request.headers, process.env.WHOP_WEBHOOK_SECRET))) return new Response("Invalid signature", { status: 401 });
    let eventId = request.headers.get("webhook-id") ?? "";
    try {
      eventId = String((JSON.parse(body) as { id?: unknown }).id ?? eventId);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    const out = await ctx.runMutation(internal.payments.handleWhopEvent, { eventId, payload: body });
    return Response.json(out);
  }),
});

export default http;
