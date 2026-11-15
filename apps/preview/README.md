# Nickel iMessage preview

A clickable simulation of Nickel inside Messages, for checking the design on a phone before the real Keiki line exists.

```bash
node apps/preview/server.mjs   # http://localhost:4173, set PORT to change it
```

- `/` is a simulated Messages app: the group chat with the Nickel bot, and the private Nickel chat with Keiki Vault cards. Messages itself is fake; the game pages are the real pages a link or a Vault card would open.
- `/r/<roundId>` is one game, picked by the round in `rounds.json`. There is no game picker. Unknown rounds still return 200 with an "isn't open anymore" screen, because Keiki Vault shows its own error page for anything 400 or above.
- `?via=link` asks "Which one are you?" the first time. `?via=vault` signs in as the card's recipient, the way the Keiki Vault `#kv` token would.

Rounds in `rounds.json`:

| Round | Shows |
| :--- | :--- |
| `wordle-212` | Today's Wordle Blitz, with the reveal against the group |
| `rps-dev` | A head-to-head Rock Paper Scissors challenge from Dev |
| `krill-87` | Yesterday's One in a Krillion, closed, with a practice mode |

Game logic runs in the page here for the demo. In the real app, answers, timers, and scoring live in Convex (see `UX.md` §7).
