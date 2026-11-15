# Apple platform UX guidance for Nickel (HIG, widgets, Live Activities, notifications, haptics, accessibility)

Track 03. Date: 2026-11-15. Tags: **[VERIFIED]** = read in the cited source this session. **[INFERRED]** = my reasoning from verified facts, or a secondary source I could only skim. Gaps are listed at the end.

## 0. Bottom line

1. **Keiki Vault can already do a *generic* Live Activity and push notification for Nickel, with no Expo app and no Apple developer account of our own.** The content is a fixed task template (title, body, phase, progress), not custom UI. It is good enough for "round ends in 2:00", "pot is 14 nickels", "you got poached". It cannot render a custom countdown ring, a Wordle grid, or an interactive button.
2. **Anything custom (home screen widget, branded Live Activity, interactive widget, lock-screen widget) needs our own native iOS app**, via `expo-widgets` (stable, Expo SDK 56+; docs now show SDK 58). That means an App Store app, an Apple Developer account, a development build (not Expo Go), and our own APNs credentials.
3. **Games inside a Vault card cannot use native haptics** (it is a web view; Safari has no `navigator.vibrate`). A Safari-only `<input switch>` trick gives a light tick. Treat haptics as a bonus, not core feedback. Sound and animation must carry the feedback.
4. **Design the card for the iMessage compact/expanded model and for Wordle-style accessibility from day one**: never encode state by color alone, support Dynamic Type through rem/system fonts, honor `prefers-reduced-motion`.

## 1. What Keiki Vault can trigger (primary source)

Source: https://onkeiki.com/docs/keiki-vault.md (fetched; the tool truncates at 10,000 characters, so the presentation-card section further down was not readable. Everything below is from the portion I read).

**[VERIFIED]**
- Vault is Keiki's own iMessage app (App Store bundle `com.keiki.vault`, extension `com.keiki.vault.messages`). One app for every agent; no per-agent build. "A card opens inside Messages without opening the full app."
- Two card types: **presentation card** (your HTTPS page in a web view, from a tool returning `presentation {type: "app"}`) and **approval card** (native Approve/Decline behind Face ID).
- **Native notifications and "task activities" exist** as a recipient-scoped contract. Delivery needs a compatible Vault build, platform APNs credentials, and device permission. "Existing App Store cards do not gain native push simply because the backend is updated."
- **Opt-in is a real funnel, not a toggle.** The recipient opens Vault in Messages, taps **Enable agent updates**, passes a Face ID consent for the named agent. Needs an existing Face ID approval key (created by approving any Keiki card first). Settled approval cards also show "Enable agent updates". The agent calls `vault_connect` (no args): on a direct iMessage chat it sends a Face ID approval card ("Updates from <agent>"); other channels get a link. If already connected it returns `connected` and sends nothing.
- Agent tools: `vault_connect`, `notify`, `activity_start`, `activity_update`, `activity_end`, `activity_status`, `notification_status`. Developer API: `POST /api/v1/developer/agents/:agentId/notifications` and `.../activities/{start,update,end}` with `{recipient, content}`, scope `agents:write`; cloud client `@onkeiki/agents/cloud` (`cloud.vault.notify`, `cloud.vault.activity.*`). Recipient is a phone number looked up against an already-enrolled conversation.
- **Content model:** `id` (your logical id), `revision` (start at 1, +1 per full snapshot; stale revision returns `revision_conflict`), `title` (max 120 chars), `body` (max 500), `phase` (`working` etc.; end phases `completed` / `failed` / `cancelled`), optional `progress` 0 to 1, `expiresAt` (**capped at 8 hours from task creation**). Notification IDs are single-use.
- Before updating, call `activity_status` (returns up to 20 recent tasks). Reuse the exact logical id and the original `expiresAt`; do not recompute eight hours.
- Result states: `queued`, `not_enrolled`, `permission_denied`, `suppressed`, `unsupported`. Transport: `provider_accepted`, `expired`, `failed`, `unknown`. "APNs acceptance is not proof of visibility." No silent fallback to SMS.
- **Live Activities need iOS 17.2+ for remote starts** and "represent one bounded task, not an always-on agent indicator." Apple's notification permission and Live Activities can each be disabled separately.
- Branding: "Keiki Vault keeps one stable app icon; agent names and initials supply task branding." So Nickel will not have its own icon on the lock screen.
- Warning in docs: avoid sensitive lock-screen text.

**[INFERRED] consequences for Nickel**
- Mapping: one Live Activity per *round per player* (or per group round, one per enrolled member). Title "Wordle Blitz • 1:42 left", body "3 of 5 friends have played", progress = elapsed/duration. Update at most a few times per round (see budgets, section 3). End with `completed` and a final body ("You won 6 nickels").
- Because the card renders text only and we cannot use `Text(timerInterval:)`-style system countdowns, a Vault Live Activity will show *stale* remaining time between updates unless Keiki's template uses a system timer on `expiresAt`. **Ask Keiki** whether the template renders a self-ticking countdown. If not, put an absolute time ("ends 7:42 PM") in the body rather than "1:42 left".
- Consent friction is high (Vault installed + Face ID key + agent consent + iOS notification permission + Live Activities enabled). Expect a small fraction of group members to be fully enrolled. Treat native notifications/activities as an **enhancement**, with the iMessage group message as the guaranteed channel.

## 2. iMessage apps, stickers, App Clips: guidance that applies to a Vault card

**[VERIFIED]** from the HIG data (https://developer.apple.com/tutorials/data/design/human-interface-guidelines/imessage-apps-and-stickers.json, human page https://developer.apple.com/design/human-interface-guidelines/imessage-apps-and-stickers):
- "Prefer providing one primary experience in your iMessage app. People are in a conversational flow when they choose your app, so your functionality or content needs to be easy to understand and immediately available."
- "Present essential features in the compact view." The compact view appears below the transcript and "occupies roughly the same space as the keyboard"; the expanded view takes most of the window.
- "Let people edit text only in the expanded view" so the keyboard does not cover content. Relevant to word games (Wordle, Closest Estimate numeric entry): use an in-page tile keyboard, not the system keyboard, in compact/live cards.
- Stickers: three sizes (small, regular, large); do not mix sizes in a pack; file must be **500 KB or smaller**; @3x dimensions per size; provide a localized alt description for VoiceOver. A sticker pack for Nickel reactions ("poached", "steal") is cheap if we ever ship our own iMessage extension. Keiki does not mention stickers.

**[VERIFIED] App Clips** (https://developer.apple.com/tutorials/data/design/human-interface-guidelines/app-clips.json):
- App Clips can launch from "tapping links others share with them in the Messages app." Guidance: linear UI, no tab bars or settings, show the relevant screen immediately, no splash screen, never make people wait on launch, no marketing/ads, and "don't require people to install the full app" to finish a task or level. A game demo is explicitly an endorsed use.
- **App Clips use native components; "If only web components are available to you, offer a quick link to your website instead of an App Clip."** A web card therefore is not an App Clip. Keiki Vault *is* the Messages-embedded surface for web content; an App Clip would be a separate native build.
- **[INFERRED]** Use the App Clip bar as a design checklist for the card: open straight into the round, zero onboarding screens, one primary action, finish in under a minute, no ads.

**[INFERRED] sizing for the card.** I could not find a published Keiki card height. Design for the iMessage compact area (about keyboard height, roughly 260-340 pt on current iPhones; **not verified**) and verify empirically on a device. Parent notes say live cards do not scroll: keep each game state to one non-scrolling viewport and make tap targets at least 44x44 pt (Apple's standard minimum; I did not re-fetch the HIG page for that number).

## 3. Live Activities and Dynamic Island: rules and numbers

Source: HIG https://developer.apple.com/design/human-interface-guidelines/live-activities (JSON copy read), Apple article https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities, WWDC23 "Design dynamic Live Activities" https://developer.apple.com/videos/play/wwdc2023/10194/, WWDC26 "Live Activities essentials" https://developer.apple.com/videos/play/wwdc2026/223/ (only the abstract was readable; it mentions a new landscape Dynamic Island style).

**[VERIFIED]**
- Presentations you must support: compact (leading + trailing around the TrueDepth camera, only when one activity is active), minimal (up to three detached bubbles when several are active), expanded (touch and hold), Lock Screen banner. On iPhone in **StandBy** it shows the minimal presentation; tapping scales the Lock Screen layout **2x** to full screen and extends a custom background color.
- "Offer Live Activities for tasks and events that have a defined beginning and end... short to medium duration activities that **don't exceed eight hours**." Focus on "important information that people need to see at a glance."
- **8-hour active limit**; the Dynamic Island entry disappears at 8h; the Lock Screen copy stays up to **4 more hours** (12 h max).
- A Live Activity "can't access the network or receive location updates"; it updates through ActivityKit in-app or push. Image assets must be at or under the presentation size or the activity may fail to start.
- Updates via APNs `liveactivity` push type, token-based connection only (https://wwdcnotes.com/documentation/wwdc23-10185-update-live-activities-with-push-notifications/); priority 5 = low, 10 = high (WWDC23 10185 transcript snippet, https://developer.apple.com/videos/play/wwdc2023/10185/). Channels and broadcast push exist for large audiences (Apple article on ActivityKit push). Remote *start* needs iOS 17.2 (push-to-start token).
- Retention-blog summary of Apple's rules: no marketing or promotions in a Live Activity, no static unrelated content (secondary source: https://www.retention.blog/p/widgets-and-live-activities; **[INFERRED]** that it paraphrases the HIG accurately).
- Layout numbers from secondary sources: max Lock Screen height **160 pt**, Dynamic Island corner radius **44 pt** (https://sparrowcode.io/en/tutorials/live-activities, written for iOS 16, treat as approximate), 14 pt Lock Screen margins (WWDC23 10194 snippet).
- Payload: dynamic content limited to **4 KB** (https://schibsted-vend.pl/blog/creating-real-time-news-experience-with-ios-live-activities/, secondary; **[INFERRED]** still correct). Keiki's own limits (120/500 chars) are far below this.

**Nickel Live Activity candidates** (this is where they earn their place per Apple's "defined start and end" rule):

| Activity | Start / end | Content | Via Vault? |
|---|---|---|---|
| Live round countdown (e.g. 25 s One in a Krillion, 2 min Wordle Blitz) | round start / reveal | time left, players done X/Y | Yes, but a 25 s round is too short for push updates to land reliably; use only for rounds of at least 2 min **[INFERRED]** |
| Daily round window (24 h async games) | open / close | "3 of 5 played, closes 9 PM" | Yes, capped at 8 h so start it late in the window |
| Poach window timer | poach opens / expires | "Poach window: 0:45, pot 12" | Generic only; a precise ticking timer needs our app |
| Pot ticker | round start / settle | "Pot: 14 nickels", progress to cap | Yes |
| Custom rich UI (rank list, ring, buttons) | n/a | custom | **Needs our app** (expo-widgets) |

**Budgets [INFERRED]:** each push update is also subject to Apple's per-activity update budget; higher-frequency updates require the `NSSupportsLiveActivitiesFrequentUpdates` key, which expo-widgets exposes as `frequentUpdates`. I could not read Apple's exact budget text (page rendered empty), so do not promise more than about one update per 15 to 60 seconds and test.

## 4. Widgets: rules and constraints

Source: HIG widgets https://developer.apple.com/design/human-interface-guidelines/widgets (JSON read), WWDC21 "Principles of great widgets" notes https://wwdcnotes.com/documentation/wwdc21-10048-principles-of-great-widgets/, Expo https://docs.expo.dev/versions/latest/sdk/widgets/.

**[VERIFIED]**
- Widgets live on Home Screen, Lock Screen (accessory), StandBy, Mac desktop, Smart Stack, CarPlay and more; "adapt their appearance to the context", with rendering modes and tinting.
- Widgets are **not live**: you hand the system a timeline of pre-rendered entries. A frequently viewed widget gets about **40 to 70 background reloads per day**; reloads are minutes/hours apart, not seconds. Reload via `WidgetCenter` from the foreground app is free. Prefer one reload that supplies many future entries (https://www.dzionis.by/writing/widgetkit-timeline-budget.html, secondary).
- Interactive widgets (buttons, toggles) exist since iOS 17 (https://expo.dev/blog/home-screen-widgets-and-live-activities-in-expo; Apple: https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities).
- Widgets can deep link into the app.

**Expo specifics [VERIFIED]** (https://docs.expo.dev/versions/latest/sdk/widgets/, https://expo.dev/blog/home-screen-widgets-and-live-activities-in-expo, reddit thread "stable as of SDK 56" https://www.reddit.com/r/reactnative/comments/1u9ax11/the_expowidgets_library_is_stable_now/):
- `expo-widgets` builds iOS widgets and Live Activities (and Android widgets, opt in) from React using `@expo/ui` SwiftUI components, without writing native code. Not available in Expo Go; needs a development build.
- Widget code runs in an **isolated runtime with no hooks, app state, or async work**: it is a pure function of props. Data arrives through the timeline you schedule from the app.
- Config plugin options include an app group id and `enablePushNotifications` (adds the `aps-environment` entitlement, needed for Live Activity push) and `frequentUpdates`.
- Live Activity layout has slots: Lock Screen banner, Dynamic Island compact leading/trailing, minimal, expanded (leading, center, trailing, bottom). Remote start via push-to-start tokens is supported.
- Alternative: `expo-apple-targets` (https://github.com/EvanBacon/expo-apple-targets) generates SwiftUI targets (widgets, App Clips) when we want hand-written SwiftUI.
- Known issue to watch: how to send APNs start/update for Expo Live Activities was an open docs question (https://github.com/expo/expo/issues/43591).

**Nickel widget ideas (needs our app) [INFERRED]**
- Small: current streak plus "your move" state (Duolingo pattern, below).
- Medium: the group scoreboard top 3 plus nickels.
- Lock Screen accessory: "Round closes in 40m".
- Interactive: a one-tap "Steal" / "Split" button in a Split or Steal round (iOS 17 interactive widgets), as a progressive enhancement only.
- Because widgets are budgeted, show closing *times* as system-formatted dates (SwiftUI relative/timer text ticks on its own) instead of reloading.

## 5. What successful widget and social products do

- **Duolingo widget.** Built from a hackathon; took over a year because of utility and installation. Finding: "simply reminding a learner of their current streak, and whether or not it's at risk, is hugely valuable... We don't need to complicate this." Metric: "half of the learners with the widget installed have a streak of at least 6 months" (correlation, not proof). Installation was the real challenge, so they tested in-app promos right after a finished lesson with an animated how-to, and "installs skyrocket[ed]" (https://blog.duolingo.com/widget-feature/; install-prompt tactic also summarized at https://gtmsauce.com/tactics/duolingo-after-a-finished-lesson-show-a-card-asking-users-to-add-the-widget). **Lesson:** ask for the widget at the moment of a win, show how to add it.
- **Locket.** Photos from friends in a home screen widget; hit #1 on the App Store within days of the Dec 2021 launch, then 20M+ downloads by Aug 2022 (https://techcrunch.com/2022/01/11/locket-an-app-for-sharing-photos-to-friends-homescreens-hits-the-top-of-the-app-store/, https://techcrunch.com/2022/08/02/locket-app-that-lets-yor-post-photos-to-your-loved-ones-homescreens-raises-12-5m/). The founder started it as a gift; usage with his girlfriend averaged about five photos a day. **Lesson:** a widget showing a *friend's latest thing* turns the home screen into the social surface. For Nickel: widget shows "Maya just beat your Wordle score" (**[INFERRED]**).
- **BeReal.** One notification a day, same time for everyone in a time zone, **2 minutes** to post; late posts are labeled; you cannot see friends' posts until you post (https://help.bereal.com/hc/en-us/articles/7350386715165--Time-to-BeReal). Teen interviews (n=29) link the random timing and reciprocity to less staging (https://arxiv.org/html/2408.02883v1). **Lesson for Nickel:** a shared synchronized trigger plus a short window produces the "everyone at once" feeling; labeling latecomers (and gating the reveal until you've played) creates reciprocity without extra copy.
- **NYT Games / Wordle.** Daily ritual, streak, shareable color grid. Official app exists on iOS/Android (https://www.nytco.com/press/wordle-nyt-crossword-app/). I could not verify specifics about an NYT lock-screen widget; **not verified**.
- **Retention-blog survey** (https://www.retention.blog/p/widgets-and-live-activities): Duolingo uses widgets and Live Activities for streak/lesson reminders; Live Activities are most powerful and most abusable, so stay inside Apple's rules (no promotion).
- **Sports score Live Activities** (Apple's own example in the HIG: "live in-game information for a soccer match") fit rounds with a clear end. **[INFERRED]** the Pokemon/sports pattern is: one activity per game, start on kickoff, update on score events only, end with final result and a lingering Lock Screen summary.

**What makes them engage [INFERRED, synthesizing the above]:** (1) glanceable state of *social* standing, not generic stats; (2) loss aversion (streak at risk); (3) one shared time anchor; (4) opt-in prompt at a high point; (5) restraint: the lasting ones update rarely.

## 6. Notifications

**[VERIFIED]** from https://developer.apple.com/design/human-interface-guidelines/notifications (JSON read):
- Concise, high-value, glanceable. Do not send multiple notifications for the same thing "even if someone hasn't responded", people turn notifications off entirely.
- Don't tell people to perform a task in your app as the notification content; use actions if it can be done without opening.
- Don't put sensitive info in a notification; write generic body text that still works when previews are hidden ("Friend request", "New comment").
- Short title; sentence case, complete sentences; the system truncates.
- When the app is in the foreground, do not show a banner; update in place.
- Interruption levels (https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel.md; https://documentation.onesignal.com/docs/en/ios-focus-modes-and-interruption-levels): Time Sensitive can break through Focus and needs a capability, users can turn it off per app. **[INFERRED]** Do not use it for Nickel except the poach window; Keiki controls this anyway.

**Nickel copy rules [INFERRED]:** one notification per round start, one per "closing soon" at most, one result. Use the Live Activity (updated in place) instead of a stream of pushes. Preview-safe text: "Round ready" / "Result is in" rather than the answer or a score spoiler.

## 7. Haptics

**[VERIFIED]** (https://developer.apple.com/design/human-interface-guidelines/playing-haptics): use system haptics with their documented meanings; keep a clear cause-and-effect mapping (same pattern should not mean both fail and success); haptics complement visuals/audio and should match intensity and sharpness of the animation; prefer short haptics on discrete events; "let people turn off or mute haptics, and make sure people can still enjoy your app without them." Core Haptics supports transient (tap) and continuous events for custom patterns in native games.

**Web view reality [VERIFIED]:**
- Safari on iOS has never implemented `navigator.vibrate` (https://wingo-ui.com/blog/web-vibration-api-haptic-feedback).
- WebKit added haptic feedback to `<input type=checkbox switch>` (https://bugs.webkit.org/show_bug.cgi?id=266066, Safari 17.4 per https://maid.zone/blog/2025-06-03-ios-web-haptics.html). A known workaround creates a hidden switch inside a label and clicks the label, then removes it (npm `ios-haptics`, cobalt.tools source).
- **Fragile:** a report says it stopped working for the imperative path on iOS 26.5+ (https://github.com/lochie/web-haptics/issues/41, created 2026-06-07). **Unknown whether it works inside the Keiki Vault web view** (extension process); test on device.

**Plan [INFERRED]:** wrap haptics in one `haptic(kind)` helper, no-op when unsupported, and map: tick (tile placed, digit entry), confirm (correct), error (invalid word). Native Expo app, if we ship one, can use `expo-haptics` instead.

## 8. Typography, dark mode, color, accessibility

**[VERIFIED]** (https://developer.apple.com/design/human-interface-guidelines/color and /accessibility JSON):
- Don't rely solely on color; add text labels or glyph shapes to identify states.
- Supply light, dark, and increased-contrast variants for every custom color.
- Dynamic Type: let people enlarge text by **at least 200%** (140% on watchOS); follow recommended defaults for custom type; thin weights need larger sizes.
- Contrast: Apple points to WCAG AA (4.5:1 normal text) or APCA; if you can't meet it by default, provide higher contrast under Increase Contrast.
- Motion (https://developer.apple.com/design/human-interface-guidelines/motion): don't use motion as the only way to communicate; keep feedback animation brief; avoid animating frequent interactions; in games 30 to 60 fps is the target.

**Wordle-style palettes.** Wordle's own high-contrast mode swaps green/yellow for **orange and blue** (https://indianexpress.com/article/technology/gaming/wordle-has-a-colour-blind-mode-heres-how-to-activate-it-7754332/). Original greens/yellows used in clones: green #6aaa64 / #538d4e, yellow #c9b458 / #b59f3b, gray #86888a (from a copy of a clone's source, https://gist.github.com/jpluimers/8226cd975d58e66efe873736d33d3dc8; **not** an official NYT source). A UX Stack Exchange answer notes that what matters for deuteranopia/protanopia is luminance and hue contrast between states, and that the default green/yellow has almost no contrast for those users (https://ux.stackexchange.com/questions/143574/does-wordles-high-contrast-mode-confuse-the-meanings-of-the-colors-for-colorbli; a Substack criticizes the toggle being buried, https://billfischer.substack.com/p/these-2-wordle-colors-undermine-color).

**Recommendations [INFERRED]:**
- Default to the orange/blue pair for everyone, not an opt-in toggle, since the toggle is rarely found. Add a glyph on each tile (check = correct spot, dot = wrong spot, none = absent) plus an accessibility label ("A, correct position"). Verify contrast with a deuteranopia/protanopia simulator and a 3:1 minimum between adjacent tile states (WCAG 1.4.11 non-text contrast; not re-fetched).
- Use system fonts (`-apple-system`, SF Pro) with `rem`-based sizes so iOS text size settings apply in a web view; test at the 200% setting. Use `font-variant-numeric: tabular-nums` for timers and pot counters so digits do not jitter.
- Support `prefers-color-scheme` and `prefers-contrast` and `prefers-reduced-motion` (swap confetti/shake for a static state change).
- VoiceOver: native tiles get roles/labels; announce round state changes with `aria-live=polite`. Alt text for any sticker or carousel image (HIG sticker guidance above).
- Fixed 25 s and 2 min timers are a time-pressure accessibility issue; offer a longer-time option or untimed practice **[INFERRED]**.

## 9. Capability matrix: Vault vs own Expo app

| Capability | Keiki Vault alone | Needs our own Expo/iOS app |
|---|---|---|
| Play games in card (web view, live or expanded) | Yes | No |
| Push notification to a player | Yes, after Vault + consent funnel | Own APNs, own permission prompt |
| Live Activity (generic title/body/progress, 8 h cap) | Yes, iOS 17.2+ for remote start | Not needed |
| Branded or custom Live Activity UI, Dynamic Island layouts, buttons | No (one stable Vault icon, template content) | Yes: expo-widgets, `enablePushNotifications`, `frequentUpdates` |
| Home screen / Lock Screen / StandBy widgets, interactive widgets | No | Yes: expo-widgets |
| Native haptics (UIFeedbackGenerator / Core Haptics) | No (web view) | Yes (expo-haptics) |
| Web haptic tick (switch trick) | Maybe, untested in Vault | n/a |
| Stickers / own iMessage extension | No | Separate native iMessage extension |
| App Clip | No | Native build, not web-only |
| Face ID approvals | Yes (approval cards) | n/a |

## 10. Open questions to put to Keiki or test on device

1. Does a Vault Live Activity render a self-ticking timer from `expiresAt`, or only the last pushed text? (Decides whether it can show the poach countdown.)
2. Exact live-card height and width on iPhone sizes; does the web view expose `env(safe-area-inset-*)`?
3. Does the iOS switch-haptic trick fire inside the Vault Messages extension?
4. Realistic enrollment rate through the consent funnel in a group of 4 to 8 friends.
5. Per-activity update budget and latency for Vault pushes; can `activity_update` be sent every 15 s for a 2 minute round?

## 11. Gaps in this research

- The HIG pages for Messages (compact/expanded sizes), Live Activities "Specifications", and WidgetKit budget text rendered empty or truncated; sizes quoted from secondary sources are marked.
- The Keiki doc sections after the first 10,000 characters (presentation cards, live:true details) were not readable by the fetch tool.
- NYT Games widget details, Widgetsmith, and Pokemon Live Activities were not verified from a primary source.

