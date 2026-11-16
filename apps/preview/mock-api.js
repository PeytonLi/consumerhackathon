(() => {
  const query = new URLSearchParams(location.search);
  const scene = query.get("mock");
  if (!scene) return;
  const min = 60e3, hour = 60 * min, now = Date.now();
  const seed = () => {
    const base = {
      wallet: {
        balanceCents: 435, dailyLimitCents: 100, spentTodayCents: 10, consent: true, kyc: "none",
        activity: [
          { at: now - 9 * min, amountCents: 25, reason: "round", note: "Rock Paper Scissors" },
          { at: now - 40 * min, amountCents: 15, reason: "chest", note: "" },
          { at: now - 2 * hour, amountCents: 5, reason: "steal", note: "Dev" },
          { at: now - 5 * hour, amountCents: -5, reason: "stake", note: "Wordle Blitz" },
          { at: now - 26 * hour, amountCents: -5, reason: "steal", note: "Maya" },
          { at: now - 27 * hour, amountCents: -100, reason: "buyin", note: "Cupertino Day Ones" },
          { at: now - 28 * hour, amountCents: 500, reason: "topup", note: "" },
        ],
      },
      chest: {
        available: true, opened: null, skipped: false,
        odds: [{ kind: "points", label: "Nickels", pct: 60 }, { kind: "perk", label: "Perk", pct: 30 }, { kind: "cash", label: "Cash bonus", pct: 10 }],
      },
      heist: {
        loose: [
          { id: "lz-dev", victim: "Dev", nickels: 1, cents: 5, ghostMs: 212, endsAt: now + 2 * hour + 14 * min, peek: true },
          { id: "lz-alex", victim: "Alex", nickels: 2, cents: 10, ghostMs: 148, endsAt: now + 47 * min, peek: false },
          { id: "lz-maya", victim: "Maya", nickels: 1, cents: 5, ghostMs: 300, endsAt: now + 5 * hour + 3 * min, peek: false },
        ],
        perks: { lock: 1, double_steal: 0, peek: 1, shield: 2 },
      },
    };
    if (scene === "low") Object.assign(base.wallet, { balanceCents: 10, spentTodayCents: 90, activity: [{ at: now - 3 * hour, amountCents: -90, reason: "stake", note: "Wordle Blitz" }, { at: now - 30 * hour, amountCents: 100, reason: "topup", note: "" }] });
    if (scene === "new") Object.assign(base.wallet, { balanceCents: 0, spentTodayCents: 0, consent: false, activity: [] });
    if (scene === "verified") base.wallet.kyc = "verified";
    if (scene === "opened") Object.assign(base.chest, { available: false, opened: { kind: "perk", label: "Double Steal", perk: "double_steal" } });
    if (scene === "skipped") Object.assign(base.chest, { available: false, skipped: true });
    if (scene === "empty") base.heist.loose = [];
    return base;
  };
  const key = "nickel.mock." + scene;
  let db;
  try { db = JSON.parse(sessionStorage.getItem(key)) || seed(); } catch { db = seed(); }
  db.done ??= [];
  db.heist.started ??= {};
  const save = () => sessionStorage.setItem(key, JSON.stringify(db));
  const credit = (amountCents, reason, note = "") => {
    db.wallet.balanceCents += amountCents;
    db.wallet.activity.unshift({ at: Date.now(), amountCents, reason, note });
  };
  const once = (tag, fn) => { if (tag && !db.done.includes(tag)) { db.done.push(tag); fn(); } };
  once(query.get("paid") && query.get("t"), () => credit(Number(query.get("paid")), "topup"));
  once(query.get("onboarded") && query.get("t"), () => { db.wallet.kyc = "verified"; });
  save();
  if (!window.ME) window.ME = { name: "Peyton" };

  const back = (extra) => location.pathname + "?" + new URLSearchParams({ ...Object.fromEntries(query), mock: scene, ...extra, t: String(Date.now()) });
  const roll = () => {
    const r = Math.random() * 100;
    if (r < 60) { const points = [10, 20, 25, 40, 50][Math.floor(Math.random() * 5)]; return { kind: "points", label: points + " Nickels", points }; }
    if (r < 90) { const perk = ["lock", "double_steal", "peek", "shield"][Math.floor(Math.random() * 4)]; return { kind: "perk", label: { lock: "Lock", double_steal: "Double Steal", peek: "Peek", shield: "Shield" }[perk], perk }; }
    const amountCents = [5, 10, 15, 25][Math.floor(Math.random() * 4)];
    return { kind: "cash", label: amountCents + "\u00a2 bonus", amountCents };
  };
  const routes = [
    ["GET", /^\/api\/wallet$/, () => db.wallet],
    ["POST", /^\/api\/wallet\/topup$/, (b) => (Number.isInteger(b.amountCents) && b.amountCents >= 100 ? { checkoutUrl: back({ paid: b.amountCents }) } : [400, { error: "Minimum is $1" }])],
    ["POST", /^\/api\/wallet\/limit$/, (b) => {
      if (b.consent !== true || !Number.isInteger(b.dailyLimitCents) || b.dailyLimitCents < 0) return [400, { error: "Try again" }];
      Object.assign(db.wallet, { dailyLimitCents: b.dailyLimitCents, consent: true });
      return { ok: true };
    }],
    ["POST", /^\/api\/wallet\/cashout$/, (b) => {
      if (!Number.isInteger(b.amountCents) || b.amountCents < 1 || b.amountCents > db.wallet.balanceCents) return [400, { error: "Not enough balance" }];
      if (db.wallet.kyc !== "verified") return { url: back({ onboarded: 1 }) };
      credit(-b.amountCents, "cashout");
      return { ok: true, status: "pending" };
    }],
    ["GET", /^\/api\/chest$/, () => ({ available: db.chest.available, opened: db.chest.opened, odds: db.chest.odds })],
    ["POST", /^\/api\/chest\/open$/, () => {
      if (!db.chest.available) return [409, { error: "Already opened" }];
      const result = roll();
      Object.assign(db.chest, { available: false, opened: result });
      if (result.kind === "cash") credit(result.amountCents, "chest");
      if (result.kind === "perk") db.heist.perks[result.perk] += 1;
      return { result };
    }],
    ["POST", /^\/api\/chest\/skip$/, () => { Object.assign(db.chest, { available: false, skipped: true }); return { ok: true }; }],
    ["GET", /^\/api\/heist$/, () => ({ loose: db.heist.loose.filter((l) => l.endsAt > Date.now() && !db.heist.started[l.id]).map((l) => ({ ...l, ghostMs: l.peek ? l.ghostMs : null })), perks: db.heist.perks })],
    ["POST", /^\/api\/heist\/([\w-]+)\/peek$/, (b, id) => {
      const target = db.heist.loose.find((l) => l.id === id);
      if (!target) return [404, { error: "That nickel is gone" }];
      if (db.heist.started[id]) return [409, { error: "You already tried for this nickel" }];
      if (!target.peek && db.heist.perks.peek < 1) return [409, { error: "You have no Peek left" }];
      if (!target.peek) db.heist.perks.peek -= 1;
      target.peek = true;
      return { ghostMs: target.ghostMs };
    }],
    ["POST", /^\/api\/heist\/([\w-]+)\/start$/, (b, id) => {
      if (!db.heist.loose.some((l) => l.id === id)) return [404, { error: "That nickel is gone" }];
      if (db.heist.started[id]) return [409, { error: "You already tried for this nickel" }];
      db.heist.started[id] = Date.now();
      return { ok: true, limitMs: 15000 };
    }],
    ["POST", /^\/api\/heist\/([\w-]+)\/attempt$/, (b, id) => {
      const target = db.heist.loose.find((l) => l.id === id);
      if (!target) return [404, { error: "That nickel is gone" }];
      db.heist.loose = db.heist.loose.filter((l) => l !== target);
      const elapsed = Date.now() - (db.heist.started[id] ?? -Infinity);
      if (!(elapsed <= 15000)) return { won: false, ghostMs: target.ghostMs, ms: null, took: { nickels: 0, cents: 0 } };
      const ms = Math.round(Number.isFinite(b.ms) && b.ms >= elapsed - 400 && b.ms <= elapsed ? b.ms : elapsed);
      const won = Math.abs(ms - 5000) < target.ghostMs;
      if (won) credit(target.cents, "steal", target.victim);
      return { won, ghostMs: target.ghostMs, ms, took: won ? { nickels: target.nickels, cents: target.cents } : { nickels: 0, cents: 0 } };
    }],
  ];

  const real = window.fetch.bind(window);
  const reply = (status, data) => new Promise((done) => setTimeout(() => done(new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })), 180));
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const method = (init.method || "GET").toUpperCase();
    let body = {};
    try { body = init.body ? JSON.parse(init.body) : {}; } catch {}
    if (method === "POST" && /^\/api\/rounds\/[\w-]+\/result$/.test(url.pathname)) {
      const data = await real(input, init).then((r) => r.json()).catch(() => ({ ok: true, points: null }));
      const moneyCents = body.won === false || /x/i.test(String(body.tries ?? "")) ? -5 : 15;
      credit(moneyCents, "round", "Today's game");
      save();
      return reply(200, { ...data, moneyCents });
    }
    for (const [verb, pattern, handle] of routes) {
      const hit = url.pathname.match(pattern);
      if (verb !== method || !hit) continue;
      const out = handle(body, hit[1]);
      save();
      return Array.isArray(out) ? reply(out[0], out[1]) : reply(200, structuredClone(out));
    }
    return real(input, init);
  };
})();
