# Live topic leagues

Implemented on `sritej/live-leagues`, based on the wallet integration at `0bb9b93`. No pull request, production data change, Convex deployment, Keiki call, text message, or Stripe session was made.

## Behavior

League creation returns immediately with the existing draft board and starts OpenAI Responses research using `gpt-5.4-mini` and `web_search`. The existing four-second page poll fills in 10 to 16 researched picks, their reasons and source links. Already-owned or manually scored write-ins survive the update. Source URLs must occur in the search results, opened pages, or citations returned by the tool.

Research selects quote scoring or public-outcome scoring. Each league stores its one-week window, fixed scoring rule, research, quote baseline, check timestamps, and counted-event keys inside the existing persisted league record. Scheduled outcomes must resolve inside that window; unscheduled public milestone leagues must be anchored to reporting from the last 48 hours. No hardcoded Nvidia pool is used.

`Nickel, score <topic or league id>` checks for new results. Both chat and the server timer are throttled to one attempt per league per four hours. The timer resumes interrupted research on startup and checks active leagues while the server runs. Automatic points never touch the wallet or pot. Manual chat and page scoring still work.

For public outcomes, the fixed rule is +5 for the researched positive outcome and -3 for its negative counterpart. Stored keys conservatively allow at most one positive and one negative award per pick per UTC day, independent of article URLs or wording. A one-day overlap catches delayed reporting without repeating counted outcomes. This deliberately skips additional same-day outcomes of the same kind, rather than counting multiple articles about one result.

`Nickel, what's happening with <topic or league>` returns two sentences and one source link. Research successes, failures and in-flight requests are cached per normalized topic for an hour; saved current research can also serve after a restart. Scoring and summaries wait at most nine seconds in the HTTP turn handler. Longer work continues in the server and appears on the polling page; an unattached topic summary can be requested again once cached.

Privacy/tragedy refusals run locally and in the research prompt. A researched refusal disables drafting/scoring and clears the pool. Missing keys, failed requests, unverifiable sources, insufficient pools and invalid resolution dates preserve the existing fallback pool and manual points. The page explains delayed data and points-only play. Fantasy card replies bypass unrelated wallet and pot reminders.

## Routes and exports

No new route was added. Existing `/api/turn`, `/f/:id`, and `/api/fantasy/:id` expose the new behavior and persisted metadata. Existing `/api/fantasy/:id/draft` and `/api/fantasy/:id/score` still pass through `authGate`; no new client-supplied actor path was introduced.

`server/live.ts` exports `attachLive`, `liveTopicRefusal`, `researchTopic`, `publicQuote`, `openLiveLeague`, `scoreLiveLeague`, `tickLiveLeagues`, `liveTurn`, `finishLiveTurn`, `LIVE_INTERVAL_MS`, `LIVE_CACHE_MS`, and the `LiveData`, `LivePick`, and `LiveAward` types.

Shared-file edits, using final feature-branch line numbers relative to `0bb9b93`:

- `server/brain.ts`: 9; 26-27; 29; 74; 117; 135; 158; 671-672; 752-753; 757. These are imports/types, store attachment, refusal checks, asynchronous creation, chat dispatch, and the loading sentence.
- `server/index.ts`: 6; 40-41; 79; 81-82; 86. These are the import, startup/four-hour timer, bounded reply completion, and suppression of unrelated financial reminders on fantasy replies.
- `apps/preview/fantasy.html`: 13-14; 40-51; 135-146; 163; 166; 172-174; 180; 185. These are scoped styles, source/live-info rendering, additive timeline navigation, pick reasons, and link click handling. No existing code or layout blocks were moved or reformatted.

## Verification

The required gate exited 0 after the final code change on November 16, 2026 UTC:

```sh
env -u STRIPE_SECRET_KEY -u OPENAI_API_KEY bun run typecheck &&
env -u STRIPE_SECRET_KEY -u OPENAI_API_KEY bun run test &&
env -u STRIPE_SECRET_KEY -u OPENAI_API_KEY bun run build
```

125 tests passed across 11 files, including 13 new network-mocked live tests. Coverage includes cache coalescing/expiry, fallback, privacy refusal, dated pool validation, ongoing headline leagues, source provenance, concurrent scoring, persisted deduplication, quote validation and cumulative deltas, manual scoring, four-hour/week limits, summaries, and bounded replies. An existing Nace test failed intermittently on earlier runs: it gives `the obvious one` to a randomly selected `Countries with exactly 4 letters` round. That collision was reproduced without a network call; the existing test and grader were not changed.

Browser checks used a 390x844 mobile/touch viewport in light and dark. Checked researched Nvidia and NBA boards, reasons/source links, the current rule and disclaimer, a long topic title, drafting NVDA as Maya (roster count 0/3 to 1/3), the real empty timeline, and a clearly labeled mocked +5 sourced timeline entry. A manual +1 was added through the existing sheet; the board became 6 and the timeline kept both the automatic +5 and manual +1. The final browser console had no errors.

Screenshots are in this folder. `nvidia-*` and `nba-*` show actual research outputs. `mock-timeline-*` explicitly show mocked outcomes, not real sports results. `nfl-initial-*` and `nfl-superseded-*` retain earlier research evidence; they are not the accepted final sports pool.

## Actual API results

`real-results.json` retains every creation/scoring result, including failed and superseded attempts. These are captured model research outputs, not independently endorsed news claims. Nine Responses calls were used across the smoke test and research-quality fixes; quote checks used Yahoo's public endpoint.

The accepted Nvidia retry returned its opening reply in 3.7 ms and produced 13 picks:

`NVDA, AMD, INTC, AVGO, QCOM, MU, ANET, SMCI, ARM, TSM, MSFT, META, GOOGL`

All 13 obtained a public Yahoo baseline. NVDA's snapshot was $162.85 at November 13, 2026, 21:00:01 UTC. The immediate scoring pass returned zero new awards: the regular market had not supplied a newer quote. The first Nvidia attempt had fallen back safely; the subsequent fresh-process retry succeeded.

The accepted `NBA games in the next seven days` creation returned its opening reply in 9.7 ms and produced 12 picks with resolution timestamps between November 16 and November 22 UTC:

`Bulls, Cavaliers, Rockets, Nuggets, Thunder, Heat, Mavericks, Clippers, Lakers, Jazz, Knicks, Timberwolves`

Its stored rule was `5 points for official game win; -3 for official game loss`. The immediate real scoring pass returned zero verified new events and no awards. An earlier NFL response chose games beyond the one-week window; this led to the explicit resolution-date validator and its regression test. A subsequent dated NFL response mixed past and future games and was correctly rejected, retaining the existing manual NFL pool.

## Source limits and remaining gaps

Quote scoring reads `regularMarketPrice` and `regularMarketTime` from `query1.finance.yahoo.com/v8/finance/chart/:ticker?range=5d&interval=1d`, and links each award to `finance.yahoo.com/quote/:ticker/`. It accepts matching USD equity/ETF symbols only, rejects malformed/future/older-than-seven-day quotes, ignores out-of-order quote replays, and never substitutes a model price. Points track the cumulative percentage change from the opening snapshot, rounded to 0.1; manual points remain separate. This is an unofficial, possibly delayed regular-market feed with no availability guarantee, no extended-hours scoring, and no corporate-action or currency adjustment. Moves exceeding 100% are skipped rather than guessed.

Public-outcome research still depends on the model interpreting web sources correctly. URL provenance and date checks do not prove that an article entails every generated claim. Ambiguous or poor research can fall back instead of producing a live pool. No nonzero award occurred during the short real-data smoke window; nonzero awards, negative moves and deduplication were verified with mocked network data. A real four-hour timer cycle and a week-long season were not left running; their eligibility/throttling logic was tested with controlled dates. Production transport and long-term deployment were not exercised.
