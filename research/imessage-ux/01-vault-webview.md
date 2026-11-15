# Track 01 — Keiki Vault cards + in-Messages web view UX

Research date: 2026-11-15. Scope: how Vault cards behave, and how to build fast, error-free games inside the Vault WKWebView. Every claim is tagged **[V]** (verified from a source I read, URL given) or **[I]** (inferred, with the reasoning). Nothing in the repo was modified.

Keiki doc URLs used (all https://onkeiki.com/docs/…): keiki-vault.md, imessage-apps.md, imessage-best-practices.md, cloud-agents.md, external-harness.md, actions.md, cards.md. App Store listing: https://apps.apple.com/us/app/keiki-vault/id6823504083.

---

## 0. Ten things that change the plan

1. **A game page must never return HTTP ≥400 for the card URL.** Vault shows its own load error and fires card.load_failed for any main-frame status ≥400 or failed load [V keiki-vault.md "How it renders"]. An expired or finished round must return 200 with your own "round over" screen.
2. **Vault cannot edit our cards after they are sent.** In-place rewrite (updateApp) is used only by Keiki for approval cards; "a tool cannot edit its own card; return a presentation with a new id" [V keiki-vault.md "Updating a sent card"]. A live card has to poll or subscribe for its own results, and results also go out as a normal Nickel text bubble.
3. **The #kv token is good for 24 hours, names the send (not the holder), and a forwarded bubble carries the same token** [V imessage-apps.md "Who opened the card"]. Exchange it once, mint your own session, and make the card show the player's name so a forwarded card is visibly someone else's.
4. **Vault removes the token when a card is opened in Safari** [V imessage-apps.md]. So the plain-link fallback needs its own signed, per-player URL, not kv.
5. **Live cards need Vault ≥ 1.2.2.** "Keiki Vault 1.2.1 and earlier ignore taps on live cards" [V keiki-vault.md]; the App Store changelog dates the fix to 1.2.2, Oct 27 ("Cards are now interactive in the conversation") [V App Store page]. We cannot detect a stale install from the page, so live is only for single-tap games.
6. **Cards only go to 1:1 chats on a dedicated Keiki line with the Dynamic UI add-on** [V keiki-vault.md "Where it works"]. Group iMessage needs a line whose channel is photon or blooio; linq lines ignore groups [V cloud-agents.md "Group chats"]. Confirm with Keiki that one line type supports both cards and groups [I: docs list the constraints separately and never say they overlap].
7. **Card sends are idempotent by (tool, id, url); an unknown delivery must never be auto-retried** [V imessage-apps.md]. Use ids like round-<roundId>-<playerId> so a retry can't double-send.
8. **The first message to someone must be plain text, and cards come only after they reply.** Keiki's line-health guidance: user texts first, plain first message, cards after the user has replied; under 50 new conversations per line per day [V imessage-best-practices.md]. The group flow "Nickel DMs every player a card" starts a new conversation per player unless they texted first. Use an sms: link in the group to make them text first.
9. **iOS has no real web haptics.** navigator.vibrate doesn't exist on iOS; a native switch toggled by a real tap gives one system tick, and a third-party source says iOS 26.5 removed script-triggered haptics [V wingo-ui, sergey-grishchev playground; single-source for 26.5, treat as [I]]. Feedback must be visual and audio, plus Nickel's tapbacks and effects in the chat.
10. **Typing inside a transcript-embedded WKWebView is the weakest spot.** iOS keyboards resize only the visual viewport and push fixed elements around [V kairi.cc, WebKit PR 15517, WebKit bug 311821]. Wordle gets a custom in-page keyboard; Krillion typing runs in expanded mode, never live.

---

## 1. Keiki Vault: what it is, hard facts

| Fact | Value | Source |
|---|---|---|
| App / extension IDs | com.keiki.vault / com.keiki.vault.messages; one app shared by every Keiki agent | [V] keiki-vault.md |
| Publisher, size, OS | Zero Email, Inc.; 2.2 MB; iOS 17.0+; "Designed for iPhone. Not verified for macOS" | [V] App Store page |
| Version timeline | 1.0 Oct 23; 1.2 Oct 25 (web cards fill the whole card with the page's own colour); 1.2.1 Oct 25; 1.2.2 Oct 27 (cards interactive in the transcript, Apple Pay); 1.2.3 Oct 28 (redirecting cards stay inside Messages); 1.2.4 ~Nov 12 (agent updates, Photos save, native device-confirmation) | [V] App Store page |
| Install friction | Free, no account, "Data Not Collected"; installed once from the App Store | [V] App Store; imessage-apps.md |
| Where it sends | Dedicated Keiki iMessage line, 1:1 chat only; not group, other channels, imported/shared/pool lines | [V] keiki-vault.md |
| Required add-on | Dynamic UI (features.dynamicUi), off for new agents | [V] imessage-apps.md |
| Bubble text | caption 1–60 chars (default "Open app"), subcaption 1–80 (default "Tap to open") | [V] keiki-vault.md |
| URL | https, absolute, ≤2,048 chars, no user:pass@ | [V] keiki-vault.md |
| Compact vs expanded | App Store: "compact or full screen"; Apple's Messages framework has compact (about keyboard height) and expanded styles | [V] App Store page; ustwo.com/blog/experimenting-with-imessage-apps-watch-this/; onkeiki blog imessage-apps-vs-imessage-bots |

### Expanded vs live

- **Expanded (default, live:false).** Tapping the bubble opens the card and loads the URL in a web view [V keiki-vault.md]. Exact web view dimensions are not published. Apple's presentation styles suggest a compact sheet at roughly keyboard height that the user can drag to full screen [V ustwo], and Vault's own approval card is described as "a compact native card above the keyboard" [V keiki-vault.md]. Plan for the page being created compact and then resized to full screen mid-session [I].
- **Live (live:true).** The page renders inside the transcript bubble. Taps reach the page, but a tap does not open the expanded card. The bubble does not scroll, because vertical swipes scroll the conversation [V keiki-vault.md]. On the Apple side this is MSMessageLiveLayout, one MSMessagesAppViewController instance per message, presentation style .transcript, and several live messages coexist in a transcript [V WWDC17 s234 via nonstrict.eu/wwdcindex/wwdc2017/234/; photon.codes/blog/you-can-now-send-live-mini-app-cards-in-imessage]. Apple's API lets the extension choose the bubble size through contentSizeThatFits [V WWDC17 s234]. **Keiki does not document what size it returns, or whether the page can request one** [V by absence across the docs I read]. **Test on a real device and treat width as unknown.** Design a live card as a fixed aspect-ratio box that scales to whatever width it gets (width: 100vw, height from aspect-ratio or container units) and do not assume a height [I].
- **Consequences of one WebView per live bubble [I].** A scrollback with 10 old live cards means up to 10 pages in memory if Messages keeps their view controllers alive. Keep live pages tiny, and make off-screen or finished cards go idle: stop timers, close the poll or stream on visibilitychange.
- **Mac/iPad.** The listing says "Not verified for macOS" [V]. Assume group members on Mac or without Vault see something broken, and always include the plain-link fallback (section 4).

### Navigation rules (unchanged from docs, applied to games)

- https links on the same origin (scheme, host, port) load in the card; other origins leave Messages; iframes and subresources on any https origin are allowed; tel:, mailto:, sms: open the system app; http:, javascript:, and custom schemes are blocked [V keiki-vault.md].
- Serve the game at one origin (e.g. play.nickel.app) and put the API on a same-origin path or a CORS-enabled subdomain (subresource fetches are allowed) [V + I on CORS].
- Do not link out to Apple Pay, sign-in, or share sheets. A cross-origin link leaves the card.
- WebSockets are not mentioned in the docs [V by absence]. They are not "navigation", so they very likely work [I], but assume they can drop whenever the card is backgrounded and always have an HTTPS polling or SSE fallback.
- The #kv fragment is dropped on any full-page navigation. Use client-side routing (Expo Router / history.pushState) inside the game so reload-equivalent navigations don't lose it, and exchange the token on the first load only [I].

### Identity: token exchange

- Page reads kv from location.hash, POSTs it to our backend; backend calls POST /api/v1/developer/vault/principal with the API key (needs people:read), gets agent_id, card_id, phone, expires_at (24h after send), and the identity-webhook principal [V imessage-apps.md].
- Wrong org/agent, approval or pay tokens, expired sends all return 404 [V]. Show a friendly "this card expired, ask Nickel for a new one" page with HTTP 200.
- "The token says which card was opened, not who is holding the phone … Start your own session on the first successful lookup rather than relying on the token afterwards" [V imessage-apps.md]. Implement: first exchange creates a signed session cookie/JWT scoped to (roundId, playerId, phone), HttpOnly, 12h; later loads use the session. Re-exchange stays allowed (same token resolves to the same phone), so we can't distinguish a forwarder from the owner. Mitigation is social: put the player's display name and avatar in the card header [I].
- Per-send token means one card per player per round: a six-player round is six presentation intents. Use id = round-<roundId>-<playerId>.

### Telemetry

Vault posts events to Keiki: POST /api/v1/vault/events with card.opened, card.dwell_ms, card.load_failed, card.nav_bounced (plus approval.* kinds for approvals). They are keyed only by the per-send token and carry no page content, URLs, or recipient identity [V keiki-vault.md "Telemetry"; imessage-apps.md "Telemetry"]. The docs don't say how a developer reads them; they're presumably in the Keiki dashboard [I]. Our own page should report load, first-interaction, and error events to our backend, keyed by roundId and playerId. Keiki's telemetry is only useful to answer "was the card opened at all", for example as a trigger for "Alex hasn't opened it" nudges, if exposed [I].

### Delivery states and retry rules

| Where | States | What Nickel does |
|---|---|---|
| send_widget / presentation | accepted → success with message_id; unavailable (addon_disabled, invalid_presentation, unsupported_channel, unsupported_presentation, line_not_eligible, url_host_not_allowed, delivery_failed) → no card sent; failed (before acceptance); unknown (may have been delivered) | accepted: wait. unavailable: send the signed plain link as text. failed: safe to retry once with the same id (dedup by tool+id+url). **unknown: never auto-retry; send a text "if you don't see the card, tap here: <link>"** |
| Idempotency | same tool + id + url in one conversation = one send, retry returns the first delivery; harness send_widget idempotencyKey is required, ≤128 chars | [V] imessage-apps.md; external-harness.md |
| Harness context | turn actions are 409 on closed turns; held-back and steered turns cannot send; notice turns can send_widget; "Keiki never substitutes text: on unavailable, your harness can send its own plain link" | [V] external-harness.md |
| Receipts | sent, delivered, read, failed; a message with no delivery to any iMessage device in ~10 minutes shows Not delivered | [V] cloud-agents.md |
| accepted | means provider accepted, not that the recipient opened it | [V] imessage-apps.md |
| Cards are also not sent in "held-back, steered or detached turns" | A scheduled timer starting a round must run as a real turn or notice turn | [V] imessage-apps.md; [I] on how our scheduler maps to these |
| Presentation-intent expiry | unanswered choice/confirm intents expire after 24h; the same 24h as the kv token | [V] imessage-apps.md |

### Without Vault installed

For Keiki's own Vault the docs describe the first-time install from the App Store [V imessage-apps.md "What the recipient sees"]. For customer-owned extensions, "Recipients without the extension see Apple's App Store prompt" [V imessage-apps.md]. Apple's live-layout design provides an alternateLayout template bubble for devices that lack the extension or can't run iMessage apps (SMS, older OS) [V WWDC17 s234]. Assume Vault gets the same behavior: an App Store prompt or template bubble that says "Open app" or whatever caption we set [I]. Android/SMS users get nothing from a card: the line falls back to SMS/RCS for them [V imessage-best-practices.md "Mix Android and SMS users in"].

**Design for the install gap.** (a) Caption the card like a message that makes sense even if it can't open: caption "Wordle Blitz · 1:30 left", subcaption "Tap to play" [I]. (b) Nickel's accompanying text message always includes the plain signed link. (c) First-run: Nickel tells new players once "needs the free Keiki Vault app (2 MB)" with the App Store link.

### Native notifications and Live Activities via Vault

- Available only after the recipient does a one-time **Enable agent updates** consent in Vault, which is Face ID plus a named-agent consent; the Face ID approval key must already exist from a previous approval card on that iPhone [V keiki-vault.md]. That means notifications need at least one Face ID approval. Offer it as an opt-in after the third game, never before the first [I].
- Tools: vault_connect, notify, activity_start/update/end, activity_status, notification_status. Title ≤120, body ≤500 chars, optional progress 0–1, activity expiry capped at 8 hours; revision must increment by one; identical replay is idempotent; terminal phases completed/failed/cancelled [V keiki-vault.md].
- Results: queued, not_enrolled, permission_denied, suppressed, unsupported; transport provider_accepted/expired/failed/unknown; "APNs acceptance is not proof of visibility" [V].
- Live Activities need iOS 17.2+ for remote start [V]. A "your turn" push suits Salvo, Connect 4, and tic-tac-toe, where a notification can arrive within seconds to minutes. **It is the wrong tool for sub-30-second rounds**: APNs delivery latency isn't guaranteed [I], so a 25s Krillion round should be driven by the iMessage text and card, not a push.
- Don't put game secrets (Salvo coordinates, sealed bids) in Lock Screen text [V guidance: "Avoid sensitive Lock Screen text"].

### Line capacity vs card fan-out

5,000 messages/line/day guideline, 7,000 hard cap, <50 new conversations/day, 200–400 users per line for intensive use, "a line that sends a hundred or more messages within a few minutes looks automated" [V imessage-best-practices.md]. Cards count as messages. A 6-player group with 4 games a night is roughly 24 cards plus texts, so ~50 messages per group per night. At 200 intensive users per line that's about 10,000/day, over the hard cap [I arithmetic]. Plan lines at roughly 60–100 active players per line, or cut fan-out: one card per player per session (the card page loads the next round itself) instead of one card per round [I]. That last idea is the big one: **send one long-lived card per player per game session and have the page advance rounds**, within the 24h token life.

---

## 2. Building for the WKWebView: layout and input

### Viewport and safe area

- Use <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"> and env(safe-area-inset-*) paddings; viewport-fit=cover removes the automatic inset [V webkit.org/blog/7929/designing-websites-for-iphone-x/]. Whether Vault's WebView draws under the home indicator is not documented, so pad with max(env(safe-area-inset-bottom), 0px) and test both [I].
- Vault fills "the whole card with the page's own colour" [V App Store 1.2]. Set the background color on html in inline critical CSS and in <meta name="theme-color"> so there is no white flash; also set color-scheme for dark mode [I].
- Don't trust 100vh/100dvh alone. The card is resized between compact and expanded while open [I]. Use a root that's position: fixed; inset: 0, size children with flex/% and container queries, and listen to visualViewport resize for CSS custom properties as a fallback [I]. 100dvh is fine as the primary unit where there's no dynamic toolbar, but I could not find a source confirming its value inside Vault [I].
- Fit-to-bubble for live cards: no scrolling at all; overflow: hidden on html/body; one aspect-ratio-locked stage.

### Zoom, bounce, selection, touch

- maximum-scale=1 / user-scalable=no is no longer honored by modern Safari; use touch-action instead [V paulau.dev/blog/disable-pinch-zoom-on-ios-safari/, Jan 2026; webkit.org/blog/7367/new-interaction-behaviors-in-ios-10/]. Apply * { touch-action: manipulation } (kills double-tap zoom), and touch-action: none on any canvas/drag surface [V MDN touch-action; paulau].
- Inputs below 16px font trigger zoom-on-focus [V css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/]. Set every <input> to ≥16px.
- Rubber-band: overscroll-behavior is supported from iOS 16 [V stackoverflow.com/questions/7768269]; Vault needs iOS 17, so use overscroll-behavior: none plus a non-scrolling fixed root [I].
- Text-selection magnifier and callouts: -webkit-user-select: none; -webkit-touch-callout: none; and preventDefault on touchstart for game surfaces; user-select alone doesn't suppress the iOS 15+ loupe in some cases [V stackoverflow.com/questions/69491371; WebKit commit for bug 231161].
- Tap targets ≥ 44×44 pt per Apple's HIG guidance [general, not re-fetched this session].
- A tap-pressed state must paint on touchstart/pointerdown, not click (iOS adds no 300ms delay with a proper viewport, but feedback should be instant) [I].

### Keyboard (Wordle Blitz, Krillion, Closest Estimate, Lowest Unique Number)

On iOS the keyboard shrinks and offsets the visual viewport rather than resizing layout, so position: fixed and sticky elements appear to drift [V kairi.cc/en/blog/ios-input-scroll]. WebKit fixed one iOS 17 case (keyboard overlapping fixed elements) [V github.com/WebKit/WebKit/pull/15517], and there are fresh 2026 regressions: iOS 26.4.1 pans the visual viewport despite overflow: hidden [V bugs.webkit.org/show_bug.cgi?id=311821] and visualViewport reporting issues on iOS 26 [V developer.apple.com/forums/thread/800125]. interactive-widget just landed in WebKit trunk, not in Safari [V bram.us/2026/09/11/…]. So:

- **Wordle Blitz: no native keyboard.** Build the QWERTY as in-page buttons, which also gives instant haptic-free feedback, keeps layout stable, and removes autocorrect or predictive text [I]. Disable the native keyboard entirely: no <input>. Map hardware keyboard events as a bonus for Mac.
- **Numeric games (Lowest Unique, 2/3 of average, Closest Estimate, Sealed Bid):** in-page number pad (0–9, ⌫, Submit) for the same reasons [I].
- **Krillion (free text):** native input is unavoidable unless you offer typeahead choice chips. Rules: expanded mode only; input pinned in the upper half; font ≥16px; autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" inputmode="text"; focus with focus({preventScroll:true}) after a user tap (iOS ≥15.5) [V kairi.cc]; recompute layout from visualViewport.height and visualViewport.offsetTop on resize and scroll; blur on submit [I].
- Don't autofocus on load; iOS only shows the keyboard for focus inside a user gesture anyway [V kairi.cc].

### Haptics

- navigator.vibrate: never shipped in Safari on iPhone; calling it throws unless feature-detected [V wingo-ui.com/blog/web-vibration-api-haptic-feedback; docs.swmansion.com/pulsar/sdk/web/].
- The only iOS web haptic is the system tick from a real-finger toggle of <input type=checkbox switch> (Safari 17.4+, haptics from iOS 18) [V webkit.org/blog/15054/an-html-switch-control/; Medium posaune0423 writeup]. A third-party playground reports **iOS 26.5 removed script-triggered haptics, so a genuine tap on an overlaid real switch is required** and Low Power Mode can suppress it [V single source: sergey-grishchev.github.io/haptics-playground/; treat as unconfirmed]. I could not confirm that this works inside Vault's WKWebView [I].
- Recommendation: build a tiny feedback helper (visual pulse + short sound + optional invisible switch trick for primary buttons) that silently no-ops when unavailable. Don't promise haptics in the product. Use Nickel's native tapbacks and effects in the thread as the "native feel" [V cloud-agents.md: tapbacks and effects work on iMessage lines].

### Audio

- Playback must start inside a user gesture; Web Audio output is muted by the hardware silent switch on iOS unless set to the playback channel [V bugs.webkit.org/show_bug.cgi?id=237322; MDN Web Audio best practices].
- Fix: set navigator.audioSession.type = 'playback' (iOS 17+) synchronously in the first tap handler, then resume() the AudioContext [V goodturn.ai post, secondary source; WebKit bug above]. Vault's minimum OS is 17.0, so the fallback silent-buffer trick isn't needed [V App Store; I].
- WKWebView's autoplay behavior is controlled by native config (mediaTypesRequiringUserActionForPlayback) that Vault's authors set; unknown [V developer.apple.com/documentation/webkit/wkwebviewconfiguration/mediatypesrequiringuseractionforplayback; I on Vault's setting]. Assume every sound needs a prior tap.
- Sound in a group-chat game gets played on a bus or at dinner. Default sound off with a visible toggle, remembered in storage; the first "Start" tap doubles as the audio unlock.

---

## 3. Performance, memory, resilience

### Memory

- Apple warns that extension memory limits are "significantly lower" than apps and that the system "may aggressively terminate extensions" [V App Extension Programming Guide quoted at stackoverflow.com/questions/37361261]. There's no published number for Messages extensions; commonly cited figures (≈120 MB for share extensions) come from forum reports [V reddit.com/r/iOSProgramming/comments/b0kaxc], and one practitioner says terminations are driven by failing to free memory under pressure, not a fixed cap [V SO answer, same thread].
- A WKWebView's JS heap lives in a separate WebContent process, so heavy JS probably doesn't count against the extension's own budget [I; widely documented for apps, not verified for Messages extensions]. The WebContent process can still be killed, leaving a blank view; apps are expected to reload [V nevermeant.dev/handling-blank-wkwebviews/; embrace.io/blog/webview-thread-terminations/; bugs.webkit.org/show_bug.cgi?id=186468]. We don't control Vault's delegate, so **the page must be recoverable from scratch at any moment**: all state lives on the server, every load calls GET /round/:id/state, and a visibilitychange to visible re-fetches state [I].
- Budgets (my targets [I]): live card ≤ 150 KB gzip JS, no images over 100 KB, no video; expanded card ≤ 350 KB gzip JS; physics games (Cup Pong, Hoops, Mini-golf) as a separate lazily loaded chunk only on those routes, one canvas, DPR capped at 2, requestAnimationFrame paused when hidden.

### Bundle and cold start

- react-native-web alone is 245 kB min / 74.6 kB gzip on Bundlephobia [V bundlephobia.com/package/react-native-web, v0.21.4], before React DOM, router, animation or your game code. Expo notes web has no bytecode precompilation, so bundle size matters directly [V docs.expo.dev/guides/analyzing-bundles]; the 2 MB figure in a Medium post is for native bundles [V medium.com/react-native-rocket/…, not web].
- Mitigations [I]: use Expo Router static rendering/export so the HTML paints before JS [V docs.expo.dev/router/web/static-rendering/]; per-route code splitting; avoid importing the whole RN namespace; analyze with Expo Atlas [V docs.expo.dev/guides/analyzing-bundles]; set long-cache immutable asset headers; preconnect the API origin; inline critical CSS and a skeleton (round name, countdown, player avatars) in the static HTML so the first paint doesn't wait on JS.
- Hot path: the card is opened on tap with no prefetch, so first paint should happen under ~1s on LTE and interactive under ~2s [I targets]. The live-card path should have its own tiny entry (plain React DOM or even vanilla JS, no RNW) for the single-tap games, because 3–10 live bubbles may exist in a scrollback [I]. The "build once in Expo" decision is fine for expanded games; I'd carve live as a thin exception, or at least measure RNW live first.
- Service workers in WKWebView require App-Bound Domains configured by the host app [V webkit.org/blog/10882/app-bound-domains/; inappwebview.dev/docs/service-worker/], which we don't control; don't depend on a service worker or offline cache.

### Storage

- WebKit apps on iOS 17 get an origin quota of up to 15% of disk and an overall 20%; eviction is LRU per origin and "best-effort" by default [V webkit.org/blog/14403/updates-to-storage-policy/]. ITP's 7-day cap doesn't apply to WKWebView storage per developer reports [V github.com/ionic-team/ionic-storage/issues/184]. Whether Vault's WKWebView uses a persistent data store is unknown [I]. Treat localStorage/cookies as a convenience cache only; the server session is authoritative.

### Network failure handling

- Wrap every request in a typed client: timeout 6s, 2 retries with exponential backoff and jitter (300ms/900ms), only for idempotent or keyed calls [I].
- Persist an "outbox" of unsent moves in memory and sessionStorage, show the move as pending, and reconcile from authoritative state once online [I].
- navigator.sendBeacon is unreliable on iOS, especially in pagehide, and iOS may not fire all unload-type events [V bugs.webkit.org/show_bug.cgi?id=188329; ctrl.blog/entry/safari-beacon-issues/; nicj.net/beaconing-in-practice…]. Use fetch with keepalive:true on visibilitychange→hidden for analytics, and never rely on exit events for game state.
- WebSockets die when the app suspends; always reconnect on visibilitychange and pageshow, then resync full state [V bugs.webkit.org/show_bug.cgi?id=247943 and forum reports; I on reconnect strategy]. Fallback to 1.5–2s long-poll (SSE where proxies allow) for state; poll fast only during the live round [I].
- Offline state: a visible banner with automatic retry; the timer keeps running (server decides), and a submit that arrives after the deadline is rejected with a clear message.

### Idempotent submits

Every mutating call carries a client-generated Idempotency-Key (UUID v4, one per intended move, reused across retries) and a clientSeq. Server dedupes on (roundId, playerId, key) and also enforces one-answer-per-round (or move number for turn games) with a unique constraint. A duplicate returns the original result with 200 instead of an error [I; same pattern as Keiki's own idempotency: duplicate keys return the same acknowledgement, per external-harness.md and cloud-agents.md "Idempotency-Key … returns 200"]. The UI disables the button immediately and shows "Sent ✓" only on server ack.

### Clock and anti-cheat

- All timing authority is on the server; the client clock is only for animation [V pattern: docs.unity.com/en-us/cloud-code/3.0.0/scripts/use-cases/server-time-anti-cheat; accelbyte.io/blog/server-authoritative-vs-client-authoritative-architecture]. Keiki follows the same principle, rejecting Face ID signatures more than 5 minutes off its own clock [V keiki-vault.md].
- Sync: on load, ping 5 times, keep the lowest-RTT sample, compute offset = serverTime − (t0 + t1)/2, and draw countdowns as serverDeadline − (Date.now() + offset). Re-sync every 30s and on visibilitychange [I].
- Deadline rules [I]: the round has a server-set closesAt. A submit is valid if serverReceiveTime ≤ closesAt + grace, where grace = min(RTT/2, 250ms) measured from that player's recent pings; reject everything else with 409 round_closed. Never accept a client timestamp for ranking; ranking uses server receive time.
- Reaction games (Stop the Clock, Penalty Kick): the client sends "tap at displayed value X"; the server derives the true value at receive time minus the RTT/2 compensation (capped at ~150ms) and scores that. Server-issues the target and seed, so an injected value is meaningless [I].
- Hidden-information games: the answer is never in the page. Wordle Blitz validates guesses on the server (the dictionary for the "not a word" check can be public); Salvo ship layouts are committed server-side on placement and only shot results go to the opponent; Sealed Bid and Lowest Unique reveal nothing until closesAt [I].
- Rate limits: one open session per (roundId, playerId); limit submits to 5/s; log suspicious sub-human reaction times (<120ms) but don't hard-block [I].
- The forwarded-card caveat in section 1 applies: whoever opens the bubble can play as that player until the round closes; accept this for friend groups and show the player name big on the card.

---

## 4. The plain-link fallback (needed for Android, no-Vault, unknown deliveries, line problems)

Keiki says a failed send is on us to recover: "Keiki never substitutes text … your harness can send its own plain link" [V external-harness.md]; "Keep the page URL available in the result and show it as a normal link if delivery is unavailable, fails or is unknown" [V imessage-apps.md]. Because Vault strips kv for Safari and Safari has nothing to exchange [V imessage-apps.md], the fallback URL should carry our own HMAC-signed, per-player token (or require a short code), e.g. /play/<game>/<roundId>?p=<playerId>&t=<hmac>, with:

- GET that returns 200 and never consumes the token, because iMessage may fetch link previews [I];
- the same HTML app, which runs in Safari with the same server-authoritative rules;
- the in-chat cost of showing the link (a rich preview from OG tags, small image) tuned so the fallback looks intentional.

---

## 5. Recommended build checklist

1. Static HTML shell with critical CSS: background, safe-area, skeleton; JS entry per route; target above budgets.
2. Root layout: position: fixed; inset: 0; overflow: hidden; touch-action: manipulation; safe-area padding; listens to visualViewport/resize.
3. On load: read kv, POST to /session/from-card, store session, clear the fragment with history.replaceState, fetch round state. All errors render in-page with HTTP 200.
4. Custom in-page keyboards or number pads for all games except Krillion; Krillion text input only in expanded mode with the 16px/autocorrect-off rules.
5. Feedback helper: visual + optional audio (audioSession playback set on first tap) + best-effort switch haptic; all no-op safe.
6. API client with timeout, backoff, idempotency keys, outbox, visibility-driven resync, SSE/long-poll fallback.
7. Server: authoritative clock, grace window, unique (round, player, key), 409 round_closed, hidden-info never sent.
8. Messaging layer: card id = round-<roundId>-<playerId>; on accepted do nothing; on unavailable or failed send signed link; on unknown send "didn't see the card?" link and never resend the card; spread sends to avoid bursts; ask users to text first via sms: link.
9. Test matrix: iOS 17.0 and latest, Vault 1.2.1 (expect dead live cards), 1.2.4, compact vs expanded vs live, low power mode, silent switch, airplane mode mid-round, app switch mid-round, and a killed WebContent process.

## 6. Open questions to verify on a device (not answerable from docs)

- Exact pixel size and aspect of expanded-compact and live bubbles, and whether the page can influence them.
- Whether Vault's WKWebView keeps cookies/localStorage between opens, and whether wss: connections work.
- Whether safe-area insets are nonzero in Vault's web view and what 100dvh equals there.
- What a user on an old Vault sees on a live card (dead bubble vs fallback), and how an iPad/Mac Messages user sees any card.
- How Keiki exposes /api/v1/vault/events data to developers.
- Whether one dedicated line can carry both cards and group chats.

