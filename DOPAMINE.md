# Dopamine pass: what we took and what we left

The result screen and the leaderboard are the two moments people screenshot, so they get the motion budget. Everything else stays calm. The effects live in [`apps/preview/juice.js`](apps/preview/juice.js); screenshots and a recording are in [`docs/dopamine/`](docs/dopamine/).

The hard limit: a result finishes in 1.5 seconds and any tap ends it at once. Games are quick, so the celebration can't be longer than the game.

## What we took

1. **The number counts up (Duolingo XP, Robinhood's rolling ticker).** The Nickel total rolls from 0 to its value in 0.7 seconds on an ease-out curve, so the last few digits slow down and the final value lands.
2. **The breakdown lands one piece at a time (Duolingo's lesson-complete bonuses).** Each part of `points.parts` drops in as its own chip, staggered so six parts still finish inside the budget. You see why you got 17, not only that you got 17.
3. **A win gets a burst, once (Duolingo, Robinhood before 2021).** About 90 pieces of confetti drawn on a canvas from the score outward, gone in 1.3 seconds. It fires for a win and for the winner reveal on the leaderboard, and nowhere else.
4. **A loss is funny, not sad (NYT Games keeps a loss quiet; BeReal makes lateness a joke).** The points tag flops over and hangs crooked, one grey piece of confetti drifts down alone, and Nickel says one dry line. No red screen.
5. **Haptics carry the result (Duolingo, Apple's own guidance).** A triple tick for a win, one long buzz for a loss, one tick when your rank goes up and on each carousel snap. `navigator.vibrate` where it exists, and the page's existing iOS switch tick where it doesn't.
6. **The streak is visible when it paid (Duolingo, NYT Games).** When the breakdown has a streak part, that chip is orange with a flame drawn in SVG. It only shows when the streak actually added Nickels, so it never nags.
7. **Rank change in one sentence (Duolingo leagues, Strava segments).** "3rd to 2nd, passing Alex" is the line people repeat in the chat. It compares `/api/leaderboard` from before and after the result, names who you passed or who passed you, and the row itself opens the leaderboard.
8. **Loser first, winner last, and the winner is hidden (Spotify Wrapped saves the top artist for the end).** The carousel opens on last place. The winner card sits behind a cover until you land on it, then it lifts with a burst. Cards snap one at a time, and the active card is full size while its neighbors shrink and their art slides a little slower.
9. **Movement since you last looked (Robinhood's green and red arrows).** Each card shows an up or down arrow with the number of places moved since this phone last opened the board. The arrow has a shape and a number, never color alone.
10. **Wrapped as six swipeable cards with one share button (Spotify Wrapped, Instagram stories).** `/w` is one stat per screen with a giant number: most wins, the live streak, biggest upset, who is paying for dinner, the punishment. Story ticks on top, tap to advance, and the last card shares.

## What we left out, because it would slow the product down

- **Stacked interstitials.** Duolingo puts up to a dozen screens between a lesson and the exit, and its own users complain about tapping through them. Here everything happens on the one result screen.
- **Anything you must wait for.** No modal, no "Continue" button before the score, no animation that blocks a tap. One tap skips to the final state.
- **Sound.** The page opens from a group chat, often in class or at dinner. Haptics do that job silently.
- **Confetti everywhere.** Robinhood removed its confetti in 2021 after it became the symbol of cheap gamification. It works here because it's rare: one burst per win.
- **Loss shaming and streak guilt.** No streak-freeze upsell, no "you'll lose your streak" push. The punishment is the group's job, not the UI's.
- **Libraries and Lottie files.** Confetti is about 40 lines of canvas. Nothing new to download on a cold iMessage tap.
- **Long recaps.** Spotify Wrapped runs a dozen or more cards with video. Ours is six cards and can be read in fifteen seconds.
- **Mascot animation and daily quests.** They need art and state the product doesn't have yet.

## Reduced motion

With `prefers-reduced-motion`, no canvas is created, the total shows its final value at once, the chips and rank line appear together, the carousels stop scaling and sliding, and the winner cover fades instead of bursting. Haptics still fire because they aren't motion.

## One rule changed

`GAME-UI.md` rule 8 used to say "No confetti". It now allows one short burst for a win, and keeps the ban on red screens.
