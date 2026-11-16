# Arcade quality pass

November 15, 2026, America/Los_Angeles. Started on `sritej/main` at `b6eb934`, then rebased and reverified on `4bf0d67`, not the repository’s unrelated default `main`. This pass preserves the five boards, league scoring, one official attempt, practice, and Peyton’s shared visual system. Wordle and Krillion are untouched.

## Concrete findings and fixes

| Game | What was wrong | Change |
| --- | --- | --- |
| Reaction | Reaction milliseconds were measured from the scheduled signal, even when the browser painted it later. The obvious circle wasn’t tappable. A color transition also softened the cue. | Measure from the animation frame that presents the cue; submit `cueAt` for server validation. Both circle and dock button work. The cue changes immediately. Text also says “Tap now,” so color isn’t the only signal. |
| Free Throw | The meter really did start centered. It wasn’t literally an instant perfect score: shooting was locked for 100ms. But shooting at the first allowed instant after each lockout yields about **362/500**, above the 250 win threshold, without tracking the meter. | New rounds start each shot at the edge with a smooth cosine sweep. The earliest allowed shot earns zero. Slower, progressively faster sweeps give the player time to aim. Old round traces still validate with their original formula. The intro now previews the edge start, too. |
| Memory | The first flash started against the server clock before the player necessarily saw the board. Playback had no step counter. | Give the newly displayed board a 450ms get-ready beat, then show “Watch 1 of 3” etc. Keep numbered pads, distinct watch/your-turn states, the growing pattern, and existing 400ms flashes/150ms gaps. Pads remain locked while watching. |
| Math | Every question put one distractor above and one below the answer: selecting the numeric median bypassed arithmetic. Choices only used three cyclic arrangements. Wrong-answer feedback vanished in 170ms. | Sample two distinct nearby distractors independently; shuffle all three positions. The answer can be the lowest, middle, or highest number. Correct feedback lasts 220ms; incorrect feedback displays the right answer for 650ms. Input stays locked during feedback. |
| Higher/Lower | “Low to high” never explained the range or ties. Replacing a tie with the adjacent card doubled that card’s probability. Reveals were easy to miss. | New decks sample uniformly from the eleven values other than the current card. Show “2 low · 13 high · no ties” and the number of favorable possibilities on both controls. Hold correct reveals for 650ms and wrong reveals for 1100ms. One wrong call still ends the run. |

Across the games: practice replays redraw the memory sequence, reaction waits, and card deck, and reshuffle the question order. Practice never posts a start or result. The avatar is now an accessible “Back to games” link; results retain Practice/Play again and Leaderboard. Native buttons support keyboard activation, with additional Space/Enter, number-key, and arrow-key shortcuts when the board has focus. Dock instructions have stronger contrast. Fresh results explain timer expiry, a broken pattern, a lost card call, or abandonment instead of always saying “That’s a round.”

The server continues to score the trace, enforce the original deadline and event limits, and preserve the first result. `cueAt` is checked against the scheduled signal and the submitted tap; it is a client rendering timestamp, **not** proof of physical human input. Legacy reaction events without it remain valid. New shot curves are explicitly versioned with `qualityVersion`; existing official challenges aren’t silently changed.

## Honest browser play

All five were played using the real rendered buttons in Chromium at **390×844**, with mobile/touch emulation, in both light and dark themes. No page variables, answer arrays, score setters, perfect-score traces, or timed auto-players were used for these playthroughs. Light runs were official local runs; dark runs were local practice. Screenshots are in `quality/`, named `<theme>-<game>-play.png` and `<theme>-<game>-result.png`.

| Game | Light official score | Dark practice score | What the play actually established |
| --- | ---: | ---: | --- |
| Reaction | 0/1000 | 0/1000 | Blue cue and text appeared clearly; the circle accepted a tap; the clock expired and produced a result. Remote observation/input took seconds, so these are not measurements of human reflexes. |
| Free Throw | 206/500 | 169/500 | The meter moved, shots produced varied accuracy instead of a guaranteed winning start, feedback/pips updated, and incomplete runs expired cleanly. Remote timing prevented precise aim. |
| Memory | 0 steps | 0 steps | Watch/your-turn states and pad locking rendered correctly; a wrong pad ended the run. The tool’s roughly two-second settling skipped the short pattern: the taps were guesses. This is **not** evidence that a person can comfortably follow the full pattern. |
| Math | 3/20 | 3/20 | Answers were selected by calculating the visible equation, not looking up the challenge. The dark run included an answer below both distractors. Timer expiry preserved the correct count. |
| Higher/Lower | 3 in a row | 1 in a row | Calls used only the visible card and displayed risk counts. A low-probability card really ended the dark run; no future card was inspected. |

These modest scores are intentional evidence, not a claim that the games have been user-tested for enjoyment. The boards fit the observed viewport without clipped game controls. This was a cloud Chromium check, **not** physical iPhone, Safari, haptic, screen-reader, or touch-to-photon verification. A person should still play Memory’s full sequence and aim several Free Throws on a phone before calling the tuning finished. Short runs after a memory/card mistake remain intentional; 15–25 seconds is the maximum clock, not a forced minimum.

Some captures precede the final result-heading refinement, so they say “That’s a round”; `dark-unsaved-result.png` and `dark-retried-result.png` show the final “Time’s up” heading. Point counters in some result captures are still counting up; the skill score is final.

## Recovery and safety

- Reopened all five official links after completion: each restored its identical score and “Saved to your league,” with no second Start action.
- Clicked Play again in dark Higher/Lower: returned to the practice intro without replacing the official result.
- Created another official Math round and answered one visible question. Stopped the local server before expiry. The final screen retained **1/20**, explicitly said it wasn’t saved, hid Share, and offered Retry save. Restarted the same scratch server and clicked Retry save: the same **1/20** became the saved official result. See `quality/dark-unsaved-result.png` and `quality/dark-retried-result.png`.
- Server runs used scratch `NICKEL_DATA_DIR` under `~/.capy/work/game-quality/`. `CONVEX_URL`, `CONVEX_DEPLOY_KEY`, model/NACE keys, and Stripe keys were unset for launch/checks. No Convex deployment, Keiki message, or paid call was made.

## Regression coverage

`server/arcade-quality.test.ts` adds deterministic fairness checks, edge-start/legacy shot validation, delayed actual reaction cues, client watch/input phases, readable wrong-answer feedback, practice expiry/replay with zero result calls, unchanged save retries, rejected-run zero recovery, and reopening a saved zero. These unit tests deliberately use synthetic inputs; they are separate from the honest browser scores above. Existing tests are unchanged.

`bun run typecheck && bun run test && bun run build` passed after rebasing: **235 tests in 22 files**, including the 11 quality regressions. `node --check apps/preview/arcade.js` and `git diff --check` passed as well.
