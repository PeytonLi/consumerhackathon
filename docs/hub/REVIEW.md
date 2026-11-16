# Hub UX review

Reviewed at 390 x 844 in light and dark, with an additional 360 x 640 check. The hub now represents signed-up people instead of a demo league. The first decision is either finish your card, join the group, or check your place on the board.

## Evidence and data safety

The `before/` screenshots capture the original hub at `8ffa448`. The `after/` screenshots capture this branch after integrating `0bb9b93` (wallet, Nace, and the separate game/leaderboard work). The original screenshots at the root of this folder are retained.

All screenshots use isolated local fixture data, not the live group or a production roster export. The sample profile pictures and crowned/crying portraits were drawn locally as SVGs, rendered to PNG/JPEG, and written into the temporary data directory. The portraits exercise the existing-art path; no image generation was purchased. The fixture has four named members and two people who have texted but not named their cards. Christopher has no photo; Abhi has a phone profile and photo but has not claimed his card.

The final server used `NICKEL_DATA_DIR=/tmp/nickel-roster-ui-*/main`, with a separate empty directory for the empty-state server. Convex, image-provider, Nace, and Stripe keys were removed from the local server environment. No Keiki calls, outgoing texts, real charges, or cash-outs were made.

## Findings and changes

| Finding | What changed | Evidence |
| --- | --- | --- |
| An empty league displayed five invented people, ranks, and records. A computer opponent could also become a member through score history. | `server/roster.ts` resolves phone-backed or claimed profiles, names, photos, join time, claim status, and participation. Legacy phone-to-name entries are included without inventing a join date. Leaderboards and portrait cards use that roster by default. Demo fallback names and seeded results require `NICKEL_DEMO=1`. | [Before: empty](before/empty-light-1-top.png), [after: empty light](after/empty-light-1-top.png), [after: empty dark](after/empty-dark-1-top.png) |
| There was no visible distinction between a missing member, an unfinished card, and an empty league. | People has every named member, a real photo or fallback, rank, score, and current streak. Unnamed contacts are identified only by the last two digits of their number, with instructions to finish the card from Nickel's text. The signed-in owner gets a prominent Finish/Add photo link. Claim history survives ending a device session. | [People light](after/me-light-3-people.png), [people dark](after/me-dark-3-people.png), [finish card](after/ghost-light-1-top.png), [add photo](after/nophoto-light-1-top.png) |
| The reel reduced the expressive portraits to small avatars with a hat. | Portraits are 148px rounded tiles. First/last use their existing generated portrait when present, then their real photo, then the stock role illustration. Middle places use their photo or the deterministic illustrated fallback. People rows and the pager always use the person's actual photo when available. Portraits sit in native HTML cards, so text and surfaces remain correct in dark mode. Reading the hub does not start image generation. | [Before](before/seeded-light-1-top.png), [after](after/me-light-1-top.png), [winner light](after/me-light-7-board-winner.png), [winner dark](after/me-dark-7-board-winner.png) |
| Finding another player required swiping through a carousel. There was no invite action. | People is a direct thumb-reachable tab and a complete row list. Each named row opens the same person sheet. Invite shares the join code and line from server configuration through Web Share, with clipboard and copy fallbacks. The empty state also has Text the code and Invite the group. | [People and Invite](after/me-light-3-people.png), [copied](after/light-invite-copied.png) |
| The league title collided with the stakes pill. Captions and setup labels had weak contrast. The pager targets were only 40px wide. | The header now gives its title a bounded column and lets it wrap. Stakes use a smaller pill. Captions, ranks, and chevrons use the secondary ink color; setup labels have a stronger light/dark orange. Pager targets are 44 x 44px; rows are at least 68px; all other interactive targets measured at least 44px. Overflowing pagers keep both ends reachable. | [Top](after/me-light-1-top.png), [smaller viewport](after/light-360x640.png) |
| Long result lines became a two-line clipping problem and drowned the activity list in score arithmetic. | Card notes wrap without a line clamp. Recent separates the outcome from the scoring breakdown without removing the breakdown. Scores such as 2-1 use a nonbreaking hyphen. Names and setup badges can wrap instead of truncating. | [Before Recent](before/seeded-light-5-activity.png), [after Recent](after/me-light-6-activity.png) |
| The person sheet spent two full rows on Edit and Close, leaving its memory list cramped. Keyboard focus could leave the modal. | Edit and Close share a fixed bottom row. The scrollable body has a fading edge, retains its scroll position during updates, and keeps its content from shrinking. The sheet includes the real join date and streak. Tab/Shift+Tab stay inside; Escape and the scrim close it and return focus to the originating row. Header drag/flick dismissal is retained. | [Before sheet](before/seeded-light-7-person-sheet.png), [after light](after/me-light-8-person-sheet.png), [after dark](after/me-dark-8-person-sheet.png), [no photo](after/light-sheet-no-photo.png) |
| Pot totals could be mistaken for money already collected. | The large amount is explicitly the per-person buy-in. The secondary line distinguishes the paid member count from the committed amount. All values come from the hub response; there are no fixture numbers embedded in the page. | [Pots and payouts](after/me-light-5-money.png) |
| Initial loading looked like an empty league and failed refreshes were silent. | Static placeholders and a loading label precede the first response. An initial failure has Try again. Later failures retain the last good roster and show an in-flow offline notice, which clears on recovery without obscuring section headings. | [Loading](after/light-loading.png), [failure](after/light-load-failed.png), [offline](after/light-offline.png) |

## Motion, scrolling, and safe areas

The existing MOODBOARD decisions remain: native scroll snapping, 120ms press feedback, 280ms section entrances with 45ms stagger, 450ms number changes, and a 380ms opening/240ms closing sheet. The final two section entrances share their last stagger slot so the entire sequence still finishes within 460ms. No looping animation, shimmer, autoplay, or scroll-jacking was introduced.

Reel and page scroll handlers are passive and coalesced through `requestAnimationFrame`. Refreshes replace only changed sections. An unchanged refresh retained the tested page/reel scroll offsets exactly: `[692, 949]` before and after. Reduced motion disables the reel's view-timeline animation, displays numbers at their final value, uses fades, and avoids smooth tab jumps. [Reduced-motion evidence](after/dark-reduced-motion.png).

The page retains `viewport-fit=cover`, safe-area top padding, and bottom padding for the floating tabs. Section/header horizontal gutters and sheet height also respect safe-area insets. Physical iPhone notch, home-indicator, and Safari behavior still need a device check; desktop Chromium cannot prove those insets.

## Verification

- The full gate passed after integration: `bun run typecheck && bun run test && bun run build`; 125 tests across 11 files, including 13 new roster tests.
- Roster tests cover the empty league, env-configured invite text, demo opt-in, phone profiles, unfinished setup, claimed cards without a phone, durable claim history, real ranks/streaks/participation, seed-round cleanup, and AI/photo/stock portrait selection and serving.
- Only the exact appended-field assertions in `server/hub.test.ts:120` and `server/wallet.test.ts:154` changed. Existing name-based test fixtures remain unchanged; the test configuration explicitly opts into `NICKEL_DEMO=1`.
- A pre-existing Nace test is nondeterministic: `server/nace.test.ts:104-113` chooses a random Krillion prompt but always submits `the obvious one`. If the prompt requires exactly four letters, the correct local validator returns a wipeout and that test fails. Earlier gate attempts encountered this; the complete final gate passed. No Nace-owned file was edited.
- Browser inspection and automated Chromium assertions covered light/dark layouts, real photo URLs and both role portraits, all People rows, owner setup links, person-sheet open/close, focus trapping/restoration, the exact share payload, clipboard fallback, loading/retry, offline/recovery, and reduced motion. No page script errors or external network requests occurred during those assertions; the browser's unrelated `/favicon.ico` request returns 404.
- The tested reel scores were `-17`, `+5`, `+7`, and `+22`, matching `/api/hub`. Member ranks were 1-4, with four named members and two setting up. No interactive target measured below 44px, and the sampled layouts had no horizontal page overflow or clipped leaf text.
- Not verified: the live league's current roster contents, delivery/claiming of a real iMessage link, a physical iPhone, the native operating-system share sheet, or paid portrait generation. The Web Share payload was verified with a browser stub; the OS share chooser was not opened.

## Shared-file integration map

Ranges below are this branch's final line numbers, relative to `origin/sritej/main` at `0bb9b93`:

| File | Changed/added lines | Purpose |
| --- | --- | --- |
| `server/brain.ts` | 7, 9, 72-78, 95-96, 101-105, 174, 258, 346, 414-417, 419-420, 437, 619-620, 678-679, 794 | Roster/demo hooks, persistent claim history, seed sanitization, real portraits, empty-board safety, and contact capture |
| `server/hub.ts` | 3, 177-178, 247-248, 271 | Empty settlement guard and appended `roster` field, preserving the wallet response |
| `server/index.ts` | 6, 158-166 | Serve existing portrait JPEGs and include the real hub response on `/h` |
| `vitest.config.ts` | 6 | Explicit demo mode for existing tests |

The new logic and its tests are in `server/roster.ts` and `server/roster.test.ts`. No changes were made to the other agents' play, leaderboard, recap, Nace, or custom-game files.
