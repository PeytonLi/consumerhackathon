# Hub motion moodboard

Research for `apps/preview/hub.html` (served at `/h`). Everything here was turned into a decision in the page; the last two sections are the rules the build follows.

## About "Open Motion by Meta"

I could not find a Meta project called Open Motion or OpenMotion. The name belongs to unrelated open-source video tools: [Yuan-ManX/open-motion](https://github.com/Yuan-ManX/open-motion) (an "AI-native motion design" canvas), [nexu-io/openmotion](http://github.com/nexu-io/openmotion) (an agentic video generator) and [jsongo/open-motion](https://github.com/jsongo/open-motion) (a Remotion alternative). None of them is from Meta and none is a UI motion system, so nothing was taken from them. The references below are what I used instead.

How the X references were read: X posts were found through web search and read as public post text. I did not browse X signed in and could not play the attached videos, so each X entry cites what the post says, not what its clip shows.

## References

| # | Reference | What it does well | What the hub takes from it |
|---|---|---|---|
| 1 | Emil Kowalski on X, ["The bigger an animated element is, the slower it should move"](https://x.com/emilkowalski/status/2108531407786242389) | Ties duration to size and travel distance instead of one global speed. | Small things are fastest: press 120ms, pager ring 200ms. The tab thumb travels further, 260ms. The sheet is the biggest mover and gets the longest time, 380ms. |
| 2 | Emil Kowalski on X, [the Linear dialog fix](https://x.com/emilkowalski/status/2102798004281635184) | Matched the overlay and dialog durations and dropped the spring where it felt abrupt. | Scrim and sheet open on the same 380ms clock. The spring is kept for opening only; closing is a plain 240ms ease-out with no bounce. |
| 3 | Emil Kowalski on X, [Sonner pauses when the tab is hidden](https://x.com/emilkowalski/status/2094386675384230109) | Timed UI respects whether anyone is looking. | The 5 second refresh skips while `document.hidden`, so nobody comes back to a number that ticked without them. |
| 4 | Emil Kowalski, [7 Practical Animation Tips](https://emilkowal.ski/ui/7-practical-animation-tips) | Press scale around 0.97, never animate from `scale(0)`, `ease-out` for anything entering. | Every tappable card scales to 0.96 on press (the value `nickel.css` already uses). The crown starts at 0.6, not 0. Entrances use the design system's ease-out curve `cubic-bezier(.2,.8,.2,1)`. |
| 5 | Emil Kowalski, [Great Animations](https://emilkowal.ski/ui/great-animations) | "Your animations should also usually be shorter than 300ms", and how often a thing is seen decides whether it animates. | Section entrance is 280ms. Things seen every few seconds (the refresh) do not animate at all. |
| 6 | Emil Kowalski, [Building a drawer component](https://emilkowal.ski/ui/building-a-drawer-component) (Vaul) | A web sheet that feels native: follows the finger, closes on a flick, damps when pulled the wrong way, writes `transform` directly. | The person sheet follows the finger 1:1 downward, moves at one sixth speed upward, and closes past 90px or on a flick faster than 0.5px/ms. Drag starts only from the header so it never fights the memory list's scroll. |
| 7 | Benji Taylor on X, [Family's dynamic tray](https://x.com/benjitaylor/status/1762508367690670372) and [Family Values](https://benji.org/family-values) | Keeps screens "focused and minimal until more context needs to be shown". | The board shows five numbers per person. Record, games played and what Nickel remembers live in a tray that opens on tap, in place, without leaving the hub. |
| 8 | Benji Taylor on X, [mini-profile trays](https://x.com/benjitaylor/status/2086543562758303893) | A person is a tray over the feed, not a new page. | Same pattern for each player: one sheet, same anatomy for everyone, and the "You" card opens the same sheet. |
| 9 | Jakub Krehel, [Details that make interfaces feel better](https://jakub.kr/writing/details-that-make-interfaces-feel-better) and [the skill he posted on X](https://x.com/jakubkrehel/status/2033579028288856466) | Stagger a staged entrance by semantic chunk, never stagger routine updates, prefer interruptible transitions, `text-wrap: balance` and `pretty`. | Sections (not rows) stagger, 45ms apart, once per load. State changes are CSS transitions so they can be interrupted. Titles and empty states balance, memory lines use `pretty`. |
| 10 | Max Barvian, [NumberFlow](https://number-flow.barvian.me/) ([on X](https://x.com/mbarvian)) | Numbers that change in place read as live; tabular digits stop the layout from jumping. | Nickels, balances and pot totals count to their value in 450ms on first paint and whenever the value changes. Tabular numerals everywhere. The component itself is not used: no dependency. |
| 11 | 60fps.design, [Duolingo league leaderboard move-up](https://60fps.design/shots/duolingo-league-leaderboard-move-up-animation) | The leaderboard is a moment: your row is highlighted, ranks update, the win is celebrated. | The board is staged, last place first, with the crown landing when you reach the winner. Duolingo's confetti is deliberately left out: GAME-UI rule 8 says win gently. |
| 12 | Apple, [Designing Fluid Interfaces (WWDC18)](https://developer.apple.com/videos/play/wwdc2018/803/) | Instant response, interruptible and redirectable motion, movement that follows the gesture. | The reel is native scroll with snap, so it tracks the finger with zero added latency and can be caught mid-flight. The sheet can be grabbed while it is still settling. |
| 13 | Chrome, [Carousel slide effects](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-atoms/carousel-slide-effects) | Slides scale and fade from the scroll position itself with a view timeline, no scroll listeners. | Off-center slides sit at 0.93 scale and 0.6 opacity through `animation-timeline: view(inline)`, behind `@supports`. Browsers without it get a plain carousel. |
| 14 | Rauno Freiberg, [Web Interface Guidelines](https://github.com/raunofreiberg/interfaces/) | "Actions that are frequent and low in novelty should avoid extraneous animation." | Tab switches move only the thumb. Reopening a sheet does not replay its count-up. |

## Motion decisions

| What | Animates | Duration | Easing | When |
|---|---|---|---|---|
| Press on any card, slide, tab | scale to 0.96 | 120ms down, 350ms back | spring back | every tap |
| Section entrance | 10px rise and fade, per section | 280ms, 45ms stagger, all done by 460ms | `cubic-bezier(.2,.8,.2,1)` | once per page load |
| Nickels, balances, pot totals | count to value | 450ms | ease-out cubic | first paint, then only when the value changes |
| Leaderboard reel | scale 0.93 to 1, opacity 0.6 to 1 | scroll-linked | linear on the scroll timeline | while swiping |
| Pager avatar ring | opacity, scale 1.12, ring | 200ms | ease-out | as the centered slide changes |
| Crown on the winner | scale 0.6 to 1.12 to 1 | 420ms | spring `cubic-bezier(.34,1.56,.64,1)` | once, the first time the winner is centered |
| Person sheet in | slide up, scrim fades | 380ms | spring | on tap |
| Person sheet out | slide down, scrim fades | 240ms | ease-out, no bounce | close, scrim tap, Escape, drag or flick |
| Sheet drag | follows the finger | none | none | while dragging |
| Section tabs | thumb slides and resizes | 260ms | ease-out | on tap and as you scroll |
| Pot progress | bar fills from the left | 420ms after a 260ms delay | ease-out | once per load; later changes take 380ms |

## What must not animate

- The 5 second refresh. Only the section whose data changed is swapped, with no entrance; changed numbers tick, everything else holds still.
- Rows, memory lines and activity text. They are content, and they never stagger.
- Anything on a loop. No shimmer, no pulsing, no breathing, no autoplaying carousel.
- Wins. No confetti and no full-screen takeover; the crown is the whole celebration.
- Scrolling. No parallax and no scroll-jacking; the only scroll-linked effect is the reel's focus scale.
- Nothing runs longer than 460ms end to end.

## Reduced motion

With `prefers-reduced-motion: reduce`: numbers appear at their final value, section entrances and the crown become a 150ms fade, the sheet fades instead of sliding, the reel loses its scale effect, press scaling is off, and tab and pager jumps scroll instantly instead of smoothly. `nickel.css` caps every remaining transition at 150ms.
