# Shared-file integration map

Based on `origin/sritej/main` at `0bb9b93`. The line ranges below are **new-file line numbers** in this branch, from `git diff --unified=0 origin/sritej/main`. No other existing files were changed, and `apps/preview/play.html` is untouched.

| File | Lines | Change |
| --- | --- | --- |
| `server/brain.ts` | 9 | Arcade imports |
| `server/brain.ts` | 13 | Extend the round game union |
| `server/brain.ts` | 161–163 | Create arcade rounds through the new module |
| `server/brain.ts` | 185 | Use the catalog hue for link cards |
| `server/brain.ts` | 629 | Extend the existing result response type |
| `server/brain.ts` | 633–637 | Validate lifecycle actions and normalize scores before the existing result path |
| `server/brain.ts` | 640 | Resolve the other challenger from the round, not client input |
| `server/brain.ts` | 661 | Return the persisted arcade result and round standings |
| `server/brain.ts` | 808–810 | Games list and game detection |
| `server/brain.ts` | 816 | Describe actual arcade challenge terms without claiming a stake transfer |
| `server/brain.ts` | 819 | Recognize arcade play requests |
| `server/index.ts` | 6 | Import game detection |
| `server/index.ts` | 119 | Serve `arcade.html` at `/r/<id>` only for arcade types |
| `server/points.ts` | 1–3 | Arcade types and game union |
| `server/points.ts` | 30–31, 42, 50 | New payload and stored-result fields |
| `server/points.ts` | 91–100 | Five scoring functions using the existing breakdown shape |
| `server/points.ts` | 135 | Allow challenge context in scoring |
| `server/points.ts` | 146–161 | Arcade points, bonuses and head-to-head result comparison |
| `apps/preview/messages.html` | 243 | One-line addition of five suggestion chips |

New code lives in `server/arcade.ts`, `server/arcade.test.ts`, `apps/preview/arcade.html`, `apps/preview/arcade.css`, and `apps/preview/arcade.js`. Documentation and browser evidence live only under `docs/arcade/`.

## Server exports

`server/arcade.ts`: `ARCADE`, `isArcadeGame`, `arcadeGame`, `createArcade`, `arcadeOutcome`, `validateArcade`, `arcadeView`, `arcadeSubmission`; types `ArcadeGame`, `ArcadeEvent`, `ArcadePayload`, `ArcadeOutcome`, `ArcadeChallenge`, `ArcadeReply`.

`server/points.ts`: new `scoreReaction`, `scoreFreeThrow`, `scoreMemory`, `scoreMath`, `scoreHigherLower`. Existing `scoreResult` routes validated arcade outcomes through these functions and the normal bonus/cap logic.

## Routes

There is no second result-writing route. All three arcade lifecycle actions use the existing `POST /api/rounds/<id>/result`, so `authGate` continues to supply the session actor. `/r/<id>` chooses the arcade page by game type. `/arcade.js` and `/arcade.css` use the existing static-file handler.
