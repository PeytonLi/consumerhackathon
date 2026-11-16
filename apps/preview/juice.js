(function (root) {
  const hasDom = typeof document !== "undefined";
  const COLORS = ["#0a84ff", "#ff9f0a", "#30d158", "#bf5af2", "#ff375f", "#ffd60a"];
  const QUIPS = [
    "A bold strategy. It did not work.",
    "Nickel saw that. Nickel will remember.",
    "Somewhere, your Nickels are happier.",
    "Participation has been noted.",
    "The group chat will hear about this.",
    "Technically, that was an attempt.",
  ];
  const TOTAL_MS = 1500;
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");
  const plural = (n, word) => n + " " + word + (Math.abs(n) === 1 ? "" : "s");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
  const reduced = () => hasDom && typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const names = (list) => (list.length <= 2 ? list.join(" and ") : list[0] + " and " + (list.length - 1) + " more");

  function plan(count) {
    const step = count > 1 ? Math.min(150, Math.floor(560 / (count - 1))) : 0;
    const partAt = Array.from({ length: count }, (_, i) => 140 + i * step);
    const partsEnd = count ? partAt[count - 1] + 240 : 0;
    const rankAt = Math.max(900, partsEnd);
    return { countMs: 700, partAt, rankAt, burstMs: 1300, end: Math.max(rankAt + 260, 1300) };
  }

  function rank(before, after, me) {
    const now = after?.people?.find((p) => p.name === me);
    if (!now) return null;
    const was = before?.people?.find((p) => p.name === me);
    const total = after.people.length;
    const base = { from: was ? was.rank : null, to: now.rank, total, passed: [], passedBy: [] };
    if (!was) return { ...base, dir: "up", text: "In at " + ordinal(now.rank) + " of " + total };
    const wasRank = Object.fromEntries(before.people.map((p) => [p.name, p.rank]));
    const others = after.people.filter((p) => p.name !== me && wasRank[p.name] !== undefined);
    const passed = others.filter((p) => wasRank[p.name] < was.rank && p.rank > now.rank).map((p) => p.name);
    const passedBy = others.filter((p) => wasRank[p.name] > was.rank && p.rank < now.rank).map((p) => p.name);
    const move = ordinal(was.rank) + " to " + ordinal(now.rank);
    if (now.rank < was.rank) return { ...base, passed, dir: "up", text: move + (passed.length ? ", passing " + names(passed) : "") };
    if (now.rank > was.rank) return { ...base, passedBy, dir: "down", text: move + (passedBy.length ? ", " + names(passedBy) + " passed you" : "") };
    const above = after.people.find((p) => p.rank === now.rank - 1);
    const below = after.people.find((p) => p.rank === now.rank + 1);
    const text = above
      ? above.nickels === now.nickels ? "Still " + ordinal(now.rank) + ", level with " + above.name : "Still " + ordinal(now.rank) + ", " + (above.nickels - now.nickels) + " behind " + above.name
      : below ? "Still 1st, " + (now.nickels - below.nickels) + " ahead of " + below.name : "Still 1st";
    return { ...base, dir: "same", text };
  }

  function moves(seen, people) {
    const out = {};
    if (!seen) return out;
    for (const p of people) if (seen[p.name] !== undefined && seen[p.name] !== p.rank) out[p.name] = seen[p.name] - p.rank;
    return out;
  }

  function wrapped(board, hub) {
    const people = board?.people ?? [];
    const signed = (n) => (n > 0 ? "+" : n < 0 ? "\u2212" : "") + Math.abs(n);
    const plays = people.reduce((n, p) => n + p.played, 0);
    const slides = [{ key: "intro", hue: "#ff9f0a", kicker: "Nickel Wrapped", who: null, big: String(plays), unit: plays === 1 ? "play" : "plays", title: board?.league ?? "Your league", sub: plays ? "The season so far, in six cards. Tap to go." : "Nothing played yet. Finish one game and this fills in." }];

    const byWins = [...people].sort((a, b) => b.wins - a.wins || a.rank - b.rank);
    const champ = byWins[0];
    slides.push(champ && champ.wins > 0
      ? { key: "wins", hue: "#30d158", kicker: "Most wins", who: champ.name, big: String(champ.wins), unit: champ.wins === 1 ? "win" : "wins", title: champ.name, sub: champ.wins + " and " + champ.losses + " on the season." + (byWins[1] && byWins[1].wins > 0 ? " " + byWins[1].name + " is next with " + byWins[1].wins + "." : " Nobody else has one.") }
      : { key: "wins", hue: "#30d158", kicker: "Most wins", who: null, big: "0", unit: "wins", title: "Nobody yet", sub: "The first win takes this card." });

    const runs = [];
    for (const p of hub?.people ?? []) for (const fact of p.memory ?? []) {
      const m = String(fact).match(/ has (won|lost) (\d+) in a row/);
      if (m) runs.push({ name: p.name, won: m[1] === "won", n: Number(m[2]) });
    }
    const hot = runs.filter((r) => r.won).sort((a, b) => b.n - a.n)[0];
    const cold = runs.filter((r) => !r.won).sort((a, b) => b.n - a.n)[0];
    const coldLine = cold ? cold.name + " has lost " + cold.n + " in a row." : "";
    slides.push(hot
      ? { key: "streak", hue: "#ff9f0a", kicker: "Longest streak", who: hot.name, big: String(hot.n), unit: "in a row", title: hot.name, sub: "Still alive." + (coldLine ? " Meanwhile, " + coldLine : " Somebody end it.") }
      : { key: "streak", hue: "#ff9f0a", kicker: "Longest streak", who: cold ? cold.name : null, big: cold ? String(cold.n) : "0", unit: cold ? "losses in a row" : "in a row", title: cold ? cold.name : "No streak yet", sub: cold ? "The only streak on the board is the wrong kind." : "Win two in a row to claim this card." });

    const upsets = (hub?.recent ?? []).filter((r) => /\bupset\b/.test(r.line)).map((r) => {
      const duel = r.line.match(/^([A-Za-z]+) beat ([A-Za-z]+)/);
      const solo = r.line.match(/^([A-Za-z]+) /);
      return { line: r.line, winner: duel ? duel[1] : solo ? solo[1] : "", loser: duel ? duel[2] : "", total: Number(r.line.match(/= (\d+) Nickels?/)?.[1] ?? 0) };
    }).sort((a, b) => b.total - a.total);
    const upset = upsets[0];
    slides.push(upset
      ? { key: "upset", hue: "#bf5af2", kicker: "Biggest upset", who: upset.winner || null, big: "+" + upset.total, unit: upset.total === 1 ? "Nickel" : "Nickels", title: upset.loser ? upset.winner + " over " + upset.loser : upset.winner, sub: upset.loser ? upset.loser + " was ahead on the board. Was." : "Outscored someone ahead on the board." }
      : { key: "upset", hue: "#bf5af2", kicker: "Biggest upset", who: null, big: "0", unit: "upsets", title: "No upsets yet", sub: "The favorites are holding. Somebody fix that." });

    const last = people.length > 1 ? people[people.length - 1] : null;
    const ahead = people.length > 1 ? people[people.length - 2] : null;
    slides.push(last && plays
      ? { key: "dinner", hue: "#ff375f", kicker: "Paying for dinner", who: last.name, big: signed(last.nickels), unit: Math.abs(last.nickels) === 1 ? "Nickel" : "Nickels", title: last.name, sub: board.stakes ? "Last place, and out the " + board.stakes + "." : ahead.nickels === last.nickels ? "Tied with " + ahead.name + " at the bottom. One game decides the bill." : plural(ahead.nickels - last.nickels, "Nickel") + " behind " + ahead.name + ". The bill is getting close." }
      : { key: "dinner", hue: "#ff375f", kicker: "Paying for dinner", who: null, big: "?", unit: "", title: "Still open", sub: "Last place pays. Nobody is there yet." });

    const head = board?.punishment ? board.punishment.split(":")[0].trim() : "";
    const rest = board?.punishment ? board.punishment.split(":").slice(1).join(":").trim() : "";
    slides.push(board?.stakes
      ? { key: "punishment", hue: "#5e5ce6", kicker: "The stakes", who: last ? last.name : null, big: "", unit: "", title: board.stakes, sub: "Real money this season. Leader takes the pot" + (last && plays ? ", " + last.name + " funds it." : ".") }
      : head
        ? { key: "punishment", hue: "#5e5ce6", kicker: "The punishment", who: last && plays ? last.name : null, big: "", unit: "", title: "Last place " + head, sub: (rest ? rest.replace(/[.]?$/, ". ") : "") + (last && plays ? "Right now that is " + last.name + "." : "Nobody is on the hook yet.") }
        : { key: "punishment", hue: "#5e5ce6", kicker: "The punishment", who: null, big: "", unit: "", title: "Not set yet", sub: "Text the group: Nickel, set a punishment." });
    return slides;
  }

  function css() {
    if (!hasDom || document.getElementById("juice-css")) return;
    const style = document.createElement("style");
    style.id = "juice-css";
    style.textContent = [
      ".juice { gap: 8px; }",
      ".juice-total { height: 34px; padding: 0 14px; color: var(--ink); animation: pop 420ms var(--spring) both; }",
      ".juice-total b { font: 700 19px/1 var(--round); font-variant-numeric: tabular-nums; }",
      ".juice-parts { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; max-width: 330px; }",
      ".juice-part { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 9px; border-radius: var(--r-pill); background: var(--surface-2); font: 600 12px/1 var(--font); color: var(--ink-2); animation: juice-land 240ms var(--spring) both; }",
      ".juice-part.streak { color: var(--them); background: color-mix(in srgb, var(--them) 18%, var(--surface)); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--them) 55%, transparent); }",
      ".juice-part svg { width: 12px; height: 12px; fill: currentColor; }",
      ".juice-lost .juice-total { color: var(--ink-2); rotate: 9deg; transform-origin: 14% 50%; animation: juice-flop 900ms var(--ease) both; }",
      ".juice-quip { animation: rise 240ms var(--ease) 500ms both; color: var(--ink-2); }",
      ".juice-rank { display: flex; align-items: center; gap: 8px; min-height: 44px; margin-top: 4px; padding: 0 12px 0 10px; border-radius: 16px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--hair); font: 600 15px/1.2 var(--font); color: var(--ink); text-decoration: none; animation: rise 240ms var(--ease) both; }",
      ".juice-rank:active { transform: scale(.97); }",
      ".juice-mv { width: 24px; height: 24px; border-radius: 50%; flex: none; display: grid; place-items: center; color: #fff; background: var(--none); }",
      ".juice-mv svg, .juice-go { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }",
      ".juice-mv.up { background: light-dark(#34c759, #30d158); }",
      ".juice-mv.down { background: light-dark(#ff3b30, #ff453a); }",
      ".juice-go { color: var(--ink-3); flex: none; }",
      ".juice-skip, .juice-skip * { animation: none !important; }",
      "@keyframes juice-land { from { opacity: 0; transform: translateY(-14px) scale(.7); } }",
      "@keyframes juice-flop { 0% { opacity: 0; rotate: 0deg; translate: 0 -16px; } 30% { opacity: 1; rotate: 0deg; translate: 0 0; } 55% { rotate: 16deg; } 78% { rotate: 6deg; } 100% { rotate: 9deg; } }",
    ].join("\n");
    document.head.append(style);
  }

  const ARROWS = { up: '<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>', down: '<path d="M12 5v14M5.5 12.5L12 19l6.5-6.5"/>', same: '<path d="M5 12h14"/>' };
  const arrow = (dir) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + ARROWS[dir] + "</svg>";
  const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.5 2c.6 3.4-1 5.2-2.6 7C8.300 10.800 6.500 12.700 6.500 15.800A5.600 5.600 0 0 0 12 21.500a5.600 5.600 0 0 0 5.500-5.700c0-2.300-1-4-2.100-5.300-.3 1.500-1 2.400-2 2.900.6-3.600-.300-7.600-.900-11.400z"/></svg>';
  const CHEVRON = '<svg class="juice-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

  function buzz(pattern, fallback) {
    if (!hasDom) return false;
    if (typeof navigator.vibrate === "function") { try { if (navigator.vibrate(pattern)) return true; } catch {} }
    if (fallback) fallback(Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1);
    return false;
  }

  function countUp(el, to, ms, format = String) {
    if (reduced() || ms <= 0 || !to) { el.textContent = format(to); return { finish() {} }; }
    let raf = 0, done = false;
    const t0 = performance.now();
    const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); el.textContent = format(to); };
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      if (k >= 1) return finish();
      el.textContent = format(Math.round(to * (1 - Math.pow(1 - k, 3))));
      raf = requestAnimationFrame(tick);
    };
    el.textContent = format(0);
    raf = requestAnimationFrame(tick);
    return { finish };
  }

  function burst(opts = {}) {
    if (!hasDom || reduced()) return () => {};
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    const canvas = document.createElement("canvas");
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:60;pointer-events:none";
    canvas.setAttribute("aria-hidden", "true");
    document.body.append(canvas);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const sad = !!opts.sad, life = opts.ms ?? 1300, ox = opts.x ?? w / 2, oy = opts.y ?? h * 0.36;
    const bits = Array.from({ length: sad ? 1 : opts.count ?? 90 }, (_, i) => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3, v = 380 + Math.random() * 560;
      return sad
        ? { x: ox, y: oy - 90, vx: 0, vy: 30, s: 9, r: 0.4, vr: 2.2, c: "#8e8e93", round: false }
        : { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: 5 + Math.random() * 6, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 16, c: COLORS[i % COLORS.length], round: i % 4 === 0 };
    });
    let t0 = 0, last = 0, raf = 0, dead = false;
    const stop = () => { if (dead) return; dead = true; cancelAnimationFrame(raf); canvas.remove(); };
    const tick = (now) => {
      t0 ||= now;
      const t = now - t0, dt = Math.min((now - (last || now)) / 1000, 0.034);
      last = now;
      if (t >= life) return stop();
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.min(1, (life - t) / 300);
      for (const b of bits) {
        b.vy += (sad ? 150 : 1500) * dt;
        b.vx = sad ? Math.sin(t / 170) * 46 : b.vx * (1 - 2.2 * dt);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.r += b.vr * dt;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        ctx.fillStyle = b.c;
        if (b.round) { ctx.beginPath(); ctx.arc(0, 0, b.s / 2, 0, 6.29); ctx.fill(); }
        else ctx.fillRect(-b.s / 2, -b.s / 3, b.s, b.s * (0.45 + 0.4 * Math.abs(Math.cos(b.r * 1.7))));
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return stop;
  }

  const board = () => fetch("/api/leaderboard").then((r) => r.json()).catch(() => null);

  function result(o) {
    const host = o.host;
    if (!host) return;
    css();
    const p = o.points, won = !!o.won, calm = reduced();
    const parts = p ? p.parts : [];
    const t = plan(parts.length);
    const began = performance.now();
    const box = host.getBoundingClientRect();
    host.classList.add("juice");
    host.classList.toggle("juice-lost", !won);
    host.classList.toggle("juice-skip", calm);
    host.innerHTML =
      (p ? '<span class="tag juice-total">' + (o.icon ?? "") + '<b></b></span><div class="juice-parts">' + parts.map((x, i) => '<span class="juice-part' + (x.label === "streak" ? " streak" : "") + '" style="animation-delay:' + t.partAt[i] + 'ms">' + (x.label === "streak" ? FLAME : "") + (i ? (x.points < 0 ? "\u2212" : "+") : "") + Math.abs(x.points) + " " + esc(x.label) + "</span>").join("") + "</div>" : "") +
      (won ? "" : '<p class="t-caption juice-quip">' + QUIPS[Math.floor(Math.random() * QUIPS.length)] + "</p>") +
      '<span class="juice-slot" hidden></span>';
    const counter = p ? countUp(host.querySelector(".juice-total b"), Math.abs(p.total), t.countMs, (n) => (p.total < 0 ? "\u2212" : "+") + n) : { finish() {} };
    const stopBurst = burst(won ? { x: box.left + box.width / 2, y: Math.max(120, box.top), ms: t.burstMs } : { sad: true, x: box.left + box.width / 2 + 60, y: Math.max(140, box.top), ms: t.burstMs });
    buzz(won ? [14, 50, 14, 50, 30] : [70], o.haptic);
    let skipped = calm, rankHtml = "", rankTimer = 0;
    const showRank = () => {
      const slot = host.querySelector(".juice-slot");
      if (slot && rankHtml) slot.outerHTML = rankHtml;
    };
    const skip = () => {
      if (skipped) return;
      skipped = true;
      host.classList.add("juice-skip");
      counter.finish();
      stopBurst();
      clearTimeout(rankTimer);
      showRank();
    };
    document.addEventListener("pointerdown", skip, { once: true, capture: true });
    document.addEventListener("keydown", skip, { once: true, capture: true });
    setTimeout(() => { skipped = true; }, t.end);
    if (p && o.me && o.after) Promise.resolve(o.before).then((was) => o.after().then((now) => {
      const r = rank(was, now, o.me);
      if (!r) return;
      rankHtml = '<a class="juice-rank" href="' + esc(o.href ?? "/l") + '" aria-label="' + esc(r.text) + '. Open the leaderboard"><span class="juice-mv ' + r.dir + '">' + arrow(r.dir) + "</span><span>" + esc(r.text) + "</span>" + CHEVRON + "</a>";
      const wait = skipped ? 0 : Math.max(0, t.rankAt - (performance.now() - began));
      rankTimer = setTimeout(() => { showRank(); if (r.dir === "up" && !skipped) buzz([10], o.haptic); }, wait);
    }));
    return skip;
  }

  async function share(o) {
    try {
      const blob = o.image ? await o.image : null;
      const file = blob ? new File([blob], o.name ?? "nickel.png", { type: "image/png" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: o.title, text: o.text }); return "shared"; }
      if (navigator.share) { await navigator.share({ title: o.title, text: o.text, url: o.url }); return "shared"; }
      await navigator.clipboard.writeText(o.url);
      return "copied";
    } catch (err) {
      return err?.name === "AbortError" ? "cancelled" : "failed";
    }
  }

  root.Juice = { TOTAL_MS, ordinal, plan, rank, moves, wrapped, reduced, buzz, countUp, burst, board, result, share, arrow, css };
})(typeof window !== "undefined" ? window : globalThis);
