# Research: custom games, custom leagues, and last-place punishments

This is the research behind `server/custom.ts`, `server/punishments.ts` and `apps/preview/custom.html`. Every claim links to the page it came from. Pages were read on November 15, 2026.

## A. Quick group games that work in a chat

### What the sources agree on

1. **One message, no shared clock, fun to read.** SamePage's list of 30 group chat games opens with the rule: "Everyone can answer in one message. Nobody needs to be online at the same time. And the answers are more fun to read than to write." It also says to give "a soft deadline" and that "a game that needs every single person to reply will stall." ([SamePage](https://joinsamepage.com/group-chat-games))
2. **Thirty seconds to explain.** Tribe Chat: "The best group chat games are the ones that take 30 seconds to explain and can run for days, because nobody in a busy friend group wants to download a new app." ([Tribe Chat](https://tribechat.com/blog/group-chat-games))
3. **Asynchronous by design.** GameAnalytics' guide to iMessage games lists asynchronous play first: a game has to "withstand long pauses without the player losing interest", and competition "will boil down to a leaderboard." ([GameAnalytics](https://www.gameanalytics.com/blog/how-to-make-an-imessage-game))
4. **Everyone plays the same thing, at any skill level, and talks about it after.** Game Developer's breakdown of once-a-day games names three goals: engage players of different skill, promote conversation, and stay good over the long run. ([Game Developer](https://www.gamedeveloper.com/design/the-rise-of-once-a-day-games-lessons-learned-from-wordle-s-legacy))
5. **Prompts work best when they are about the group.** Jackbox's writers on Quiplash prompts: use "funny words", ridiculous premises, and inside jokes for a specific group. ([Jackbox Games](https://www.jackboxgames.com/blog/the-science-of-creating-a-quiplash-prompt), [How to write a good Quiplash prompt](https://www.jackboxgames.com/blog/how-to-write-a-good-quiplash-prompt))

### What that means for Nickel

- One move per person, with a personal clock of 5 to 60 seconds that starts when they tap Start.
- A window for the whole group (10 minutes, 1 hour, or 1 day) instead of a requirement that everyone answers. The game closes itself at the window, or anyone who has answered can tap Reveal once two people are in.
- Answers stay hidden until the reveal, so a late player is not copying.
- Every result lands on the same leaderboard as the built-in games.

### The six templates

| Template | One move | How it scores | Why it is here |
|---|---|---|---|
| Closest Guess | Type one number | Closest to the real number wins. Optional rule: closest without going over. A bullseye adds 3. | "Guess the price" is on SamePage's list of guessing games, and guess-the-number is a standard chat bot game ([SamePage](https://joinsamepage.com/group-chat-games), [BotGG](https://botgg.app/features/mini-games/)). The real number can be about the group itself, which is the part no general game has. |
| Hot Take | Tap Agree or Disagree | The bigger side wins. Optional rule: the smaller side wins. | SamePage "Hot-take vote: Reply AGREE or DISAGREE first"; Tribe Chat "Hot Takes Hour". |
| Trivia | Type one short answer | Fastest correct answer wins, other correct answers take half. | Tribe Chat "Daily Trivia Battle"; Discord trivia bots score speed the same way: "Answer fast for 5 points" ([TriviaForge](https://gettriviaforge.com/)). |
| Caption This | Write one line, then tap the best line from the others | Most votes wins. Authors are hidden while voting and nobody can vote for their own line. | SamePage "Caption this" and "Finish the sentence"; the write-then-vote loop is Quiplash ([competitive analysis](https://medium.com/game-design-fundamentals/a-competitive-analysis-of-quiplash-dcb375fa1069)). |
| Fastest Finger | Tap when the board turns blue | Lowest reaction time wins. An early tap restarts the wait. | Reaction rounds are a staple of chat trivia bots ("Frenzy: 7 seconds. Pure reaction", [TriviaSphere](https://triviasphere.com/)). It needs no writing, so it is the fastest game to create. |
| Lowest Unique | Pick 1 to 9 | The lowest number nobody else picked wins. Optional rule: highest. | A studied game with real strategy and no skill barrier: the Swedish LUPI lottery and lab experiments ([American Economic Association](https://www.aeaweb.org/articles?id=10.1257%2Fmic.3.3.1), [Caltech](http://hss.caltech.edu/~camerer/LUPI_final2.pdf)). It was already on the roadmap in `GAME-UI.md`. |

Payout is the same shape for all six: the winner takes the stake (6 Nickels unless the request says "for 10 nickels"), second place or other correct answers take half where the template has an order, and everyone else gets 1 for showing up. A game with one player pays 1, so nobody can farm Nickels alone.

## B. How friend groups run custom leagues

1. **The group writes its own scoring.** Fantasy leagues for TV are scored on rules the league invents: "Dramatic exit? 10 points. Ugly cry? 1 point. Your league, your rules," with a commissioner who can override anything ([Fantasy Reality TV](https://fantasyrealitytv.com/)). Bachelor leagues publish point tables per event, such as a rose, a one-on-one date, or a surprise exit ([Reality Fantasy League](https://bachelor.realityfantasyleague.com/rules), [Bracketology](https://bracketology.tv/how-it-works), [Vulture](https://www.vulture.com/2014/01/how-to-set-up-your-own-fantasy-bachelor-league.html)).
2. **A commissioner applies the rule by hand.** In these leagues a person reads the rule and enters the points. That is the model Nickel already has: anyone texts "Nickel, Teaspoon +10". What was missing was a place to write the rule down so the group scores the same way each time.
3. **A season has a length, and something happens every week.** Weekly awards exist because "nothing kills a fantasy league faster than three teams that stopped setting lineups"; the standard fix is a weekly high score prize, plus variants such as most improved and survivor elimination ([Season DFS](https://seasondfs.com/blog/weekly-payout-ideas-fantasy-football/), [ESPN](https://www.espn.com/fantasy/football/ffl/story?page=nfldk2k10rulestweaks)).
4. **Rules are agreed before the season and written where everyone can see them.** RotoWire and LeagueLogs both say to vote before the draft and write it into the league rules ([RotoWire](https://www.rotowire.com/football/article/fantasy-football-last-place-punishments-94933), [LeagueLogs](https://leaguelogs.com/fantasy-football-punishments)).

### What was added

- "Nickel, league scoring: 1 point per new drink, 5 for a line out the door" saves the league's own rule in plain words.
- "Nickel, season is 8 weeks" (or "10 days") sets the season length and starts the clock.
- "Nickel, league rules" reports the rule, the season, the current week, and the roster size. After the last week it names the winner.
- The standings tab of the league page shows the scoring rule.

Not built: automatic weekly winners. The league log has what is needed to compute one, and it is the next step this research points to.

## C. Last-place punishments

The bar, from the owner: "not BS punishments like drink milk but running a milk mile". The bar from the sources: "A good last-place punishment is public, survivable, and funny for everyone except the loser" ([LeagueLogs](https://leaguelogs.com/fantasy-football-punishments)); set "real boundaries up front: nothing dangerous, nothing that costs someone their job" ([RotoWire](https://www.rotowire.com/football/article/fantasy-football-last-place-punishments-94933)).

Every item below is legal, has no alcohol, and is not permanent. Left out on purpose even though they are popular: tattoos, body waxing, bad haircuts, the beer mile, the 9-9-9 challenge, bar crawls, the gallon challenge, the one chip challenge, texting an ex, eating only McDonald's, and the dog crate.

Sources are abbreviated: **SI** ([Sports Illustrated](https://www.si.com/onsi/fantasy/nfl/top-10-fantasy-football-punishments-for-last-place)), **RW** ([RotoWire](https://www.rotowire.com/football/article/fantasy-football-last-place-punishments-94933)), **LL** ([LeagueLogs](https://leaguelogs.com/fantasy-football-punishments)), **FS** ([FanSided](https://fansided.com/fantasy-sports/50-fantasy-football-punishments-your-league-mates-will-love-or-hate-you-for)), **SL** ([Sleeper](https://sleeper.com/blog/best-fantasy-football-punishments/)), **SN** ([Sporting News](https://www.sportingnews.com/us/fantasy/news/11-funniest-fantasy-football-punishments-loser-2025-league/9b866d447ff5b392166d4433)), **DTV** ([DIRECTV](https://www.directv.com/insider/creative-fantasy-football-punishments/)), **TS** ([TrophySmack](https://www.trophysmack.com/blogs/smackzone/ultimate-guide-to-fantasy-football-punishments)), **BN** ([Bleacher Nation](https://www.bleachernation.com/fantasy-football/2026/08/12/fantasy-football-punishments/)), **AFL** ([AFL Fantasy](https://www.afl.com.au/news/1266443/the-best-losers-punishments-for-your-fantasy-league)). "Kept" means it was already in Nickel's list.

### Mild: private or passive, fine for a group with coworkers in it

| # | Last place... | Source |
|---|---|---|
| 1 | sends a good morning text to the group chat every day until next season | Kept; a version of the daily post in SL, RW |
| 2 | gets the league trophy: a framed photo of the winner on their desk all season | Kept; loser trophy in SL, FS, TS |
| 3 | makes a three-minute apology video to the league and pins it | Kept; RW, TS |
| 4 | takes the group's coffee order every morning for a week, by hand, on foot | Kept; "The servant" SN, draft runner LL |
| 5 | uses a profile picture the group picks on every app for a month | LL, RW, TS |
| 6 | orders coffee for a month under a name the group picks and answers to it | LL |
| 7 | bakes a cake decorated in the winner's honor and delivers it in person | LL |
| 8 | presents a 15-slide deck to the group on why they lost, with questions after | LL |
| 9 | mails a handwritten apology letter to every person in the group | LL |
| 10 | lets the winner write their out-of-office reply for a full week | RW |
| 11 | washes the winner's car in a costume on a weekend morning | LL, FS, RW |
| 12 | hosts movie night with a film the winner picks and buys every snack | LL, BN |
| 13 | reads a two-minute vow of improvement out loud before next season starts | LL |

### Medium: public, takes an afternoon, strangers are involved

| # | Last place... | Source |
|---|---|---|
| 14 | retakes the SAT and posts the score in the chat | Kept; FS, SN, SL, LL, TS, DTV |
| 15 | does a five-minute open mic set and the group picks the topic | Kept; SI, SL, DTV, BN, LL |
| 16 | sets up a lemonade stand and cannot leave until it makes 20 dollars | Kept; SL, DTV, SN, RW |
| 17 | wears a full suit to every class for a week and explains nothing | Kept; embarrassing outfit in SI, RW |
| 18 | lets the group write their dating profile and keeps it up for a month | Kept; LL |
| 19 | holds a sign on the busiest corner on campus that says they finished last | Kept; FS, SL, RW, AFL |
| 20 | performs karaoke of the winner's choice, sober, first song of the night | Kept; FS, SL, SN, DTV |
| 21 | cooks dinner for the whole group in a costume the winner picks | Kept; BN, FS |
| 22 | runs a 5K in jeans and posts the splits | Kept; costume race in SL, LL, RW |
| 23 | takes a stuffed animal to a sit-down dinner for two and orders for both | FS, DTV, SL, SN |
| 24 | waits at airport arrivals for two hours with a sign the winner wrote | LL, RW |
| 25 | plays 18 holes of golf with no ball and explains nothing | RW |
| 26 | runs the full NFL Combine at a public park and posts every result | FS, DTV, BN |
| 27 | records a rap about their season and posts it publicly | RW, TS |
| 28 | wears a rival jersey to a live game and sits with the home fans | FS, LL |
| 29 | caddies a full round for the winner and takes the blame for every bad shot | FS, RW |

### Brutal: a full day, an endurance test, or a month of it

| # | Last place... | Source |
|---|---|---|
| 30 | runs a milk mile: four laps, a full glass of milk before each one | Kept; SI, SL, SN, RW, LL, TS |
| 31 | spends 24 hours in a Waffle House, minus one hour per waffle eaten | Kept; every source, "the most-cited fantasy football punishment on the internet" (RW) |
| 32 | films a calendar shoot, one themed photo for each month, printed for everyone | Kept; LL, DTV, TS, SN |
| 33 | runs an official 5K in a full-body costume with the group's name on the back | LL, SL, RW |
| 34 | eats the full Hot Ones wing lineup on camera while answering the group's questions | LL, RW, FS, DTV, TS |
| 35 | does an organized polar plunge in January, fully under, filmed | LL, RW |
| 36 | walks a full marathon distance in one day wearing a sign that says why | LL |
| 37 | does one pushup for every point they finished behind first, in one session, on camera | LL |
| 38 | takes a flight longer than two hours with no phone, no book and no screen | FS |
| 39 | gets hunted for a day: shares their location and has to dodge the whole group | RW "The Loser Hunt", SL "The Hunt" |
| 40 | performs a choreographed halftime routine in costume at a public game | LL |
| 41 | takes five rideshares dressed as a mascot and reads each driver a speech the group wrote | LL |
| 42 | posts a new embarrassing video every day for a month, ideas supplied by the group | SL, RW |
| 43 | does one hour of interpretive dance in a public square to music the group picks | LL |
| 44 | sings three songs the group picks at a packed bar on a Saturday, sober, no sunglasses | LL |

### Notes on the edges

- The milk mile and the Hot Ones lineup are uncomfortable by design. They stay in the brutal tier and a group can exclude that tier with "Nickel, punishment, mild".
- The polar plunge is written as an organized event on purpose, because a supervised plunge is the safe form of it.
- Two rules every source repeats, which Nickel already follows: agree on the punishment before anyone is losing, and when real money is on the line the loser just loses the money. Nickel refuses to set a punishment once a buy-in has two paid players.

### How the list is used

- `server/punishments.ts` holds the three tiers. "Nickel, punishment" and "Nickel, new punishment" draw from every tier, or from one tier after "Nickel, punishment, mild" (or medium, brutal). "Nickel, punishment, any intensity" clears the choice.
- "Nickel, research a punishment for <context>" returns three options and sets nothing until the group answers "Nickel, option 2". With an OpenAI key the three come from a live web search under the same safety rules. Without a key they come from this list: one per tier, or three from one tier if the request names it, preferring items that share words with the request.
