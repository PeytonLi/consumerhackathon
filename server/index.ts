import { cardPng, recordResult, draftPick, fantasyCard, fantasyStandings, getFantasy, getRound, handleTurn, roundCard, scorePick } from "./brain.js";

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

Bun.serve({
  port,
  hostname: "0.0.0.0",
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const base = origin(request);

    if (request.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" } });

    if (path === "/api/turn" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { text?: string; sender?: string; senderPhone?: string; fantasyTopic?: string; fantasyPicks?: string[]; opponent?: string; game?: string };
      return json(handleTurn({ text: String(body.text ?? ""), sender: body.sender, senderPhone: body.senderPhone, baseUrl: base, opponent: body.opponent, game: body.game, fantasyTopic: body.fantasyTopic, fantasyPicks: Array.isArray(body.fantasyPicks) ? body.fantasyPicks.map(String) : undefined }));
    }

    const resultApi = path.match(/^\/api\/rounds\/([a-z0-9-]+)\/result$/);
    if (resultApi && request.method === "POST") return json(recordResult(resultApi[1], (await request.json().catch(() => ({}))) as Parameters<typeof recordResult>[1]));

    const fantasyApi = path.match(/^\/api\/fantasy\/([a-z0-9-]+)(?:\/(draft|score))?$/);
    if (fantasyApi) {
      const [, id, action] = fantasyApi;
      const body = request.method === "POST" ? ((await request.json().catch(() => ({}))) as { member?: string; pick?: string; delta?: number }) : {};
      const result = action === "draft" ? draftPick(id, body.member ?? "", body.pick ?? "") : action === "score" ? scorePick(id, body.pick ?? "", Number(body.delta), body.member ?? "") : { ok: true };
      const league = getFantasy(id);
      if (!league) return json({ ok: false, error: "Not found" }, 404);
      return json({ ...result, league, standings: fantasyStandings(league) }, result.ok ? 200 : 409);
    }

    const og = path.match(/^\/og\/(r|f)\/([a-z0-9-]+)\.png$/);
    if (og) {
      const card = og[1] === "r" ? (getRound(og[2]) ? roundCard(getRound(og[2])!) : null) : getFantasy(og[2]) ? fantasyCard(getFantasy(og[2])!) : null;
      if (!card) return new Response("Not found", { status: 404 });
      return new Response((await cardPng(card)) as unknown as BodyInit, { headers: { "content-type": "image/png", "cache-control": "public, max-age=30" } });
    }

    const round = path.match(/^\/r\/([a-z0-9-]+)\/?$/);
    if (round) {
      const found = getRound(round[1]);
      const data = found ?? { id: round[1], game: "missing", title: "Nickel" };
      const tags = found ? headTags(roundCard(found), base, "") : "";
      return html((await Bun.file(site + "play.html").text()).replace("<!--ROUND-->", tags + "\n<script>window.ROUND = " + inline(data) + ";</script>"));
    }

    const fantasy = path.match(/^\/f\/([a-z0-9-]+)\/?$/);
    if (fantasy) {
      const league = getFantasy(fantasy[1]);
      const tags = league ? headTags(fantasyCard(league), base, "") : "";
      return html((await Bun.file(site + "fantasy.html").text()).replace("<!--LEAGUE-->", tags + "\n<script>window.LEAGUE = " + inline(league) + ";</script>"));
    }

    const name = path === "/" ? "messages.html" : path.replace(/^\/+/, "");
    if (!/^[\w.-]+$/.test(name)) return new Response("Not found", { status: 404 });
    const file = Bun.file(site + name);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file, { headers: { "cache-control": "no-store" } });
  },
});

console.log("Nickel on " + port);
