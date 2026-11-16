# Nickel money tools (Keiki)

The bot never moves money itself. Each tool calls the Bun server at `NICKEL_BASE_URL` (https only) with header `x-nickel-secret: NICKEL_TURN_SECRET`, and sends the caller's phone from Keiki's signed context (`ctx.channel.userId`, else `ctx.phone`). No tool takes a phone, user id or player id as input. In a group the chat id (`ctx.channel.channelId`, `conversationId`, or a non-phone `ctx.phone` such as `imsg:chat:<id>`) goes along as `chatId`. A turn counts as a direct chat only when `ctx.channel.isDirect === true`.

| Tool | Direct chat | Group |
| --- | --- | --- |
| `add_money { amountDollars? }` | Vault card for `/wallet?add=<cents>`, caption "Add money", `live: false` | Plain `/wallet` link |
| `balance` | Balance numbers | Server texts the balance to their DM; the tool returns `privateOnly`, `sentPrivately` and no numbers |
| `cash_out` | Vault card for `/wallet?cashout=1` | `privateOnly` line, no server call |
| `open_chest` | Vault card for `/chest` | `/chest` link |
| `heist` | Vault card for `/heist` | `/heist` link |
| `propose_adjustment { player, amountDollars, reason }` | Works | Works |
| `approve_adjustment { adjustmentId, amount, reason, from }` | Face ID card (`approval: ask`, `approvalProof: verified`) | Refused |
| `remove_player { player }` | Face ID card | Refused by Keiki (no card in groups) |

Every link a tool returns must be same-origin with `NICKEL_BASE_URL` and on the exact page path it asked for, so a checkout URL can never reach a group.

## Adjustment flow

1. The commissioner says "Nickel, take $2 from Maya for missed dues" (group or DM). The model calls `propose_adjustment`.
2. The server checks the caller is that group's commissioner, stores a pending adjustment (Maya's balance into the group pot), and sends a Keiki notice to Maya's phone only: `[NICKEL_ADJUSTMENT] ... Call approve_adjustment with adjustmentId "...", amount "$2.00", reason "...", from "Sam".`
3. In Maya's DM the model calls `approve_adjustment` with those fields. Keiki shows a Face ID Vault card built from them.
4. If Maya approves, the tool runs as Maya (Keiki runs Vault decisions as the conversation's contact) and posts to the approve endpoint. The server moves the money only if the phone is the debited player's and the amount and reason match the stored request. If she declines, nothing runs.

## Server endpoints (`server/agent-money.ts`, all POST, all need the secret)

| Path | Body | Answer |
| --- | --- | --- |
| `/api/agent/link` | `{ phone, page: "wallet" \| "cashout" \| "chest" \| "heist", amountCents? }` | `{ url }` |
| `/api/agent/balance` | `{ phone, deliver?: "dm" }` | `{ balanceCents, dailyLimitCents, spentTodayCents }`, or `{ notified }` with `deliver: "dm"` |
| `/api/agent/adjustments` | `{ phone, chatId?, player, amountCents, reason }` | `{ id, player, amountCents, reason, notified }` |
| `/api/agent/adjustments/:id/approve` | `{ phone, amountCents, reason }` | `{ ok: true, balanceCents }` |
| `/api/agent/players/remove` | `{ phone, chatId?, player }` | `{ ok: true, player, refundedCents }` |

Errors are `{ ok: false, error }` with 400, 401, 403, 404, 409 or 503; the tools relay `error` as one line.
