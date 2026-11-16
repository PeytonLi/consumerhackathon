# Visual polish verification

## Baseline and isolation

Based on `origin/sritej/main` at `0bb9b93`, including the wallet integration. The feature branch is `sritej/beauty`.

All runtime state used `/tmp/nickel-beauty-*` scratch directories through `NICKEL_DATA_DIR`. `CONVEX_URL`, Stripe, Nace and OpenAI keys were unset for the local server and the gate. No Convex development or deployment command, Keiki API, text message, Stripe session, top-up, or cash-out was invoked.

The before captures were made from the preserved original page sources and original card functions before editing. Before/after page comparisons use the same illustrative league and player data, 390×844 viewport, scale factor 1, and explicit light or dark mode. They are not screenshots of production league data.

## Gate

`bun run typecheck && bun run test && bun run build` exited 0 with `STRIPE_SECRET_KEY` unset. All 11 test files and 125 tests passed. The new `server/card-art.test.ts` contributes 13 tests; no existing test was changed.

The new tests cover every chat card type at 1200 and 300px, all three person variants at 300px, distinct compositions, text escaping, emoji exclusion, embedding raster photos, and refusal to load remote or SVG portraits. Existing `brain.test.ts` and `card.test.ts` remain green, including their SVG text assertions.

## Browser checks

- A Playwright Chromium harness passed 72 checks across explicit light and dark modes. It exercised fantasy tabs, arrow-key navigation, draft success and failure, retained write-in input, full roster, score success and failure, modal focus containment and restoration, empty leagues, profile live preview, offline and malformed save responses, saved profiles, expired claims, rate limits, Messages search and empty results, real OG image aspect ratios, iframe open/close, retryable message drafts, dynamic OG paths, and reduced motion. All harness write requests were intercepted and fulfilled with fixtures.
- Layout overflow checks passed at 320, 390 and 768px. The requested comparison screenshots are all 390×844.
- Each moodboard passed 390 and 1200px overflow checks plus draft-button state, tray dismiss/reopen, and replay interactions. Each has eight source annotations and six rendered component types.
- A second browser session used the actual Bun routes and a local-only claim: saved a profile, opened `/f/fantasy-beauty` as that signed-in player, drafted Gemini, scored Claude +5, and reloaded in dark mode. The roster moved from 1/2 to 2/2, and points from 24 to 38 to 43. Only the scratch file store changed. Those screenshots start with `real-`.
- The Messages preview now displays the actual `/og` PNGs rather than an unrelated HTML mock. Dynamic claim-link query strings are removed from the image path, so a profile link with `?k=...` still loads `/og/me/:token.png`.

## Evidence inventory

`shots/before/` holds 28 images: ten card variants at full size and 300px, plus fantasy, profile, Messages inbox, and Messages group in both modes. `shots/after/` holds the matching 28 images, nine moodboard captures, 36 state captures, and seven real-route browser captures.

- Chat variants: `game`, `challenge`, `fantasy`, `buy-in`, `leaderboard`, `player-card`, `hub`. Each has `-full.png` at 1200×630 and `-300.png` at 300×158 in both folders.
- Person variants: `person-winner`, `person-middle`, `person-loser`. Each has `-full.png` at 1080×1080 and `-300.png` at 300×300 in both folders.
- Page pairs: `fantasy`, `profile`, `messages-inbox`, `messages-group`, each with `-light.png` and `-dark.png`.
- State captures include fantasy sheet, score error, scored, roster-full, empty, disconnected; profile saving, saved, error, locked, edit-after-save; Messages loading, offline, challenge, preview-unavailable and reduced-motion.

Review [index.html](index.html) to compare the cards at their actual small size. Card title, subject and action are the primary hierarchy; league and supporting copy are intentionally secondary.

## Exports, routes and shared-file changes

New pure renderer module: `server/card-art.ts`, exporting `renderChatCard`, `renderPersonCard`, and the `ChatCardArt` / `PersonCardArt` interfaces. Existing `cardSvg`, `cardPng`, `personCardSvg` and `personCardPng` signatures are unchanged. PNG rendering still uses resvg and the existing Inter font files.

No server routes were added or removed. Existing `/og/r/:id.png`, `/og/f/:id.png`, `/og/p/:id.png`, `/og/me/:token.png`, `/og/l.png`, `/og/h.png`, `/og/wallet.png`, `/card/l/:index.png` and `/card/me/:token/(winner|loser).png` consumers use the new art. Page routes remain `/f/:id`, `/me/:token` and `/`; the existing static handler serves `/polish.css`.

`server/index.ts` is untouched. Against `0bb9b93`, the only shared-file edits are in `server/brain.ts`:

- Added the renderer import at new line 9.
- Removed the now-unused ordinal helper at old line 543.
- Replaced the person SVG presentation only at old lines 563–574 and 578–590 with the delegate at new line 566. Identity, photo/art selection, ranking, footer copy, and null behavior stay in place.
- Removed the old SVG-only helpers at old lines 821–823 and replaced the card drawing body at old lines 825–843 with profile-photo collection and delegation at new lines 798–799.

No handleTurn, scoring, session, payment, wallet or league behavior was changed. `nickel.css`, `juice.js` and the excluded pages are untouched.

## Remaining gaps

Verified in Chromium emulating mobile size and touch, not on physical iOS Safari. The native iMessage unfurl, real Keiki handoff, actual iPhone safe-area/keyboard behavior, and platform haptics still need a device check. Resvg output and 300px rendering were inspected locally; no real message was sent. X clips were not viewed. Existing stock winner/loser artwork remains the fallback when no person photo is available; this pass did not generate new AI portraits.
