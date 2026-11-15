# Track 02: GamePigeon and iMessage game UX

Research date: 2026-11-15. Scope: what makes in-chat games feel seamless, what breaks them, and what Nickel's Keiki Vault card flow should copy or avoid.

**Labels.** VERIFIED means I read it in the cited source. INFERRED means my reasoning from verified facts. I did not read Keiki's own Vault docs: `https://onkeiki.com/docs/vault.md` returned 404 when I tried it. Every Keiki-specific recommendation below is therefore INFERRED from the architecture in the brief. Reddit pages return HTTP 403 to the fetch tool, so Reddit items come from search-result snippets only and are marked "(snippet)".

---

## 1. How GamePigeon actually works (the baseline Nickel is competing with)

**VERIFIED**
- GamePigeon is an iMessage extension by solo developer Vitalii Zlotskii. It launched 2016-09-13, the day iOS 10 shipped (https://grokipedia.com/page/GamePigeon, a secondary source). The App Store listing shows 24 games, a 108.8 MB app, "Only for iMessage", free with in-app purchases, and 234K ratings at 4.0 (https://apps.apple.com/us/app/gamepigeon/id1124197642).
- In-app purchases run from $1.99 to $4.99, with GamePigeon+ at $4.99 (https://brainrotgames.gg/guides/imessage-games-for-group-chats).
- The listing says "More games are coming soon!", yet one source says no games have been added since 2020 (grokipedia, same page). A Dec 2025 review calls the games stale: "they've been here for such a long time. No changes." (App Store reviews page).
- Most GamePigeon games are head to head. Crazy 8 is the exception at 3 to 6 players. Everyone in the chat must be on iMessage, so a green-bubble friend is locked out (brainrotgames.gg guide above).
- Mechanically, GamePigeon games ride iMessage as app balloons whose payload is a URL (https://github.com/time-attack/OpenPigeon, which reverse-engineers the wire format).
- The send flow: you tap send on the game bubble, and the friend gets a tappable game bubble. They tap it, take their turn, and the game is sent back automatically (https://newly.app/how-to-play-imessage-games).

**INFERRED.** GamePigeon's success comes mostly from zero-setup challenge flow inside an existing thread, not from game depth. The games are simple, short, and fit "one turn in 30 to 60 seconds".

---

## 2. The Apple platform primitives (these are what the bubble UX is built from)

**VERIFIED**
- **MSSession.** Messages sent with the same session behave like this. The first message appears normally. A later message with the same session removes the previous one from the transcript and adds the updated one at the bottom. If the previous message had a non-nil `summaryText`, Messages inserts a summary line in the old position (https://apple-docs.everest.mt/docs/messages/mssession/). So a game is one live bubble that jumps down the thread, leaving a trail like "Alex played Cup Pong".
- **MSMessageTemplateLayout** is the generic bubble: extension icon, an image or video, caption, subcaption, trailing caption, and trailing subcaption. It is "minimally configurable and designed to be a summary view" (https://twocentstudios.com/2016/06/24/a-deep-dive-into-ios-messages-extensions/, https://medium.com/rendez-voo/how-to-customize-imessage-bubbles-ui-66c97bbcb302).
- **Fallback behavior.** Users without the extension get the summary text and the URL as two separate messages, and only if the URL is http or https. The model is meant to be a URL (`MSMessage.url`) so it degrades to a browser (twocentstudios, same article). Apple designed the system around progressive enhancement.
- **Compact vs expanded.** Compose happens in a compact, keyboard-sized view with an expand control. Tapping an existing bubble opens the extension expanded, full screen (twocentstudios). The transcript presentation style is a third style (https://www.apidocs.mobileui.dev/robovm/latest/org/robovm/apple/messages/MSMessagesAppPresentationStyle.html).
- **Group races.** If two participants modify the same message at once, the latest sent wins and overwrites. Apple recommends keeping state on a server and putting only a resource link in the URL (twocentstudios, citing WWDC16 session 224). Session transcript: https://nonstrict.eu/wwdcindex/wwdc2016/224/.
- **Direct Send (iOS 11, WWDC17 session 234).** Insert-draft needs an extra tap; Direct Send sends immediately. It requires the extension to be visible and a recent user interaction. Each interaction permits one send, and later calls fail with `sendWithoutRecentInteraction` or `sendWhileNotVisible`. Apple says to make clear which control triggers a send (https://nonstrict.eu/wwdcindex/wwdc2017/234/). Apple says insert-draft remains the recommended default because it lets users add a comment or screen effect.
- **Live Message Layouts (iOS 11).** The app can supply its own view inside the transcript, going past the template (same WWDC17 transcript). This is the Apple mechanism closest to the Vault `live:true` card. I could not read the live-layout size or interaction limits because the transcript page truncated, so those limits are unverified here.
- **Apple's installation change.** In iOS 11, installed iMessage apps are enabled by default in the drawer and moved to the front of recents (WWDC17 transcript).

**INFERRED for Nickel**
- A Vault card is likely a template-style or live bubble backed by an https URL. If the Keiki line sends the same card again with a reused session, you get the "bubble replaces itself" behavior for free. Ask Keiki whether Vault cards are MSSession-linked or just new bubbles each time. That one answer decides whether the 1:1 thread stays clean or fills with stale cards.
- Server-held state (Apple's own recommendation) matches the Nickel plan of `/play/<game>/<roundId>`. Do not encode game state in the card URL fragment.

---

## 3. Competitor and adjacent-platform patterns

| Platform | What it does well (VERIFIED) | Source |
|---|---|---|
| Snapchat Turn Based | A "Your Turn" button in the chat opens the Lens with state restored. `endTurn()` captures the Snap and sends it. Global and per-user variables persist across turns, and a final-turn flag ends the game. | https://developers.snap.com/games/turn-based |
| Telegram Games | The game message always carries a Play button. The message shows chat high scores and is updated in place. A service message posts when a new high score is set. A share-score button posts the score to a chat. A GIF preview can make the message attractive. | https://core.telegram.org/bots/games |
| Discord Activities | Launch from a rocket-ship button in a voice call. Others see "Join Activity" on the voice channel. Each activity has its own participant cap. The game is an iframe SPA with a ready handshake. | https://discord.com/blog/server-activities-games-voice-watch-together, https://docs.discord.com/developers/activities/how-activities-work |
| Facebook Instant Games | No install, which helps discovery but hurts retention. Social contexts (a post in a chat with a clear call to action) and a bot channel drive return. Facebook limits how often games can message. The loading screen shows player counts. | https://www.deconstructoroffun.com/blog/2018/3/6/facebook-instant-games-designing-games-for-chat |
| Plato | 30+ games, group chat rooms, ranked play, tournaments. The store listing sells itself as ad-free. | https://apps.apple.com/us/app/plato-fun-multiplayer-games/id1054747306 |
| Cobi Hoops and Cobi Arrows | Short 30-second iMessage challenges. Reviews are mixed (Hoops 2.5 stars, 157 ratings). | https://apps.apple.com/us/app/cobi-hoops/id1169945299?see-all=reviews&platform=iphone |

**Key lessons from the Instant Games teardown (VERIFIED).**
1. Async turn-based play has weak retention: "if players can't keep playing because they're waiting for friends, they will leave the game." The author found it did not retain on Messenger.
2. Direct ports of mobile games mostly failed. Messenger games need rethinking around social interaction.
3. Group dynamics (cooperating or competing in a group chat) were the standout new mechanic.

**INFERRED.** Nickel's chosen game list (simultaneous-reveal games like Lowest Unique Number, 2/3 of average, Sealed Bid, RPS) avoids the async-wait problem for groups. The risk lives in the turn-based 1:1 games (tic-tac-toe, Connect 4, Salvo).

---

## 4. What users love and what they complain about

**Loved (VERIFIED from reviews)**
- Playing without leaving the conversation. One reviewer says it is "perfect for me" because they already text friends while gaming (App Store reviews page).
- A wide selection that already runs inside Messages. The roughly 2016 teen group-chat observation: Game Pigeon spread "like wildfire" through shared bubbles within one month of the iMessage App Store launching (https://medium.com/hackernoon/teen-imessage-group-chats-contain-a-treasure-trove-of-growth-product-development-insights-yes-7e6ce157672d).
- Requests that signal what users want next: replay of past games, bots with easy, medium, and hard levels, and achievements (App Store reviews page, "Amazing game but just a few suggestions").

**Complaints (VERIFIED unless marked snippet)**
1. **"Open the app" / won't open.** The bubble says to open or install GamePigeon even though it is installed, and the drawer icon does nothing until a restart (App Store reviews: "Amazing game but just a few suggestions"; https://apps.apple.com/za/app/gamepigeon/id1124197642).
2. **Blank screen on "Your move".** A reviewer reports that tapping the "your move" button shows one second of the game, then a white screen. The workaround is to switch conversations and come back (https://apps.apple.com/au/app/gamepigeon/id1124197642, 2019).
3. **Stuck re-entry.** If you leave a game and tap back in, it will not load until you open a different game and return (za store reviews).
4. **iOS 17 regression.** The close "X" disappeared and users could no longer move between games smoothly (za store reviews, Sept 2023).
5. **Ads blocking sends.** (snippet) A thread titled "You can't close ads on GamePigeon" says the move will not send until the ad is closed (https://www.reddit.com/r/assholedesign/comments/i85e80/you_cant_close_ads_on_gamepigeon/). Another thread claims ads reflect search history (https://forums.macrumors.com/threads/imessage-game-pigeon-ads-knows-my-search-history.2220498/).
6. **Message history breakage.** (snippet) Threads report old messages failing to load after heavy GamePigeon use, with a temporary fix of deleting one message (https://www.reddit.com/r/iphone/comments/1jns2gu/temp_fix_game_pigeon_bug_prevents_you_from/ and https://www.reddit.com/r/iphone/comments/1icwz3e/imessage_not_loading_old_messages_specific_to_1/). This is plausibly a side effect of many session-replaced bubbles, but that cause is INFERRED.
7. **Stale invitations.** An old invitation can fail after app deletion, reinstall, or an iOS update. Do not keep tapping it; enable the app and send a new game (https://www.techbloat.com/6-fixes-for-gamepigeon-not-working-on-iphone-in-ios-26.html).
8. **Green bubbles and Screen Time.** The game is unavailable if the chat is not iMessage, if the app is disabled, or if Screen Time blocks it (techbloat). One reviewer says it fails when a child's device has app time limits (US reviews page).
9. **No rules.** Many games show "Game manual coming soon". The reviewer could not tell the objective (US reviews page).
10. **Rules bugs destroy trust.** An 8-Ball review describes a loss when the last solid and the 8-ball dropped on the same shot, and says the friends now mock them for it (au reviews page).
11. **Notification lag in timed games.** A Cobi Hoops reviewer says it "lags horribly when receiving notifications; which is frustrating since it is a timed game" (Cobi Hoops reviews page). Another says unpredictable knock-over animations ruin competitive fairness.
12. **Stale-game caps (Plato).** A reviewer found a cap of three open games per room, with no way to clear an abandoned game unless it was 2-player (Plato reviews). Plato also censored the word "Japan".
13. **Setup friction.** Gamebytes tells users to reorder their app bar and press Continue; one reviewer's Continue button stopped working and the app became unplayable (https://apps.apple.com/us/app/games-for-imessage-text-chat/id1506797690).

---

## 5. Design patterns to adopt (22)

Numbers are stated where I have a source. Everything marked INFERRED is a recommendation, not a measured fact.

1. **One bubble per game, updated in place.** Use MSSession semantics or its equivalent so a game occupies one live bubble plus a one-line trail. Source: MSSession doc. For Nickel, post a fresh card and let the agent edit or reply with a trail line (INFERRED).
2. **Caption states the state, not the game.** Use templates such as "Your turn", "Waiting for Sam", "You won". Template layouts give icon, image, caption, subcaption, and trailing captions (twocentstudios, medium). INFERRED: put the verb for the viewer in the caption.
3. **Summary text is the audit trail.** Write it as a past-tense event ("Alex took 12s, Maya took 9s"), because Messages inserts it where the old bubble was (MSSession doc).
4. **A state-rendering preview image.** Show the current board, score, or countdown as the bubble image so the card is informative before it is opened. Telegram does the same with a GIF preview (core.telegram.org). INFERRED: render a 2x PNG server-side per state.
5. **A single obvious call to action.** Telegram always makes the first button the Play launcher (core.telegram.org). Snap uses a "Your Turn" button (developers.snap.com). Give every Nickel card one tap target.
6. **Tap goes straight into the game state.** No lobby. Snap and Telegram both restore state on open. INFERRED: the `/play/<game>/<roundId>` route must render the correct state at first paint (skeleton under 1s).
7. **Server-authoritative state, URL carries only an id.** Apple's own advice for avoiding group races (twocentstudios, WWDC16). Matches the `#kv=<token>` plus roundId design.
8. **Send on the interaction that completes the move.** Direct Send lets one tap play and send in the same gesture (WWDC17). For Nickel, post the result from the backend on submit, so players never need an extra send tap (INFERRED).
9. **Simultaneous-reveal games for groups.** Instant Games found waiting on friends kills retention (deconstructoroffun). Simultaneous games let a whole group finish in one window. INFERRED: give every round a hard deadline (for example 25s for One in a Krillion) so nobody waits on a slow player.
10. **Group-chat dynamics as the hook.** The teardown calls group competition the standout new mechanic. Use the Keiki group chat as the scoreboard: the agent announces the results, uses tapbacks, and runs polls.
11. **Telegram-style scoreboard on the message.** The game message shows chat high scores and updates in place, with a service message on a new record (core.telegram.org). INFERRED: Nickel's agent posts "New record" lines and a weekly board.
12. **Social proof at load.** Instant Games showed live player counts on the loading screen (deconstructoroffun). Show "3 of 5 have played" on the card or loading screen.
13. **Join, don't invite.** Discord shows "Join Activity" to anyone in the room and respects per-game caps (discord.com blog). Every card should say how many seats remain and let a latecomer join.
14. **Guaranteed state restoration on re-entry.** GamePigeon's worst complaints are blank and stuck re-entry (au and za reviews). Persist the in-progress turn on the server and make reopening idempotent.
15. **Explicit in-game exit control.** Always show a visible close or back control. The iOS 17 loss of the X drew complaints (za reviews). INFERRED: the Vault web view chrome may already supply one, so confirm with Keiki.
16. **Inline rules in under 10 seconds.** Reviews flag missing manuals (US reviews page). Show a 2-line rule and an animated hint on first play only.
17. **Rematch as the final screen's primary button.** Instant Games and Plato retention lessons say play must continue with the same friends. Cheap INFERRED implementation: "Rematch" posts a new card carrying the same roster and a running series score (a dev.to write-up of rooms keeps the room, settings, and score on rematch: https://dev.to/dhaval109/play-board-games-online-with-friends-how-i-added-online-rooms-to-22-browser-games).
18. **Results presentation that is screenshot-ready.** INFERRED: a final share image in the group chat (winner, time, a rarity percentile) that works as a tapback or screenshot object. Telegram's share-score button shows the pattern (core.telegram.org).
19. **Cross-device fallback for outsiders.** Apple's design degrades to an https link (twocentstudios), and link-based group games reach Android users (brainrotgames guide). INFERRED: every card's URL should render a usable page in plain Safari or Chrome, so a green-bubble friend can still play.
20. **Network and notification resilience for timed games.** Cobi Hoops's lag-on-notification complaint shows timers must survive interruptions. INFERRED: use a server clock for deadlines, freeze local timers when the view is backgrounded, and show the server-confirmed result.
21. **Bot difficulty and solo fallback.** Reviewers ask for bots when friends are busy (US reviews page). INFERRED: a house bot that fills empty seats at the deadline.
22. **Replay.** Reviewers want to rewatch past games (US reviews page, "Amazing game but just a few suggestions"). INFERRED: store move logs per roundId and show "watch replay" on result cards.

---

## 6. Anti-patterns to avoid (14)

1. **Ads that block the send.** A move that will not send until an ad closes (reddit snippet, assholedesign). Never gate result submission on any interstitial.
2. **A bubble that says "open the app" when the app is open.** Stale or unresolvable cards need an in-page recovery state, not an instruction to reinstall (US and za reviews, techbloat).
3. **Blank white screen on open.** The "your move" white-screen bug (au reviews). Always render a visible skeleton, a timeout message, and a retry button.
4. **State that lives only on one device.** GamePigeon's stuck-reentry complaints (za reviews) reflect fragile client state. Keep state on the server.
5. **Removing the exit control.** The iOS 17 "X" regression (za reviews).
6. **"Manual coming soon".** Shipping a game with no rules (US reviews page).
7. **Undeclared rule edge cases that decide a result.** The 8-Ball same-shot loss (au reviews). For every Nickel game, write tie-break rules down and show the rule that decided a result.
8. **Pay-to-win or cosmetic IAP inside a friend game.** Plato markets itself as free of pay-to-win schemes (Plato listing). Keep cosmetics out of fairness-sensitive rounds.
9. **Unbounded open games.** Plato's three-game cap with no way to clear a dead game (Plato reviews). Auto-expire every round and tell players when it expired.
10. **Over-aggressive profanity filters.** Plato censored "Japan" (Plato reviews). Prefer reveal-then-report over blunt wordlists in any free-text game.
11. **Spammy bot nudges.** Facebook restricts how often games message, and unengaged bot channels drop away (deconstructoroffun). Cap Nickel's agent to a small number of reminders per round, with one at most.
12. **Pure async waiting for a slow friend.** Instant Games' main retention finding. If a turn-based game stalls, the agent should offer a skip, bot takeover, or forfeit after a set delay (INFERRED).
13. **Group-chat flooding.** (INFERRED) GamePigeon-style repeated session bubbles may be the cause of the history-loading complaints (reddit snippets). Keep the group transcript to a few agent messages per round, and keep detailed state inside the card.
14. **Game logic that depends on an unavailable surface.** GamePigeon fails under Screen Time and for green bubbles (techbloat, brainrotgames). Nickel's Vault requirement of iMessage on a Keiki line (1:1 only) inherits that limit, so state it in onboarding.

---

## 7. Nickel-specific recommendations

**Onboarding (INFERRED).** The first card a new friend taps is their onboarding. Make it one screen: a 2-line rule, a "Play" button, and no sign-in (the `#kv` exchange already verifies the phone). Apple's iOS 11 change to enable installed apps by default and rank them first in recents shows the platform treats zero-config launch as the goal (WWDC17 transcript). A Keiki line is a separate number, so say in the group chat message why a 1:1 card is arriving ("check your DMs from Nickel").

**Bubble caption template (INFERRED).**
- Image: current state render.
- Caption: "Wordle Blitz" or the game name.
- Subcaption: "Your turn · 25s" or "3/5 played".
- Trailing caption: the result, for example "You: 4/6".

**Turn notification pattern (INFERRED).** Group chat gets one announcement per round and one result post. Each player's 1:1 thread gets exactly one card per round. Expanded cards suit turn-based games (tic-tac-toe, Connect 4, Salvo) and live cards suit one-tap games (RPS, Stop the Clock), because a live bubble does not scroll (brief) and RPS needs only a tap.

**Spectating (INFERRED).** The brief says games are played in 1:1 Vault threads, so spectating has to happen in the group chat. The agent can post a progress line ("Maya finished in 9.2s") and an image carousel of final boards. This borrows Telegram's pattern of an in-chat scoreboard that updates (core.telegram.org).

**Rematch (INFERRED).** Offer rematch inside the result page and as an agent poll in the group chat ("Run it back?"). Roster, series score, and game settings carry over (dev.to pattern above).

**Version mismatch (INFERRED, partly VERIFIED).** The documented iMessage failure mode is old bubbles that cannot be opened after an update or reinstall (techbloat). Because Nickel games are web pages, you avoid the extension-version problem. Keep a `schemaVersion` in each roundId payload and render a "this round ended, join the new one" page instead of an error.

---

## 8. Open questions for the team

1. Does a Keiki Vault card reuse an MSSession so older cards collapse into a summary line? (Not verified; Keiki docs unavailable to me.)
2. What are the live-card dimensions and tap constraints? Apple's WWDC17 live-layout details were not readable in my fetch.
3. Does Keiki's web view show a close control and handle backgrounding? This drives anti-patterns 3 and 5.
4. Can the agent edit or delete a posted card for an expired round? This is the cleanest answer to the stale-invitation problem.

## Source list

- https://apps.apple.com/us/app/gamepigeon/id1124197642 (and ?see-all=reviews, /au/, /za/ storefront variants)
- https://grokipedia.com/page/GamePigeon
- https://apple-docs.everest.mt/docs/messages/mssession/
- https://twocentstudios.com/2016/06/24/a-deep-dive-into-ios-messages-extensions/
- https://nonstrict.eu/wwdcindex/wwdc2016/224/
- https://nonstrict.eu/wwdcindex/wwdc2017/234/
- https://medium.com/rendez-voo/how-to-customize-imessage-bubbles-ui-66c97bbcb302
- https://developers.snap.com/games/turn-based
- https://core.telegram.org/bots/games
- https://docs.discord.com/developers/activities/how-activities-work
- https://discord.com/blog/server-activities-games-voice-watch-together
- https://www.deconstructoroffun.com/blog/2018/3/6/facebook-instant-games-designing-games-for-chat
- https://apps.apple.com/us/app/plato-fun-multiplayer-games/id1054747306
- https://apps.apple.com/us/app/cobi-hoops/id1169945299?see-all=reviews&platform=iphone
- https://apps.apple.com/us/app/games-for-imessage-text-chat/id1506797690
- https://github.com/time-attack/OpenPigeon
- https://brainrotgames.gg/guides/imessage-games-for-group-chats
- https://www.techbloat.com/6-fixes-for-gamepigeon-not-working-on-iphone-in-ios-26.html
- https://newly.app/how-to-play-imessage-games
- https://medium.com/hackernoon/teen-imessage-group-chats-contain-a-treasure-trove-of-growth-product-development-insights-yes-7e6ce157672d
- Reddit snippets only: assholedesign/i85e80, iphone/1jns2gu, iphone/1icwz3e; MacRumors thread 2220498
