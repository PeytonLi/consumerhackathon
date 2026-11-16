# Nickel Arcade

## Why these five

Research checked November 15, 2026. Apple's [GamePigeon listing](https://apps.apple.com/us/app/gamepigeon/id1124197642) lists Basketball, Cup Pong and Mini Golf among its iMessage games and shows roughly 234,000 ratings. [OpenPigeon](https://openbubbles.app/openpigeon) also foregrounds Cup Pong and Basketball. Those are signals of an established social-game format, not a measured ranking of which game people currently play most. Free Throw takes the immediate shot-and-reveal appeal, without requiring a synchronous opponent or a long match.

[Human Benchmark](https://humanbenchmark.com/) puts Reaction Time and Sequence Memory on its front page; its [sequence test](https://humanbenchmark.com/tests/sequence) describes a growing pattern that ends on a mistake. Reaction and Memory use those instantly understandable interactions, shortened to 15 and 25 seconds. They are different skills, so a friend who wins at words does not automatically win here.

Math Sprint adds a 20-second knowledge-and-speed race with three large answer buttons rather than a mobile keyboard. Higher or Lower adds a 20-second card streak with a little risk and luck. These last two are design choices, not claims of current popularity. All five work with one thumb and produce a comparable score without waiting for anyone else.

| Chat game | Clock | Score | Interaction |
| --- | --- | --- | --- |
| reaction | 15 seconds maximum | Three trials, average of `max(0, 1000 - reaction ms)`; a false start or missed trial scores zero | Tap after the signal |
| free throw | 20 seconds maximum | Five shots, up to 100 accuracy each | Stop the moving marker in the center |
| memory | 25 seconds maximum | Correct steps, starting with a three-pad sequence | Repeat the numbered pads |
| math | 20 seconds maximum | Correct answers out of 20 | Pick one of three answers |
| higher or lower | 20 seconds maximum | Consecutive correct predictions, up to 20 | Pick higher or lower |

Shorter runs are possible when the player completes every trial/card or misses a memory/card step. The countdown is an upper bound, not a delay before seeing results.

## Server contract

All writes use the existing authenticated `POST /api/rounds/<id>/result` route and `recordResult`. The payload adds `arcade: { action: "status" | "start" | "finish", events?: [{at, value}], abandoned?: boolean }`. `at` is elapsed milliseconds from the server-issued start. The auth gate still replaces the actor with the session name. A start is persisted on the round and is idempotent; a result is persisted in the existing results ledger and cannot be replaced with a better run.

The server computes scores from the input trace. It rejects events after the countdown, future events, repeated/out-of-order timestamps, impossibly rapid input, reaction times below 120ms, more trials/cards/questions than exist, incorrect free-throw marker positions, memory taps during playback, and inputs after a terminal mistake. It checks actual question answers and the shared card deck. Missing trials count as zero. Retrying an upload later is allowed, but its events must still fit the original clock. Abandonment records zero skill score and the normal showing-up Nickel.

This is plausibility validation, not bot-proof anti-cheat: a determined client can inspect the shared challenge and synthesize a human-timed trace. There is no claim of cryptographically verified physical reaction time. Every player in a round receives the same challenge, and challenge scores are compared in the result line used by “Nickel, who won”. Nickels reward each run with the existing first-in, upset, streak and cap logic; no fake head-to-head stake is transferred.

`?practice=1` stays local and does not write starts or results. Leaving an official run forfeits the run rather than resetting the timer. Finished official rounds reopen on their saved result. Network failures remain visibly unsaved and can be retried with the same trace.

## Files and routes

- `/r/<id>` serves `arcade.html` for the five arcade game types; older games still serve `play.html` unchanged.
- `server/arcade.ts` exports the catalog, game detection, challenge creation, outcome formatting, trace validation, attempt lifecycle and result view.
- `server/points.ts` adds `scoreReaction`, `scoreFreeThrow`, `scoreMemory`, `scoreMath` and `scoreHigherLower` with the existing points breakdown format.
- “Nickel, games” lists the games on one line; “Nickel, play <game>” and “Nickel, challenge Maya to <game>” create real rounds. Basketball and cup pong are aliases for Free Throw.

## Verification

The browser evidence and measured timings are recorded in `VERIFICATION.md`. Screenshots alongside this file are actual rendered 390×844 browser captures, not mockups.
