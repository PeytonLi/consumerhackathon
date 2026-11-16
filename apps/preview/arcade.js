(() => {
  "use strict";

  const R = window.ROUND ?? {};
  const params = new URLSearchParams(location.search);
  const practice = params.get("practice") === "1";
  const theme = params.get("theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  const $ = (id) => document.getElementById(id);
  const stage = $("stage");
  const dock = $("dock");
  const clock = $("clock");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
  const icons = {
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
    bolt: '<path d="M14 2L4 14h7l-1 8 10-12h-7z"/>',
    check: '<path d="M5 12l4.5 4.5L19 7"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>',
    share: '<path d="M12 15V3M8 7l4-4 4 4M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/>',
    again: '<path d="M4.5 11a7.5 7.5 0 1 1 1 5M4.5 4.5V11H11"/>',
    up: '<path d="M12 20V4M5 11l7-7 7 7"/>',
    down: '<path d="M12 4v16M5 13l7 7 7-7"/>',
  };
  const icon = (name) => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + icons[name] + "</svg>";
  const games = {
    reaction: { title: "Quick Draw", seconds: 15, hue: "var(--you)", kicker: "Three chances", instruction: "Wait for blue. Then tap.", caption: "An early tap counts as a miss" },
    freethrow: { title: "Free Throw", seconds: 20, hue: "var(--them)", kicker: "Five shots", instruction: "Stop it in the middle.", caption: "Tap Shoot when the marker reaches the target" },
    memory: { title: "Memory", seconds: 25, hue: "light-dark(#5856d6, #5e5ce6)", kicker: "Watch. Remember. Repeat.", instruction: "The pattern grows by one.", caption: "Tap the numbered pads in order. One miss ends it." },
    math: { title: "Math Sprint", seconds: 20, hue: "var(--you)", kicker: "Twenty seconds", instruction: "Find the answer. Keep moving.", caption: "Three choices. Up to 20 questions." },
    higherlower: { title: "Higher or Lower", seconds: 20, hue: "light-dark(#5856d6, #5e5ce6)", kicker: "Trust your next move", instruction: "Will the next card be higher?", caption: "Cards 2–13. No ties. One miss ends it." },
  };
  const game = games[R.game];
  const challenge = R.arcade ?? {};
  const seconds = game?.seconds ?? 20;
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} },
    remove(key) { try { localStorage.removeItem(key); } catch {} },
  };
  const fallbackHaptic = (() => {
    const label = document.createElement("label");
    label.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;overflow:hidden";
    label.setAttribute("aria-hidden", "true");
    label.innerHTML = '<input type="checkbox" switch tabindex="-1">';
    document.body.append(label);
    return (times = 1) => {
      label.click();
      for (let i = 1; i < times; i++) setTimeout(() => label.click(), i * 80);
    };
  })();
  const haptic = (times = 1) => {
    if (navigator.vibrate) {
      try { if (navigator.vibrate(times > 1 ? [10, 50, 10] : 10)) return; } catch {}
    }
    fallbackHaptic(times);
  };

  const normalizeName = (raw) => {
    const clean = String(raw || "").replace(/[^A-Za-z]/g, "").slice(0, 14);
    return clean ? clean[0].toUpperCase() + clean.slice(1).toLowerCase() : "";
  };
  let name = normalizeName(window.ME?.name || storage.get("nickel.arcade.name"));
  let attempt = null;
  let events = [];
  let mode = "loading";
  let frame = 0;
  let tickGame = null;
  let savedResult = null;
  let savedBoard = [];
  let finishPayload = null;
  let saving = false;
  let celebrated = false;
  let rejectedFinish = false;
  let serverOffset = 0;
  let lastClock = "";
  let boardBefore = null;
  let finishReason = "";
  const stateKey = () => "nickel.arcade." + R.id + "." + name;
  const timeNow = () => Date.now() + (practice ? 0 : serverOffset);
  const elapsed = () => Math.max(0, Math.round(timeNow() - attempt.startedAt));
  const capEvents = { reaction: 3, freethrow: 5, memory: 100, math: 20, higherlower: 20 };

  function show(html, controls = "") {
    stage.classList.remove("result-stage");
    stage.innerHTML = html;
    dock.innerHTML = controls;
  }

  function toast(text) {
    $("toast").textContent = text;
    $("toast").classList.add("on");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => $("toast").classList.remove("on"), 1300);
  }

  function bind(id, action) {
    const button = $(id);
    if (!button) return;
    button.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !e.isPrimary || button.disabled) return;
      e.preventDefault();
      button.classList.add("pressed");
      setTimeout(() => button.classList.remove("pressed"), 120);
      haptic();
      action(e);
    });
    button.addEventListener("click", (e) => {
      if (e.detail !== 0 || button.disabled) return;
      haptic();
      action(e);
    });
  }

  function setClock(left = seconds) {
    const value = Math.max(0, Math.ceil(left));
    const text = "0:" + String(value).padStart(2, "0");
    if (lastClock === text) return;
    lastClock = text;
    clock.innerHTML = icon("clock") + text;
    clock.setAttribute("aria-label", value + " seconds remaining");
    clock.classList.toggle("warn", value <= 5);
  }

  function stopFrame() {
    cancelAnimationFrame(frame);
    frame = 0;
    tickGame = null;
  }

  function runFrame(tick) {
    stopFrame();
    tickGame = tick;
    const loop = () => {
      if (mode !== "playing" && mode !== "abandoned") return;
      const remaining = attempt.deadline - timeNow();
      setClock(remaining / 1000);
      if (remaining <= 0) return finish(mode === "abandoned");
      tickGame?.(elapsed());
      if (mode === "playing" || mode === "abandoned") frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
  }

  function remember(extra = {}) {
    if (practice || !attempt || (mode === "result" && !finishPayload)) return;
    storage.set(stateKey(), JSON.stringify({ game: R.game, startedAt: attempt.startedAt, events, finishPayload, ...extra }));
  }

  function cachedState() {
    try {
      const saved = JSON.parse(storage.get(stateKey()) || "null");
      if (!saved || saved.game !== R.game || !Array.isArray(saved.events) || saved.events.length > capEvents[R.game]) return null;
      if (!saved.events.every((event) => Number.isInteger(event.at) && event.at >= 0 && Number.isFinite(event.value))) return null;
      return saved;
    } catch { return null; }
  }

  async function api(action, extra = {}) {
    if (practice) throw new Error("Practice never submits an official result");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const sentAt = Date.now();
    try {
      const response = await fetch("/api/rounds/" + encodeURIComponent(R.id) + "/result", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, arcade: { action, ...extra } }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        const error = new Error(data.error || "Couldn’t reach Nickel");
        error.serverRejected = data.ok === false;
        throw error;
      }
      if (action !== "finish" && Number.isFinite(data.serverNow)) serverOffset = data.serverNow - (sentAt + Date.now()) / 2;
      return data;
    } finally { clearTimeout(timeout); }
  }

  function paintIdentity() {
    $("me").innerHTML = '<a class="avatar" href="/h' + (theme ? '?theme=' + encodeURIComponent(theme) : '') + '" aria-label="Back to games">' + esc(Array.from(name)[0]?.toUpperCase() || "N") + (window.ME?.name ? '<span class="seal">' + icon("check") + "</span>" : "") + "</a>";
    $("me").setAttribute("aria-label", name || "Guest");
  }

  function pickName() {
    mode = "identity";
    show('<div class="game-copy"><p class="eyebrow">Your turn</p><h1 class="t-title">Who’s playing?</h1></div>' +
      '<div class="identity-form"><label for="player-name">Your name</label><input id="player-name" type="text" maxlength="32" autocomplete="given-name" enterkeyhint="go" placeholder="Choose a name"></div>' +
      '<div class="name-options">' + (R.members ?? []).slice(0, 8).map((member, i) => '<button class="name-option play-control" id="name-' + i + '" type="button">' + esc(member) + "</button>").join("") + "</div>",
      '<button class="glass primary play-control" id="confirm-name" type="button" disabled>That’s me</button><p class="t-caption">Saved on this device for your next game</p>');
    const input = $("player-name");
    const submit = () => {
      const chosen = normalizeName(input.value);
      if (!chosen) return;
      name = chosen;
      storage.set("nickel.arcade.name", name);
      paintIdentity();
      loadStatus();
    };
    input.addEventListener("input", () => { $("confirm-name").disabled = !normalizeName(input.value); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    (R.members ?? []).slice(0, 8).forEach((member, i) => bind("name-" + i, () => {
      input.value = member;
      $("confirm-name").disabled = false;
      stage.querySelectorAll(".name-option").forEach((button, index) => button.classList.toggle("on", index === i));
    }));
    bind("confirm-name", submit);
  }

  function errorScreen(title, text, retry) {
    mode = "error";
    stopFrame();
    show('<div class="pending-ring">' + icon("again") + '</div><div class="game-copy"><h1 class="t-title">' + esc(title) + '</h1><p class="t-label">' + esc(text) + "</p></div>",
      '<button class="glass primary play-control" id="retry" type="button">Try again</button><button class="secondary play-control" id="practice" type="button">Practice instead</button>');
    bind("retry", retry);
    bind("practice", openPractice);
  }

  async function loadStatus() {
    if (practice) return intro();
    mode = "loading";
    show('<div class="pending-ring">' + icon("clock") + '</div><p class="t-label" role="status">Checking your round…</p>');
    boardBefore ??= window.Juice?.board();
    try {
      const status = await api("status");
      savedBoard = status.board ?? [];
      if (status.result) return showOfficial(status);
      if (status.attempt) {
        attempt = normalizeAttempt(status.attempt);
        const saved = cachedState();
        if (saved?.startedAt === attempt.startedAt) {
          events = saved.events;
          finishPayload = saved.finishPayload ?? null;
          if (finishPayload || timeNow() >= attempt.deadline) return finish(!!finishPayload?.abandoned);
          toast("Round resumed");
          return play();
        }
        return abandon();
      }
      intro();
    } catch (error) {
      errorScreen("Couldn’t load your round", "Your attempt hasn’t been changed. Check your connection and try again.", loadStatus);
    }
  }

  function normalizeAttempt(value) {
    const startedAt = Number(value.startedAt);
    const deadline = Number(value.deadline);
    if (!Number.isFinite(startedAt) || !Number.isFinite(deadline) || deadline <= startedAt) throw new Error("Invalid attempt time");
    return { startedAt, deadline };
  }

  function pips(count, active = 0, outcomes = []) {
    return '<div class="dots">' + Array.from({ length: count }, (_, i) => '<i class="' + (i < active ? outcomes[i] === false ? "miss" : "on" : i === active ? "current" : "") + '"></i>').join("") + "</div>";
  }

  function court() {
    return '<div class="shot-board"><svg class="court" viewBox="0 0 340 270" aria-label="Basketball and hoop" role="img">' +
      '<path class="court-line" d="M15 251h310M89 251a81 22 0 0 1 162 0"/><path class="arc-guide" d="M170 228Q71 30 213 86"/>' +
      '<rect class="backboard" x="206" y="22" width="72" height="53" rx="7"/><path class="court-line" d="M225 75V48h34v27M277 49h35v174"/>' +
      '<path class="net" d="M197 88l8 31h30l8-31M201 101h38M205 112h31M206 89l9 30M219 89l7 30M233 89l-9 30M215 89l-7 30"/><path class="hoop" d="M192 86h56"/>' +
      '<ellipse class="ball-shadow" id="ball-shadow" cx="170" cy="248" rx="25" ry="5"/>' +
      '<g id="ball" transform="translate(170 222)"><circle class="ball" r="19"/><path class="seam" d="M-19 0h38M0-19v38M-13-14c16 6 16 22 0 28M13-14C-3-8-3 8 13 14"/></g></svg>' +
      '<div><div class="shot-meter"><span class="sweet-spot"></span><span class="meter-center"></span><div class="meter-lane"><span class="meter-position" id="meter-position" style="transform:translateX(' + (challenge.qualityVersion ? 0 : 50) + '%)"><span class="meter-pin"></span></span></div></div>' +
      '<div class="meter-labels"><span>Too far</span><span>Perfect</span><span>Too far</span></div></div></div>';
  }

  function card(value, reveal = false) {
    return '<div class="playing-card under" aria-hidden="true">?</div><div class="playing-card' + (reveal ? " reveal" : "") + '"><span class="corner">' + esc(value) + '</span>' + esc(value) + '<span class="corner bottom" aria-hidden="true">' + esc(value) + "</span></div>";
  }

  function intro() {
    stopFrame();
    mode = "ready";
    setClock(seconds);
    if (practice) {
      challenge.sequence = Array.from({ length: 20 }, () => Math.floor(Math.random() * 4));
      challenge.reactionWaits = Array.from({ length: 3 }, () => 2800 + Math.floor(Math.random() * 1000));
      if (challenge.questions) {
        for (let i = challenge.questions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [challenge.questions[i], challenge.questions[j]] = [challenge.questions[j], challenge.questions[i]];
        }
      }
      challenge.deck = [2 + Math.floor(Math.random() * 12)];
      for (let i = 0; i < 20; i++) {
        let next = 2 + Math.floor(Math.random() * 11);
        if (next >= challenge.deck[i]) next++;
        challenge.deck.push(next);
      }
    }
    let board = "";
    if (R.game === "reaction") board = '<div class="signal"><svg class="signal-symbol i" viewBox="0 0 24 24" aria-hidden="true">' + icons.bolt + "</svg></div>" + pips(3);
    if (R.game === "freethrow") board = court() + pips(5);
    if (R.game === "memory") board = '<div class="pad-board" aria-hidden="true">' + [1, 2, 3, 4].map((n) => '<div class="pad' + (n === 1 ? " lit" : "") + '" style="display:grid;place-items:center">' + n + "</div>").join("") + "</div>";
    if (R.game === "math") board = '<div class="math-board"><p class="math-equation">7 + 8</p><div class="math-rule"></div><div class="answer-slots" aria-hidden="true"><span></span><span></span></div></div>';
    if (R.game === "higherlower") board = '<div class="card-table">' + card(challenge.deck?.[0] ?? 7) + '</div><div class="card-range">2 low · 13 high · no ties</div>';
    show('<div class="game-copy"><p class="eyebrow">' + (practice ? "Practice · " : "") + game.kicker + '</p><h1 class="t-title">' + esc(game.instruction) + '</h1></div>' + board,
      '<button class="glass primary play-control" id="start" type="button">Start' + (practice ? " practice" : "") + '</button><p class="t-caption">' + esc(game.caption) + (practice ? "<br>Practice never changes your league points." : "<br>One official run. Leaving ends it.") + "</p>");
    bind("start", start);
  }

  function validChallenge() {
    if (R.game === "reaction") return Array.isArray(challenge.reactionWaits) && challenge.reactionWaits.length >= 3;
    if (R.game === "freethrow") return Array.isArray(challenge.speeds) && challenge.speeds.length >= 5;
    if (R.game === "memory") return Array.isArray(challenge.sequence) && challenge.sequence.length >= 20;
    if (R.game === "math") return Array.isArray(challenge.questions) && challenge.questions.length >= 20;
    return Array.isArray(challenge.deck) && challenge.deck.length >= 21;
  }

  async function start() {
    if (mode !== "ready") return;
    if (!validChallenge()) return errorScreen("This round isn’t ready", "The challenge couldn’t be loaded. Try opening the link again.", loadStatus);
    mode = "starting";
    $("start").disabled = true;
    $("start").textContent = "Starting…";
    try {
      if (practice) {
        const now = Date.now();
        attempt = { startedAt: now, deadline: now + seconds * 1000 };
      } else {
        const data = await api("start");
        if (data.result) return showOfficial(data);
        attempt = normalizeAttempt(data.attempt);
        const saved = cachedState();
        if (saved?.startedAt === attempt.startedAt) {
          events = saved.events;
          finishPayload = saved.finishPayload ?? null;
          if (finishPayload) return finish(!!finishPayload.abandoned);
          return play();
        }
        if (timeNow() - attempt.startedAt > 2000) return abandon();
      }
      events = [];
      finishPayload = null;
      remember();
      play();
    } catch (error) {
      errorScreen("Couldn’t start", "Check your connection. Nickel will recover your attempt if it already started.", loadStatus);
    }
  }

  function abandon() {
    mode = "abandoned";
    events = [];
    finishPayload = { abandoned: true, events: [] };
    remember();
    if (timeNow() >= attempt.deadline) return finish(true);
    show('<div class="pending-ring">' + icon("clock") + '</div><div class="game-copy"><h1 class="t-title">Round already started</h1><p class="t-label">This device couldn’t recover your play. The original clock is still running.</p></div><p class="t-caption status-note">Your official attempt will close with zero. Practice is always open.</p>',
      '<button class="glass secondary play-control" id="practice" type="button">Practice</button>');
    bind("practice", openPractice);
    runFrame(() => {});
  }

  function addEvent(value, at = elapsed(), extra = {}) {
    if (mode !== "playing") return false;
    if (timeNow() >= attempt.deadline) { finish(); return false; }
    if (events.length && at - events.at(-1).at < 80) return false;
    events.push({ at: Math.floor(at), value, ...extra });
    remember();
    return true;
  }

  function play() {
    if (!validChallenge()) return abandon();
    mode = "playing";
    ({ reaction: reactionGame, freethrow: freethrowGame, memory: memoryGame, math: mathGame, higherlower: higherlowerGame })[R.game]();
  }

  function reactionGame() {
    show('<div class="live-meta"><p class="t-label" id="trial-label"></p><p class="t-label">Fastest thumb wins</p></div>' +
      '<button class="signal play-control" id="signal" type="button" aria-label="Reaction target"><svg class="signal-symbol i" viewBox="0 0 24 24" aria-hidden="true">' + icons.bolt + '</svg></button>' +
      '<div class="game-copy"><h1 class="t-title" id="signal-title">Wait for blue</h1><p class="t-label" id="signal-caption">Not yet. Hold your nerve.</p></div><div id="trials"></div>',
      '<button class="glass secondary play-control" id="react" type="button">Wait…</button><p class="t-caption">An early tap counts as a miss</p>');
    let view = "";
    let cueAt = null;
    const state = (at) => {
      const index = events.length;
      const trialStart = index ? events[index - 1].at + 250 : 0;
      return { index, trialStart, signalAt: trialStart + Number(challenge.reactionWaits[index] || 0), cooling: index > 0 && at < trialStart };
    };
    const paint = (at) => {
      const s = state(at);
      if (s.index >= 3 && !s.cooling) return finish();
      const phase = s.cooling ? "feedback" : at >= s.signalAt ? "go" : "wait";
      const nextView = s.index + ":" + phase;
      if (view === nextView) return;
      view = nextView;
      if (phase !== "go") cueAt = null;
      else cueAt = at;
      const signal = $("signal");
      const button = $("react");
      $("trial-label").textContent = "Trial " + Math.min(3, s.index + 1) + " of 3";
      $("trials").innerHTML = pips(3, s.index, events.map((event) => event.value > 0));
      signal.className = "signal" + (phase === "go" ? " go" : "");
      button.disabled = phase === "feedback";
      signal.disabled = phase === "feedback";
      button.className = "glass " + (phase === "go" ? "primary" : "secondary") + " play-control";
      if (phase === "feedback") {
        const value = events.at(-1).value;
        signal.classList.toggle("early", !value);
        signal.innerHTML = '<span class="signal-number">' + (value || "Miss") + (value ? "<small>milliseconds</small>" : "") + "</span>";
        $("signal-title").textContent = value ? "Got it" : "Too soon";
        $("signal-caption").textContent = value ? "Next signal coming up." : "Wait until the circle turns blue.";
        button.textContent = "Next trial…";
      } else {
        signal.innerHTML = '<svg class="signal-symbol i" viewBox="0 0 24 24" aria-hidden="true">' + icons.bolt + "</svg>";
        $("signal-title").textContent = phase === "go" ? "Tap now" : "Wait for blue";
        $("signal-caption").textContent = phase === "go" ? "Go. Go. Go." : "Not yet. Hold your nerve.";
        button.textContent = phase === "go" ? "Tap" : "Wait…";
        if (phase === "go") haptic();
      }
    };
    const react = () => {
      const at = elapsed();
      const s = state(at);
      if (s.cooling || s.index >= 3) return;
      if (cueAt === null && at >= s.signalAt) { paint(at); return; }
      if (cueAt !== null && at - cueAt < 120) return toast("Get set. Tap on blue.");
      if (!addEvent(cueAt === null ? 0 : at - cueAt, at, cueAt === null ? {} : { cueAt })) return;
      view = "";
      paint(at);
    };
    bind("react", react);
    bind("signal", react);
    paint(elapsed());
    if (mode === "playing") runFrame(paint);
  }

  function freethrowGame() {
    show('<div class="live-meta"><p class="t-label" id="shot-label"></p><p class="t-label" id="shot-score"></p></div>' + court() +
      '<div class="game-copy"><h1 class="t-title" id="shot-message">Find the middle</h1><div id="shot-pips"></div></div>',
      '<button class="glass primary play-control" id="shoot" type="button">Shoot</button><p class="t-caption">The dashed box is your target</p>');
    let previousCount = -1;
    const position = (at) => {
      const shotStarted = events.length ? events.at(-1).at + 500 : 0;
      const phase = Math.max(0, at - shotStarted) / 1000 * challenge.speeds[events.length];
      return Math.round((challenge.qualityVersion ? 1 - Math.cos(phase / 2) : Math.sin(phase) + 1) * 500);
    };
    const made = (value) => Math.abs(value - 500) <= 110;
    const paint = (at) => {
      const last = events.at(-1);
      const shooting = last && at - last.at < 500;
      const ready = at >= (last ? last.at + 500 : 0) + 100;
      if (events.length >= 5 && !shooting) return finish();
      if (previousCount !== events.length) {
        previousCount = events.length;
        $("shot-label").textContent = "Shot " + Math.min(5, events.length + 1) + " of 5";
        $("shot-score").innerHTML = "<strong>" + events.reduce((sum, event) => sum + Math.max(0, 100 - Math.round(Math.abs(event.value - 500) / 5)), 0) + "</strong> / 500";
        $("shot-pips").innerHTML = pips(5, events.length, events.map((event) => made(event.value)));
        $("shot-message").textContent = last ? made(last.value) ? Math.abs(last.value - 500) <= 35 ? "Nothing but net" : "It’s in" : "Just outside" : "Find the middle";
      }
      $("shoot").disabled = !!shooting || !ready;
      $("shoot").textContent = shooting ? "In the air…" : !ready ? "Get set…" : "Shoot";
      const pos = shooting ? last.value : position(at);
      $("meter-position").style.transform = "translateX(" + pos / 10 + "%)";
      let x = 170, y = 222, rotation = 0;
      if (shooting) {
        const t = Math.min(1, (at - last.at) / 500);
        const destination = 220 + (made(last.value) ? 0 : (last.value - 500) / 4);
        x += (destination - 170) * t;
        y += (92 - 222) * t - 110 * 4 * t * (1 - t);
        rotation = t * 260;
        $("ball-shadow").style.opacity = String(.08 * (1 - t));
      } else $("ball-shadow").style.opacity = ".08";
      $("ball").setAttribute("transform", "translate(" + x.toFixed(2) + " " + y.toFixed(2) + ") rotate(" + rotation.toFixed(1) + ")");
    };
    bind("shoot", () => {
      const at = elapsed();
      if (events.length >= 5 || at < (events.length ? events.at(-1).at + 500 : 0) + 100) return;
      if (!addEvent(position(at), at)) return;
      paint(at);
    });
    paint(elapsed());
    if (mode === "playing") runFrame(paint);
  }

  function memoryProgress(displayAt = 450) {
    let length = 3, cursor = 0, correct = 0, wrong = false;
    for (const event of events) {
      if (event.value !== challenge.sequence[cursor]) { wrong = true; break; }
      correct++;
      cursor++;
      if (cursor === length) {
        length++;
        cursor = 0;
        displayAt = event.at + 350;
      }
    }
    return { length, cursor, correct, displayAt, wrong };
  }

  function memoryGame() {
    const firstDisplayAt = elapsed() + 450;
    show('<div class="live-meta"><p class="t-label" id="memory-level"></p><p class="t-label" id="memory-best"></p></div>' +
      '<div class="game-copy"><h1 class="t-title" id="memory-message">Watch the pattern</h1><p class="t-label" id="memory-caption">Your turn comes next.</p></div>' +
      '<div class="pad-board">' + [0, 1, 2, 3].map((value) => '<button class="pad play-control" id="pad-' + value + '" type="button" aria-label="Pad ' + (value + 1) + '" disabled>' + (value + 1) + "</button>").join("") + '</div><div class="dots sequence-dots" id="memory-dots"></div>',
      '<p class="t-caption" id="memory-dock">Watch first. Then repeat the numbers.</p>');
    let view = "";
    let lit = -1;
    const paint = (at) => {
      const s = memoryProgress(firstDisplayAt);
      const last = events.at(-1);
      if (s.wrong) {
        if (at >= last.at + 350) return finish();
        $("memory-message").textContent = "Pattern broken";
        $("memory-caption").textContent = "That one went its own way.";
        [0, 1, 2, 3].forEach((value) => { $("pad-" + value).disabled = true; $("pad-" + value).classList.toggle("wrong", value === last.value); });
        return;
      }
      if (s.length > challenge.sequence.length) return finish();
      const watching = at < s.displayAt + s.length * 550;
      const step = Math.floor((at - s.displayAt) / 550);
      const nextLit = watching && at >= s.displayAt && (at - s.displayAt) % 550 < 400 ? challenge.sequence[step] : -1;
      const nextView = [s.length, s.cursor, watching, s.correct].join(":");
      if (view !== nextView) {
        view = nextView;
        $("memory-level").textContent = s.length + " numbers";
        $("memory-best").innerHTML = "<strong>" + s.correct + "</strong> steps";
        $("memory-message").textContent = watching ? "Watch the pattern" : "Your turn";
        $("memory-caption").textContent = watching ? "Your turn comes next." : "Repeat all " + s.length + " numbers in order.";
        $("memory-dock").textContent = watching ? "Hands off. Take it in." : "Tap the numbered pads in order";
        $("memory-dots").innerHTML = Array.from({ length: s.length }, (_, i) => '<i class="' + (i < s.cursor ? "on" : i === s.cursor && !watching ? "current" : "") + '"></i>').join("");
      }
      if (lit !== nextLit) {
        if (nextLit >= 0) haptic();
        lit = nextLit;
      }
      if (watching) $("memory-caption").textContent = at < s.displayAt ? "Get ready…" : "Watch " + Math.min(s.length, step + 1) + " of " + s.length;
      [0, 1, 2, 3].forEach((value) => {
        const button = $("pad-" + value);
        button.disabled = watching;
        button.classList.toggle("lit", value === nextLit);
        button.classList.toggle("hit", !watching && last?.value === value && at - last.at < 140);
      });
    };
    [0, 1, 2, 3].forEach((value) => bind("pad-" + value, () => {
      const s = memoryProgress(firstDisplayAt);
      const at = elapsed();
      if (s.wrong || at < s.displayAt + s.length * 550) return;
      if (!addEvent(value, at)) return;
      $("pad-" + value).classList.add(value === challenge.sequence[s.cursor] ? "hit" : "wrong");
      paint(at);
    }));
    paint(elapsed());
    if (mode === "playing") runFrame(paint);
  }

  function mathGame() {
    show('<div class="live-meta"><p class="t-label" id="question-number"></p><p class="t-label" id="math-score"></p></div>' +
      '<div class="math-board"><p class="eyebrow">Find the answer</p><h1 class="math-equation" id="equation"></h1><div class="math-rule"></div><p class="answer-mark" id="answer-mark" aria-live="polite"></p></div>',
      '<div class="math-answers">' + [0, 1, 2].map((index) => '<button class="answer play-control" id="answer-' + index + '" type="button"></button>').join("") + '</div><p class="t-caption">A new question on every answer</p>');
    let view = "";
    const paint = (at) => {
      const last = events.at(-1);
      const feedback = !!last && at - last.at < (last.value === challenge.questions[events.length - 1].answer ? 220 : 650);
      if (events.length >= 20 && !feedback) return finish();
      const index = Math.min(19, events.length - (feedback ? 1 : 0));
      const nextView = index + ":" + feedback;
      if (nextView === view) return;
      view = nextView;
      const question = challenge.questions[index];
      const correct = events.filter((event, i) => event.value === challenge.questions[i].answer).length;
      $("question-number").textContent = "Question " + (index + 1) + " of 20";
      $("math-score").innerHTML = "<strong>" + correct + "</strong> correct";
      $("equation").textContent = question.text;
      $("answer-mark").textContent = feedback ? last.value === question.answer ? "Correct" : "Answer: " + question.answer : " ";
      question.choices.forEach((choice, i) => {
        const button = $("answer-" + i);
        button.textContent = choice;
        button.disabled = feedback;
        button.classList.toggle("hit", feedback && choice === question.answer);
        button.classList.toggle("wrong", feedback && choice === last.value && choice !== question.answer);
      });
    };
    [0, 1, 2].forEach((index) => bind("answer-" + index, () => {
      const at = elapsed();
      if (events.length >= 20 || $("answer-" + index).disabled) return;
      if (!addEvent(challenge.questions[events.length].choices[index], at)) return;
      paint(at);
    }));
    paint(elapsed());
    if (mode === "playing") runFrame(paint);
  }

  function predictionCorrect(event, index) {
    return event.value === (challenge.deck[index + 1] > challenge.deck[index] ? 1 : -1);
  }

  function higherlowerGame() {
    show('<div class="live-meta"><p class="t-label" id="card-progress"></p><p class="t-label" id="card-score"></p></div>' +
      '<div class="game-copy"><p class="eyebrow">Next card</p><h1 class="t-title" id="card-message">Higher or lower?</h1></div>' +
      '<div class="card-table" id="card-table"></div><div class="card-range">2 low · 13 high · no ties</div>',
      '<div class="action-row"><button class="glass secondary predict play-control" id="lower" type="button">' + icon("down") + 'Lower</button><button class="glass primary predict play-control" id="higher" type="button">' + icon("up") + 'Higher</button></div><p class="t-caption">One wrong call ends the run</p>');
    let view = "";
    const paint = (at) => {
      const last = events.at(-1);
      const correct = !last || predictionCorrect(last, events.length - 1);
      const feedback = !!last && at - last.at < (correct ? 650 : 1100);
      if ((!correct || events.length >= 20) && !feedback) return finish();
      const nextView = events.length + ":" + feedback;
      if (nextView === view) return;
      view = nextView;
      $("card-progress").textContent = "Card " + Math.min(20, events.length + 1) + " of 20";
      $("card-score").innerHTML = "<strong>" + (events.length - (correct ? 0 : 1)) + "</strong> streak";
      $("card-table").innerHTML = card(challenge.deck[events.length], !!last && feedback);
      $("card-message").textContent = !correct ? "The deck had other plans" : feedback ? "Good call" : "Higher or lower?";
      $("lower").disabled = feedback || !correct;
      $("higher").disabled = feedback || !correct;
      const current = challenge.deck[events.length];
      $("lower").innerHTML = icon("down") + '<span>Lower <small>' + (current - 2) + ' of 11</small></span>';
      $("higher").innerHTML = icon("up") + '<span>Higher <small>' + (13 - current) + ' of 11</small></span>';
    };
    const predict = (value) => {
      const at = elapsed();
      if (events.length >= 20 || $(value === 1 ? "higher" : "lower").disabled) return;
      if (!addEvent(value, at)) return;
      paint(at);
    };
    bind("lower", () => predict(-1));
    bind("higher", () => predict(1));
    paint(elapsed());
    if (mode === "playing") runFrame(paint);
  }

  function outcome(score) {
    const label = R.game === "reaction" ? score + "/1000 reflex" : R.game === "freethrow" ? score + "/500 accuracy" : R.game === "memory" ? score + " steps" : R.game === "math" ? score + "/20 correct" : score + " in a row";
    return { score, label, won: score >= { reaction: 500, freethrow: 250, memory: 7, math: 8, higherlower: 5 }[R.game] };
  }

  function localResult(abandoned = false) {
    if (abandoned) return outcome(0);
    if (R.game === "reaction") {
      const score = Math.round(events.reduce((sum, event) => sum + (event.value > 0 ? Math.max(0, 1000 - event.value) : 0), 0) / 3);
      return outcome(score);
    }
    if (R.game === "freethrow") {
      const score = events.reduce((sum, event) => sum + Math.max(0, 100 - Math.round(Math.abs(event.value - 500) / 5)), 0);
      return outcome(score);
    }
    if (R.game === "memory") {
      return outcome(memoryProgress().correct);
    }
    if (R.game === "math") {
      const score = events.filter((event, i) => event.value === challenge.questions[i]?.answer).length;
      return outcome(score);
    }
    let score = 0;
    for (let i = 0; i < events.length && predictionCorrect(events[i], i); i++) score++;
    return outcome(score);
  }

  function finish(abandoned = false) {
    if (mode === "result" && !finishPayload) return;
    stopFrame();
    finishReason = abandoned ? "Round left early" : timeNow() >= attempt.deadline ? "Time’s up"
      : R.game === "memory" && memoryProgress().wrong ? "Pattern broken"
      : R.game === "higherlower" && events.length && !predictionCorrect(events.at(-1), events.length - 1) ? "The deck wins"
      : "That’s a round";
    setClock(0);
    mode = "result";
    finishPayload ??= { events: events.map((event) => ({ ...event })), ...(abandoned ? { abandoned: true } : {}) };
    remember();
    savedResult = localResult(!!finishPayload.abandoned);
    renderResult(false);
    if (practice) {
      finishPayload = null;
      celebrate(null);
      return;
    }
    saveResult();
  }

  function resultData(data) {
    const result = data.result ?? data;
    return { score: result.score ?? 0, label: result.label ?? "Round complete", won: !!result.won, points: result.points ?? data.points ?? null, line: result.line ?? data.line ?? null };
  }

  function showOfficial(data) {
    stopFrame();
    mode = "result";
    setClock(0);
    savedResult = resultData(data);
    savedBoard = data.board ?? [];
    finishPayload = null;
    storage.remove(stateKey());
    renderResult(true);
    celebrate(savedResult.points);
  }

  function renderResult(saved) {
    const result = savedResult;
    show('<div class="result-summary"><p class="eyebrow">' + (practice ? "Practice complete" : saved ? "Official result" : "Your result") + '</p><h1 class="t-title">' + (result.won ? "Nicely done" : finishReason || "That’s a round") + '</h1><p class="result-score" id="result-score">' + esc(result.score) + '</p><p class="result-label" id="result-label">' + esc(resultCaption(result)) + '</p></div>' +
      '<div class="result-points" id="points"></div><p class="save-state" id="save-state" role="status">' + (practice ? "Practice only · no points recorded" : saved ? "Saved to your league" : "Saving official result…") + '</p><div class="round-board" id="round-board"></div>',
      '<button class="glass primary play-control" id="share" type="button">' + icon("share") + 'Share</button><div class="result-links"><button class="secondary fill play-control" id="practice" type="button">' + icon("again") + (practice ? "Play again" : "Practice") + '</button><a class="quiet-link" id="league-link" href="/l' + (theme ? "?theme=" + encodeURIComponent(theme) : "") + '">Leaderboard</a></div>');
    stage.classList.add("result-stage");
    paintRoundBoard();
    bind("share", share);
    bind("practice", openPractice);
    if (!practice && !saved) {
      $("practice").disabled = true;
      $("practice").setAttribute("aria-label", "Practice is available after your result is saved");
    }
  }

  function paintRoundBoard() {
    if (!$("round-board") || !savedBoard.length) return;
    const rows = savedBoard.slice(0, 3);
    $("round-board").innerHTML = '<p class="t-caption">This round</p>' + rows.map((player, i) => '<div class="rowi' + (player.name === name ? " me" : "") + '"><span class="rk">' + (i + 1) + '</span><b>' + esc(player.name) + '</b><span class="num">' + esc(player.label || player.score) + "</span></div>").join("");
  }

  function resultCaption(result) {
    return result.label.startsWith(String(result.score)) ? result.label.slice(String(result.score).length).trim().replace(/^\//, "out of ") : result.label;
  }

  function celebrate(points) {
    if (celebrated || !window.Juice) return;
    celebrated = true;
    window.Juice.result({ host: $("points"), points, won: savedResult.won, icon: icon("coin"), haptic: fallbackHaptic, me: practice ? null : name, before: boardBefore, after: practice ? null : window.Juice.board, href: "/l" + (theme ? "?theme=" + encodeURIComponent(theme) : "") });
  }

  async function saveResult() {
    if (practice || saving || !finishPayload) return;
    saving = true;
    const state = $("save-state");
    if (state) { state.textContent = "Saving official result…"; state.classList.remove("failed"); }
    if ($("retry-save")) { $("retry-save").disabled = true; $("retry-save").textContent = "Saving…"; }
    try {
      const data = await api("finish", finishPayload);
      savedResult = resultData(data);
      savedBoard = data.board ?? [];
      finishPayload = null;
      storage.remove(stateKey());
      $("result-score").textContent = savedResult.score;
      $("result-label").textContent = resultCaption(savedResult);
      stage.querySelector(".eyebrow").textContent = "Official result";
      stage.querySelector("h1").textContent = savedResult.won ? "Nicely done" : finishReason || "That’s a round";
      $("save-state").textContent = "Saved to your league";
      $("practice").disabled = false;
      $("practice").removeAttribute("aria-label");
      $("retry-save")?.remove();
      $("share").hidden = false;
      paintRoundBoard();
      celebrate(savedResult.points);
      if (parent !== window) parent.postMessage({ type: "nickel:done", round: R.id, line: savedResult.line }, location.origin);
    } catch (error) {
      rejectedFinish = !!error.serverRejected;
      $("save-state").textContent = rejectedFinish ? error.message + " End this run to record zero." : "Not saved yet. Your result is kept on this device.";
      $("save-state").classList.add("failed");
      $("practice").disabled = false;
      $("practice").removeAttribute("aria-label");
      $("share").hidden = true;
      if (!$("retry-save")) {
        dock.insertAdjacentHTML("afterbegin", '<button class="glass primary play-control" id="retry-save" type="button">Retry save</button>');
        bind("retry-save", () => {
          if (rejectedFinish) {
            rejectedFinish = false;
            events = [];
            finishPayload = { abandoned: true, events: [] };
            savedResult = localResult(true);
            $("result-score").textContent = savedResult.score;
            $("result-label").textContent = resultCaption(savedResult);
            stage.querySelector("h1").textContent = "That’s a round";
            remember();
          }
          saveResult();
        });
      }
      $("retry-save").disabled = false;
      $("retry-save").textContent = rejectedFinish ? "End run" : "Retry save";
    } finally { saving = false; }
  }

  async function share() {
    const url = new URL(location.href);
    const text = name + " · " + (R.title || game.title) + "\n" + savedResult.label + (practice ? "\nPractice round" : finishPayload ? "\nResult not saved yet" : "");
    if (!window.Juice) return toast("Sharing isn’t available here");
    const result = await window.Juice.share({ title: R.title || game.title, text, url: url.href });
    if (result === "copied") toast("Link copied");
    if (result === "failed") toast("Couldn’t share. Try again.");
  }

  function openPractice() {
    if (practice) {
      stopFrame();
      attempt = null;
      events = [];
      finishPayload = null;
      savedResult = null;
      savedBoard = [];
      celebrated = false;
      rejectedFinish = false;
      finishReason = "";
      return intro();
    }
    const url = new URL(location.href);
    url.searchParams.set("practice", "1");
    location.href = url.href;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { remember(); return; }
    if ((mode === "playing" || mode === "abandoned") && timeNow() >= attempt.deadline) finish(mode === "abandoned");
  });
  document.addEventListener("keydown", (event) => {
    if (mode !== "playing" || event.repeat || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|BUTTON|A/.test(event.target.tagName)) return;
    const key = event.key.toLowerCase();
    const id = R.game === "reaction" && (key === " " || key === "enter") ? "react"
      : R.game === "freethrow" && (key === " " || key === "enter") ? "shoot"
      : R.game === "memory" && /^[1-4]$/.test(key) ? "pad-" + (Number(key) - 1)
      : R.game === "math" && /^[1-3]$/.test(key) ? "answer-" + (Number(key) - 1)
      : R.game === "higherlower" && key === "arrowup" ? "higher"
      : R.game === "higherlower" && key === "arrowdown" ? "lower" : null;
    if (id) { event.preventDefault(); $(id)?.click(); }
  });
  window.addEventListener("pagehide", () => {
    if (!practice && mode === "playing") {
      stopFrame();
      mode = "abandoned";
      events = [];
      finishPayload = { abandoned: true, events: [] };
    }
    remember();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && !practice && (mode === "playing" || mode === "abandoned" || (mode === "result" && finishPayload))) loadStatus();
  });

  $("title").textContent = R.title || game?.title || "Nickel Arcade";
  $("league").textContent = practice ? "Practice · no points" : R.league || "One thumb. One shot.";
  setClock(seconds);
  if (!game) {
    show('<div class="game-copy"><h1 class="t-title">This game has moved on</h1><p class="t-label">Text Nickel “today” for a new round.</p></div>', '<a class="glass primary quiet-link" href="/l">Your league</a>');
    return;
  }
  document.documentElement.style.setProperty("--game", game.hue);
  if (!name) pickName();
  else { paintIdentity(); loadStatus(); }
})();
