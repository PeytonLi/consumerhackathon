import { payMode, setPhoto, generateArt, dueNudges, idleStakes, ensureArt, leaderboardImages, personCardPng, getProfile, saveProfile, facePhoto, profileCard, hydrate, cardPng, leaderboard, leaderboardCard, getPot, joinPot, potCard, recordResult, draftPick, fantasyCard, fantasyStandings, getFantasy, getRound, handleTurn, roundCard, scorePick } from "./brain.js";
import { hub, hubCard } from "./hub.js";
import { confirmTopUp, payBuyIn, potView, startTopUp, sweepForfeits, topUp, walletCard, walletView, walletViewer, withForfeitNews, withdraw } from "./wallet.js";
import { authGate, claimStatus, turnTrusted } from "./auth.js";
import { assistTurn, gradeKrillion, gradedResult, naceStats } from "./nace.js";
import { customRoute, prepareTurn } from "./custom.js";
import { artImage } from "./roster.js";
import { isArcadeGame } from "./arcade.js";

const site = new URL("../apps/preview/", import.meta.url).pathname;
const port = Number(process.env.PORT ?? 5173);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "access-control-allow-origin": "*" } });
const inline = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

function origin(request: Request): string {
  if (process.env.NICKEL_BASE_URL) return process.env.NICKEL_BASE_URL.replace(/\/+$/, "");
  const host = request.headers.get("host") ?? "localhost:" + port;
  return (/localhost|127\.0\.0\.1/.test(host) ? "http://" : "https://") + host;
}

function headTags(card: { kicker: string; title: string; sub: string; league: string; path: string }, base: string, extra: string) {
  const image = base + "/og" + card.path + ".png";
  return [
    '<meta property="og:title" content="' + esc(card.title + " \u00b7 " + card.league) + '">',
    '<meta property="og:description" content="' + esc(card.sub) + '">',
    '<meta property="og:site_name" content="Nickel">',
    '<meta property="og:type" content="website">',
    '<meta property="og:url" content="' + esc(base + card.path) + '">',
    '<meta property="og:image" content="' + esc(image) + '">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    extra,
  ].join("\n");
}

console.log("Nickel state: " + (await hydrate()));
sweepForfeits(Date.now());
setInterval(() => sweepForfeits(Date.now()), 60000);

Bun.serve({
  port,
  hostname: "0.0.0.0",
  maxRequestBodySize: 1000000,
  async fetch(incoming, server) {
    const gate = await authGate(incoming, server.requestIP(incoming)?.address ?? "");
    if (gate instanceof Response) return gate;
    const { request, session } = gate;
    const url = new URL(request.url);
    const path = url.pathname;
    const base = origin(request);
    const me = getProfile(session?.token ?? "");
    const page = (body: string) => html(body.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<script>window.ME = ' + inline(me) + ";</script>"));

    if (request.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" } });

    if (path === "/api/turn" && request.method === "POST") {
      sweepForfeits(Date.now());
      const body = (await request.json().catch(() => ({}))) as { text?: string; sender?: string; senderPhone?: string; fantasyTopic?: string; fantasyPicks?: string[]; opponent?: string; game?: string };
      let hasPhoto = false;
      const photoUrl = (body as { photoUrl?: string }).photoUrl;
      if (turnTrusted(request) && photoUrl && /^https:\/\//.test(photoUrl)) {
        const proc = Bun.spawn(["ffmpeg", "-loglevel", "error", "-i", photoUrl, "-vf", "scale=384:384:force_original_aspect_ratio=increase,crop=384:384", "-frames:v", "1", "-q:v", "5", "-f", "mjpeg", "pipe:1"], { stdout: "pipe", stderr: "pipe" });
        const bytes = Buffer.from(await new Response(proc.stdout).arrayBuffer());
        if ((await proc.exited) === 0 && bytes.length > 500 && bytes.length < 220000) {
          setPhoto(String(body.senderPhone ?? "").replace(/[^+0-9]/g, ""), body.sender ?? "", "data:image/jpeg;base64," + bytes.toString("base64"));
          hasPhoto = true;
        } else console.error("Photo import failed", await new Response(proc.stderr).text());
      }
      let text = String(body.text ?? "");
      const customPrepared = await prepareTurn(text);
      const trusted = turnTrusted(request);
      const turn = await assistTurn((text) => handleTurn({ customPrepared, trusted, hasPhoto, text, sender: body.sender, senderPhone: body.senderPhone, baseUrl: base, opponent: body.opponent, game: body.game, fantasyTopic: body.fantasyTopic, fantasyPicks: Array.isArray(body.fantasyPicks) ? body.fantasyPicks.map(String) : undefined }), text, body.sender);
      if (turn.art) await Promise.race([generateArt(turn.art.token, turn.art.role), new Promise((r) => setTimeout(r, 40000))]);
      if (turn.addressed && turn.line && Number(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false })) >= 18) {
        const due = dueNudges();
        if (due.length) turn.line += " " + due.map((n) => n.text).join(" ");
      }
      return json(withForfeitNews(turn));
    }

    const custom = await customRoute(request.method, url, () => request.json().catch(() => ({})), me?.name);
    if (custom?.kind === "json") return json(custom.data, custom.status);
    if (custom?.kind === "card") return new Response((await cardPng(custom.card)) as unknown as BodyInit, { headers: { "content-type": "image/png", "cache-control": "public, max-age=30" } });
    if (custom) return page((await Bun.file(site + "custom.html").text()).replace("<!--GAME-->", (custom.card ? headTags(custom.card, base, "") : "") + "\n<script>window.GAME = " + inline(custom.game) + "; window.CUSTOM_LEAGUE = " + inline(custom.league ?? null) + ";</script>"));

    const resultApi = path.match(/^\/api\/rounds\/([a-z0-9-]+)\/result$/);
    if (resultApi && request.method === "POST") return json(recordResult(resultApi[1], await gradedResult(getRound(resultApi[1]), (await request.json().catch(() => ({}))) as Parameters<typeof recordResult>[1])));

    const gradeApi = path.match(/^\/api\/rounds\/([a-z0-9-]+)\/grade$/);
    if (gradeApi && request.method === "POST") {
      const found = getRound(gradeApi[1]);
      const body = (await request.json().catch(() => ({}))) as { answer?: unknown };
      if (!found || found.game !== "krillion") return json({ ok: false }, 404);
      return json({ ok: true, grade: await gradeKrillion(String(found.prompt ?? ""), String(body.answer ?? "")) });
    }
    if (path === "/api/nace") return json(naceStats());

    const fantasyApi = path.match(/^\/api\/fantasy\/([a-z0-9-]+)(?:\/(draft|score))?$/);
    if (fantasyApi) {
      const [, id, action] = fantasyApi;
      const body = request.method === "POST" ? ((await request.json().catch(() => ({}))) as { member?: string; pick?: string; delta?: number }) : {};
      const result = action === "draft" ? draftPick(id, body.member ?? "", body.pick ?? "") : action === "score" ? scorePick(id, body.pick ?? "", Number(body.delta), body.member ?? "") : { ok: true };
      const league = getFantasy(id);
      if (!league) return json({ ok: false, error: "Not found" }, 404);
      return json({ ...result, league, standings: fantasyStandings(league) }, result.ok ? 200 : 409);
    }

    const og = path.match(/^\/og\/(r|f|p|me)\/([a-z0-9-]+)\.png$/);
    if (og) {
      const card = og[1] === "me" ? (getProfile(og[2]) ? profileCard(getProfile(og[2])!) : null) : og[1] === "p" ? (getPot(og[2]) ? potCard(getPot(og[2])!) : null) : og[1] === "r" ? (getRound(og[2]) ? roundCard(getRound(og[2])!) : null) : getFantasy(og[2]) ? fantasyCard(getFantasy(og[2])!) : null;
      if (!card) return new Response("Not found", { status: 404 });
      return new Response((await cardPng(card)) as unknown as BodyInit, { headers: { "content-type": "image/png", "cache-control": "public, max-age=30" } });
    }

    const round = path.match(/^\/r\/([a-z0-9-]+)\/?$/);
    if (round) {
      const found = getRound(round[1]);
      if (found?.game === "custom") return Response.redirect(base + "/g/" + found.id, 302);
      const data = found ?? { id: round[1], game: "missing", title: "Nickel" };
      const tags = found ? headTags(roundCard(found), base, "") : "";
      return page((await Bun.file(site + (found && isArcadeGame(found.game) ? "arcade.html" : "play.html")).text()).replace("<!--ROUND-->", tags + "\n<script>window.ROUND = " + inline(data) + ";</script>"));
    }

    const meApi = path.match(/^\/api\/me\/([a-z0-9-]+)$/);
    if (meApi && request.method === "POST") {
      const result = saveProfile(meApi[1], (await request.json().catch(() => ({}))) as Parameters<typeof saveProfile>[1]);
      return json(result, result.ok ? 200 : 400);
    }
    const face = path.match(/^\/face\/([a-z0-9-]+)$/);
    if (face) {
      const pic = facePhoto(face[1]);
      return pic ? new Response(pic.bytes as unknown as BodyInit, { headers: { "content-type": pic.type, "cache-control": "public, max-age=3600" } }) : new Response("Not found", { status: 404 });
    }
    const mePage = path.match(/^\/me\/([a-z0-9-]+)\/?$/);
    if (mePage) {
      const profile = getProfile(mePage[1]);
      const body = (await Bun.file(site + "profile.html").text()).replace("<!--PROFILE-->", (profile ? headTags(profileCard(profile), base, "") : "") + "\n<script>window.PROFILE = " + inline(profile) + "; window.CLAIM = " + inline(claimStatus(session, mePage[1], url.searchParams.get("k"))) + ";</script>");
      return page(body);
    }

    const board = () => { ensureArt(); const b = leaderboard(); return { ...b, cards: leaderboardImages(), order: [...b.people].reverse().map((p) => p.name) }; };
    const meCard = path.match(/^\/card\/me\/([a-z0-9-]+)\/(loser|winner)\.png$/);
    if (meCard) {
      const png = await personCardPng(0, { token: meCard[1], role: meCard[2] });
      return png ? new Response(png as unknown as BodyInit, { headers: { "content-type": "image/png", "cache-control": "public, max-age=60" } }) : new Response("Not found", { status: 404 });
    }
    if (path === "/api/nudges") return json({ idle: idleStakes(), send: request.method === "POST" ? dueNudges() : [] });
    const personCard = path.match(/^\/card\/l\/(\d)\.png$/);
    if (personCard) {
      const png = await personCardPng(Number(personCard[1]));
      return png ? new Response(png as unknown as BodyInit, { headers: { "content-type": "image/png", "cache-control": "public, max-age=60" } }) : new Response("Not found", { status: 404 });
    }
    if (path === "/api/leaderboard") return json(board());
    if (path === "/api/hub") return json(hub(me));
    if (path === "/og/l.png") return new Response((await cardPng(leaderboardCard())) as unknown as BodyInit, { headers: { "content-type": "image/png", "cache-control": "public, max-age=30" } });
    if (path === "/l") return page((await Bun.file(site + "leaderboard.html").text()).replace("<!--BOARD-->", headTags(leaderboardCard(), base, "") + "\n<script>window.BOARD = " + inline(board()) + ";</script>"));
    if (path === "/w") return page((await Bun.file(site + "wrapped.html").text()).replace("<!--WRAPPED-->", headTags({ ...leaderboardCard(), kicker: "Wrapped", title: "Season recap", path: "/w" }, base, "").replace("/og/w.png", "/og/l.png") + "\n<script>window.BOARD = " + inline(board()) + ";</script>"));

    if (path === "/og/h.png") return new Response((await cardPng(hubCard(leaderboard()))) as unknown as BodyInit, { headers: { "content-type": "image/png", "cache-control": "public, max-age=30" } });
    const art = path.match(/^\/art\/([a-z0-9-]+)\/(loser|winner)\.jpg$/);
    if (art) {
      const jpg = artImage(art[1], art[2]);
      return jpg ? new Response(jpg as unknown as BodyInit, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=3600" } }) : new Response("Not found", { status: 404 });
    }
    if (path === "/h") {
      const data = hub(me);
      return page((await Bun.file(site + "hub.html").text()).replace("<!--HUB-->", headTags(hubCard(leaderboard()), base, "") + "\n<script>window.HUB = " + inline(data) + ";</script>"));
    }

    const potApi = path.match(/^\/api\/pot\/([a-z0-9-]+)$/);
    if (potApi) {
      if (request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as { member?: string; action?: string };
        const paid = body.action === "pay" ? payBuyIn(potApi[1], body.member ?? "") : null;
        if (paid && !paid.ok) return json({ ok: false, error: paid.error, shortCents: paid.shortCents, pot: potView(potApi[1]) }, paid.pot ? 402 : 404);
        if (!paid) { const joined = joinPot(potApi[1], body.member ?? "", "in"); if (!joined.ok) return json(joined, getPot(potApi[1]) ? 409 : 404); }
      }
      const pot = potView(potApi[1]);
      return pot ? json({ ok: true, pot }) : json({ ok: false }, 404);
    }

    const potPage = path.match(/^\/p\/([a-z0-9-]+)\/?$/);
    if (potPage) {
      const pot = potView(potPage[1]);
      const tags = pot ? headTags(potCard(pot), base, "") : "";
      return page((await Bun.file(site + "pot.html").text()).replace("<!--POT-->", tags + "\n<script>window.POT = " + inline(pot) + "; window.CHECKOUT = " + inline(payMode()) + ";</script>"));
    }

    if (path === "/api/wallet") {
      const mode = payMode();
      if (request.method !== "POST") return json({ ok: true, mode, wallet: walletView(walletViewer(session?.name, url.searchParams.get("u"))) });
      const body = (await request.json().catch(() => ({}))) as { member?: string; action?: string; amountCents?: number };
      const who = walletViewer(session?.name, body.member ?? "");
      const cents = Number(body.amountCents);
      const out = body.action === "cashout" ? withdraw(who, cents) : body.action !== "topup" ? { ok: false, error: "Not found" } : mode === "demo" ? topUp(who, cents) : await startTopUp(who, cents, base);
      return json({ ...out, mode, wallet: walletView(who) }, out.ok ? 200 : 400);
    }
    if (path === "/og/wallet.png") return new Response((await cardPng(walletCard(""))) as unknown as BodyInit, { headers: { "content-type": "image/png", "cache-control": "public, max-age=30" } });
    if (path === "/wallet") {
      if (url.searchParams.get("paid")) await confirmTopUp(url.searchParams.get("paid")!);
      const view = walletView(walletViewer(session?.name, url.searchParams.get("u")));
      return page((await Bun.file(site + "wallet.html").text()).replace("<!--WALLET-->", headTags({ ...walletCard(""), path: "/wallet" }, base, "") + "\n<script>window.WALLET = " + inline(view) + "; window.CHECKOUT = " + inline(payMode()) + ";</script>"));
    }

    const fantasy = path.match(/^\/f\/([a-z0-9-]+)\/?$/);
    if (fantasy) {
      const league = getFantasy(fantasy[1]);
      const tags = league ? headTags(fantasyCard(league), base, "") : "";
      return page((await Bun.file(site + "fantasy.html").text()).replace("<!--LEAGUE-->", tags + "\n<script>window.LEAGUE = " + inline(league) + ";</script>"));
    }

    const name = path === "/" ? "messages.html" : path.replace(/^\/+/, "");
    if (!/^[\w.-]+$/.test(name)) return new Response("Not found", { status: 404 });
    const file = Bun.file(site + name);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    if (name === "messages.html") return page(await file.text());
    return new Response(file, { headers: { "cache-control": "no-store" } });
  },
});

console.log("Nickel on " + port);
