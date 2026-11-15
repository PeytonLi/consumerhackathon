# 02 — Premium minimal casual-game UI: what the best share, and a Nickel standard

Scope: 15–60 s social games opened from an iMessage link in iOS Safari (~402×874 pt, ~100 pt lost to toolbar → ~402×774 usable). Tags: **VERIFIED** = read in the cited source this session. **INFERRED** = my synthesis or an unverified/third-party number; treat as a starting value to test. Third-party "DESIGN.md" packs and fan clones are not official specs; I flag them.

## 1. What the references actually do

**Wordle / NYT Games — color is earned, everything else is quiet.** One analysis describes Wordle as "olive-soft green, dusty-gold yellow, flat neutral gray" on cool white, with generous gutters between tiles being "the design", and says "nothing here earns color it hasn't paid for" (https://designbycurio.com/wordle-2021 — VERIFIED as that writer's reading; it's an interpretive third-party piece, not NYT's own). Typefaces: Libre Franklin for UI, a slab for titles (https://www.vgnicholls.com/case-studies/nyt-app-redesign — VERIFIED, a fan redesign that matched NYT's look). Feedback timing from open-source clones: tile pop 100 ms, flip 300 ms, invalid-row shake 500 ms (https://github.com/danprince/wordle/blob/main/wordle.html — VERIFIED in that clone's CSS; INFERRED to approximate NYT's). A clone writer confirms the two core animations are the shake on invalid and the staggered reveal flip (https://www.olegsilkin.com/work/personal/worgle — VERIFIED). NYT ships an orange/blue "high contrast" option in place of green/yellow (https://www.instagram.com/p/DZhnppDklAJ/ — VERIFIED as an NYT Games post; an accessibility critique of the gray/blue closeness: https://www.reddit.com/r/wordle/comments/17uuzbd/wordle_high_contrast_mode_change/ — user report). Lesson: the default pair is not color-blind safe, so NYT needed a second mode. We should pick a safe pair by default.

**Puzzmo / Zach Gage — play first, rules in the object.** Gage: "Every game I design is meant to be a sandbox. At the lowest level, someone coming in should just feel comfortable playing around." (https://www.gamedeveloper.com/design/puzzmo-co-creator-zach-gage-on-building-newspaper-games-that-can-last-forever — VERIFIED.) Puzzmo's pitch is to play "as quickly as possible with as minimal rules as possible" (Gage on Reddit, https://www.reddit.com/r/puzzles/comments/17g7k3n/im_indie_game_designer_zach_gage_creator_of/ — VERIFIED snippet).

**Monument Valley (ustwo) — "so simple it needed almost no instruction."** Stated design concepts: near-zero instruction, friendly look, quality over quantity, and "art, sound, text and animation are restrained and subtle" (https://ustwo.com/blog/monument-valley-out-now/ — VERIFIED).

**Threes! — teach by doing, don't patronize.** Asher Vollmer's GDC 2014 talk covers priming players, letting them internalize mechanics, and iterating the tutorial (https://www.gamedeveloper.com/design/video-i-threes-i-creator-shares-tips-on-making-great-game-tutorials — VERIFIED summary only; I did not watch the talk, so specifics like "first move is forced" are INFERRED).

**Mini Metro — UI as the minimal visual language.** Jamie Churchman's GDC 2017 talk examines how visual and UI decisions create a gratifying experience (https://www.gamedeveloper.com/design/video-behind-the-minimalistic-visual-design-of-i-mini-metro-i- — VERIFIED summary; details not read).

**Duolingo — the feedback benchmark (louder than we want).** A third-party DESIGN.md for the iOS app (https://github.com/Meliwat/awesome-ios-design-md/blob/main/design-md/misc/duolingo/DESIGN.md — an unofficial reconstruction; INFERRED accuracy) lists: green #58CC02 for primary/correct, red #FF4B4B for wrong, blue #1CB0F6 info, 16 pt cards, 12 pt tiles, pill buttons, dark canvas #131F24, and "haptics + sound paired on every correct/wrong answer." Its snippet cites correct = checkmark pop scale 0→1.2→1.0 spring in 300 ms plus success haptic and chime; wrong ~400 ms with warning haptic and buzz. Duolingo's own sound/haptics team frames them as one discipline ("sound and haptic", https://www.linkedin.com/posts/samiakhalaf_duolingocreator-duolingodesign-haptics-activity-7489002944923660288-eBan — VERIFIED headline). Take the pairing and the spring; leave the saturation and mascot.

**GamePigeon — comparison.** I did not find a primary design source this session, so I make no sourced claims. INFERRED from common use: it lives inside the iMessage app drawer and relies on native iMessage chrome, so it feels native by construction. Nickel opens in Safari, so it must imitate that nativeness itself.

**Apple Games app / iOS 26.** Apple's overview: https://developer.apple.com/games-app/ (VERIFIED existence; I did not extract layout specs).

## 2. Apple platform rules that constrain us

- **Liquid Glass belongs to the control layer, not content.** HIG: it "forms a distinct functional layer for controls and navigation … that floats above the content layer"; "Don't use Liquid Glass in the content layer"; "Use Liquid Glass effects sparingly"; "Only use clear Liquid Glass for components that appear over visually rich backgrounds"; the regular variant "blurs and adjusts the luminosity of background content to maintain legibility" (https://developer.apple.com/design/human-interface-guidelines/materials.md — VERIFIED). Apple's framing: translucent, reflects and refracts surroundings, specular highlights that react to movement (https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/ — VERIFIED).
- **Real glass costs usability.** NN/g: transparent controls over busy backgrounds are harder to see, and floating controls compete with in-page ones, including Safari's own floating bar (https://www.nngroup.com/articles/liquid-glass/ — VERIFIED). Implication: on a web page, keep glass behind a few buttons, over a calm surface, never behind text.
- **Type.** iOS default 17 pt, minimum 11 pt; prefer Regular/Medium/Semibold/Bold, avoid Light and thinner; use few typefaces; SF has rounded variants "to coordinate text with … soft or rounded UI elements" (https://developer.apple.com/design/human-interface-guidelines/typography.md — VERIFIED).
- **Targets.** At least 44×44 pt hit region (https://developer.apple.com/design/human-interface-guidelines/buttons — VERIFIED snippet).
- **Haptics.** Use haptics consistently, tie each to one cause, and use them to complement visual and audio feedback; don't reuse a failure pattern for success (https://developer.apple.com/design/human-interface-guidelines/playing-haptics — VERIFIED).
- **Color independence.** Users shouldn't rely on color alone to tell states or values apart (https://developer.apple.com/help/app-store-connect/manage-app-accessibility/differentiate-without-color-alone-evaluation-criteria/ — VERIFIED).
- **Web haptics reality.** navigator.vibrate isn't available on iOS Safari. A known hack: a hidden `<input type="checkbox" switch>` whose label you .click() produces a system tick, and pulses can build patterns (https://x.com/jh3yy/status/2028544698055299220 — VERIFIED as a claim by that designer; INFERRED that it still works on current iOS, so test on device and treat as progressive enhancement).

## 3. Shared screen anatomy (INFERRED synthesis from the above)

Every reference reduces to four stacked bands, one focal object, one verb:

1. **Header (48–56 pt)**: game name or round counter left-center, ≤2 glass icon buttons (close/info) at the edges. Nothing else.
2. **Status line (24–32 pt)**: the one live number — timer, round, opponent state. One value, never a dashboard.
3. **Stage (flex, centered)**: the board/choice. It owns the color. Large, thumb-reachable, ≥80% of width.
4. **Action zone (bottom 96–120 pt, above Safari's toolbar)**: one primary pill button or the choice cluster itself. Primary actions sit in the bottom third because Safari iPhone one-hand reach is there.

Rules: no scrolling during play; the stage never reflows when feedback appears; the result replaces the action zone first, then expands.

## 4. Teaching without words

- **Ghost state**: show the empty shape of the answer (empty Wordle row, dashed slots, a faint "your move" ring). Affordance = placeholder, not paragraph.
- **First-move hint**: one pulse (scale 1→1.04→1, 600 ms, runs twice then stops) on the target or the first tappable thing. Stop on first touch.
- **Verbs as icons + one word**: "Pick", "Lock in", "Steal". 1–2 words per button.
- **Show, don't tell**: a 2–3 s looped demo in the stage before the first move (e.g. hand-cursor ghost doing a move) for complex ones (Battleship, Split or Steal). INFERRED.
- **Info button**: only on games with hidden rules or non-obvious scoring (One in a Krillion, Lowest Unique Number, Split or Steal, Battleship). Small 32 pt glass circle (44 pt hit area), "i" glyph, top-right, opens a half-sheet with ≤3 icon+line rows. Simple games (RPS, Stop the Clock, tic-tac-toe) get none. INFERRED; consistent with Gage/ustwo "minimal instruction".
- **Never auto-open help.** Gage's "sandbox" stance: let people play around.

## 5. Feedback, haptics, sound

| Event | Visual | Time | Haptic (iOS, via hack if available) | Sound |
|---|---|---|---|---|
| Tap/press | scale 0.96, 90 ms ease-out, release 160 ms spring | 90/160 ms | light tick | soft click (optional) |
| Selection locked | ring fills accent, other options fade to 40% | 200 ms | medium | tick |
| Invalid | horizontal shake ±6 pt | 400–500 ms (Wordle clone: 500 ms) | error double-tick | none |
| Reveal (tile/answer) | flip/fade stagger 80–100 ms apart | 300 ms each | light per item | soft rising notes |
| Win | pop scale 0→1.1→1 spring + one accent flash; no confetti wall | 300–450 ms | success | one chime |
| Lose | gentle dim + 4 pt settle, no red flood | 300 ms | single soft thud | low, short |
| Timer final 3 s | number pulses once per second | 1000 ms | tick per second | none |

Timings: pop 100/flip 300/shake 500 are VERIFIED from the Wordle clone CSS; Duolingo 300 ms spring is from the unofficial pack; the rest are INFERRED defaults. Respect prefers-reduced-motion: swap springs/shakes for 150 ms fades. Sound defaults off or muted until first tap (browsers block autoplay; INFERRED), with one tiny mute toggle in the result sheet.

## 6. Typography

- **UI font**: system stack `-apple-system, "SF Pro Rounded"…`. Rounded fits the soft, friendly iMessage-native feel and Apple lists rounded as the designed pairing for soft UI (HIG typography, VERIFIED). Caveat: in Safari, SF Pro Rounded is reachable via `font-family: ui-rounded` (INFERRED; verify on device). Fall back to system-ui.
- **Numerals**: `font-variant-numeric: tabular-nums` for timers and scores (INFERRED best practice).
- **Scale (pt/px at 1×)**: Display 56/Bold (timer, big result); Title 28/Semibold; Body 17/Regular (HIG default); Label 13/Semibold uppercase 0.04em tracking; Caption 12/Medium. Never below 11 (HIG minimum). Weights: Regular, Medium, Semibold, Bold only.
- One typeface, one numeral style. Wordle's NYT slab is brand voice we don't need.

## 7. Color system

Principle from Wordle and HIG: neutral surfaces carry the screen, one accent plus two semantic states carry meaning.

Light:
- Background `#F5F5F7`, surface `#FFFFFF`, hairline `rgba(60,60,67,0.12)`
- Text primary `#1C1C1E`, secondary `#6C6C70`
- Accent (Nickel) `#0A84FF`-family blue: `#007AFF` is iOS system blue (INFERRED value from memory; confirm in HIG color page)
Dark:
- Background `#000000` or Duolingo-style blue-black `#131F24` for softer feel (that value VERIFIED in the unofficial pack); surface `#1C1C1E`; text `#F2F2F7`.

**Color-blind safe pair**: blue + orange. NYT's own high-contrast mode moved to orange/blue (Instagram post above, VERIFIED). Use **positive/you = blue `#0A84FF`**, **opposing/steal/alert = orange `#FF9F0A`**, and never red/green as the only signal. Pair with shape/icon/label: ✓ vs ✕, filled vs outlined (Apple "differentiate without color alone", VERIFIED). Duolingo's green/red works for them but is the standard-failure pair for deuteranopia (INFERRED, well known).

Surface rule: players and states, not decoration, get color. A screen should show ≤3 hues at once.

## 8. Liquid Glass on a web page (INFERRED recipe; no Apple web spec exists)

Use glass only on: header icon buttons, the primary action pill, and the result sheet. Not on the stage or text blocks.

```css
.glass{
  background: rgba(255,255,255,0.55);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  border: 0.5px solid rgba(255,255,255,0.6);
  box-shadow: 0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7);
  border-radius: 999px;
}
.glass-dark{ background: rgba(44,44,46,0.55); border-color: rgba(255,255,255,0.14); }
@media (prefers-reduced-transparency: reduce){ .glass{ background:#fff; backdrop-filter:none } }
```
Blur 20–30 px, saturate 160–200%, 0.5 px inner highlight edge. Blur only reads against something behind it, so place a soft tinted gradient or the board edge beneath. Always ensure text on glass passes 4.5:1 (NN/g warning, VERIFIED). Add `prefers-reduced-transparency` fallback to opaque.

## 9. Result, share, and waiting states

- **Result**: stage stays visible, a bottom glass sheet slides up (360 ms, cubic-bezier(0.2,0.8,0.2,1)) holding: big outcome word (Display 56), one-line context, primary "Rematch"/"Share" pill, secondary text link "Done". Wordle's share grid is the model: a tiny emoji-or-glyph recap that doesn't spoil (INFERRED from Wordle behavior).
- **Share**: native share sheet or one copy button; reply goes back into the iMessage thread (the link is the home). Preview text ≤1 line.
- **Waiting for opponent**: stage dimmed to 60%, a single quiet loop (three dots or breathing ring 1.6 s), copy "Waiting for Sam…" (two words plus name). Never a spinner plus paragraph. Show who has already moved with a filled avatar dot — information without words.
- **Empty/first load**: render the board skeleton immediately (no blank screen, <100 ms), then fill.

## 10. Nickel game design standard

### Tokens
```
space:   4 8 12 16 24 32          (multiples of 4; page gutter 20)
radius:  chip 12 · tile 16 · card/sheet 28 · button/pill 999 · glass buttons 999
hit:     min 44×44; primary button height 56
header:  height 52 pt, icon buttons 36 visual / 44 hit
type:    Display 56/700 · Title 28/600 · Body 17/400 · Label 13/600 · Caption 12/500
motion:  press 90ms · lock 200ms · flip 300ms · sheet 360ms · shake 450ms · reduced-motion: 150ms fade
ease:    standard cubic-bezier(0.2,0.8,0.2,1); spring ≈ stiffness 300, damping 20
color:   bg #F5F5F7/#000 · surface #FFF/#1C1C1E · text #1C1C1E/#F2F2F7 · accent #0A84FF · alt #FF9F0A
glass:   blur 24 · saturate 180% · tint rgba(255,255,255,.55) / rgba(44,44,46,.55) · 0.5px edge
```

### Rules
1. **One screen, one verb.** The stage shows one thing to do; the primary action is a single bottom pill ≤2 words.
2. **Glass for controls only.** Header buttons, action pill, result sheet. Never behind game content or text (HIG).
3. **Neutral first.** Max 3 hues on screen; blue = you, orange = them/risk. Never rely on color alone (icon, fill style, label too).
4. **No instruction paragraphs.** Teach with ghost states, one 600 ms first-move pulse, and a looping demo when needed. Rules never exceed 3 icon rows.
5. **Info button only for hidden-rule games** (Krillion, LUN, Split or Steal, Battleship). Never auto-open.
6. **Every action gets all three feedbacks**: ≤100 ms visual response, a matching haptic tick (progressive enhancement via switch trick), and optional sound. One haptic ↔ one meaning.
7. **Win gently, lose gently.** Spring pop and a single chime; no confetti walls, no red floods. Failure is a 300 ms dim and settle.
8. **Fit above Safari's toolbar.** Design in 402×774; actions in the bottom third but ≥24 pt above the fold; no play-time scroll; skeleton in <100 ms.
9. **One type family, four weights, tabular numerals.** Rounded system stack; minimum 11 pt, body 17 pt.
10. **Waiting is a state, not a spinner.** Dimmed stage, breathing ring, opponent name, filled dot when they've moved; result sheet always offers Rematch + Share.

### Open items to test on a real iPhone
SF Pro Rounded via ui-rounded; haptic switch hack on current iOS; backdrop-filter perf on Battleship board; contrast of glass over each stage; confirming exact system blue/orange from the HIG color page.
