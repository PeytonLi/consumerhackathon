import { Effect, Schema } from "effect";
import { defineTool, type ToolContext } from "@onkeiki/agents";
import { MoneyApiError, moneyClient, secureBase, type MoneyClient, type MoneyPage } from "./money-client.js";

type Caller = { direct: boolean; phone: string | null; chatId?: string };
type Fail = { ok: false; error: string };
type Api = MoneyClient & { base: string };

const env = (name: string) => (typeof process !== "undefined" ? process.env?.[name] : undefined);
const phoneLike = (raw?: string): raw is string => !!raw && /^\+?[0-9][0-9 ().-]{6,20}$/.test(raw.trim());
const fail = (error: string): Fail => ({ ok: false, error });

export const dollars = (cents: number) => (cents < 100 ? cents + "\u00a2" : "$" + (cents / 100).toFixed(2));

export function caller(ctx: ToolContext): Caller {
  const direct = ctx.channel?.isDirect === true;
  const source = [ctx.channel?.userId, ctx.phone].find(phoneLike);
  const room = ctx.channel?.channelId ?? ctx.channel?.conversationId ?? (phoneLike(ctx.phone) ? undefined : ctx.phone || undefined);
  return { direct, phone: source ? source.replace(/[^+0-9]/g, "") : null, ...(!direct && room && { chatId: room }) };
}

function money<I, O>(run: (input: I, who: Caller & { phone: string }, api: Api, ctx: ToolContext) => Promise<O>, groupLine?: string) {
  return (input: I, ctx: ToolContext) =>
    Effect.all([ctx.secrets.get("NICKEL_BASE_URL"), ctx.secrets.get("NICKEL_TURN_SECRET")]).pipe(
      Effect.flatMap(([base, secret]) =>
        Effect.promise(async (): Promise<O | Fail | { ok: true; privateOnly: true; line: string }> => {
          const who = caller(ctx);
          if (!who.direct && groupLine) return { ok: true, privateOnly: true, line: groupLine };
          if (!who.phone) return fail("I can't tell who you are here. Text me directly.");
          try {
            const baseUrl = base ?? env("NICKEL_BASE_URL") ?? "";
            const api = { ...moneyClient({ baseUrl, secret: secret ?? env("NICKEL_TURN_SECRET") ?? "" }), base: secureBase(baseUrl) };
            return await run(input, { ...who, phone: who.phone }, api, ctx);
          } catch (e) {
            return fail(e instanceof MoneyApiError ? e.message : "Nickel could not do that right now.");
          }
        })
      )
    );
}

const PATHS: Record<MoneyPage, string> = { wallet: "/w", cashout: "/w", chest: "/chest", heist: "/heist" };

async function pageCard(api: Api, who: Caller & { phone: string }, ctx: ToolContext, page: MoneyPage, card: { line: string; caption: string; subcaption?: string; amountCents?: number }) {
  const { url } = await api.link({ phone: who.phone, page, ...(card.amountCents !== undefined && { amountCents: card.amountCents }) });
  const parsed = new URL(url, api.base);
  if (parsed.origin !== new URL(api.base).origin || parsed.pathname !== PATHS[page]) return fail("Nickel sent back a link I can't share.");
  const link = parsed.toString();
  if (!who.direct || !link.startsWith("https://")) return { ok: true as const, line: card.line, url: link };
  const intent = ctx.channel?.messageId ?? new Date().toISOString().slice(0, 16);
  return {
    ok: true as const,
    line: card.line,
    url: link,
    presentation: {
      type: "app" as const,
      id: ("nickel-" + page + "-" + intent).replace(/[^a-z0-9-]+/gi, "-").slice(0, 128),
      url: link,
      live: false,
      caption: card.caption,
      ...(card.subcaption && { subcaption: card.subcaption }),
    },
  };
}

const toCents = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) : NaN);

export const addMoneyTool = defineTool({
  name: "add_money",
  description: "Add money to the caller's own Nickel balance. Returns the wallet page: a card in a direct chat, a plain link in a group. The minimum is $1. Never pass a phone or name; Nickel knows who is asking.",
  input: Schema.Struct({ amountDollars: Schema.optional(Schema.Number) }),
  execute: money(async (input, who, api, ctx) => {
    const amountCents = input.amountDollars === undefined ? undefined : toCents(input.amountDollars);
    if (amountCents !== undefined && !(amountCents >= 100)) return fail("The minimum is $1.");
    return pageCard(api, who, ctx, "wallet", { line: amountCents ? "Add " + dollars(amountCents) + " here." : "Add money here.", caption: "Add money", subcaption: amountCents ? dollars(amountCents) : undefined, amountCents });
  }),
});

export const balanceTool = defineTool({
  name: "balance",
  description: "The caller's own Nickel cash balance. In a direct chat it returns the numbers. In a group it texts them privately and returns privateOnly: say only the returned line.",
  input: Schema.Struct({}),
  execute: money(async (_input, who, api) => {
    if (!who.direct) {
      const sent = await api.balance({ phone: who.phone, deliver: "dm" });
      const notified = "notified" in sent && sent.notified;
      return { ok: true, privateOnly: true, sentPrivately: notified, line: notified ? "I texted you your balance." : "Text me directly and I'll tell you your balance." };
    }
    const wallet = await api.balance({ phone: who.phone });
    if (!("balanceCents" in wallet)) return fail("Nickel could not read your balance right now.");
    return { ok: true, balanceCents: wallet.balanceCents, dailyLimitCents: wallet.dailyLimitCents, spentTodayCents: wallet.spentTodayCents, line: "You have " + dollars(wallet.balanceCents) + "." };
  }),
});

export const cashOutTool = defineTool({
  name: "cash_out",
  description: "Cash out the caller's own balance. Direct chat only: returns the wallet card. In a group it returns privateOnly and a line asking them to text Nickel directly.",
  input: Schema.Struct({}),
  execute: money((_input, who, api, ctx) => pageCard(api, who, ctx, "cashout", { line: "Cash out here.", caption: "Cash out", subcaption: "ID check, then your bank" }), "Text me directly to cash out."),
});

export const openChestTool = defineTool({
  name: "open_chest",
  description: "Open today's free daily chest. Returns the chest page: a card in a direct chat, a link in a group. Never say what is inside; the page shows it.",
  input: Schema.Struct({}),
  execute: money((_input, who, api, ctx) => pageCard(api, who, ctx, "chest", { line: "Your chest is ready.", caption: "Daily chest", subcaption: "Free, once a day" })),
});

export const heistTool = defineTool({
  name: "heist",
  description: "Open the heist: stop the clock at 5.000 seconds to take loose Nickels. Returns the heist page: a card in a direct chat, a link in a group.",
  input: Schema.Struct({}),
  execute: money((_input, who, api, ctx) => pageCard(api, who, ctx, "heist", { line: "Stop the clock at 5.000.", caption: "Heist", subcaption: "Stop the clock at 5.000s" })),
});

export const proposeAdjustmentTool = defineTool({
  name: "propose_adjustment",
  description: "Commissioner only: propose taking money from a player's balance into the group pot, for example missed dues. Nickel checks the caller is the commissioner. Nothing moves until that player approves it with Face ID in their direct chat.",
  input: Schema.Struct({ player: Schema.String, amountDollars: Schema.Number, reason: Schema.String }),
  execute: money(async (input, who, api) => {
    const amountCents = toCents(input.amountDollars);
    const reason = input.reason.trim();
    if (!(amountCents >= 1)) return fail("Give an amount above zero.");
    if (!reason) return fail("Give a reason.");
    const made = await api.proposeAdjustment({ phone: who.phone, ...(who.chatId && { chatId: who.chatId }), player: input.player.trim(), amountCents, reason });
    return { ok: true, adjustmentId: made.id, line: made.notified ? "Sent to " + made.player + " to approve " + dollars(made.amountCents) + "." : made.player + " needs to text me to approve " + dollars(made.amountCents) + "." };
  }),
});

export const approveAdjustmentTool = defineTool({
  name: "approve_adjustment",
  description: "Call only on a [NICKEL_ADJUSTMENT] notice, in the debited player's direct chat, with exactly the fields the notice gives. Keiki asks them to approve with Face ID; the money moves only if they approve.",
  input: Schema.Struct({ adjustmentId: Schema.String, amount: Schema.String, reason: Schema.String, from: Schema.String }),
  policy: {
    approval: "ask",
    approvalProof: "verified",
    card: {
      v: 1,
      blocks: [
        { kind: "header", title: "Approve adjustment", subtitle: "$.from" },
        { kind: "fields", fields: [{ label: "Amount", value: "$.amount" }, { label: "Reason", value: "$.reason" }] },
        { kind: "divider" },
        { kind: "note", text: "Moves from your Nickel balance into the group pot." },
      ],
      theme: { accent: "#FF5B2E", approveLabel: "Approve", declineLabel: "Decline" },
    },
  },
  execute: money(async (input, who, api) => {
    if (!who.direct) return fail("Approve this in your direct chat with Nickel.");
    const match = input.amount.trim().match(/^\$?(\d+)(?:\.(\d{1,2}))?$/);
    if (!match) return fail("That amount does not match the request.");
    const amountCents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
    const done = await api.approveAdjustment(input.adjustmentId, { phone: who.phone, amountCents, reason: input.reason });
    return { ok: true, balanceCents: done.balanceCents, line: "Done. You have " + dollars(done.balanceCents) + "." };
  }),
});

export const removePlayerTool = defineTool({
  name: "remove_player",
  description: "Commissioner only: remove a player from the group. Nickel checks the caller is the commissioner, closes the player's seat, and returns their pot share. Needs the commissioner's Face ID, so it only runs in their direct chat.",
  input: Schema.Struct({ player: Schema.String }),
  policy: {
    approval: "ask",
    approvalProof: "verified",
    card: {
      v: 1,
      blocks: [
        { kind: "header", title: "Remove player", subtitle: "$.player" },
        { kind: "note", text: "Their share of the pot goes back to them. This can't be undone." },
      ],
      theme: { accent: "#FF5B2E", approveLabel: "Remove", declineLabel: "Keep" },
    },
  },
  execute: money(async (input, who, api) => {
    const out = await api.removePlayer({ phone: who.phone, ...(who.chatId && { chatId: who.chatId }), player: input.player.trim() });
    return { ok: true, line: out.player + " is out." + (out.refundedCents > 0 ? " " + dollars(out.refundedCents) + " goes back to them." : "") };
  }),
});

export const moneyTools = [addMoneyTool, balanceTool, cashOutTool, openChestTool, heistTool, proposeAdjustmentTool, approveAdjustmentTool, removePlayerTool];
