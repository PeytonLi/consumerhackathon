# Nickel — Ideas

Brainstorm for season competition, pot splits, social hooks, and the one-move game lineup. Nothing here is committed scope yet; see "Recommendations" for what we'd build first.

---

## 1. Ways to Split the Pot

- **Monthly winner slice:** each month, a set share (e.g. 25%) of that month's contributions goes to the month's best player; the other 75% rolls into the season pot.
- **Season top 3:** final pot splits **60/30/10** so more people stay in the race.
- **Daily winner micro-pot:** best score each day takes that day's nickels. Tiny money, but a reason to play every day.
- **Bounty on the leader:** beat the current #1 on any day and take a small bounty from their winnings, so the leader can't coast.
- **Comeback prize:** a slice for whoever climbed the most places over the season.
- **Perfect-week bonus:** play all 7 days in a week to enter a small weekly prize.

## 2. Competition Mechanics

- **Weekly head-to-heads:** matched against one friend each week; winner gets bonus season points.
- **Double-points days:** random days, or every Sunday, count 2×.
- **Drop your worst days:** only your best days count, so missing a few doesn't wreck your season.
- **Playoffs:** top 4 play a bracket of head-to-head days for the grand prize.
- **Side bets:** two friends put an extra 50¢ (or Nickels) on just tomorrow's game.
- **Handicaps:** optionally, stronger players start each week a few points behind.

## 3. Social Features

- **Trash talk feed:** results post automatically ("Jason solved in 2 🔥"); people react and comment.
- **Rivalry stats:** lifetime head-to-head record against each friend.
- **Shareable result cards:** Wordle-style grid, plus your rank and the pot.
- **Badges and titles:** "Monthly Champ," "Iron Streak," "Choke of the Week."
- **Group-picked punishment:** last place does something the group voted on.

## 4. Daily-Open Hooks

- **Pot ticker on the home screen:** "$94.35 and climbing."
- **Push notifications:** "4 friends already played today, you're in 6th" / "Double points today."
- **Midnight results reveal:** who won the day and how the standings moved.
- **Streak flame:** days in a row played, with a warning before it breaks.
- **"Behind you" alert:** "Jason is 3 points behind you and just played."

## 5. End of Season

- **Season Wrapped:** Spotify-style recap — winner, longest streak, best day, biggest comeback, your rival record.
- **Hall of fame:** past champions pinned in the group forever.
- **Payout ceremony:** animated reveal of final standings and the pot split.

---

## 6. Game Lineup: Fun One-Move Games

Every game is one move per player: you lock it in, and it resolves when everyone has played (or at the daily cutoff). That keeps play async across a friend group. Mix skill games with read-your-friends games so luck only matters across a season, not on a single day.

### Group games (everyone plays, one leaderboard)

| Game | How it works | Why it's fun |
| :--- | :--- | :--- |
| **Wordle** | Shared daily 5-letter word, fewest guesses wins. | Known format, great share grid. |
| **Lowest Unique Number** | Everyone picks 1–100; lowest number nobody else picked wins. | Pure mind games about your friends; dramatic reveal. |
| **⅔ of the Average** | Pick 0–100; closest to ⅔ of the group's average wins. | Trivial to explain, gets deeper over time. |
| **Closest Estimate** | Daily number trivia ("How many Costcos in the US?"); closest wins, or Price-Is-Right style. | Curated answer list, no AI needed. |
| **Stop the Clock** | A hidden timer runs; tap once to stop at exactly 10.00s. Milliseconds off is your score. | 15 seconds, pure skill, "9.98s 🔥" share card. |
| **Majority Rules / Minority Wins** | This-or-that question; score for picking the less popular side, or for predicting the group's % yes. | Social and opinionated. |

### Head-to-head (weekly matchups, side bets)

| Game | How it works | Why it's fun |
| :--- | :--- | :--- |
| **Rock Paper Scissors** | Classic, with a daily twist ("Rock is banned today") or Lizard-Spock. | Instantly understood; twist adds strategy. |
| **Penalty Kick** | Shooter picks left/center/right, keeper picks a dive; swap roles each round. | RPS that feels like a sport. |
| **Split or Steal** | Both secretly pick split or steal on a Nickel stake. Both split: halve it. One steals: takes all. Both steal: nobody wins. | Best group-chat drama on the list. |
| **Odds or Evens** | Each throws 1–5 fingers; one calls odd/even on the total. | Fast tiebreaker. |
| **Sealed Bid** | Both secretly bid Nickels for a prize; high bid wins, both pay. | Gives Nickels something to be spent on. |

### Anti-cheat rule for every game

The server stores each move before any move is revealed, so nobody can wait and react. **Stop the Clock** is the only one a player can cheat on their own phone, so measure the time on the server with a small allowance for network delay, or accept the risk among friends.

---

## 7. Recommendations

- **Real money only in the season pot.** Pay out once via Whop at settlement. Daily micro-pots, bounties, side bets, and monthly slices move between friends as Nickel points, not cash. This keeps clear of gambling rules, and the cash amounts are tiny anyway (6 friends × $0.05 = $0.30/day).
- **Default split: 60/30/10 top 3.** `leagues.payoutSplit` already supports `[60, 30, 10]`.
- **One catch-up mechanic: Bounty on the leader.** It happens daily, it's visible, and it makes a good line in the chat. Cut handicaps; keep the comeback prize only as a Wrapped superlative.
- **Scale long-season ideas to season length.** "Drop your worst ~15% of days" instead of a fixed number; playoffs in the season's last 2 days instead of December.
- **Already in DESIGN.md under other names:** side bets = 1v1 challenges/wagers; trash talk feed = Chat Sync + Keiki; badges = Group Superlatives; perfect-week ≈ Full-Squad Multiplier; push / "behind you" alerts = Keiki `/notice` events.
- **Starting game lineup:** Wordle (skill), Stop the Clock (reflex), Lowest Unique Number (read your friends), Split or Steal (head-to-head drama). Each is one screen with simple scoring.
- **Demo on a 3-minute Demo Blitz season:** pot ticker → bounty firing when someone passes #1 → results reveal after each round → share card → payout ceremony with the 60/30/10 split and a hall-of-fame pin.

### Schema changes this implies

- `transactions.kind`: add `bounty`.
- `memberships`: add `badges: v.array(v.string())`.
- New `seasons` table for hall of fame and Wrapped data.
- `rounds`: optional `multiplier` for double-points days; extend `gameType` with the new games.
