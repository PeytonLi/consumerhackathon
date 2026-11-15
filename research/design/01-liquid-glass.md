# 01 — Apple Liquid Glass (iOS 26) and a web recipe for Nickel

Status key: **VERIFIED** = read in the cited source. **INFERRED** = my judgment or an extrapolation; test on a real iPhone before relying on it. Apple publishes no pt, radius, blur or ms numbers for Liquid Glass, so every number in the recipes is INFERRED unless a source is cited.

## Bottom line

Liquid Glass on the web means a frosted, tinted, edge-lit capsule floating over content, not refraction. Safari/iOS cannot do the refraction version. Use glass only on Nickel's control layer (top bar, bottom action dock, info button, toasts) and keep the game board itself opaque and flat. That is also exactly what Apple tells developers to do.

## 1. Apple's rules

**Where glass goes (VERIFIED).** Liquid Glass "forms a distinct functional layer for controls and navigation elements — like tab bars and sidebars — that floats above the content layer." Apple says: "Don't use Liquid Glass in the content layer," and use standard materials for the app background and content. The only content-layer exception is transient controls such as sliders and toggles, which take on glass while being touched. [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials.md)

**Use sparingly (VERIFIED).** "Limit these effects to the most important functional elements in your app." Overusing it in custom controls distracts from content. [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass.md)

**No glass on glass (VERIFIED).** WWDC25 "Meet Liquid Glass": avoid stacking glass on glass; on top of glass use fills and transparency for separation; do not mix the regular and clear variants. [WWDCNotes summary of session 219](https://wwdcnotes.com/documentation/wwdc25-219-meet-liquid-glass/), primary: [Apple session 219](https://developer.apple.com/videos/play/wwdc2025/219/)

**Regular vs clear (VERIFIED).**
- Regular blurs and adjusts luminosity of what is behind it to keep text legible. It is the default and fits components with text (alerts, sidebars, popovers). It looks darker over dark content and lighter over light content. [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials.md)
- Clear is highly translucent and has no adaptive behavior. Use it only when all three hold: over media-rich content, content tolerates a dimming layer, and the covered content is bold and bright. Apple suggests a 35%-opacity dark dimming layer behind clear glass when the content under it is bright. [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials.md), [WWDCNotes](https://wwdcnotes.com/documentation/wwdc25-219-meet-liquid-glass/)
- INFERRED for Nickel: a colorful game background is "rich" only on a splash or result screen. For in-game controls choose regular.

**Adaptivity (VERIFIED).** Shadows get stronger when text scrolls underneath; elements can flip light/dark independently; nearby colour spills onto the surface; larger glass looks thicker, with more shadow and scattering. Larger elements (sidebars) look more opaque than small ones (toolbars, tab bars). [WWDCNotes](https://wwdcnotes.com/documentation/wwdc25-219-meet-liquid-glass/), [HIG Color](https://developer.apple.com/design/human-interface-guidelines/color.md)

**Tint (VERIFIED).** Glass has no colour of its own; it takes colour from what is behind it. Tint only for emphasis such as a primary call to action, and apply the colour to the background, not to the symbol or text. Do not tint multiple controls. [HIG Color, "Liquid Glass color"](https://developer.apple.com/design/human-interface-guidelines/color.md)

**Legibility (VERIFIED).** Default symbols/text on small glass are monochrome: dark over light content, light over dark. Use vibrant system colours on materials, not low-contrast greys (HIG shows systemGray3 on a material as the wrong example). [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials.md)

**Scroll edge effect (VERIFIED).** A blur-and-fade of content under floating bars, "not decorative" and not an overlay that darkens. Only use it when a scroll view sits behind floating UI; one per view; prefer the automatic style. [HIG Scroll views](https://developer.apple.com/design/human-interface-guidelines/scroll-views.md), [WWDC25 session 323](https://developer.apple.com/videos/play/wwdc2025/323/). INFERRED web equivalent: a 24–32pt gradient mask/fade under the bar. Nickel screens do not scroll much, so likely skip it.

**Shapes and radii.** Rounder corners everywhere in iOS 26 and more spacious controls (VERIFIED, [Design for Native](https://designfornative.com/ui-changes-in-ios-26-thats-not-about-liquid-glass/)). Concentric rule (VERIFIED, same source): inner radius = parent radius minus the padding between them. Apple publishes no pt radii; capsule (radius = half the height) is the default control shape (INFERRED from the toolbar/tab bar look; HIG shows a capsule in its Materials hero image).

**Buttons (VERIFIED).** Minimum hit region 44×44pt. Same-size buttons for equal choices; show the preferred choice with a more prominent style, not a bigger size. Prefer a short verb label when it is clearer than an icon. [HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons.md). Toolbars: group by function and aim for at most three groups ([HIG Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars.md)). INFERRED for Nickel: one primary action (capsule, 52–56pt tall, full-width minus 16pt margins) and at most one 44pt circular info button.

**Motion (VERIFIED, partial).** Glass "flexes and energizes" on interaction, moves with gel-like flexibility, and elements lift into glass while touched ([WWDCNotes](https://wwdcnotes.com/documentation/wwdc25-219-meet-liquid-glass/)). Dialogs and sheets morph out of the button that presents them ([WWDC25 session 323](https://developer.apple.com/videos/play/wwdc2025/323/)). Apple gives no ms values. INFERRED web timing: press = scale(0.96) in 120ms ease-out, release = a spring-like overshoot, e.g. 350ms cubic-bezier(.34,1.56,.64,1); morphing open = 300–380ms of the same curve, animating transform/opacity only. Honour prefers-reduced-motion (Apple tells devs reduce-motion modifies these effects, [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass.md)).

**Accessibility (VERIFIED).** Users can pick a preferred Glass look, and Reduce Transparency / Increase Contrast change both variants. Test custom elements under these settings. [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials.md)

## 2. What Messages on iOS 26 looks like

VERIFIED from [AppleInsider](https://appleinsider.com/inside/ios-26/vs/messages-ios-26-vs-ios-18-playful-useful-changes) and [MacRumors](https://www.macrumors.com/guide/ios-26-messages-app/): the list is familiar but search moved from the top to the bottom, the compose button moved to bottom right, swipe actions are round buttons rather than square blocks, and conversations can have custom backgrounds (preset sky, water, aurora, or a solid colour). INFERRED from the general iOS 26 pattern ([Design for Native](https://designfornative.com/ui-changes-in-ios-26-thats-not-about-liquid-glass/): floating glass tab bars, contained icon buttons): chrome is capsule glass floating above a plain content field, and content (bubbles) stays solid colour. I could not confirm bubble radii or input-bar heights from text sources; to match, screenshot a real iOS 26 thread and sample it.

Implication for Nickel: an opaque, calm field with a floating glass top pill (title or timer) and a floating glass bottom dock reads as "native to iMessage". A link opened from Messages loads in Safari, so the real Safari bottom bar is also glass on iOS 26, and your dock should sit clear of it (INFERRED; use safe-area insets, below).

## 3. Reproducing it in Safari

**Frosted base works.** `backdrop-filter` is unprefixed in Safari 18 and prefixed (`-webkit-`) before (VERIFIED, via [HorizonX citing MDN](https://horizonx.so/blog/liquid-glass-css), [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)). Keep both declarations.

**Refraction does not work in Safari.** `backdrop-filter: url(#svg)` (the feDisplacementMap trick) is ignored by WebKit: [WebKit bug 245510](https://bugs.webkit.org/show_bug.cgi?id=245510) (open, with a 2026 contributor patch in [WebKit PR 68614](https://github.com/WebKit/WebKit/pull/68614) not yet merged as of the page I read) and [bug 317059](https://bugs.webkit.org/show_bug.cgi?id=317059). Chromium-only: [kube.io](https://kube.io/blog/liquid-glass-css-svg/), [lucaperullo/simple-liquid-glass](https://github.com/lucaperullo/simple-liquid-glass). A JS library (liquidglass.dev) claims refraction in Safari only over a *known image* backdrop, and only frosted blur over arbitrary page content ([liquidglass.dev table](https://liquidglass.dev/)). Verdict: do not ship refraction; treat it as an enhancement at most. Do not use `@supports` to gate it; I did not verify that Safari reports support truthfully for `url()` (INFERRED).

**What sells the look without refraction (INFERRED, consistent with [HorizonX](https://horizonx.so/blog/liquid-glass-css) and [21st.dev](https://21st.dev/blog/liquid-glass-react-components)):**
1. A low-alpha tint over a blur, with `saturate(160–180%)` so colour behind does not go grey.
2. A bright 1px top inner highlight and a faint bottom inner shade (the "slab" cue). 21st.dev notes most perceived quality comes from this paint layer and it is nearly free.
3. A hairline gradient border (bright top-left to dim bottom-right) done with a masked pseudo-element.
4. A soft, low-opacity shadow that grows slightly with size.
5. Capsule radius and concentric inner radii.

**Performance on iPhone.**
- WebKit has had a Safari 26 regression where huge blur radii stall painting: blur(8px) and blur(64px) were fast, blur(200px) stalled around 15s ([WebKit bug 316769](https://bugs.webkit.org/show_bug.cgi?id=316769)). VERIFIED. Keep blur ≤ 28px.
- 21st.dev: cost scales with radius and area, with no visible gain beyond ~20px, and one full-screen blur costs more than several small ones ([21st.dev](https://21st.dev/blog/liquid-glass-react-components)); stacking blurs hurts older devices ([example issue](https://github.com/silverbucket/setlist-roller/issues/66)). Rules for Nickel (INFERRED): at most 3 glass surfaces on screen, none full-screen; never animate `backdrop-filter` itself, animate transform/opacity; do not nest blurred elements; put no filter/opacity/mask on the glass element's ancestors between it and the backdrop (Backdrop Root issue, [HorizonX](https://horizonx.so/blog/liquid-glass-css)).
- A moving or animating game board behind glass forces the blur to re-render each frame. Keep the board outside the glass footprint (INFERRED).

**Reduced transparency / contrast.** `prefers-reduced-transparency` is not supported in Safari or iOS Safari through the versions in [Can I use](https://caniuse.com/wf-prefers-reduced-transparency) (VERIFIED: unsupported through iOS 27.2, supported in Chrome 119+). So you cannot detect the iOS Reduce Transparency setting on the web. Mitigations (INFERRED): make the glass tint opaque enough to be legible alone (≥ 0.55 alpha light, ≥ 0.45 dark); honour `prefers-contrast: more` (widely supported, I did not re-verify in a source this session) with a solid fill and a 1px solid border; keep `prefers-reduced-transparency` in as free progressive enhancement; and add an `@supports not (backdrop-filter: blur(1px))` solid fallback.

## 4. CSS recipe

Tokens first. Rationale: one variable set switches light/dark and fallbacks; components never hard-code colours.

```css
:root {
  color-scheme: light dark;
  --glass-blur: 20px;
  --glass-sat: 170%;
  --glass-fill: rgb(255 255 255 / 0.42);
  --glass-fill-solid: rgb(246 246 248 / 0.96);
  --glass-hi: rgb(255 255 255 / 0.75);
  --glass-lo: rgb(0 0 0 / 0.06);
  --glass-edge-a: rgb(255 255 255 / 0.85);
  --glass-edge-b: rgb(255 255 255 / 0.12);
  --glass-shadow: 0 6px 20px rgb(20 20 40 / 0.12), 0 1px 3px rgb(20 20 40 / 0.08);
  --glass-label: #111114;
  --spring: cubic-bezier(.34, 1.56, .64, 1);
}
@media (prefers-color-scheme: dark) {
  :root {
    --glass-fill: rgb(40 40 46 / 0.45);
    --glass-fill-solid: rgb(36 36 40 / 0.96);
    --glass-hi: rgb(255 255 255 / 0.22);
    --glass-lo: rgb(0 0 0 / 0.35);
    --glass-edge-a: rgb(255 255 255 / 0.35);
    --glass-edge-b: rgb(255 255 255 / 0.05);
    --glass-shadow: 0 8px 24px rgb(0 0 0 / 0.45), 0 1px 3px rgb(0 0 0 / 0.4);
    --glass-label: #f5f5f7;
  }
}
```

### Variant A — Regular capsule (default: top pill, bottom dock, info button)

```css
.glass {
  position: relative;
  isolation: isolate;
  border-radius: 999px;
  color: var(--glass-label);
  background: var(--glass-fill);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
  box-shadow:
    inset 0 1px 0 var(--glass-hi),
    inset 0 -1px 0 var(--glass-lo),
    var(--glass-shadow);
  transition: transform 350ms var(--spring);
}
.glass::before { /* gradient hairline border */
  content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
  background: linear-gradient(145deg, var(--glass-edge-a), var(--glass-edge-b) 45%, var(--glass-edge-a));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  pointer-events: none;
}
.glass:active { transform: scale(.96); transition-duration: 120ms; }
.glass-btn  { min-height: 52px; padding: 0 28px; font: 600 17px/1 -apple-system, system-ui; }
.glass-icon { width: 44px; height: 44px; display: grid; place-items: center; }
```
Why: this is the HIG "regular" idea (blur plus luminosity change) approximated by a mid-alpha fill over blur and saturate. Mask-composite border keeps the hairline from stacking with the box-shadow.

### Variant B — Tinted primary (one per screen)

```css
.glass-primary {
  --tint: 10 132 255; /* iOS blue (VERIFIED systemBlue light #007AFF, dark #0A84FF is common knowledge; sample real values) */
  background: linear-gradient(rgb(var(--tint) / .78), rgb(var(--tint) / .62));
  color: #fff;
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  backdrop-filter: blur(16px) saturate(180%);
}
```
Why: Apple puts colour on the glass background, never the label, and only on the primary action. White text on this tint is ~4.5:1 or better at 0.78 alpha over mid-tones (INFERRED; check with your accent). Do not give secondary buttons a tint.

### Variant C — Clear, over a vivid result/splash screen only

```css
.glass-clear {
  background: rgb(255 255 255 / 0.12);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  backdrop-filter: blur(8px) saturate(150%);
  color: #fff;
  text-shadow: 0 1px 2px rgb(0 0 0 / .35);
}
.glass-clear-scrim { background: rgb(0 0 0 / .35); } /* HIG: 35% dim under bright media */
```
Why: Apple's clear variant needs a bold, bright backdrop plus a dimming layer. Don't mix A and C on one screen.

### Fallbacks (append once)

```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass, .glass-clear { background: var(--glass-fill-solid); }
}
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .glass, .glass-clear, .glass-primary {
    background: var(--glass-fill-solid);
    -webkit-backdrop-filter: none; backdrop-filter: none;
    box-shadow: 0 0 0 1px currentColor;
  }
  .glass::before { display: none; }
}
@media (prefers-reduced-motion: reduce) { .glass { transition: none; } }
```

### Placement CSS for the Safari viewport

```css
.dock { position: fixed; left: 16px; right: 16px;
        bottom: max(16px, env(safe-area-inset-bottom)); }
.topbar { position: fixed; top: max(12px, env(safe-area-inset-top)); left: 16px; right: 16px; }
```
Concentric rule: dock radius 28px with 8px inner padding means the inner button radius is 20px (28 − 8). With a full capsule, the inner capsule is simply also 999px.

## 5. Nickel-specific rules (INFERRED synthesis)

- Game board, tiles, grids and the answer area: opaque, flat, no blur. Glass only for: top status pill, bottom primary action, info (i) button, result toast.
- Text over glass: 17pt semibold minimum, and use the monochrome label colour, never coloured text.
- Colour: neutral field (#F2F2F7 light, #000/#1C1C1E dark) plus one accent. Glass over a flat neutral field looks like a plain frosted pill, which is correct and clean; use a subtle large gradient or soft colour blobs behind a screen only if you want visible glass.
- Do not build a bubble-style UI; Messages bubbles are solid content, not glass.

## 6. Open items

- Apple's exact radii, blur and ms values are not published; sample a real iOS 26 device before finalising any number above.
- WebKit PR 68614 could add backdrop-filter: url() later; check Safari release notes, but never rely on it.
- I did not verify `prefers-contrast` support from a source in this session.
