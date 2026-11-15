# Nickel: plan and status

Nickel is a phone number you add to your existing iMessage group chat. Say "@nickel" or "Nickel, challenge Peyton" and it replies with a card. Tapping the card opens the game in the browser. There is no app to install and no chat UI on the website.

## How a turn works

1. Someone in the group addresses Nickel by @ or by name. Keiki delivers the message to the Nickel agent (group chats need a dedicated Photon or Blooio line).
2. The agent calls `send_nickel_card` with the game, the challenger and the opponent.
3. The tool returns a short line and a link such as `/c/KRILL5?g=cup_pong&u=sritej&vs=peyton`.
4. The agent sends the line, then the link alone. iMessage unfurls the link into a large card from the page's Open Graph tags and `/og/<code>.png`.
5. Tapping the card opens the game page.

## Stack

- TypeScript on Bun 1.4.4. React 19, Vite 6 and Tailwind 4 for the game pages.
- Convex for data: schema, mutations and tests in `convex/`.
- Keiki for the iMessage agent. Whop for cash buy-ins. Nace/TypeSafe System One for grading Krillion answers, with a local fallback table.
- Revyl tests in `.revyl/tests`.

## Where things are

- `server/card.ts`: card image (SVG to PNG), unfurl tags, link builder, request handler for `/c`, `/og`, `/api/keiki/card`.
- `server/index.ts`: Bun server for a built `dist/`. `vite.config.ts` mounts the same handler in dev.
- `shared/league.ts`: game catalog, sample league, intent parsing.
- `packages/keiki-agent`: the agent definition and tools for the SDK path.
- `src/App.tsx`: game pages (Krillion, Word Blitz, Cup Pong, Mini Golf, Salvo), board, league settings, Wrapped.

Set `NICKEL_BASE_URL` to the public HTTPS origin so card links and image URLs point at it.

## Status

Done:
- Card image, unfurl tags and link routing, covered by tests and checked over public HTTPS.
- Game pages, with no chat simulator and no emojis.
- Agent "Nickel" created in Keiki with group chats on and `send_nickel_card` published.

Open:
- The Keiki account is in its waitlist sandbox, so no plan or line can be bought yet. Nothing has run in a real iMessage thread.
- No Convex deployment. The pages use the sample league in `shared/league.ts`; `convex/_generated` is hand-written until a deploy regenerates it.
- The Whop buy-in button changes local state only. `convex/whop.ts` has the checkout and webhook mutation but no HTTP route.
- No permanent host. The card host must be a stable HTTPS URL for the demo.
- Revyl tests are written but have not been run; the Revyl CLI and key are not set up here.

## Rules

- No emojis in the UI, the cards or agent replies.
- The website is only for games and league pages.
- Rewards stay a switch: points, cash, or both (`rewardMode`).
- Games take under a minute.
