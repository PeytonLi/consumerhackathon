import {
  DEMO_MEMBERS,
  GAMES,
  CADENCE_LABELS,
  cardPath,
  findLeague,
  parseIntent,
  potLabel,
  type GameKind,
  type TabKind,
} from "../shared/league.js";

const INK = "#0F0E0C";
const PAPER = "#F3EEE3";
const MUTE = "#8E887B";
const LINE = "#2A2823";
const ACCENT = "#FF5B2E";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const GAME_KINDS = Object.keys(GAMES) as GameKind[];
const TAB_KINDS: TabKind[] = ["play", "board", "league", "wrapped"];

export interface CardView {
  code: string;
  game: GameKind;
  tab: TabKind;
  from?: string;
  vs?: string;
}

const personName = (raw: string | null | undefined) => {
  const clean = (raw ?? "").replace(/[^A-Za-z]/g, "").slice(0, 12);
  return clean ? clean[0].toUpperCase() + clean.slice(1).toLowerCase() : undefined;
};

export function cardViewFromUrl(url: URL): CardView | null {
  const match = url.pathname.match(/^\/(?:c|og)\/([A-Za-z0-9]{3,12})(?:\.png|\.svg)?$/);
  if (!match) return null;
  const g = url.searchParams.get("g") as GameKind | null;
  const tab = url.searchParams.get("tab") as TabKind | null;
  return {
    code: match[1].toUpperCase(),
    game: g && GAME_KINDS.includes(g) ? g : "krillion",
    tab: tab && TAB_KINDS.includes(tab) ? tab : "play",
    from: personName(url.searchParams.get("u")),
    vs: personName(url.searchParams.get("vs")),
  };
}

export function cardCopy(view: CardView) {
  const league = findLeague(view.code);
  const played = DEMO_MEMBERS.filter((m) => m.played).length;
  const total = DEMO_MEMBERS.length;
  const leader = [...DEMO_MEMBERS].sort((a, b) => b.seasonPoints - a.seasonPoints)[0];
  if (view.tab === "board") {
    return { league, played, total, kicker: "The board", headline: "Put a nickel on it", sub: "Call the over or the under on your friends.", cta: "Open the board" };
  }
  if (view.tab === "league") {
    return { league, played, total, kicker: "Standings", headline: leader.name + " leads", sub: "Pays out " + CADENCE_LABELS[league.cadence].toLowerCase() + ". " + league.daysLeft + " days left.", cta: "See standings" };
  }
  if (view.tab === "wrapped") {
    return { league, played, total, kicker: "Season recap", headline: "Nickel Wrapped", sub: "Who carried, who faded, who poached.", cta: "Open your recap" };
  }
  const game = GAMES[view.game];
  if (view.vs) {
    return { league, played, total, kicker: "Challenge  /  " + game.title, headline: (view.from ?? "You") + " vs " + view.vs, sub: game.seconds + " seconds each. Higher score takes the nickels.", cta: "Tap to play" };
  }
  return { league, played, total, kicker: "Today's round  /  " + game.seconds + " seconds", headline: game.title, sub: game.blurb, cta: "Tap to play" };
}

export function cardTitle(view: CardView): string {
  const copy = cardCopy(view);
  return copy.headline + " - " + copy.league.name;
}

export function cardDescription(view: CardView): string {
  const copy = cardCopy(view);
  return copy.played + " of " + copy.total + " played today. " + copy.sub;
}

export function cardSvg(view: CardView): string {
  const copy = cardCopy(view);
  const avatars = DEMO_MEMBERS.map((m, i) => {
    const cx = 96 + i * 62;
    const fill = m.played ? PAPER : "none";
    const text = m.played ? INK : MUTE;
    return (
      '<circle cx="' + cx + '" cy="508" r="26" fill="' + fill + '" stroke="' + (m.played ? PAPER : "#4A463E") + '" stroke-width="2"/>' +
      '<text x="' + cx + '" y="517" text-anchor="middle" font-family="Inter" font-weight="600" font-size="24" fill="' + text + '">' + esc(m.name[0]) + "</text>"
    );
  }).join("");
  const headlineSize = copy.headline.length > 16 ? 108 : 132;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">' +
    "<defs>" +
    '<radialGradient id="glow" cx="82%" cy="40%" r="60%"><stop offset="0" stop-color="#2B261D"/><stop offset="1" stop-color="' + INK + '"/></radialGradient>' +
    '<linearGradient id="coin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7F3EA"/><stop offset="0.5" stop-color="#C9C3B5"/><stop offset="1" stop-color="#8F897B"/></linearGradient>' +
    '<clipPath id="frame"><rect width="1200" height="630"/></clipPath>' +
    "</defs>" +
    '<g clip-path="url(#frame)">' +
    '<rect width="1200" height="630" fill="url(#glow)"/>' +
    '<circle cx="1010" cy="250" r="250" fill="url(#coin)"/>' +
    '<circle cx="1010" cy="250" r="226" fill="none" stroke="' + INK + '" stroke-opacity="0.35" stroke-width="2"/>' +
    '<circle cx="1010" cy="250" r="212" fill="none" stroke="' + INK + '" stroke-opacity="0.18" stroke-width="1"/>' +
    '<text x="1010" y="352" text-anchor="middle" font-family="Instrument Serif" font-size="330" fill="' + INK + '" fill-opacity="0.82">5</text>' +
    '<text x="72" y="96" font-family="JetBrains Mono" font-size="22" letter-spacing="4" fill="' + PAPER + '">NICKEL</text>' +
    '<rect x="188" y="84" width="6" height="6" fill="' + ACCENT + '"/>' +
    '<text x="214" y="96" font-family="JetBrains Mono" font-size="22" letter-spacing="4" fill="' + MUTE + '">' + esc(copy.league.name.toUpperCase()) + "</text>" +
    '<text x="72" y="232" font-family="JetBrains Mono" font-size="20" letter-spacing="3" fill="' + ACCENT + '">' + esc(copy.kicker.toUpperCase()) + "</text>" +
    '<text x="66" y="' + (headlineSize > 120 ? 352 : 340) + '" font-family="Instrument Serif" font-size="' + headlineSize + '" fill="' + PAPER + '">' + esc(copy.headline) + "</text>" +
    '<text x="72" y="412" font-family="Inter" font-size="30" fill="#BDB7A9">' + esc(copy.sub) + "</text>" +
    avatars +
    '<text x="412" y="502" font-family="Inter" font-weight="600" font-size="26" fill="' + PAPER + '">' + copy.played + " of " + copy.total + " played</text>" +
    '<text x="412" y="534" font-family="Inter" font-size="22" fill="' + MUTE + '">' + esc(potLabel(copy.league)) + "</text>" +
    '<rect x="0" y="576" width="1200" height="54" fill="' + PAPER + '"/>' +
    '<text x="72" y="611" font-family="Inter" font-weight="600" font-size="22" fill="' + INK + '">' + esc(copy.cta) + "</text>" +
    '<text x="1128" y="611" text-anchor="end" font-family="JetBrains Mono" font-size="18" letter-spacing="2" fill="' + INK + '">5 NICKELS A DAY</text>' +
    "</g></svg>"
  );
}

let pngRenderer: ((svg: string) => Uint8Array) | null = null;

export async function cardPng(view: CardView): Promise<Uint8Array> {
  if (!pngRenderer) {
    const { Resvg } = await import("@resvg/resvg-js");
    const fontDir = new URL("./fonts/", import.meta.url).pathname;
    const files = ["InstrumentSerif-Regular.ttf", "InstrumentSerif-Italic.ttf", "Inter-Regular.otf", "Inter-SemiBold.otf", "JetBrainsMono.ttf"].map(
      (f) => fontDir + f
    );
    pngRenderer = (svg) =>
      new Resvg(svg, { font: { fontFiles: files, loadSystemFonts: false, defaultFontFamily: "Inter" } }).render().asPng();
  }
  return pngRenderer(cardSvg(view));
}

export function injectCardMeta(indexHtml: string, view: CardView, origin: string, search: string): string {
  const pageUrl = origin + "/c/" + view.code + search;
  const imageUrl = origin + "/og/" + view.code + ".png" + search;
  const title = esc(cardTitle(view));
  const description = esc(cardDescription(view));
  const meta = [
    "<title>" + title + "</title>",
    '<meta property="og:title" content="' + title + '" />',
    '<meta property="og:description" content="' + description + '" />',
    '<meta property="og:site_name" content="Nickel" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:url" content="' + esc(pageUrl) + '" />',
    '<meta property="og:image" content="' + esc(imageUrl) + '" />',
    '<meta property="og:image:type" content="image/png" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:image" content="' + esc(imageUrl) + '" />',
  ].join("\n    ");
  return indexHtml.replace(/<!--card-meta-->[\s\S]*?<!--\/card-meta-->/, meta);
}

export function buildCardReply(params: { text: string; baseUrl: string; leagueCode?: string; handle?: string; opponent?: string }) {
  const intent = parseIntent(params.text);
  const league = findLeague(params.leagueCode);
  const vs = intent.tab === "play" ? personName(params.opponent ?? params.text.match(/(?:challenge|vs\.?|versus|against)\s+@?([A-Za-z]+)/i)?.[1]) : undefined;
  const view: CardView = { code: league.code, game: intent.game, tab: intent.tab, from: personName(params.handle), vs };
  const url = params.baseUrl.replace(/\/+$/, "") + cardPath({ code: league.code, game: intent.game, tab: intent.tab, handle: params.handle, vs: vs?.toLowerCase() });
  const copy = cardCopy(view);
  return {
    addressed: intent.addressed,
    game: intent.game,
    tab: intent.tab,
    league: league.name,
    url,
    line: copy.headline + ". " + copy.played + " of " + copy.total + " in.",
    title: cardTitle(view),
  };
}

function originOf(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? (/localhost|127\.0\.0\.1/.test(host) ? "http" : "https");
  return (process.env.NICKEL_BASE_URL ?? proto + "://" + host).replace(/\/+$/, "");
}

export async function handleNickelRequest(request: Request, loadIndexHtml: (pathname: string) => Promise<string>): Promise<Response | null> {
  const url = new URL(request.url);
  const origin = originOf(request);

  if (url.pathname.startsWith("/og/")) {
    const view = cardViewFromUrl(url);
    if (!view) return new Response("Not found", { status: 404 });
    if (url.pathname.endsWith(".svg")) {
      return new Response(cardSvg(view), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=60" } });
    }
    const png = await cardPng(view);
    return new Response(png as unknown as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=60" } });
  }

  if (url.pathname.startsWith("/c/") && (request.method === "GET" || request.method === "HEAD")) {
    const view = cardViewFromUrl(url);
    if (!view) return null;
    const html = injectCardMeta(await loadIndexHtml(url.pathname), view, origin, url.search);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
  }

  if (url.pathname === "/api/keiki/card" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { text?: string; leagueCode?: string; handle?: string; opponent?: string };
    return Response.json(buildCardReply({ text: body.text ?? "", baseUrl: origin, leagueCode: body.leagueCode, handle: body.handle, opponent: body.opponent }));
  }

  return null;
}
