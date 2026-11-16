# Nickel game UI standard

Every Nickel mini-game is one page that opens from one iMessage link and shows one game. They all load [`apps/preview/nickel.css`](apps/preview/nickel.css) and follow the rules below, so a new game only designs its board.

The look in one line: a calm, flat board that holds all the color, with Liquid Glass only on the controls that float above it. That is Apple's own rule for iOS 26 ("Don't use Liquid Glass in the content layer"), and it is what makes the page read as part of Messages. Sources are in `research/design/`.

## Screen anatomy

Every screen is the same three bands and never scrolls during play. It is designed for 402×774pt, an iPhone 17/18 Pro in Safari after the toolbar.

| Band | Height | What goes there |
|---|---|---|
| Bar | 60pt | Left: your avatar (blue seal = verified by Keiki Vault). Center: game name and number, group name under it. Right: one glass pill for the single live value (timer, stake), plus the glass ⓘ button only on complex games. |
| Stage | flexible | The board, centered. Opaque, flat, no blur. It owns the color. |
| Dock | ~100pt | The one action: a 56pt capsule button, or the game's own controls (Wordle keyboard, RPS hands). One short caption at most. |

Results replace the stage and dock in place, or rise as a bottom sheet for head-to-head games. Waiting and closed states use the same three bands.

## Rules

1. **One screen, one verb.** One primary button per screen with a label of one or two words: Start, Lock in, Share, Rematch.
2. **Glass for controls only.** Bar pills, the ⓘ button, buttons, toasts, and sheets. Never the board, tiles, or text blocks. At most three glass surfaces on screen, and no glass on top of glass. Buttons inside a sheet use flat fills.
3. **Neutral first, three hues at most.** Gray and white surfaces. Blue (`--you`) is you and the primary action, orange (`--them`) is the opponent or an exact hit. Each game gets one ambient hue (`--game`) used only for the glow behind the bar and the game's own accents.
4. **Never color alone.** Every colored state also has a shape: ✓ and • on Wordle tiles, filled versus hollow score pips, a ring on the winning hand.
5. **No instruction paragraphs.** Teach with the object itself: empty tiles, a pulsing first tile, a "?" card waiting for your hand, a lock on the opponent's card, the depth ladder shown before you start. If a rule can't be shown, it goes in the ⓘ sheet.
6. **ⓘ only for hidden rules.** A ⓘ button appears when the scoring is not visible on the board. It opens a sheet with a title, at most three icon-and-line rows, and "Got it". It never opens by itself.
7. **Every tap answers within 100ms.** It answers with a press scale, a state change, and a haptic tick where iOS allows it. Each haptic has one meaning.
8. **Win big, lose funny, both fast.** A win gets one confetti burst and a triple tick; a loss gets a crooked tag and one dry line. No red screens. The whole result finishes in 1.5 seconds and any tap skips it. See [`DOPAMINE.md`](DOPAMINE.md).
9. **One type family.** SF Pro for words, SF Pro Rounded for numbers (`ui-rounded`, tabular). Weights are 400, 500, 600, and 700 only, and nothing is smaller than 12pt.
10. **Always land somewhere.** Closed and expired rounds still return HTTP 200 and offer the next step (Today's game, Practice, or text Nickel), because Keiki Vault shows its own error page for any status of 400 or above.

## Which games get ⓘ

| Game | ⓘ | Why |
|---|---|---|
| Wordle Blitz | no | Everyone knows it. The pulsing first tile and "Clock starts on your first letter" cover the twist. |
| Rock Paper Scissors | no | The three hands are the rules. |
| Stop the Clock | no | One button and a moving number. |
| Tic-tac-toe, Connect 4 | no | Known boards. |
| One in a Krillion | yes | Rarity scoring is hidden: name one answer, rarer dives deeper, hidden until the reveal. |
| Lowest Unique Number | yes | "Lowest number nobody else picked" isn't visible. |
| Split or Steal | yes | The payoff matrix needs one picture. |
| Battleship salvo | yes | Salvo size and simultaneous turns. |

## Tokens

| Token | Light | Dark |
|---|---|---|
| `--bg` | #F2F2F7 | #000000 |
| `--surface` | #FFFFFF | #1C1C1E |
| `--surface-2` | #E5E5EA | #2C2C2E |
| `--ink` / `--ink-2` / `--ink-3` | #1C1C1E / #6C6C70 / #AEAEB2 | #F5F5F7 / #98989F / #5A5A5F |
| `--you` | #007AFF | #0A84FF |
| `--them` | #FF9500 | #FF9F0A |
| `--none` (absent) | #8E8E93 | #3A3A3C |
| `--game` | Wordle orange, Krillion #0F9FBF, RPS #5856D6 | lighter versions of the same hues |

- **Spacing:** 4, 8, 12, 16, 24, 32, with a 20pt page gutter.
- **Radius:** tile 10, card 18, big card 28, sheet 36, and full capsules for every control.
- **Hit targets:** at least 44×44. The primary button is 56 tall and secondary buttons are 50.
- **Type:** display 52/700 rounded, title 28/700, head 17/600, body 17/400, label 13/600, caption 12/500.
- **Motion:** press 120ms, lock 200ms, tile flip 300ms with a 110ms stagger, sheet 380ms on a spring `cubic-bezier(.34,1.56,.64,1)`, and a 450ms shake for invalid input. Reduced motion turns all of these into 150ms fades.

## Liquid Glass recipe

Safari can't do Apple's refraction: WebKit ignores `backdrop-filter: url()`. The `.glass` class gets the look from parts that do work on iPhone:

- A tinted fill: 58% white in light mode, 52% graphite in dark mode.
- `blur(20px) saturate(180%)`. Blurs past about 28px slow Safari 26 down.
- A 1px bright inner top edge and a faint inner bottom shade.
- A masked gradient hairline border and a soft shadow.

The primary button is the only tinted glass on a screen. The sheet is the same material made nearly opaque, because larger glass reads thicker.

Fallbacks: `prefers-contrast: more`, and `prefers-reduced-transparency` where a browser supports it, switch every glass surface to a solid fill with a 1px border. iOS Safari can't detect the Reduce Transparency setting, so the glass tint is kept opaque enough to read on its own.

## Adding a game

1. Add an entry to `GAMES` in `play.html` with its `hue`, and `info` rows only if rule 6 applies.
2. Write one function that fills `#stage` and `#dock` using `show()`, with the shared classes: `.glass .primary`, `.glass .secondary`, `.card`, `.avatar`, `.rows`, `.tag`, `.t-*`.
3. Use `setClock()` or `countdown()` for the bar pill, `toast()` for one-word feedback, `openSheet()` for results, `haptic()` on every meaningful tap, and `tell()` to post the result back to the group.
4. Check it on an iPhone in light and dark mode, with no scrolling above Safari's toolbar.
