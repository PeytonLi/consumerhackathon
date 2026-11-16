# Arcade verification

Verified November 15, 2026 (America/Los_Angeles), on the feature branch based on wallet integration `0bb9b93`.

## Required gate

`bun run typecheck && bun run test && bun run build` exited **0** with `STRIPE_SECRET_KEY` and `CONVEX_URL` unset. The suite passed **134 tests in 11 files**, including **22 new arcade tests**. `node --check apps/preview/arcade.js` and `git diff --check` also passed. Existing tests were not changed.

All server runs used `NICKEL_DATA_DIR=/tmp/nickel-arcade-dev`. No Convex deployment, Keiki API, text message, Stripe session or real payment was used. The browser fixtures were created by local `/api/turn` requests.

## Browser playthroughs

Played all five games through actual pointer/touch controls in Chromium **157.0.8103.78**, with a **390×844** mobile viewport, once in light mode and once in dark mode. Each official run reached “Saved to your league”, received server points, showed its round standings and restored the same score after reload with no Start button. There were no page JavaScript errors, rejected result responses or document overflow in these ten runs.

| Game | Saved light score | Saved dark score | Play/result screenshots in each theme |
| --- | ---: | ---: | --- |
| Reaction | 703/1000 | 697/1000 | `*-reaction-play.png`, `*-reaction-result.png` |
| Free Throw | 453/500 | 454/500 | `*-freethrow-play.png`, `*-freethrow-result.png` |
| Memory | 12 steps | 12 steps | `*-memory-play.png`, `*-memory-result.png` |
| Math Sprint | 20/20 | 20/20 | `*-math-play.png`, `*-math-result.png` |
| Higher or Lower | 6 in a row | 6 in a row | `*-higherlower-play.png`, `*-higherlower-result.png` |

The `*` prefix is `light` or `dark`. These are twenty individual 390×844 screenshots. They were visually inspected in contact sheets. A separate interactive browser check also exercised Free Throw in both themes.

## Observed timing

Instrumentation recorded `requestAnimationFrame` intervals during active play, and the time from a captured `pointerdown` to its next animation-frame callback. The table shows the worse p95 of the two themes, not the faster run.

| Game | Gameplay frames sampled | p95 frame interval | p95 pointer-to-next-frame |
| --- | ---: | ---: | ---: |
| Reaction | 1,419 | 16.7ms | 15.9ms |
| Free Throw | 1,018 | 16.7ms | 15.2ms |
| Memory | 1,628 | 16.7ms | 16.0ms |
| Math Sprint | 693 | 16.7ms | 16.0ms |
| Higher or Lower | 389 | 16.7ms | 15.9ms |

Across **5,147 frames**, the observed median cadence was approximately **60fps** and the largest interval was **16.8ms**. Across **106 pointer inputs**, the largest pointer-to-next-frame measurement was **16.2ms**. This is a headless Chromium scheduling measurement, not a high-speed-camera measurement of physical touch-to-photon latency or proof of iPhone frame rate. Raw measurements and accepted response summaries are in `browser-verification.json`.

## Recovery, practice and safety checks

- Completed **all five games in practice**, with **zero POST requests** from each practice page. Practice results and replay stayed local.
- Refreshed during an official run: the run recorded zero rather than resetting its timer. Evidence: `light-refresh-forfeit.png`.
- Navigated away and back during an official run: the saved abandonment state recorded zero and did not permit a new start.
- Reopened every finished official round: its score was unchanged. Restarted the Bun server and recovered a saved 20/20 Math Sprint result and its 15 Nickels from the scratch data directory.
- Aborted the finish request: the UI visibly retained an unsaved result and offered Retry save. Removing the simulated network fault and retrying saved the same trace. Evidence: `light-unsaved-retry.png`.
- Shifted the browser clock five minutes ahead of the server: a new official round still started at 0:20 through the server-clock offset.
- Ran a reduced-motion result: it completed without a confetti canvas. Evidence: `dark-reduced-motion-result.png`.
- The new unit tests cover server-computed scores, impossible reaction times, false starts, theoretical input limits, out-of-clock/future/repeated input, free-throw positions, memory playback and terminal mistakes, actual math choices, card predictions, idempotent starts/results, authenticated actor injection, all five play/challenge commands, the one-line games list and head-to-head “who won” comparison.

Additional browser check results are in `browser-extra-checks.json`.

## Not verified

Physical iPhone Safari performance, iOS switch haptics, native vibration and native share-sheet behavior were not available in this Linux environment. The code includes the existing switch-haptic fallback, `navigator.vibrate` support and Juice sharing, but their physical-device behavior needs an iPhone check. Live iMessage card delivery and live league persistence were deliberately not exercised. Trace validation is plausibility checking, not bot-proof anti-cheat; see `NOTES.md`.

The exact existing-file edit map and route/export inventory are in `SHARED-HOOKS.md`.
