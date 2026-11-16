# Custom feature verification

Base integrated: `origin/sritej/main` at `0bb9b93`. Feature branch: `sritej/custom`. No pull request.

## Built

Six one-move templates: closest numeric guess, agree/disagree vote, typed trivia, group-judged caption, reaction tap and lowest/highest unique number. Chat and web creation share server planning, and results go through `recordResult` rather than a separate leaderboard.

Custom leagues reuse `createFantasy`, draft picks, score events and standings. They add human-readable scoring, a season deadline, web creation/settings and chat rules reporting. Drafting and scoring reject expired seasons.

Research has 44 sourced punishment traditions or clearly marked safer adaptations, three intensity tiers, three numbered research options with source links, explicit selection and consent limits. Live research preserves the integrated Nace safety check; no-key research uses the catalog.

## Routes

- `GET /g/new`, `GET /g/<id>`, `GET /og/g/<id>.png`.
- `POST /api/games`: create a game.
- `GET /api/games/<id>`, `POST /api/games/<id>`: read, answer, vote or reveal.
- `GET /leagues/new`, `GET /leagues/<fantasy-id>`: create/edit forms.
- `POST /api/leagues`: create through existing fantasy logic.
- `GET /api/leagues/<fantasy-id>`, `POST /api/leagues/<fantasy-id>`: read/update scoring and season.
- Existing `/f/<id>` shows the rules and links to settings. Existing `/api/turn` dispatches custom chat commands.
- Raw `/api/rounds/game-*/result` is blocked. `/r/game-*` redirects to `/g/game-*`, avoiding exposure through the old round payload.

New write routes use the existing auth body-size, same-origin, identity and rate-limit gate. Signed sessions override payload identities, retain verification in recorded results, and cannot be impersonated with a query-string name.

## Added exports

`server/custom.ts` functions:
`scoringText`, `planGame`, `planGameAI`, `createGame`, `customScore`, `settleGame`, `getGame`, `submitAnswer`, `castVote`, `revealGame`, `gameView`, `gameCard`, `punishmentPool`, `wantsResearch`, `researchPunishments`, `prepareTurn`, `leagueRules`, `configureLeague`, `leagueIsClosed`, `customTurn`, `customRoute`.

Its data/types: `TEMPLATES`, `TRIVIA`, `TAKES`, `CAPTIONS`, `Template`, `Plan`, `Entry`, `Row`, `CustomGame`, `RuledLeague`, `PunishmentOption`, `PreparedTurn`.

`server/punishments.ts`: `Intensity`, `INTENSITIES`, `PUNISHMENT_TIERS`, `ALL_PUNISHMENTS`, `PUNISHMENT_SAFETY`, `sourceOf`, `safePunishment`, `intensityIn`, `tierOf`, `threeOptions`.

Shared-file additions: exported the existing `createFantasy` and added `nameClaimed` in auth.

## Exact shared-file hooks

Line numbers refer to this feature's final working tree, compared with main at `0bb9b93`.

| File | Lines | Change |
|---|---|---|
| `server/brain.ts` | 7–8 | Imports |
| | 14 | Custom round game type |
| | 116, 134 | Season closure checks |
| | 141 | Export existing fantasy creator |
| | 286 | Replace inline punishment list with tiered catalog |
| | 606 | Reroll from chosen tier |
| | 622–624 | Custom scoring hook and premature-result rejection |
| | 650 | Request-scoped prepared input type |
| | 658–659 | Custom chat dispatch |
| | 746–747 | Report rejected fantasy scoring rather than announcing fake success |
| `server/index.ts` | 1, 5–6 | Imports |
| | 71, 73 | Prepare AI request data and pass it to the same turn |
| | 82–86 | New route handler and page/card responses |
| | 119 | Redirect old round URL for custom games |
| `server/auth.ts` | 78–79, 134 | Claimed-name read protection and reuse write gate |
| `server/points.ts` | 1 | Custom game type |
| `apps/preview/fantasy.html` | 149 | Rules, season and create/settings links |

All substantive new logic is in new files. No existing test assertions were edited relative to `0bb9b93`.

## Verified

- `bun run typecheck && bun run test && bun run build` exited 0: **134 tests across 11 files**, including 22 new custom tests. `git diff --check` also passed.
- Coverage includes all six templates, score calculations, one answer per person, duplicate result idempotency, unknown-answer reveal, solo payouts, expiry, group votes, malformed guesses, web league creation/settings, season closure, tier persistence, numbered selection, request-scoped AI plans, signed identity, body limits and cross-origin rejection.
- Browser at **390×844**, light and dark: create a guess game, Sritej submits 7,000, Maya submits 8,400, real answer 8,412. Result: Maya +6, Sritej +1. The existing leaderboard API and rendered page show those totals.
- Browser: create Boba shops with three draft picks, scoring `1 per new drink, 5 for a sellout`, 56-day season; edit scoring to `2 per new drink, 5 for a sellout`; existing fantasy standings display it. No console errors.
- HTTP after final server restart: settled game returns Maya's win, leaderboard totals are 6 and 1, league rules report eight weeks, custom OG card returns PNG 200, missing game page returns 200, and old round URL redirects 302.
- Live OpenAI Responses call with the configured key returned a closest-guess plan for Dev's steps and three sourced, private theatrical punishments. No-key flows were separately exercised.
- Screenshots 01–09 preserve earlier game/caption checks; **10–17** capture the integrated build. Nothing was deleted.

## Limits

No Keiki API, agent changes, iMessage sends, Convex deployment or production state changes. Every server used a scratch `NICKEL_DATA_DIR` and no `CONVEX_URL`; Stripe was unset for local server checks, and no charges or cash-outs were created.

Real delivery on group members' iPhones was not tested. Browser E2E used two separate guest identity keys; signed-session behavior is covered by tests. Timing follows the product's existing honor-system games rather than anti-cheat timing. Deadline settlement occurs on the next game read/write; a real-world answer still needs a group member to supply it. Weekly league awards are not implemented.

One upstream Nace test failed once during integration: it creates a random Krillion prompt but submits `the obvious one`, which conflicts with the four-letter validator when that prompt is selected. It was not changed here. The final complete gate passed.
