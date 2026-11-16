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
- The standings tab of the league page shows the scoring rule and season length. Web creation is at `/leagues/new`; the creator can edit an existing league at `/leagues/<id>`.
- Inline chat creation also works: `Nickel, make a league for reality TV; scoring: 5 per rose; season: 8 weeks; picks: Dev, Maya`.

Not built: automatic weekly winners. The league log has what is needed to compute one, and it is the next step this research points to.

## C. Last-place punishments

The owner's standard is a memorable production, not "drink milk". Research found the milk mile, 24-hour diner challenge, SAT, open mic, calendar, costume race and dozens of league-service rituals. Several published lists also recommend genuinely dangerous or permanent dares. Being published does not make a dare safe.

The shipped catalog below has **44 sourced traditions or explicitly adapted versions**. A source link establishes the original tradition, not a claim that a publisher tested or endorsed Nickel's safer adaptation. The adaptations retain the spectacle while removing forced eating, cold exposure, strenuous exercise, employer-account access, location tracking and unwitting strangers.

**Applies to every option:** agree before the season; stop or swap at any time without a penalty; permission from venues and participants; no forced eating, alcohol, nudity or permanent changes; a 20-dollar budget; no session longer than two hours. Accessibility substitutions are always allowed. Sharing stays in the group unless the participant expressly agrees to a wider audience. "Brutal" means performance and commitment, not physical danger.

### Source key

- [LeagueLogs](https://leaguelogs.com/fantasy-football-punishments): calendars, open mic, airport signs, PowerPoint, costumes, chores, handwritten letters and karaoke.
- [Sleeper](https://sleeper.com/blog/best-fantasy-football-punishments/): 18 traditions including milk mile, diner challenge, costume race, hunt and daily videos.
- [RotoWire](https://www.rotowire.com/football/article/fantasy-football-last-place-punishments-94933): duties, apology videos, out-of-office reply, original rap, imaginary golf and mock recruiting.
- [FanSided](https://fansided.com/fantasy-sports/50-fantasy-football-punishments-your-league-mates-will-love-or-hate-you-for): practice-test basis, stuffed-animal dinner, NFL Combine, rival jersey, caddy and screen-free flight.
- [DIRECTV](https://www.directv.com/insider/creative-fantasy-football-punishments/): calendar shoot, fitness test and dinner hosting.
- Additional corroboration: [Sports Illustrated](https://www.si.com/onsi/fantasy/nfl/top-10-fantasy-football-punishments-for-last-place), [Sporting News](https://www.sportingnews.com/us/fantasy/news/11-funniest-fantasy-football-punishments-loser-2025-league/9b866d447ff5b392166d4433), [TrophySmack](https://www.trophysmack.com/blogs/smackzone/ultimate-guide-to-fantasy-football-punishments), [Bleacher Nation](https://www.bleachernation.com/fantasy-football/2026/08/12/fantasy-football-punishments/).

### Mild

| # | Last place... | Source and safety adaptation |
|---|---|---|
| 1 | sends a dramatic good morning announcement to the league every day for one week | [Source](https://sleeper.com/blog/best-fantasy-football-punishments/). Adapted daily-video duty into a private daily announcement. |
| 2 | gets the league trophy: a framed photo of the winner on their desk all season | [Source](https://leaguelogs.com/fantasy-football-punishments). Kept the existing framed-winner trophy variation. |
| 3 | makes a three-minute apology video to the league and pins it | [Source](https://www.rotowire.com/football/article/fantasy-football-last-place-punishments-94933). Kept the apology-video tradition. |
| 4 | takes the group's coffee order by hand for a week, in a paper butler bow tie | [Source](https://www.rotowire.com/football/article/fantasy-football-last-place-punishments-94933). Adapted league-service duty with a paper costume. |
| 5 | uses a league-approved loser portrait as their group chat picture for one week | [Source](https://leaguelogs.com/fantasy-football-punishments). Limited picture takeover to the consenting person's group profile. |
| 6 | orders coffee for a month under a name the group picks and answers to it | [Source](https://leaguelogs.com/fantasy-football-punishments). A harmless name only; no impersonation. |
| 7 | bakes a cake decorated in the winner's honor and delivers it in person | [Source](https://leaguelogs.com/fantasy-football-punishments). Food allergies and normal kitchen safety apply. |
| 8 | presents a 15-slide deck to the group on why they lost, with questions after | [Source](https://leaguelogs.com/fantasy-football-punishments). Adapted the 30-minute PowerPoint into 15 slides. |
| 9 | mails a handwritten apology letter to every person in the group | [Source](https://leaguelogs.com/fantasy-football-punishments). Kept the mailed-letter tradition. |
| 10 | records a league-written out-of-office voice memo and reads it at every game night for a week | [Source](https://www.rotowire.com/football/article/fantasy-football-last-place-punishments-94933). Adapted work-email takeover into a private voice memo. |
| 11 | washes the winner's car in a costume on a weekend morning | [Source](https://leaguelogs.com/fantasy-football-punishments). Owner permission and a safe washing location required. |
| 12 | hosts movie night with a film the winner picks and buys every snack | [Source](https://leaguelogs.com/fantasy-football-punishments). Keep snacks within the agreed budget. |
| 13 | reads a two-minute vow of improvement out loud before next season starts | [Source](https://leaguelogs.com/fantasy-football-punishments). Kept the draft-day vow. |

### Medium

| # | Last place... | Source and safety adaptation |
|---|---|---|
| 14 | sits a two-hour practice SAT in silence while the group proctors, then posts the score | [Source](https://fansided.com/fantasy-sports/50-fantasy-football-punishments-your-league-mates-will-love-or-hate-you-for). Adapted SAT at a real test center into a practice exam. |
| 15 | does a five-minute open mic set and the group picks the topic | [Source](https://leaguelogs.com/fantasy-football-punishments). Venue sign-up and organizer permission required. |
| 16 | runs a permitted lemonade stand in costume for two hours, with a 20-dollar sales target | [Source](https://leaguelogs.com/fantasy-football-punishments). Added a two-hour cap and permission; no sales quota traps. |
| 17 | wears a full suit to every class for a week and explains nothing | [Source](https://leaguelogs.com/fantasy-football-punishments). Skip any occasion with a dress-code or comfort conflict. |
| 18 | lets the league write a fictional dating profile and reads every line at game night | [Source](https://leaguelogs.com/fantasy-football-punishments). Adapted dating-app takeover into a fictional private reading. |
| 19 | holds an I finished last sign for 20 minutes in a permitted pedestrian spot on campus | [Source](https://leaguelogs.com/fantasy-football-punishments). Moved roadside signs away from traffic. |
| 20 | performs karaoke of the winner's choice, sober, first song of the night | [Source](https://leaguelogs.com/fantasy-football-punishments). Kept karaoke; no alcohol required. |
| 21 | cooks dinner for the whole group in a costume the winner picks | [Source](https://leaguelogs.com/fantasy-football-punishments). Cooking permission, dietary needs and budget apply. |
| 22 | walks a one-mile red carpet in formalwear while the league interviews them about losing | [Source](https://sleeper.com/blog/best-fantasy-football-punishments/). Adapted costume/endurance walk into a short ceremonial performance. |
| 23 | takes a stuffed animal to a sit-down dinner for two and orders for both | [Source](https://fansided.com/fantasy-sports/50-fantasy-football-punishments-your-league-mates-will-love-or-hate-you-for). Restaurant permission; normal portions, no forced eating. |
| 24 | welcomes every guest at game night with a giant airport-arrivals sign announcing their loss | [Source](https://leaguelogs.com/fantasy-football-punishments). Adapted the airport sign into a private welcome ritual. |
| 25 | plays nine imaginary golf holes in the yard with a foam club while the league commentates | [Source](https://www.rotowire.com/football/article/fantasy-football-last-place-punishments-94933). Adapted imaginary golf with equipment and venue permission. |
| 26 | films a mock NFL Combine with paper weights and slow-motion replays of every drill | [Source](https://fansided.com/fantasy-sports/50-fantasy-football-punishments-your-league-mates-will-love-or-hate-you-for). Adapted the athletic combine into a filmed spoof. |
| 27 | records a rap about their season and posts it publicly | [Source](https://www.rotowire.com/football/article/fantasy-football-last-place-punishments-94933). Audience is opt-in; never expose personal information. |
| 28 | wears a rival jersey to the league's watch party and delivers a sincere halftime fan speech | [Source](https://fansided.com/fantasy-sports/50-fantasy-football-punishments-your-league-mates-will-love-or-hate-you-for). Moved a hostile rival-fan outing to a private watch party. |
| 29 | caddies nine mini-golf holes for the winner and takes the blame for every bad shot | [Source](https://fansided.com/fantasy-sports/50-fantasy-football-punishments-your-league-mates-will-love-or-hate-you-for). Adapted full-round caddying into accessible mini-golf. |

### Brutal

| # | Last place... | Source and safety adaptation |
|---|---|---|
| 30 | walks a milk mile in a cow costume carrying a sealed carton as the baton; no drinking required | [Source](https://sleeper.com/blog/best-fantasy-football-punishments/). Adapted milk mile: no chugging or forced drinking; walking/costume only. |
| 31 | hosts a two-hour diner booth residency while the league stages hourly last-place interviews | [Source](https://sleeper.com/blog/best-fantasy-football-punishments/). Adapted 24-hour diner confinement: two hours, normal food, venue permission. |
| 32 | films a calendar shoot, one themed photo for each month, printed for everyone | [Source](https://www.directv.com/insider/creative-fantasy-football-punishments/). Kept the calendar; fully clothed and shared only by consent. |
| 33 | walks a costume parade for one hour while the league holds a last-place finish-line ceremony | [Source](https://sleeper.com/blog/best-fantasy-football-punishments/). Adapted costume 5K into an accessible parade. |
| 34 | films a mock Hot Ones interview with ordinary snacks and answers every question about losing | [Source](https://www.rotowire.com/football/article/fantasy-football-last-place-punishments-94933). Adapted hot-sauce endurance into ordinary food and theatrical questions. |
| 35 | wears swim goggles and gives a dramatic polar-plunge press conference beside an empty paddling pool | [Source](https://leaguelogs.com/fantasy-football-punishments). Adapted cold-water immersion into an empty-pool press conference. |
| 36 | walks 26 ceremonial laps of the living room, announcing a different excuse for losing on every lap | [Source](https://leaguelogs.com/fantasy-football-punishments). Adapted marathon walk into ceremonial indoor laps. |
| 37 | performs one theatrical slow-motion pushup per loss, capped at ten with a chair version allowed | [Source](https://leaguelogs.com/fantasy-football-punishments). Capped at ten; seated or theatrical movement allowed. |
| 38 | spends two hours on a planned trip without entertainment and writes the league a paper travel diary | [Source](https://fansided.com/fantasy-sports/50-fantasy-football-punishments-your-league-mates-will-love-or-hate-you-for). Adapted screen-free flight onto an already planned trip; emergency access stays available. |
| 39 | plays a one-hour hide-and-seek hunt in a consenting friend's home wearing a mascot costume | [Source](https://sleeper.com/blog/best-fantasy-football-punishments/). Adapted location-tracking hunt into private hide-and-seek. |
| 40 | performs a choreographed halftime routine in costume at the league's watch party | [Source](https://leaguelogs.com/fantasy-football-punishments). Moved uninvited public halftime performance to a private watch party. |
| 41 | plays the mascot chauffeur at game night and reads a new apology speech to five consenting friends | [Source](https://leaguelogs.com/fantasy-football-punishments). Adapted rideshare monologues to consenting friends. |
| 42 | posts a new embarrassing video every day for a month, ideas supplied by the group | [Source](https://sleeper.com/blog/best-fantasy-football-punishments/). Daily private video, never an account takeover or public-post requirement. |
| 43 | performs a 15-minute interpretive dance about every loss at a permitted private league gathering | [Source](https://leaguelogs.com/fantasy-football-punishments). Adapted public dance to a short private performance. |
| 44 | sings three songs the group picks at a packed bar on a Saturday, sober, no sunglasses | [Source](https://leaguelogs.com/fantasy-football-punishments). Venue permission and participant consent; no alcohol required. |

### Runtime behavior

- `server/punishments.ts` contains these exact phrases, source URLs and shared consent limits.
- "Nickel, punishment" preserves the current selection. "New punishment" rerolls within the chosen intensity. "Punishment, mild", "medium" or "brutal" changes intensity; "any intensity" clears it.
- "Nickel, research a punishment for <context>" returns three numbered options with sources and does not set one. "Nickel, option 2" selects one. No-key fallback chooses from this catalog; live Responses API research must supply three HTTPS sources, pass a deterministic safety filter and the integrated Nace safety check when available.
- Paid-pot behavior remains unchanged: when two people have paid a buy-in, Nickel does not add a punishment.

## Limits and verification

Custom league scoring is a human-readable rule applied through the existing manual score path, not an automated rule interpreter. Season reporting uses elapsed days from the chosen start, and drafting and scoring close at the season deadline. Automatic weekly awards are not implemented.

Custom games use the shared JSON store and existing `recordResult` path, including scoring parts, stats, idempotency, verification status and leaderboard totals. Deadline settlement happens on the next game read or write; an unknown real answer still needs a group member to supply it. Timing follows the existing honor-system games, so this is not an anti-cheat tournament platform.

Browser evidence in `docs/custom/` covers the create form, two guest identities, submission, reveal, caption voting, result, leaderboard and the custom league web flow. Later numbered screenshots cover integration with auth, Nace, wallet and the current main branch. All server runs used scratch `NICKEL_DATA_DIR`, with no Convex URL, messages, Keiki calls, charges or cash-outs.
