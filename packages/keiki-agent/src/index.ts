import { Effect, Schema } from "effect";
import { AgentKit, defineTool } from "@onkeiki/agents";
import { buildCardReply } from "../../../server/card.js";
import { moneyTools } from "./money-tools.js";
import { NICKEL_CONVERSATION_RULES } from "./conversation.js";

const baseUrl = () =>
  (typeof process !== "undefined" ? process.env?.NICKEL_BASE_URL : undefined) ?? "http://localhost:5173";

export const sendNickelCardTool = defineTool({
  name: "send_nickel_card",
  description:
    "Get the Nickel card for a requested game, challenge, league, standings or player setup. Not for ordinary conversation. Pass their message as request. Returns a short line, a url, and a Keiki Vault presentation. In a direct chat Keiki sends the presentation as a card that opens the game inside Messages. In a group Keiki can't send cards, so the url goes out as a link instead.",
  input: Schema.Struct({
    request: Schema.String,
    opponent: Schema.optional(Schema.String),
    leagueCode: Schema.optional(Schema.String),
  }),
  execute: (input, ctx) => {
    const name = ctx.user?.metadata?.name;
    const reply = buildCardReply({
      text: input.request,
      baseUrl: baseUrl(),
      leagueCode: input.leagueCode,
      opponent: input.opponent,
      handle: typeof name === "string" ? name.toLowerCase().replace(/[^a-z0-9]/g, "") : undefined,
    });
    return Effect.succeed({
      line: reply.line,
      url: reply.url,
      cardTitle: reply.title,
      isGroup: ctx.channel?.isDirect === false,
      delivery: "If presentationDelivery.state is accepted, the Vault card is already in the chat: send only the line. Otherwise send the line, then the url alone as its own message so it renders as a link card.",
      ...(reply.url.startsWith("https://") && {
        presentation: {
          type: "app" as const,
          id: ("nickel-" + new Date().toISOString().slice(0, 10) + new URL(reply.url).pathname.replace(/[^a-z0-9]+/gi, "-") + new URL(reply.url).search.replace(/[^a-z0-9]+/gi, "-")).slice(0, 128),
          url: reply.url,
          caption: reply.title.slice(0, 60),
          subcaption: "Tap to play",
        },
      }),
    });
  },
});

export const switchRewardModeTool = defineTool({
  name: "switch_reward_mode",
  description: "Switch what the league plays for: points_only, cash_only (Whop pot), or hybrid (both).",
  input: Schema.Struct({
    rewardMode: Schema.Literal("points_only", "cash_only", "hybrid"),
    customRewardLabel: Schema.optional(Schema.String),
  }),
  execute: (input) =>
    Effect.succeed({
      switched: true,
      rewardMode: input.rewardMode,
      customRewardLabel: input.customRewardLabel ?? "Last place buys dinner",
    }),
});

export const approveStakeTool = defineTool({
  name: "approve_stake",
  description: "Ask a member to approve a cash buy-in or a high-stakes duel with Face ID before it is recorded.",
  input: Schema.Struct({
    leagueName: Schema.String,
    opponentOrPotLabel: Schema.String,
    amountDisplay: Schema.String,
  }),
  policy: {
    approval: "ask",
    approvalProof: "verified",
    approvalFallback: "tool",
    card: {
      v: 1,
      blocks: [
        { kind: "header", title: "Approve Nickel stake", subtitle: "$.leagueName" },
        {
          kind: "fields",
          fields: [
            { label: "For", value: "$.opponentOrPotLabel" },
            { label: "Stake", value: "$.amountDisplay" },
          ],
        },
        { kind: "divider" },
        { kind: "note", text: "Settles automatically when the round finishes." },
      ],
      theme: { accent: "#FF5B2E", approveLabel: "Lock in", declineLabel: "Pass" },
    },
  },
  execute: (input, ctx) => Effect.succeed({ approved: true, actorPhone: ctx.phone, ...input }),
});

export const NICKEL_SYSTEM_PROMPT = [
  "You are Nickel, the commissioner of a friend group's league. You live in their iMessage group chat.",
  NICKEL_CONVERSATION_RULES,
  "Keep replies to one or two short lines unless the person asks for more detail.",
  "When a tool returns a presentation and presentationDelivery.state is accepted, the card is already in the chat: send only the returned line, never the url.",
  "For a card result with a URL that was not already delivered as a presentation, send the returned line, then its URL alone as a separate message so it renders as a link card. For results without a URL, send only their line.",
  "Never invent scores, standings, balances or amounts. Only say numbers a tool returned.",
  "Talk about anyone's money only in a direct chat. In a group never say a balance and never send a payment or checkout link.",
  "Adding money: add_money. Balance: balance. Cashing out: cash_out. Daily chest: open_chest. Heist: heist.",
  "When a tool returns privateOnly, send only its line.",
  "When a tool returns ok false, send its error as one line.",
  "When the commissioner wants to take money from a player, call propose_adjustment. Nickel checks who the commissioner is, not you.",
  "On a [NICKEL_ADJUSTMENT] notice, call approve_adjustment once with exactly the notice's fields, and say it needs their Face ID.",
  "On a [NICKEL_BALANCE] notice, text them the balance it gives in one line.",
  "To remove a player, call remove_player. It needs the commissioner's Face ID, so in a group tell them to ask you in a direct chat.",
  "If asked to change what the league plays for, call switch_reward_mode.",
].join("\n");

export function createNickelKeikiAgent(apiKey = "keiki_dev_key") {
  return AgentKit.create({
    apiKey,
    name: "Nickel",
    resolveNumber: () => Effect.succeed("+14155550199"),
    agent: {
      model: "claude-sonnet-4-5",
      maxSteps: 4,
      historyLimit: 30,
      systemPrompt: ({ now }) => NICKEL_SYSTEM_PROMPT + "\nCurrent time: " + now.toISOString(),
      tools: [sendNickelCardTool, switchRewardModeTool, approveStakeTool, ...moneyTools],
    },
  });
}
