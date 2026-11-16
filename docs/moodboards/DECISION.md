# Pick Social Club

Use [Social Club](board-1.html) for Nickel's shared cards and the three pages in this pass. Borrow Paper League's idea of a keepsake, not its serif UI. Keep After Hours as a comparison, not a second production theme.

The product starts as an invitation in a real conversation. Partiful's useful lesson is that the invitation is a desirable object in its own right. Nickel now has seven recognizable covers instead of seven copies of a white rectangle: letter tiles for the daily game, two people for a challenge, draft cards for fantasy, coins and a receipt for a buy-in, a podium for standings, a portrait for a player card, and a small social mosaic for the hub. The title remains the first thing readable at 300px.

Inside the link, lower the volume. Peyton's existing system already has the right foundation: native system type, a neutral content layer, blue actions, and controls that feel separate from their content. The fantasy page, profile, and Messages preview opt into `polish.css`; no other page and no part of `nickel.css` changes. The new layer adds spacing, image edges, a small amount of depth, clearer hierarchy, honest loading and error states, and 100–240ms interaction feedback. It does not introduce a framework, a navigation system, a font request, or a new backend flow.

## What each direction established

- **Social Club:** Familiar, social, legible in a busy chat. SF/system type in the browser and the existing bundled Inter fonts in resvg. Cloud gray, white, ink, blue, and a restrained thematic cover color. Real uploaded photos take priority; original illustrated faces are explicit fallbacks.
- **After Hours:** Strong earned-score hierarchy and vivid contrast. Too much of it would make a casual friend league feel like a trading product or a casino. We kept the strong numbers, not the neon-money atmosphere.
- **Paper League:** A warm, collectible invitation and an editorial rhythm. A serif across the actual product would split it from Peyton's pages. We kept the player ID and the intentional artifact, not the typography switch or faux paper texture.

## Decisions that reached the code

| Research lesson | Implementation |
| --- | --- |
| Partiful treats an invite as something worth sending | Full-bleed pastel covers, large headings, distinct vector objects, an obvious destination |
| Family reveals detail when it becomes pertinent | Fantasy scoring is an accessible contextual sheet, not another page |
| Emil makes feedback immediate and movement short | Press feedback, saving/drafting labels, 240ms sheets, interruptible CSS transitions |
| Jakub's details compound | Balanced headings, tabular scores, image outlines, consistent 20px page gutters |
| Rauno keeps repeated actions quiet | No looping effects, no animation on refresh, reduced-motion support |
| Airbnb's 2025 release makes breadth scan quickly | Fantasy gets one clear summary; profile becomes a recognizable ID rather than an unstructured form |
| Linear separates control material from content | Opaque content remains opaque; no glass boards or nested glass |
| Cash App uses color deliberately | Amounts stay large and literal; green is not the only signal of money or success |

All three boards contain eight linked, annotated references, a palette and type scale, and coded chat, game, person, money, button and sheet examples. Motion plays once on entry and can be replayed. X citations are based on indexed public post text; attached videos were not played. Sources are embedded in each board, with the limits stated there.

## Proposals for Peyton, not edits to nickel.css

1. Add a shared `:focus-visible` treatment so every game gets the same keyboard affordance.
2. Consider a 240ms sheet token for non-game pages. This opt-in layer uses it without changing game motion or `juice.js`.
3. Add a semantic readable-caption token separate from decorative `--ink-3`. Recovery messages and instructions need more contrast than an absent player's placeholder.

Keep the game's existing board anatomy, control capsules, and result celebrations. This pass deliberately doesn't touch hub, pot, wallet, play, leaderboard, wrapped, or the shared game stylesheet.

## Open the evidence

Start at [index.html](index.html) for native-300px before/after card pairs, full-size PNG links, and 390×844 page comparisons in both themes. [VERIFICATION.md](VERIFICATION.md) records checks, shared-file line ranges, route compatibility, and what wasn't tested on a real phone.
