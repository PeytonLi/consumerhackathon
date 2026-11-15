# Social daily-game retention UX for Nickel (research track 04)

Scope: what makes friend-group games stick, adapted to a Keiki agent in an iMessage group plus 1:1 Vault cards. Tags: **[V]** = read in a source (URL given), **[I]** = my inference or recommendation. Items marked "secondary" came from a summary or search snippet, not the primary page. I did not read Keiki docs in this track, so Keiki platform limits are out of scope here.

## 0. Bottom line

1. The group chat is the leaderboard and the notification channel. Wordle's growth came from a spoiler-free result artifact people paste into chats, not from an in-app social graph. Nickel should make every round end in one pasteable/tappable result artifact the agent posts itself.
2. Streaks should be shared, forgiving at the start, and counted in a small unit. Duolingo's data supports a *friend* streak and two early freezes, not a punishing solo streak.
3. Keep the round short, with a hard deadline and one clear reveal moment. Suspense is staged in 3 beats (lock-in, count-up, reveal), not by waiting longer.
4. Cap agent messages. Group chats already suffer tapback and notification fatigue. One scheduled prompt plus one result per game per day is the ceiling.
5. Real-money pots between friends are legal only in narrow, state-specific cases. Ship points/bragging rights first. If money ever appears, it needs counsel and should not be run by Nickel as the house.

## 1. The shareable result artifact (Wordle)

- **[V]** Wordle launched mid-Oct 2021; the colored-square share grid was added in December 2021 and then the game went viral (Slate: https://slate.com/culture/2022/01/wordle-game-creator-wardle-twitter-scores-strategy-stats.html; ANU: https://reporter.anu.edu.au/all-stories/why-is-the-world-so-rapt-by-wordle).
- **[V]** The grid is spoiler-free because everyone plays the same word, so you can show effort without revealing answers (RNZ interview: https://www.rnz.co.nz/national/programmes/the-weekend/audio/2018826546/josh-wardle-the-power-of-wordle). NYT credits the "spoiler-free scoring grid" for spread across social media and group chats (https://www.nytimes.com/2022/01/14/crosswords/everyone-wants-to-be-wordle.html).
- **[V, secondary]** A Forbes post claims 59% of players share results "often" or "sometimes" (https://www.facebook.com/forbes/posts/wordle-has-a-feature-that-allows-players-to-share-their-results-on-social-media-/10160094411342509/). I could not verify the survey method; treat it as directional.
- **[V]** NYT's own framing: solvers already share scores "in group chats or on social media," so they built a friends leaderboard (https://www.nytco.com/press/nyt-games-launches-multi-game-leaderboard/). The NYT leaderboard covers Wordle, Connections, Spelling Bee and the Mini, and requires a registered account and the Games app.

**Nickel implications [I]**
- Every game needs a "result line" that reveals skill/luck but not the answer: e.g. `Nickel Wordle #212  3/6  ⬛🟨🟩⬛🟩 / 🟩🟩🟩🟩🟩`, `Nickel Krillion #88  rarity 0.7%  🦐🦐🦐🦐`, `Salvo vs Maya: won, 14 shots`.
- Because Nickel's agent can only post text/tapbacks/polls/images in the group, the result artifact is the main way a *card played in a 1:1 Vault* shows up in the *group*. Post it as plain text (pasteable and copyable) plus an optional image carousel at weekly recap.
- Make the format identical every day. A fixed format becomes a recognizable meme; format churn kills pasteability.

## 2. Small-group leaderboards (3 to 12 friends)

**What exists**
- **[V]** NYT Games: add friends to a leaderboard that spans several games; celebrity accounts were added as a temporary promo (press page above). Reddit shows players actively recruiting leaderboard partners for "daily leaderboard & streaks" (https://www.reddit.com/r/NYTConnections/comments/1opcx7p/looking_for_more_nyt_connections_players_daily/), which implies friction in finding people (**[I]**). Nickel avoids that by starting inside an existing group.
- **[V]** Duolingo Friend Streak: up to 5 friends, each separate streak, both must accept, each person only does their own daily lesson. Learners with at least one friend streak are 22% more likely to finish the daily lesson, rising with more friend streaks. 57% of users have at least one friend (https://blog.duolingo.com/product-lessons-friend-streak/, https://blog.duolingo.com/friend-streak/). A "nudge" button exists for the friend who has not done today's lesson (screenshot caption in the friend-streak post).
- **[V]** Duolingo Friends Quests: weekly random pairing from friends, five days to finish, shared progress bar, shared reward (https://blog.duolingo.com/friends-quests/). Duolingo says learners who follow friends are 5.6x more likely to finish a course (same page).
- **[V]** Duolingo leagues push copy: "Only the top 5 in your league move up!" (https://duolingo.deconstructoroffun.com/mechanics/notifications). Leagues are large strangers pools; at 3-12 friends the equivalent is simpler.

**Recommended design [I]**
- **Rank the day, not the lifetime.** With 3-12 people, a daily podium (gold/silver/bronze, then the rest) is readable in one text. Lifetime totals let a leader run away and make late joiners feel hopeless.
- **Three tables, rotating:** today, this week (Mon-Sun reset), and "season" (4 weeks). Show weekly by default on Sunday. The reset gives everyone a fresh shot, which matters most for the bottom of a small group.
- **Show at most top 3 plus you.** In a 12-person group, a full list in a text bubble is long. Fall back to a card image for the full table.
- **Compare to yourself too.** Add personal bests ("your fastest Wordle: 2/6") so last place still has something to celebrate.
- **Handicaps for mixed skill:** use a median-relative score for estimation games (distance from the group median) rather than raw points, so one expert doesn't win every day. Alternate "skill" and "luck" games (Lowest Unique Number, 2/3 of average, RPS) so the order of winners shuffles. This is the Jackbox principle; see section 4.
- **Team mode at 6+:** split into two teams for the weekly. Shared progress (Duolingo Quest style) lowers the sting of individual losses.

## 3. Streaks that don't feel punishing

**Evidence**
- **[V]** Duolingo says streak animations raised 7-day retention for new learners by +1.7%, and that novelty fades so loss aversion takes over for longer streaks (https://blog.duolingo.com/how-duolingo-streak-builds-habit/). Going from 2 to 3 days is +50%; 200 to 201 is +0.5% (same page), which is why early streak days need the strongest celebration.
- **[V, secondary summary of Lenny's Podcast interview with Duolingo's group PM]** More than 600 streak experiments over four years, about half lose; counting one lesson per day beat an XP goal; giving **two streak freezes at the start was one of the biggest wins**; three freezes added nothing over two; retention jumps to day 7 then flattens, "loss aversion kicks in around day seven"; too much flexibility "cheapens" the streak (https://usecaddie.app/s/behind-the-product-duolingo-streaks). I read the Caddie summary page, not the video, so verify exact numbers before quoting externally.
- **[V]** Wordle players report painful streak losses and even bugs that reset streaks (Reddit https://www.reddit.com/r/wordle/comments/1b3sp7c/what_happened_to_my_streak/, Business Insider "Losing My 222-Day Wordle Streak Was Painful, and Liberating" https://www.businessinsider.com/lost-long-wordle-streak-painful-liberating-2026-5). Lesson: a lost streak is an emotional event; design the break, not just the keep.
- **[V]** The most social streak mechanic requires no coordination: "the first social feature we've seen that doesn't require you to actually do anything with another learner" (Duolingo friend-streak product lessons URL above).

**Nickel streak spec [I]**
- **Unit:** "played today's round of any game" (one tap into a card counts). Do not require winning. Counting a very low bar (one exercise) failed to move DAU at Duolingo, but "one lesson" worked, so the unit should be one *complete round*, not one tap.
- **Two kinds:** (a) *Group streak*: consecutive days at least N players played (N = 50% of members, min 2). (b) *Personal streak*: private, shown only to you.
- **Group streak is the headline.** It is a shared commitment without requiring anyone to play together, which is the Duolingo finding.
- **Freezes:** every new group starts with 2 freezes; earn 1 more per 7 consecutive days, cap 2. The agent applies them automatically and says so, so nobody has to remember to equip one.
- **Break copy (no guilt):** "Streak paused at 12 🧊 (freeze used). Back on today's round?" and after a real break, "Streak ended at 12. Longest ever: 12. New one starts with today's round." Never say "you lost" or name the person who missed. Do not publicly attribute a break to an individual. [I]
- **Weekend rule:** only count Mon-Fri for the group streak by default, with optional weekend rounds as bonus. Friend groups don't all play on Saturdays. [I]
- **Milestones:** celebrate days 3, 7, 14, 30, 50, 100 with an iMessage effect (confetti or fireworks, whichever Keiki exposes) and a result card. Day 3 and 7 matter most per the Duolingo data above.

## 4. Reveal pacing and suspense

**Evidence**
- **[V]** HQ Trivia: 10 seconds per question, 12 questions, one wrong answer eliminates you, winners split the pot, and if no one survives it carries over; sessions ran 3pm and 9pm ET (https://www.deconstructoroffun.com/blog/2018/1/16/hq-trivia-and-the-rise-of-mobile-streaming; Wikipedia https://en.wikipedia.org/wiki/HQ_(video_game)). HQ later shut down; the format needed everyone online at the same instant. For a group chat, that is a lot to ask daily, so use a *window*, not a single instant. [I]
- **[V, secondary]** Kahoot: up to 1000 points per correct single-select answer, with the speed bonus shrinking linearly with time; a leaderboard shows between questions (https://support.kahoot.com/hc/en-us/articles/115002303908-How-points-work, plus formula detail from https://quizonator.com/en/guides/how-to-win-kahoot). Kahoot found "it was really fun to get a high number of streaks regardless of points," so they added a fixed bonus per answer streak (https://medium.com/inside-kahoot/developing-new-game-mechanics-at-kahoot-be7ddb52f6df). Kahoot's rationale for streaks: avoid the "rush to answer" trap of pure speed scoring (https://medium.com/inside-kahoot/experimenting-with-answer-streaks-to-help-make-learning-awesome-3b3357e42595).
- **[V]** Jackbox: simple interfaces ("my aunt's…"), 15-20 minute sessions, and time pressure so nobody waits on the slowest player (https://www.builtinchicago.org/articles/jackbox-games-design-party-pack, https://techcrunch.com/2020/05/04/all-product-creators-can-learn-something-from-jackbox-games-user-experiences/). Quiplash shows one prompt at a time and has the group vote (http://www.phantomknightgames.com/news/game-analysis-fibbage-and-quiplash/). Kahoot host tips recommend commentary and celebrating answer results (https://support.kahoot.com/hc/en-us/articles/360039900153-Tips-for-hosting-a-live-game).

**Nickel reveal template [I, timings are my recommendation, not measured]**
1. **Lock-in (0 s):** the moment a player submits, the card shows "Locked in ✓" and a haptic. They must not be able to change it. This creates commitment.
2. **Wait state (until deadline or all in):** the agent edits nothing and sends nothing unless a deadline is near. For games with a fixed clock (One in a Krillion 25 s, Stop the Clock), the card itself carries the countdown.
3. **Close-out (T+0):** the agent posts one text: "Round closed. 5 of 6 played. Results in 10…".
4. **Count-up (about 3 to 6 seconds of staged beats):** reveal from last place to first, one line per beat, 1.2 to 2 s apart in the *card* (animation, not messages; iMessage message pacing is not reliable at that granularity). In the group chat, post the full result as one message, with the winner tapback (heart) or an effect on that message.
5. **Reveal peak:** the winner line is last and stands alone. Rarity/odds games (Krillion) reveal the *rarity number* first ("Only 0.7% said this") then the player's name.
6. **After-glow (within 60 s):** one prompt that invites trash talk: poll "Rematch tomorrow?" or a tapback invite. Not another score table.

**Rules of thumb [I]**
- Never have the card reveal after the group message already did, or vice versa. Pick one place for the suspense (the card) and one for the record (the chat). Otherwise the group message spoils the card for the slowest player.
- Async games (Wordle Blitz, Sealed Bid) should hide others' results until you have played, as Wordle's spoiler-free grid does. The chat summary should post only after the deadline, or show *who has played* but not *how* ("4/6 in 🟩").
- A late-joiner banner on the card: "Round closed 3 min ago. Play for practice, not for rank." Avoid dead ends.

## 5. Time-boxed prompts (BeReal, Locket)

- **[V]** BeReal sends one notification a day at a random time, to everyone in a time zone at once; you have 2 minutes to post (https://help.bereal.com/hc/en-us/articles/15416869159197--Time-to-BeReal-Notification). Posting late is allowed but marked as late; a Cherwell piece notes the two-minute timer is "an idle threat" because many post hours late (https://cherwell.org/2023/01/17/time-to-berealall-the-time/). Lesson: a *visible* deadline plus soft enforcement (late flag, not a lock-out) keeps the pressure without hard failure.
- **[I]** For Nickel, a random daily moment would be intrusive in a group chat people use for plans. Use a *consistent, user-set daily time* (e.g. 12:30 local) chosen via a group poll on day one, plus a *surprise* weekly "flash round" (once a week, 5 minute window, announced the same time-of-day range). Surprise once a week gives the BeReal "we're all on at the same instant" effect without daily intrusion.
- **Late policy:** a round stays open 24 h for async games, with a visible "on time" vs "late" mark. Live-pressure games (Stop the Clock, Krillion) use a short window (5-10 min) and then close.

## 6. Notification copy and cadence

**Evidence**
- **[V]** Duolingo pushes are pinned to a motivation the user already cares about (continuity, competition, belonging, reward, completion) and rotate them to avoid "hook monotony" (https://duolingo.deconstructoroffun.com/mechanics/notifications). Examples there: "You're SO close to a 75 day streak", "You're out of the top 5 😢".
- **[V]** Apple's HIG says a notification should give "timely, high-value information they can understand at a glance" (https://developer.apple.com/design/human-interface-guidelines/notifications). The managing-notifications page lists interruption levels that decide whether a notification breaks through Focus; I could not read its body text, so I only rely on the headline guidance. OneSignal suggests ~120-150 characters, noting Apple truncates beyond 178 (https://onesignal.com/blog/apple-push-notification-best-practices/, secondary).
- **[V]** Group chats get overrun by tapbacks (https://9to5mac.com/2024/11/15/tapbacks-are-better-in-ios-18s-messages-app-but-they-need-one-key-fix/, https://www.macworld.com/article/2482686/apples-made-messages-more-fun-but-the-notifications-system-sucks.html). Any bot adding reactions per message adds to that.
- **[V, secondary]** Sleeper users complain that "in game hype notifications" need their own category to turn off (https://www.reddit.com/r/DynastyFF/comments/1fa4e7e/sleeper_notifications_are/ - I only saw the search snippet; page fetch returned 403). Directional only.
- **[V]** Sleeper's league chat features reactions, GIFs, polls, and trash talk (https://sleeper.com/fantasy-football/, https://support.sleeper.com/en/articles/1951583-what-are-sleeper-s-unique-features) and lets you customize alerts (YouTube guide in search).
- **[V]** In an iMessage group the only mute lever users have is Hide Alerts per conversation (https://www.digitalcitizen.life/how-to-play-imessage-games-on-iphone/). If Nickel is annoying, the group mutes the whole chat, which also silences friends. That is the strongest argument for restraint. [I]

**Cadence budget for the group [I]**
| Event | Max messages/day | Timing |
|---|---|---|
| Daily prompt | 1 | user-set time, default 12:30 local |
| Reminder to non-players | 1, only if >=50% haven't played and streak is at risk | 2 h before deadline, targeted at the 1:1 Vault line, not the group |
| Result | 1 | at deadline or when all have played |
| Milestone / recap | 1 (weekly Sunday 7pm) | combined with result when same day |
| Quiet hours | none 10pm-8am local | queue until morning |

Hard cap: 3 agent-initiated group messages per day, with a one-message-per-game rule. Tapbacks from the agent: only on the winner's result and at most 1 per round. [I]

**Copy templates (group)** [I]
- Daily: `Today's Nickel: Wordle Blitz 🟩 closes at 9pm. Tap your card.` (not "Don't miss out!")
- Streak at risk, targeted 1:1: `Group streak is at 11. Just 1 more person and it's safe 🧊` (names the goal, not the person)
- Result: `🏆 Maya 3/6 · Dev 4/6 · you 5/6 · Sam hasn't played` (neutral; no shaming)
- Trash-talk starter: `Dev beat Maya 3 days running. Rematch Friday?` plus a poll.
- Welcome: `I'm Nickel. One round a day, takes 1 minute. Reply STOP anytime to pause me.`

**Copy patterns to avoid** [I]
- Confirmshaming ("No thanks, I don't like winning"), guilt about specific absent friends, fake scarcity, countdown on an "offer".

## 7. Trash talk and social features

- **[V]** Fantasy apps treat chat as the core engine: Sleeper's in-app chat with reactions, GIFs, polls, and league events mixed into the thread ("Modern League Chat", support article above). The product point: results and banter occupy the same stream.
- **[V]** Gas: answer polls about friends and get "flames" when picked; hourly polls; compliments only (Common Sense Media https://www.commonsensemedia.org/app-reviews/gas, teardown https://snaphabit.app/blog/gas-app-teardown/). The mechanic is positive-only, which is why it stayed wholesome (https://www.uiskillbook.com/design-md/gas.md calls it "deliberately, unapologetically joyful"). Gas's invites are personalized ("compliments waiting") and use contact-graph second-degree matching (teardown). NGL (anonymous Q&A) is described as controversial (probablynothing https://www.probablynothing.vc/p/gas-rise-wholesome-social).
- **[I] Nickel social features worth building**
  - **Superlatives:** weekly agent-generated awards using only positive or playful categories: "Clutch Closer", "Most Unlucky", "Hot Streak", "Gone Fishing" (least active, light tone). Opt-out per member.
  - **Callouts:** one-tap "Challenge Dev" on a card that sends a 1:1 prompt, with a limit of 1 challenge per person per day. Duolingo's nudge is the model; add the cap.
  - **Receipts:** agent remembers head-to-head records ("Dev leads Maya 5-3 at tic-tac-toe") and posts them only on request (a poll option) or on rematch.
  - **Reaction-first results:** the agent asks for an emoji reaction rather than text, which keeps the chat quiet and gives a cheap, visible social signal.
  - **No anonymous features** in v1: anonymity enables harassment and complicates moderation.

## 8. Onboarding friends who have nothing installed

- **[V]** Partiful: "Guests RSVP — no app needed"; browser link, no account (https://partiful.com/, https://partiful.com/invitations/online-rsvp). A single link works because the event page *is* the product.
- **[V]** Gas used contact-list matching and heavy onboarding yet still hit #1; but its invites said "compliments waiting," which gave the invitee a reason to install (teardown above). Duolingo found most value in friends *already* in the product (57% have a friend; 22% lift).
- **[I]** Nickel's setup is unusually light: the friend is already in the iMessage group. The friction is the Vault card, which (per the parent brief) only opens in 1:1 chats on a Keiki line, and the first tap exchanges the token for a verified phone. Suggestions:
  1. **Make the first play zero-account.** First card opens straight to a round already in progress (practice or today's real round). Phone verification arrives silently from the Vault token, so no sign-in screen.
  2. **First round is a tutorial that counts.** 30-60 s max, with a visible "you're in the group's standings now" payoff at the end.
  3. **Do not ask everyone to join at once.** Seed with a "founder" who invites; the agent addresses a non-player once with a friendly card ("Maya, you're up: 1 minute"), then goes quiet for 3 days. Max 2 invitation reminders total. [I]
  4. **Consent and opt-out in the first message** (see section 9), and a "Pause me" poll anyone can start.
  5. **Spectator mode:** a person who hasn't played can still see the day's leaderboard on the web page of the card. This is the Partiful pattern (the link is useful before commitment). [I]

## 9. Ethical limits and gambling-adjacent rules

**Dark patterns**
- **[V]** The FTC treats dark patterns, including steering and trapping, as an enforcement priority (https://www.ftc.gov/news-events/news/press-releases/2021/10/ftc-ramp-enforcement-against-illegal-dark-patterns-trick-or-trap-consumers-subscriptions, https://www.ftc.gov/news-events/news/press-releases/2022/09/ftc-report-shows-rise-sophisticated-dark-patterns-designed-trick-trap-consumers). The Epic Games $245M refund settlement involved unwanted charges via dark patterns (https://www.ftc.gov/business-guidance/blog/2022/12/245-million-ftc-settlement-alleges-fortnite-owner-epic-games-used-digital-dark-patterns-charge). Those cases concern subscriptions and purchases, not streaks, so the direct legal exposure for a free game is small (**[I]**), but the principle (don't trick or trap) applies if Nickel ever sells freezes or premium.
- **[I] Guardrails:** (1) never sell freezes in v1; (2) no loss-framed push for a purchase; (3) one-tap pause for the whole group; (4) no streak pressure on individuals who left or muted; (5) no public naming of who broke the streak; (6) respect minors: Gas-type audiences are teens, and Nickel should assume 18+ unless age-gated. Consider an age check before any money feature.

**Real-money pots between friends**
- **[V]** A majority of US states have a social-gambling exception, with conditions: a genuine pre-existing social relationship, a private setting, and no one profiting from running the game; penalties range from misdemeanors to federal felonies (https://legalclarity.org/social-gambling-laws-by-state-rules-and-penalties/, secondary legal-blog source dated May 12, 2026).
- **[V]** Iowa's statute is a concrete example: the exception requires a social relationship beyond the gambling itself, no fixed or contingent right to the pot for the operator, no participation charge, and a cap of $200 won or lost per 24 hours (https://www.legis.iowa.gov/docs/code/2026/99B.42.pdf).
- **[V]** Oregon: participating in unlawful gambling is a Class A misdemeanor, and promoting or profiting is a Class C felony; "unlawful" means not specifically authorized (https://www.doj.state.or.us/wp-content/uploads/2010/01/op2010-1.pdf). Sweepstakes-style models are under active legislative attack (California AB 831: https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260AB831; New Jersey A5447: https://pub.njleg.state.nj.us/Bills/2024/A5500/5447_I1.HTM; Louisiana AG opinion 25-0083: https://ag.louisiana.gov/Opinion/Download/25-0083).
- **[I] Product stance:**
  1. **v1: no money.** Stakes are bragging rights, group-chat roles ("keeper of the trophy"), and custom effects.
  2. **If a pot is demanded,** Nickel must not hold funds, take a fee, or pick winners using its own random draw. The legally safest pattern is a self-declared side bet the *friends* settle with Venmo, with Nickel only reporting who won. This is **not legal advice**; skill-versus-chance varies by state (Lowest Unique Number, RPS, 2/3-of-average, Sealed Bid are pure-chance-like or strategy games, and the legal test differs by state; Wordle/Salvo/Connect 4 are skill games).
  3. **Never** pair real money with loss-framed streak pressure, daily deposit prompts, or auto-rebuy.
  4. If you later add prediction-style props, note that Polymarket and Kalshi converged on near-identical exchange-style UIs since 2022 (https://www.humaninvariant.com/blog/pm-interface) with dense dashboard layouts (Kalshi: https://getdesign.md/design-md/kalshi). For friends, use none of that: use two big buttons and a friend-avatar split ("3 for / 2 against") and play-money only.

## 10. Checklist to hand to design/eng

- Result line format fixed per game; plain text; spoiler-free (section 1).
- Daily podium plus weekly reset; show top 3 plus self; median-relative scoring for estimation games (section 2).
- Group streak with 2 starting freezes, auto-applied; neutral break copy (section 3).
- Reveal: lock-in, one close-out message, card-side count-up of 3-6 s, winner last (section 4).
- Cadence cap of 3 agent-initiated group messages a day; reminders go 1:1 (section 6).
- First card opens without any sign-in; first round counts for standings (section 8).
- No money in v1; no sale of freezes; positive-only superlatives; one-tap pause (section 9).

## 11. Gaps and what I could not verify

- I did not read Keiki docs, so how quickly Keiki can send multiple messages, edit a posted message, or apply iMessage effects is unverified; the 1.2-2 s staged reveal assumes the card (web page) does the animation, not the chat.
- Reddit pages returned 403 through the fetcher, so Sleeper complaints rest on a search snippet.
- The Duolingo freeze numbers come from a third-party summary of a podcast; the Duolingo blog pages I read directly support the friend-streak (22%), +1.7% animation, and 7-day claims.
- Timing numbers in sections 4 to 6 are recommendations to A/B test, not published benchmarks.
