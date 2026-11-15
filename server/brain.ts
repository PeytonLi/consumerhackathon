import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export interface Round {
  id: string;
  game: "wordle" | "krillion" | "rps";
  title: string;
  league: string;
  members: string[];
  [key: string]: unknown;
}

export interface FantasyLeague {
  id: string;
  topic: string;
  league: string;
  members: string[];
  rosterSize: number;
  pool: { name: string; points: number; owner: string | null }[];
  log: { pick: string; delta: number; by: string; at: number }[];
  createdBy: string;
}

export interface TurnReply {
  addressed: boolean;
  line?: string;
  url?: string;
  card?: { kicker: string; title: string; sub: string; path: string };
}

const LEAGUE_NAME = "Cupertino Day Ones";
const MEMBERS = ["Peyton", "Maya", "Sritej", "Alex", "Dev"];
const WORDS = ["crisp", "flame", "grind", "poker", "stake", "blitz", "coins", "rival"];
const PROMPTS = ["Countries with exactly 4 letters", "Animals that live in the ocean", "Things you find in a dorm room", "Pizza toppings"];
const POOLS: [RegExp, string[]][] = [
  [/\b(ai|llm|model)/i, ["Claude", "GPT", "Gemini", "Grok", "Llama", "Mistral", "DeepSeek", "Qwen", "Kimi", "Nova"]],
  [/hockey|nhl/i, ["McDavid", "MacKinnon", "Matthews", "Kucherov", "Makar", "Draisaitl", "Pastrnak", "Hughes", "Bedard", "Celebrini"]],
  [/basketball|nba/i, ["Jokic", "Doncic", "Gilgeous-Alexander", "Antetokounmpo", "Wembanyama", "Tatum", "Edwards", "Curry", "Brunson", "Haliburton"]],
  [/football|nfl/i, ["Mahomes", "Allen", "Jackson", "Barkley", "Chase", "Jefferson", "Hurts", "Burrow", "Henry", "St. Brown"]],
  [/startup|yc|founder/i, ["OpenAI", "Anthropic", "Stripe", "Ramp", "Figma", "Cursor", "Perplexity", "Scale", "Rippling", "Notion"]],
];

const dataDir = process.env.NICKEL_DATA_DIR ?? new URL("../.data/", import.meta.url).pathname;
const dataFile = dataDir + "/store.json";
const seedRounds = JSON.parse(readFileSync(new URL("../apps/preview/rounds.json", import.meta.url), "utf8")) as Record<string, Omit<Round, "id">>;
const store: { rounds: Record<string, Round>; fantasy: Record<string, FantasyLeague>; latestFantasy: string | null } = existsSync(dataFile)
  ? JSON.parse(readFileSync(dataFile, "utf8"))
  : { rounds: {}, fantasy: {}, latestFantasy: null };

function save() {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(dataFile, JSON.stringify(store));
}

const newId = (prefix: string) => prefix + "-" + Math.random().toString(36).slice(2, 7);
const cap = (s: string) => s.trim().replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase());
const person = (raw: string | undefined) => {
  const clean = (raw ?? "").replace(/[^A-Za-z]/g, "").slice(0, 14);
  return clean ? clean[0].toUpperCase() + clean.slice(1).toLowerCase() : "";
};
const withMember = (name: string) => (name && !MEMBERS.includes(name) ? [...MEMBERS, name] : MEMBERS);

export function getRound(id: string): Round | null {
  if (store.rounds[id]) return store.rounds[id];
  return seedRounds[id] ? ({ id, ...seedRounds[id] } as Round) : null;
}

export function getFantasy(id: string): FantasyLeague | null {
  return store.fantasy[id] ?? null;
}

export function fantasyStandings(league: FantasyLeague) {
  return league.members
    .map((member) => {
      const picks = league.pool.filter((p) => p.owner === member);
      return { member, picks: picks.map((p) => p.name), points: picks.reduce((sum, p) => sum + p.points, 0) };
    })
    .sort((a, b) => b.points - a.points);
}

export function draftPick(id: string, member: string, pickName: string): { ok: boolean; error?: string; league?: FantasyLeague } {
  const league = store.fantasy[id];
  const who = person(member);
  const name = cap(pickName).slice(0, 40);
  if (!league || !who || !name) return { ok: false, error: "Not found" };
  if (!league.members.includes(who)) league.members.push(who);
  if (league.pool.filter((p) => p.owner === who).length >= league.rosterSize) return { ok: false, error: "Your roster is full" };
  let pick = league.pool.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (pick?.owner) return { ok: false, error: pick.owner + " already has " + pick.name };
  if (!pick) {
    pick = { name, points: 0, owner: null };
    league.pool.push(pick);
  }
  pick.owner = who;
  save();
  return { ok: true, league };
}

export function scorePick(id: string, pickName: string, delta: number, by: string): { ok: boolean; error?: string; league?: FantasyLeague } {
  const league = store.fantasy[id];
  const pick = league?.pool.find((p) => p.name.toLowerCase() === pickName.trim().toLowerCase());
  if (!league || !pick || !Number.isFinite(delta) || Math.abs(delta) > 100) return { ok: false, error: "Not found" };
  pick.points += Math.round(delta);
  league.log.push({ pick: pick.name, delta: Math.round(delta), by: person(by) || "Someone", at: Date.now() });
  save();
  return { ok: true, league };
}

function createFantasy(topic: string, picks: string[], sender: string): FantasyLeague {
  const names = picks.length ? picks : (POOLS.find(([re]) => re.test(topic))?.[1] ?? []);
  const unique = [...new Map(names.map((n) => [cap(n).toLowerCase(), cap(n).slice(0, 40)])).values()].filter(Boolean).slice(0, 24);
  const league: FantasyLeague = {
    id: newId("fantasy"),
    topic: cap(topic).slice(0, 48),
    league: LEAGUE_NAME,
    members: withMember(sender),
    rosterSize: 3,
    pool: unique.map((name) => ({ name, points: 0, owner: null })),
    log: [],
    createdBy: sender || "Someone",
  };
  store.fantasy[league.id] = league;
  store.latestFantasy = league.id;
  save();
  return league;
}

function createRound(game: Round["game"], sender: string, opponent: string): Round {
  const members = withMember(opponent).concat(sender && !withMember(opponent).includes(sender) ? [sender] : []);
  const base = { league: LEAGUE_NAME, members, closes: "9:00 PM", challenger: sender || undefined };
  let round: Round;
  if (game === "rps") {
    const hands = ["rock", "paper", "scissors"];
    round = { id: newId("rps"), game, title: "Rock Paper Scissors", opponent: opponent || "Dev", bestOf: 3, stake: 5, devMoves: Array.from({ length: 5 }, () => hands[Math.floor(Math.random() * 3)]), ...base };
  } else if (game === "krillion") {
    round = { id: newId("krill"), game, title: "One in a Krillion", number: 88 + Object.keys(store.rounds).length, prompt: PROMPTS[Math.floor(Math.random() * PROMPTS.length)], seconds: 25, opponent: opponent || undefined, ...base };
  } else {
    round = { id: newId("wordle"), game, title: "Wordle Blitz", number: 213 + Object.keys(store.rounds).length, seconds: 45, answer: WORDS[Math.floor(Math.random() * WORDS.length)], played: [], board: [], opponent: opponent || undefined, ...base };
  }
  store.rounds[round.id] = round;
  save();
  return round;
}

export function roundCard(round: Round) {
  const opponent = typeof round.opponent === "string" ? round.opponent : "";
  const title = round.title + (round.number ? " #" + round.number : "");
  return {
    kicker: opponent ? "Challenge" : "Nickel",
    title: opponent ? (typeof round.challenger === "string" ? round.challenger : "You") + " vs " + opponent : title,
    sub: opponent ? title + (round.stake ? " for " + round.stake + " Nickels" : "") : round.seconds ? round.seconds + " seconds. Closes " + (round.closes ?? "tonight") + "." : "Tap to play",
    league: round.league,
    members: round.members,
    hue: round.game === "wordle" ? "#ff9500" : round.game === "krillion" ? "#0f9fbf" : "#5856d6",
    path: "/r/" + round.id,
  };
}

export function fantasyCard(league: FantasyLeague) {
  const drafted = league.pool.filter((p) => p.owner).length;
  const leader = fantasyStandings(league)[0];
  return {
    kicker: "Fantasy league",
    title: "Fantasy " + league.topic,
    sub: drafted === 0 ? "Draft " + league.rosterSize + " picks each. " + (league.pool.length ? league.pool.length + " on the board." : "Write in anything.") : leader.points ? leader.member + " leads with " + leader.points + " points." : drafted + " picks drafted so far.",
    league: league.league,
    members: league.members,
    hue: "#34c759",
    path: "/f/" + league.id,
  };
}

export function handleTurn(input: { text: string; sender?: string; baseUrl: string; fantasyTopic?: string; fantasyPicks?: string[]; opponent?: string; game?: string }): TurnReply {
  const text = input.text.trim();
  const lower = text.toLowerCase();
  if (!/(^|[^a-z])@?nickel([^a-z]|$)/.test(lower)) return { addressed: false };
  const sender = person(input.sender);
  const base = input.baseUrl.replace(/\/+$/, "");
  const reply = (line: string, card: ReturnType<typeof roundCard> | ReturnType<typeof fantasyCard>): TurnReply => ({
    addressed: true,
    line,
    url: base + card.path,
    card: { kicker: (card.kicker + " \u00b7 " + card.league).toUpperCase(), title: card.title, sub: card.sub, path: card.path },
  });
  const latest = store.latestFantasy ? store.fantasy[store.latestFantasy] : null;

  if (/fantasy/.test(lower) && (input.fantasyTopic || /(start|create|make|new|set ?up|run|open|draft|do)\b/.test(lower))) {
    const [head, list] = text.split(/:\s*/, 2);
    const topic = input.fantasyTopic ?? head.match(/\b(?:for|about|of|on)\s+(.+)$/i)?.[1] ?? head.replace(/.*fantasy\s*(league)?/i, "");
    const cleanTopic = topic.replace(/\b(league|draft|please)\b/gi, "").replace(/[.!?]+$/, "").trim() || "anything";
    const picks = input.fantasyPicks?.length ? input.fantasyPicks : list ? list.split(/,|\n|\band\b/).map((s) => s.trim()).filter(Boolean) : [];
    const league = createFantasy(cleanTopic, picks, sender);
    return reply("Fantasy " + league.topic + " is open. Draft " + league.rosterSize + " each.", fantasyCard(league));
  }

  if (latest) {
    const score = text.match(/([+-]\s?\d{1,3})/);
    const pick = score && latest.pool.find((p) => lower.includes(p.name.toLowerCase()));
    if (score && pick) {
      const delta = Number(score[1].replace(/\s/g, ""));
      scorePick(latest.id, pick.name, delta, sender);
      const top = fantasyStandings(latest)[0];
      return reply(pick.name + " " + (delta > 0 ? "+" : "") + delta + ". " + (top.points ? top.member + " leads Fantasy " + latest.topic + "." : "Nobody has drafted " + pick.name + " yet."), fantasyCard(latest));
    }
    if (/fantasy/.test(lower)) return reply("Fantasy " + latest.topic + " standings.", fantasyCard(latest));
  }

  const asked = (input.game ?? "").toLowerCase();
  const game: Round["game"] = asked === "wordle" || asked === "krillion" || asked === "rps" ? asked : /word/.test(lower) ? "wordle" : /krill/.test(lower) ? "krillion" : /rock|paper|scissors|rps/.test(lower) ? "rps" : /challenge|\bvs\b|versus|against|1v1/.test(lower) ? "rps" : "wordle";
  const skip = new Set(["between", "me", "and", "to", "a", "an", "the", "with", "my", "us", "him", "her", "them", "nickel", "for", "in", "at"]);
  const afterVerb = text.match(/(?:challenge|vs\.?|versus|against|between|and)\s+(.+)$/i)?.[1] ?? "";
  const opponent = person(input.opponent) || person(afterVerb.split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, "")).find((w) => w && !skip.has(w.toLowerCase())));
  if (opponent && /challenge|\bvs\b|versus|against|1v1|between/.test(lower + (input.opponent ? " challenge" : ""))) {
    const round = createRound(game, sender, opponent);
    return reply(sender ? sender + " challenged " + opponent + " to " + round.title + "." : opponent + ", you have been challenged to " + round.title + ".", roundCard(round));
  }
  if (/play|today|game|word|krill|rock|rps|deal|start/.test(lower)) {
    const round = game === "wordle" && !/new/.test(lower) ? getRound("wordle-212")! : createRound(game, sender, "");
    return reply(round.title + " is open. " + (round.seconds ?? 30) + " seconds.", roundCard(round));
  }
  return { addressed: true, line: "Say: challenge Maya, play wordle, or start a fantasy league for anything." };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const HUES = ["#0a84ff", "#ff9f0a", "#30d158", "#bf5af2", "#ff375f", "#40c8e0", "#5e5ce6"];

export function cardSvg(card: { kicker: string; title: string; sub: string; league: string; members: string[]; hue: string }): string {
  const size = card.title.length > 22 ? 76 : card.title.length > 15 ? 96 : 120;
  const faces = card.members.slice(0, 6).map((m, i) => {
    const cx = 132 + i * 68;
    return '<circle cx="' + cx + '" cy="470" r="30" fill="' + HUES[i % HUES.length] + '" stroke="#ffffff" stroke-width="4"/><text x="' + cx + '" y="480" text-anchor="middle" font-family="Inter" font-weight="600" font-size="26" fill="#ffffff">' + esc(m[0]) + "</text>";
  }).join("");
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs>' +
    '<radialGradient id="g" cx="50%" cy="-10%" r="90%"><stop offset="0" stop-color="' + card.hue + '" stop-opacity="0.38"/><stop offset="0.7" stop-color="' + card.hue + '" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3395ff"/><stop offset="1" stop-color="#007aff"/></linearGradient></defs>' +
    '<rect width="1200" height="630" fill="#f2f2f7"/><rect width="1200" height="630" fill="url(#g)"/>' +
    '<rect x="56" y="56" width="1088" height="518" rx="44" fill="#ffffff"/>' +
    '<text x="104" y="136" font-family="Inter" font-weight="600" font-size="24" letter-spacing="2.5" fill="#6c6c70">' + esc((card.kicker + " \u00b7 " + card.league).toUpperCase()) + "</text>" +
    '<rect x="104" y="164" width="72" height="8" rx="4" fill="' + card.hue + '"/>' +
    '<text x="100" y="' + (220 + size * 0.86) + '" font-family="Inter" font-weight="600" font-size="' + size + '" letter-spacing="-3" fill="#1c1c1e">' + esc(card.title) + "</text>" +
    '<text x="104" y="392" font-family="Inter" font-size="32" fill="#6c6c70">' + esc(card.sub) + "</text>" +
    faces +
    '<rect x="884" y="434" width="212" height="76" rx="38" fill="url(#b)"/><text x="990" y="483" text-anchor="middle" font-family="Inter" font-weight="600" font-size="30" fill="#ffffff">Open</text>' +
    "</svg>"
  );
}

let render: ((svg: string) => Uint8Array) | null = null;
export async function cardPng(card: Parameters<typeof cardSvg>[0]): Promise<Uint8Array> {
  if (!render) {
    const { Resvg } = await import("@resvg/resvg-js");
    const dir = new URL("./fonts/", import.meta.url).pathname;
    const fontFiles = ["Inter-Regular.otf", "Inter-SemiBold.otf"].map((f) => dir + f);
    render = (svg) => new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Inter" } }).render().asPng();
  }
  return render(cardSvg(card));
}
