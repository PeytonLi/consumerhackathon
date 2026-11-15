# Nickel — Final Step-by-Step Build & Revyl Testing Plan (`sritej/main`)

**Architecture:** Zero-App-Install, Partiful-Style iMessage Group Chat Experience  
**Key Pillars:**
1. **Keiki Group Chat Engine (`@onkeiki/agents@0.1.7`):** Lives natively inside iMessage (`imsg:chat:*` on dedicated `photon`/`blooio` lines) and Telegram groups (`features.groupChats: true`), supporting direct text play, native tapbacks, confetti effects, proactive `/notice` pushes, and `690×920` swipeable rich card stacks (`render_cards`).
2. **Partiful-Style iMessage Rich Link Cards (`apps/web`):** Sending `https://<host>/c/<cardId>` in iMessage renders a live dynamic OpenGraph visual bubble (`/api/og/[cardId]`) showing the pot, avatar rings, and countdown. Tapping it opens an instant, zero-install mobile web sheet over iMessage (`SFSafariViewController` / Mobile Safari) with all 5 sub-60s games, Play-to-Unblur rings, prop betting, and 1-tap return to iMessage.
3. **Modular Reward Switch (`rewardMode`: `"points_only"` | `"cash_only"` | `"hybrid"`):** A 1-click toggle (in the Commissioner/Demo bar or via `@nickel mode points | cash | hybrid` in iMessage) that switches the league between **100% Points/Bragging Rights**, **100% Real-Money Whop Cash Pot**, or **Hybrid ($ Buy-In + Daily 5-Nickel Points)**.
4. **Jev / Nace Drex (`systemOne`) Speed Layer:** Sub-40ms grading of open-ended *One in a Krillion* answers (`noul` + 6-tier `score`), dynamic player Over/Under prop lines, and group chat command parsing.
5. **Revyl Cloud Verification:** Tested on both Revyl's Web/Mobile runner AND a live attached cloud **iPhone 18 Pro** (`tools.capy.phone` + `tools.capy.computer`) opening the Partiful-style iMessage cards directly in iOS Safari.

---

## Step-by-Step Execution Plan

### Step 1: Workspace, Convex Schema (with Modular `rewardMode`) & Seed Data (`15 min`)
1. **Initialize Monorepo:**
   - Root `package.json` with `convex@1.50.0`, `convex-test@0.0.71`, `vitest`, `@typesafe-ai/sdk@0.7.0`, `nace-sdk@0.8.0`, `@whop/sdk@2.8.1`, `@onkeiki/agents@0.1.7`.
2. **Deploy `convex/schema.ts`:**
   - `leagues` table includes:
     - `rewardMode: v.union(v.literal("points_only"), v.literal("cash_only"), v.literal("hybrid"))`
     - `customRewardLabel: v.optional(v.string())` (e.g., `"Loser buys KBBQ"` when in `points_only` mode)
     - `themeType`: `"arcade_mix" | "hockey" | "basketball" | "football" | "ai_models" | "custom"`
     - `cadence`: `"demo_blitz" | "weekly" | "biweekly" | "monthly" | "custom_days"`
     - `keikiConversationId: v.optional(v.string())` (`imsg:chat:...`)
   - `users`, `memberships`, `rounds`, `plays`, `wagers`, `wrappedSnapshots`, `transactions`.
3. **Seed Realistic Demo Group Chats (`convex/seed.ts`):**
   - Pre-seed `"Cupertino Day Ones"` (5 friends, 3/5 already played today's *One in a Krillion* so Play-to-Unblur and Poaching work immediately) and `"Fantasy AI Models League"`.
4. **Gate 1:** Run `bunx vitest run convex/schema.test.ts` (`convex-test`) to confirm schema, seed, and `setRewardMode("points_only" | "cash_only" | "hybrid")` switch work cleanly.

---

### Step 2: Game Engines, Play-to-Unblur & Retention Psychology in Convex (`25 min`)
1. **Retention & Modular Economy (`convex/feed.ts`, `convex/nickels.ts`, `convex/leagues.ts`):**
   - `setRewardMode({ leagueId, rewardMode, customRewardLabel })`: Dynamically switches the league between Points-Only, Cash-Only, and Hybrid in <50ms.
   - `getStoriesFeed`: Server-side redaction of friends' *One in a Krillion* answers, 24h Bubble Notes, and prop fades until the viewing member finishes their daily turn.
   - `poachUnclaimedNickels`: Atomic OCC mutation letting the fastest friend in the iMessage chat steal an AFK friend's unclaimed 5 Daily Nickels during the evening Poach Window.
   - `claimMysteryPack`: Server-rolled variable-ratio reward (`+5` base + bonus Nickels / `double_down` / `bet_shield` / `golden_krill` +50).
2. **All 5 Sub-60s Micro-Game Backends (`convex/games/*.ts`):**
   - `krillion.ts`: `submitDive` (System One `noul` + `score` in ~30ms + duplicate-answer group collision 50/50 split).
   - `wordle.ts`: Server-only secret word + 2-pass duplicate-safe `🟩🟨⬛` live spectator masks.
   - `physics.ts`: **Cup Pong / Swish Hoops** (5-ball flick streak) and **1-Hole Trick Mini-Golf** (par + millimeter closest-to-pin tiebreaker).
   - `salvo.ts`: **5x5 Blitz Salvo** (condensed 1-volley Battleship).
3. **Gate 2:** Run `bunx vitest run convex/games.test.ts` verifying Play-to-Unblur security, OCC Poach race safety, Krillion collision splitting, and Wordle tile masks.

---

### Step 3: System One (`Jev` / `Nace Drex`), Prop Book & Nickel Wrapped (`20 min`)
1. **`convex/lib/systemOne.ts`:**
   - Wire `NaceClient` (`nace-sdk@0.8.0`) / `TypeSafeClient` (`@typesafe-ai/sdk@0.7.0`) with latency tracking (`evaluation_time_ms`) and deterministic offline fallback.
2. **Kalshi-Style Prop Book (`convex/wagers.ts`):**
   - Over/Under player prop markets, 1v1 instant challenges, and 3-leg *One in a Krillion* parlays.
   - Anti-front-running lock when target player starts their turn + automatic payout/shield settlement when they finish.
   - Adapts automatically to `league.rewardMode` (wagers settle in Nickel Points in `points_only`/`hybrid`, or shift pot shares in `cash_only`).
3. **Nickel Wrapped (`convex/wrapped.ts`, `convex/seasons.ts`):**
   - Computes **Generational Hater**, **Deepest Brain**, **Nickel Bandit**, and **Clutch God** + System One archetypes, settles Whop payouts (when in `cash_only` or `hybrid` mode) or crowns the Points/Dare winner (when in `points_only` mode), and generates data for both the 9:16 story deck and Keiki's 4-card `690×920` iMessage carousel.
4. **Gate 3:** Run `bunx vitest run convex/wagers-and-wrapped.test.ts`.

---

### Step 4: Keiki Group Chat Agent (`@onkeiki/agents`) & Whop Rails (`20 min`)
1. **Keiki Group Chat Package (`packages/keiki-agent/src/index.ts`):**
   - Configure `features: { groupChats: true }` for dedicated `photon`/`blooio` iMessage lines and Telegram groups.
   - Define tools (`link_group_chat`, `drop_daily_card`, `submit_text_play`, `place_group_bet`, `poach_nickels`, `switch_reward_mode`, `show_wrapped_cards`) backed by `convex/http.ts`.
   - Include `render_cards` / 4-slide `690×920` card payload generator so standings and **Nickel Wrapped** render as swipeable image stacks right inside iMessage.
2. **Whop Financial Rails (`convex/whop.ts`, `convex/http.ts`):**
   - `new WhopClient({ token: process.env.WHOP_API_KEY!, apiVersionDate: "2026-11-13-1" })`.
   - `checkoutConfigurations.create` for 1-tap Apple Pay buy-ins directly inside the iMessage web sheet + HMAC-verified `/webhooks/whop` (`unwrapWebhook`).
3. **Gate 4:** Run `bunx vitest run convex/http.test.ts` testing simulated Keiki group chat turns (`imsg:chat:*`), direct text plays, mode switching, and Whop webhook idempotency.

---

### Step 5: Partiful-Style iMessage Card Web App + Dynamic OG Generator (`40 min`)
1. **Dynamic OpenGraph Card Renderer (`/api/og/[cardId]`):**
   - Generates crisp `1200×630` Partiful-style iMessage link preview images (and `690×920` Keiki swipeable story cards) displaying the league's live pot/points, active `rewardMode` badge, avatar rings (`Played [Blurred]` vs. `Unclaimed 5🪙`), and game prompt.
2. **Zero-Install Mobile Sheet UI (`apps/web`):**
   - **Live iMessage Thread + Card Split/Toggle View:** Includes an interactive **"iMessage Group Thread Preview"** mode right beside the **Instant Card Sheet** so judges can see the exact blue-bubble iMessage group chat (with `@nickel` texts, tapbacks, Partiful-style rich link cards, and 4-card swipeable Wrapped stacks) AND tap into the full-screen iMessage card sheet on any phone!
   - **Top Modular Switch Bar:** 1-tap switch between **`🪙 Points Only`**, **`💵 Cash Only (Whop)`**, and **`⚡ Hybrid ($ + 🪙)`**, plus the **⚡ Judge Demo Drawer** (Drop Round, Open Poach Window, Force Golden Krill, Trigger Season Wrapped).
   - **Play-to-Unblur Stories Ring Bar + 24h Bubble Notes + Mystery Krill Pack Modal.**
   - **All 5 Sub-60s Interactive Games:** *One in a Krillion* (25s dive), *Wordle Blitz* (45s live color-masked race), *Cup Pong* (30s flick physics), *1-Hole Trick Mini-Golf* (25s slingshot + mm tiebreaker), and *5x5 Blitz Salvo* (30s radar volley).
   - **Custom Fantasy League Wizard** (*Arcade Mix*, *NHL Hockey*, *NBA*, *Fantasy AI Models*, or any custom prompt + *Weekly / Bi-Weekly / Monthly* payout cadence) & **9:16 Nickel Wrapped Story Deck** with 1-tap PNG image save/share.

---

### Step 6: Revyl Cloud Build & Live Cloud iPhone 18 Pro Testing (`25 min`)
1. **Configure `.revyl/config.yaml` & `.revyl/tests/*.yaml`:**
   - Set up the Revyl configuration and declarative YAML test suite (`imessage-card-krillion.yaml`, `modular-reward-switch.yaml`, `nickel-wrapped-flow.yaml`).
2. **Live Verification on Cloud iPhone 18 Pro (`tools.capy.phone` + `tools.capy.computer`):**
   - Attach a cloud **iPhone 18 Pro** (`tools.capy.phone({ action: "attach", platform: "ios", model: "iPhone 18 Pro" })`).
   - Open the live Nickel iMessage card URL on the cloud iPhone 18 Pro via `tools.capy.phone({ action: "open_url" })`.
   - Drive the iPhone 18 Pro touchscreen through all 6 flows using `tools.capy.computer.on({ machine_id }).screen`:
     1. Inspect the **iMessage Group Chat Bubble Card** & toggle the **Modular Reward Switch** (`Points Only` ↔ `Cash Only` ↔ `Hybrid`).
     2. Verify **Play-to-Unblur** locks friends' answers before playing.
     3. Play a 25-second **One in a Krillion** dive -> verify `<35ms` System One grading -> rip the **Mystery Krill Pack** -> confirm friends' answers & 24h Bubble Notes unblur.
     4. Play **Wordle Blitz**, **Cup Pong**, **Trick Mini-Golf**, and **5x5 Blitz Salvo**.
     5. Place an **Over/Under Prop Bet** & execute an evening **Nickel Poach**.
     6. Create a custom **"Fantasy AI Models"** league & step through the 5-slide **Nickel Wrapped** recap on the cloud iPhone 18 Pro.
   - Capture high-resolution cloud iPhone 18 Pro screenshots and verify zero console/device errors.
