import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { hubCard, hubLine, hubTurn, notePicks, renamePlayer, wantsHub } from "./hub.js";
import { scoreResult, type Points, type ResultPayload } from "./points.js";
import { customScore, customTurn, leagueIsClosed, punishmentPool, type PreparedTurn } from "./custom.js";
import { ALL_PUNISHMENTS } from "./punishments.js";
import { attachAuth, claimPath, nameClaimed, type AuthStore } from "./auth.js";
import { renameWallet, walletTurn } from "./wallet.js";
import { demoMode, roster, rosterNames } from "./roster.js";
import { ARCADE, arcadeGame, arcadeSubmission, arcadeView, createArcade, isArcadeGame, type ArcadeGame, type ArcadeReply } from "./arcade.js";
import { renderChatCard, renderPersonCard } from "./card-art.js";
import { attachLive, liveTopicRefusal, liveTurn, openLiveLeague, type LiveData, type LivePick, type LiveAward } from "./live.js";

export interface Round {
  id: string;
  game: "wordle" | "krillion" | "rps" | "custom" | ArcadeGame;
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
  pool: ({ name: string; points: number; owner: string | null } & LivePick)[];
  log: ({ pick: string; delta: number; by: string; at: number } & LiveAward)[];
  createdBy: string;
  live?: LiveData;
}

export interface TurnReply {
  addressed: boolean;
  images?: string[];
  art?: { token: string; role: string };
  react?: { emoji: string; tapback: "dislike" | "laugh" | "question" };
  roast?: string;
  pay?: { amountCents: number; memo: string };
  line?: string;
  url?: string;
  card?: { kicker: string; title: string; sub: string; path: string };
  presentation?: { type: "app"; id: string; url: string; caption: string; subcaption: string };
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
const store: { rounds: Record<string, Round>; fantasy: Record<string, FantasyLeague>; latestFantasy: string | null; names: Record<string, string>; nickels: Record<string, number>; results: { roundId: string; name: string; line: string; at: number; loser?: string; roasted?: boolean }[]; quips: number; art: Record<string, number>; nudged: Record<string, string>; profiles: Record<string, Profile>; pots: Record<string, Pot>; latestPot: string | null; stats: Record<string, { played: number; wins: number; losses: number }>; punishment: string | null } = existsSync(dataFile)
  ? JSON.parse(readFileSync(dataFile, "utf8"))
  : { rounds: {}, fantasy: {}, latestFantasy: null, names: {}, nickels: {}, results: [], pots: {}, latestPot: null, stats: {}, punishment: null, quips: 0, profiles: {}, nudged: {}, art: {} };
store.names ??= {};
store.nickels ??= {};
store.results ??= [];
store.pots ??= {};
store.latestPot ??= null;
store.stats ??= {};
store.punishment ??= null;
store.quips ??= 0;
store.art ??= {};
store.nudged ??= {};
store.profiles ??= {};
attachAuth(() => store, () => {
  for (const session of Object.values((store as typeof store & AuthStore).auth?.sessions ?? {})) {
    const profile = store.profiles[session.token];
    if (profile) profile.claimedAt ??= session.at;
  }
  save();
});
attachLive(() => store.fantasy, save);

function save() {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(dataFile, JSON.stringify(store));
  if (convex) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => convex.mutation(statePut, { key: "store", json: JSON.stringify(store), secret: process.env.NICKEL_SYNC_SECRET }).catch((e) => console.error("Convex sync failed", e)), 300);
  }
}

const newId = (prefix: string) => prefix + "-" + Math.random().toString(36).slice(2, 7);
const cap = (s: string) => (typeof s === "string" ? s : "").trim().replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase());
const person = (raw: unknown) => {
  const clean = (typeof raw === "string" ? raw : "").replace(/[^A-Za-z]/g, "").slice(0, 14);
  return clean ? clean[0].toUpperCase() + clean.slice(1).toLowerCase() : "";
};
const group = () => (demoMode() ? MEMBERS : rosterNames());
const withMember = (name: string, base = group()) => (name && !base.includes(name) ? [...base, name] : base);
export const internals = { store, save, person };

export function getRound(id: string): Round | null {
  if (store.rounds[id]) return store.rounds[id];
  if (!seedRounds[id]) return null;
  const seed = seedRounds[id];
  if (demoMode()) return { id, ...seed } as Round;
  const { mine, ...round } = seed;
  return { id, ...round, members: rosterNames(), ...(seed.opponent ? { opponent: "Nickel" } : {}), ...(seed.board ? { played: [], board: [] } : {}) } as Round;
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
  if (leagueIsClosed(league)) return { ok: false, error: "This league's season has ended" };
  if (league.live?.status === "refused") return { ok: false, error: league.live.lastMessage };
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
  const pick = typeof pickName === "string" ? league?.pool.find((p) => p.name.toLowerCase() === pickName.trim().toLowerCase()) : undefined;
  if (!league || !pick || !Number.isFinite(delta) || Math.abs(delta) > 100) return { ok: false, error: "Not found" };
  if (leagueIsClosed(league)) return { ok: false, error: "This league's season has ended" };
  if (league.live?.status === "refused") return { ok: false, error: league.live.lastMessage };
  pick.points += Math.round(delta);
  league.log.push({ pick: pick.name, delta: Math.round(delta), by: person(by) || "Someone", at: Date.now() });
  save();
  return { ok: true, league };
}

export function createFantasy(topic: string, picks: string[], sender: string): FantasyLeague {
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
  void openLiveLeague(league);
  return league;
}

function createRound(game: Round["game"], sender: string, opponent: string): Round {
  const members = withMember(opponent).concat(sender && !withMember(opponent).includes(sender) ? [sender] : []);
  const base = { league: LEAGUE_NAME, members, closes: "9:00 PM", challenger: sender || undefined };
  let round: Round;
  if (isArcadeGame(game)) {
    round = { id: newId(game), game, ...createArcade(game), opponent: opponent || undefined, ...base };
  } else if (game === "rps") {
    const hands = ["rock", "paper", "scissors"];
    round = { id: newId("rps"), game, title: "Rock Paper Scissors", opponent: opponent || (demoMode() ? "Dev" : "Nickel"), bestOf: 3, stake: 5, devMoves: Array.from({ length: 5 }, () => hands[Math.floor(Math.random() * 3)]), ...base };
  } else if (game === "krillion") {
    round = { id: newId("krill"), game, title: "One in a Krillion", number: 88 + Object.keys(store.rounds).length, prompt: PROMPTS[Math.floor(Math.random() * (process.env.NACE_API_KEY ? PROMPTS.length : 1))], seconds: 25, opponent: opponent || undefined, ...base };
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
    hue: isArcadeGame(round.game) ? ARCADE[round.game].hue : round.game === "wordle" ? "#ff9500" : round.game === "krillion" ? "#0f9fbf" : "#5856d6",
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


export interface Pot {
  id: string;
  amountCents: number;
  league: string;
  proposer: string;
  members: Record<string, "in" | "paid">;
  createdAt: number;
}

export function getPot(id: string): Pot | null {
  return store.pots[id] ?? null;
}

const dollars = (cents: number) => "$" + (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));

export function potSummary(pot: Pot) {
  const names = Object.keys(pot.members);
  const paid = names.filter((n) => pot.members[n] === "paid");
  return { names, paid, committedCents: names.length * pot.amountCents, paidCents: paid.length * pot.amountCents };
}

export function joinPot(id: string, member: string, state: "in" | "paid"): { ok: boolean; pot?: Pot; error?: string } {
  const pot = store.pots[id];
  const who = person(member);
  if (!pot || !who) return { ok: false, error: "Not found" };
  if ((pot as Pot & { settled?: boolean }).settled) return { ok: false, error: "That pot is settled" };
  if (pot.members[who] !== "paid") pot.members[who] = state;
  save();
  return { ok: true, pot };
}


export function potCard(pot: Pot) {
  const s = potSummary(pot);
  return {
    kicker: "Buy-in",
    title: dollars(pot.amountCents) + " buy-in",
    sub: s.names.length + " in for a " + dollars(s.committedCents) + " pot. " + s.paid.length + " paid.",
    league: pot.league,
    members: s.names.length ? s.names : group(),
    hue: "#34c759",
    path: "/p/" + pot.id,
  };
}

function potTurn(text: string, lower: string, sender: string): { line: string; pot: Pot | null; pay?: { amountCents: number; memo: string } } | null {
  const open = store.latestPot ? store.pots[store.latestPot] : null;
  const amount = lower.match(/\$\s?(\d{1,3}(?:\.\d{2})?)|(\d{1,3}(?:\.\d{2})?)\s?(?:dollars?|bucks)/);
  if (amount && /buy.?in|pot|stakes?|ante|put|throw|each/.test(lower)) {
    const cents = Math.round(Number(amount[1] ?? amount[2]) * 100);
    if (cents < 100 || cents > 10000) return { line: "Buy-ins run from $1 to $100. Pick a number in there.", pot: null };
    const pot: Pot = { id: newId("pot"), amountCents: cents, league: LEAGUE_NAME, proposer: sender || "Someone", members: sender ? { [sender]: "in" } : {}, createdAt: Date.now() };
    store.pots[pot.id] = pot;
    store.latestPot = pot.id;
    save();
    return { line: (sender || "Someone") + " proposed a " + dollars(cents) + " buy-in. Say \"Nickel, I'm in\" to agree. The buy-in comes out of your wallet.", pot };
  }
  if (!open) return /buy.?in|\bpot\b|pay ?out|payout|who'?s in|who paid|\b(i'?m in|im in|count me in)\b/.test(lower) ? { line: "No buy-in yet. Say: Nickel, $5 buy-in.", pot: null } : null;
  if (/\b(i'?m in|im in|count me in|i agree|agreed|i'?m down|im down|deal me in|lock me in)\b/.test(lower)) {
    if (!sender) return { line: "Tell me your name first: Nickel, I'm Sritej. Then say you are in.", pot: open };
    const was = open.members[sender];
    const joined = joinPot(open.id, sender, "in");
    if (!joined.ok) return { line: "That pot is closed. Say: Nickel, $5 buy-in.", pot: null };
    const s = potSummary(open);
    return { line: was === "paid" ? sender + " already paid. " + s.names.length + " in, " + dollars(s.committedCents) + " pot." : sender + " is in. Tap the card to pay " + dollars(open.amountCents) + " from your Nickel balance. " + s.names.length + " in, " + dollars(s.committedCents) + " pot.", pot: open };
  }
  if (/buy.?in|\bpot\b|who'?s in|who paid|pay ?out|payout/.test(lower)) {
    const s = potSummary(open);
    const owes = s.names.filter((n) => open.members[n] !== "paid");
    return { line: dollars(open.amountCents) + " buy-in. " + s.names.length + " in, " + dollars(s.paidCents) + " of " + dollars(s.committedCents) + " paid." + (owes.length ? " Still owed: " + owes.join(", ") + "." : s.names.length ? " Everyone has paid." : ""), pot: open };
  }
  return null;
}


export const PUNISHMENTS = ALL_PUNISHMENTS;

const TITLES = ["Front runner", "Closing fast", "Mid-table merchant", "Vibes only", "Down bad", "Paying for dinner"];


export const COMEBACKS = [
  "The fuck do you mean by that?",
  "Read that back to yourself. Slowly.",
  "I run a league, I do not read minds.",
  "That was a sentence, technically.",
  "Say it again, but like a person this time.",
];
export const CLAPBACKS = [
  "Bold talk from someone whose Nickels I control.",
  "Noted. The commissioner has a long memory.",
  "Say that again after you win one.",
  "Cry about it in the standings.",
  "I have seen your record. Sit down.",
];
export const EXCUSES = [
  "Skill issue. The result stands.",
  "It is not rigged. You are just losing.",
  "Appeal denied. The commissioner reviewed nothing.",
  "Lag does not explain all of that.",
];
export const ROASTS = [
  "Thoughts and prayers for NAME.",
  "NAME may want to sit the next one out.",
  "Somebody check on NAME.",
  "NAME is making the punishment feel personal.",
  "A moment of silence for NAME.",
];
const quip = (list: string[]) => list[store.quips++ % list.length];


export interface Profile { token: string; phone?: string; name: string; account?: string; photo?: string; createdAt: number; claimedAt?: number }
const publicProfile = (p: Profile) => ({ token: p.token, name: p.name, account: p.account ?? "", face: p.photo ? "/face/" + p.token + "?v=" + p.photo.length : null });

export function profileFor(phone: string, name: string): Profile {
  const found = Object.values(store.profiles).find((p) => (phone ? p.phone === phone : !p.phone && !!name && p.name === name));
  if (found) {
    if (name && !found.name) found.name = name;
    return found;
  }
  const profile: Profile = { token: newId("me") + Math.random().toString(36).slice(2, 8), phone: phone || undefined, name, createdAt: Date.now() };
  store.profiles[profile.token] = profile;
  save();
  return profile;
}

export const getProfile = (token: string) => (store.profiles[token] ? publicProfile(store.profiles[token]) : null);

export function saveProfile(token: string, body: { name?: string; account?: string; photo?: string }): { ok: boolean; error?: string; profile?: ReturnType<typeof publicProfile> } {
  const profile = store.profiles[token];
  if (!profile) return { ok: false, error: "That link is not a player card." };
  const name = person(body.name);
  if (!name) return { ok: false, error: "Add your first name." };
  if (body.photo !== undefined && !(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.photo) && body.photo.length < 300000)) return { ok: false, error: "That photo did not work. Try another." };
  const old = profile.name;
  profile.name = name;
  if (old && old !== name && !Object.values(store.profiles).some((p) => p.name === old)) {
    if (old in store.nickels) store.nickels[name] = (store.nickels[name] ?? 0) + store.nickels[old];
    const was = store.stats[old];
    const now = was ? (store.stats[name] ??= { played: 0, wins: 0, losses: 0 }) : null;
    if (was && now) for (const key of ["played", "wins", "losses"] as const) now[key] += was[key];
    delete store.nickels[old];
    delete store.stats[old];
    renameWallet(old, name);
    renamePlayer(old, name);
    const replace = (text: string) => text.replace(new RegExp("\\b" + old + "\\b", "g"), name);
    for (const result of store.results) {
      if (result.name === old) result.name = name;
      if (result.loser === old) result.loser = name;
      result.line = replace(result.line);
      const players = (result as typeof result & { players?: string[] }).players;
      if (players) players.splice(0, players.length, ...players.map((p) => p === old ? name : p));
    }
    for (const round of Object.values(store.rounds)) {
      round.members = [...new Set(round.members.map((p) => p === old ? name : p))];
      if (round.challenger === old) round.challenger = name;
      if (round.opponent === old) round.opponent = name;
    }
    for (const league of Object.values(store.fantasy)) {
      league.members = [...new Set(league.members.map((p) => p === old ? name : p))];
      if (league.createdBy === old) league.createdBy = name;
      for (const pick of league.pool) if (pick.owner === old) pick.owner = name;
      for (const entry of league.log) if (entry.by === old) entry.by = name;
    }
    for (const pot of Object.values(store.pots)) {
      if (pot.proposer === old) pot.proposer = name;
      if (pot.members[old]) { pot.members[name] = pot.members[old]; delete pot.members[old]; }
      const saved = pot as Pot & { winner?: string; paidAt?: Record<string, number> };
      if (saved.winner === old) saved.winner = name;
      if (saved.paidAt?.[old]) { saved.paidAt[name] = saved.paidAt[old]; delete saved.paidAt[old]; }
    }
    if (store.nudged[old]) { store.nudged[name] = store.nudged[old]; delete store.nudged[old]; }
  }
  profile.account = String(body.account ?? profile.account ?? "").trim().slice(0, 40);
  if (body.photo) profile.photo = body.photo;
  if (profile.phone) store.names[profile.phone] = name;
  store.nickels[name] ??= 0;
  save();
  return { ok: true, profile: publicProfile(profile) };
}

export function facePhoto(token: string): { type: string; bytes: Uint8Array } | null {
  const match = store.profiles[token]?.photo?.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  return match ? { type: match[1], bytes: Buffer.from(match[2], "base64") } : null;
}

const faceOf = (name: string) => {
  const p = Object.values(store.profiles).find((x) => x.name === name && x.photo);
  return p ? publicProfile(p).face : null;
};

export function profileCard(p: { token: string; name: string }) {
  return { kicker: "Player card", title: p.name ? p.name + "'s card" : "Your player card", sub: "Name and photo. One time.", league: LEAGUE_NAME, members: p.name ? [p.name] : [], hue: "#30d158", path: "/me/" + p.token };
}

const convexUrl = process.env.CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;
const stateGet = makeFunctionReference<"query", { key: string }, string | null>("league:get");
const statePut = makeFunctionReference<"mutation", { key: string; json: string; secret?: string }, null>("league:put");
let syncTimer: ReturnType<typeof setTimeout> | undefined;

export async function hydrate(): Promise<"convex" | "file"> {
  if (!convex) return "file";
  const json = await convex.query(stateGet, { key: "store" });
  if (json) Object.assign(store, JSON.parse(json));
  else await convex.mutation(statePut, { key: "store", json: JSON.stringify(store), secret: process.env.NICKEL_SYNC_SECRET });
  store.art ??= {};
  for (const key of Object.keys(store.art)) {
    if (existsSync(artDir + "/" + key + ".jpg")) continue;
    const saved = await convex.query(stateGet, { key: "art:" + key });
    if (!saved) continue;
    mkdirSync(artDir, { recursive: true });
    writeFileSync(artDir + "/" + key + ".jpg", Buffer.from(saved, "base64"));
  }
  return "convex";
}

export function leaderboard(only?: string[]) {
  const signed = roster();
  const names = signed.demo ? [...new Set([...Object.keys(store.nickels), ...Object.values(store.names), ...Object.keys(store.stats), ...Object.values(store.profiles).map((p) => p.name).filter(Boolean)])] : signed.members.map((m) => m.name);
  const people = (only ?? (names.length ? names : group())).map((name) => {
    const stats = store.stats[name] ?? { played: 0, wins: 0, losses: 0 };
    const last = [...store.results].reverse().find((r) => r.name === name || new RegExp("\\b" + name + "\\b").test(r.line));
    return { name, nickels: store.nickels[name] ?? 0, ...stats, last: last?.line ?? "", face: signed.members.find((m) => m.name === name)?.face ?? (signed.demo ? faceOf(name) : null) };
  }).sort((a, b) => b.nickels - a.nickels || b.wins - a.wins || a.name.localeCompare(b.name));
  const pot = store.latestPot ? store.pots[store.latestPot] : null;
  const stakes = pot && Object.values(pot.members).filter((m) => m === "paid").length >= 2 ? "$" + pot.amountCents / 100 + " buy-in" : null;
  return {
    league: LEAGUE_NAME,
    stakes,
    punishment: stakes ? null : store.punishment,
    people: people.map((p, i) => ({ ...p, rank: i + 1, title: i === people.length - 1 && people.length > 1 ? TITLES[5] : TITLES[Math.min(i, 4)] })),
  };
}


const artDir = dataDir + "/art";
const artPending = new Set<string>();
const stock: Record<string, string> = {};
const stockArt = (role: string) => (stock[role] ??= "data:image/jpeg;base64," + readFileSync(new URL("../apps/preview/art/" + role + ".jpg", import.meta.url)).toString("base64"));
const tokenOf = (name: string) => (demoMode() ? Object.values(store.profiles).find((x) => x.name === name && x.photo)?.token : roster().members.find((m) => m.name === name && m.face)?.token) ?? "";
const ascending = () => {
  const board = leaderboard();
  const n = board.people.length;
  return [...board.people].reverse().map((p) => ({ ...p, n, role: p.rank === n && n > 1 ? "loser" : p.rank === 1 && n > 1 ? "winner" : "" }));
};

export async function generateArt(token: string, role: string) {
  const photo = store.profiles[token]?.photo;
  const openai = process.env.OPENAI_API_KEY, gemini = process.env.GEMINI_API_KEY, fal = process.env.FAL_KEY;
  if (!photo || (!openai && !gemini && !fal) || artPending.has(token + role)) return;
  artPending.add(token + role);
  const prompt = (role === "loser"
    ? "Redraw this exact person as a funny cartoon caricature ugly-crying dramatically: giant waterfalls of tears, red nose, wearing a white dunce cap, holding an empty wallet."
    : "Redraw this exact person as a smug cartoon caricature wearing a huge shiny gold crown and a royal red cape, arms crossed, sparkles around them.") +
    " Keep their face, hair and skin tone recognizable. Bold flat sticker illustration, thick outlines, bright colors, square portrait, plain pastel background, no text.";
  try {
    let bytes: Uint8Array | null = null;
    if (openai) {
      const [, mime, data] = photo.match(/^data:(image\/[a-z]+);base64,(.+)$/)!;
      const form = new FormData();
      form.set("model", process.env.NICKEL_IMAGE_MODEL ?? "gpt-image-2.6-flare");
      form.set("prompt", prompt);
      form.set("size", "1024x1024");
      form.set("quality", "low");
      form.set("image", new Blob([Buffer.from(data, "base64")], { type: mime }), "face." + mime.split("/")[1]);
      const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { authorization: "Bearer " + openai }, body: form });
      const out = (await res.json()) as { data?: { b64_json?: string }[]; error?: { message?: string } };
      if (!out.data?.[0]?.b64_json) throw new Error("OpenAI returned no image, status " + res.status + " " + (out.error?.message ?? ""));
      bytes = Buffer.from(out.data[0].b64_json, "base64");
    } else if (gemini) {
      const [, mime, data] = photo.match(/^data:(image\/[a-z]+);base64,(.+)$/)!;
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + (process.env.NICKEL_IMAGE_MODEL ?? "gemini-2.5-flash-image") + ":generateContent", { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": gemini }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data } }] }] }) });
      const out = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data: string }; inline_data?: { data: string } }[] } }[] };
      const b64 = out.candidates?.[0]?.content?.parts?.map((p) => p.inlineData?.data ?? p.inline_data?.data).find(Boolean);
      if (!b64) throw new Error("Gemini returned no image, status " + res.status);
      bytes = Buffer.from(b64, "base64");
    } else {
      const res = await fetch("https://fal.run/fal-ai/nano-banana/edit", { method: "POST", headers: { "content-type": "application/json", authorization: "Key " + fal }, body: JSON.stringify({ prompt, image_urls: [photo] }) });
      const out = (await res.json()) as { images?: { url: string }[] };
      if (!out.images?.[0]?.url) throw new Error("fal returned no image, status " + res.status);
      bytes = new Uint8Array(await (await fetch(out.images[0].url)).arrayBuffer());
    }
    if (store.profiles[token]?.photo !== photo) return;
    const flat = spawnSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "color=white:s=640x640", "-i", "pipe:0", "-filter_complex", "[1]scale=640:640[a];[0][a]overlay", "-frames:v", "1", "-q:v", "5", "-f", "mjpeg", "pipe:1"], { input: bytes, maxBuffer: 20000000 });
    if (flat.status !== 0 || flat.stdout.length < 500) throw new Error("Portrait resize failed: " + flat.stderr);
    mkdirSync(artDir, { recursive: true });
    writeFileSync(artDir + "/" + token + "-" + role + ".jpg", flat.stdout);
    store.art[token + "-" + role] = Date.now();
    save();
    if (convex) await convex.mutation(statePut, { key: "art:" + token + "-" + role, json: flat.stdout.toString("base64"), secret: process.env.NICKEL_SYNC_SECRET });
  } catch (e) {
    console.error("Portrait generation failed", e);
  } finally {
    artPending.delete(token + role);
  }
}


export function setPhoto(phone: string, name: string, photo: string): Profile {
  const profile = profileFor(phone, person(name) || (phone ? store.names[phone] ?? "" : ""));
  profile.photo = photo;
  for (const role of ["loser", "winner"]) {
    rmSync(artDir + "/" + profile.token + "-" + role + ".jpg", { force: true });
    delete store.art[profile.token + "-" + role];
  }
  save();
  return profile;
}

const dayKey = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

export function idleStakes(now = Date.now()): { name: string; phone: string; text: string }[] {
  const pot = store.latestPot ? store.pots[store.latestPot] : null;
  if (!pot) return [];
  const today = store.results.filter((r) => dayKey(r.at) === dayKey(now));
  return Object.keys(pot.members)
    .filter((name) => pot.members[name] === "paid" && !today.some((r) => r.name === name || r.loser === name || r.line.includes(name)))
    .map((name) => ({ name, phone: Object.keys(store.names).find((p) => store.names[p] === name) ?? "", text: name + ", you have " + dollars(pot.amountCents) + " in the pot and you have not played today. Play before midnight or it is up for grabs." }));
}

export function dueNudges(now = Date.now()) {
  const due = idleStakes(now).filter((n) => store.nudged[n.name] !== dayKey(now));
  for (const n of due) store.nudged[n.name] = dayKey(now);
  if (due.length) save();
  return due;
}


export async function researchPunishment(request: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({
        model: process.env.NICKEL_RESEARCH_MODEL ?? "gpt-5.4-mini",
        tools: [{ type: "web_search" }],
        input: "Search the web for real last place punishments that friend groups and fantasy leagues actually do (Reddit threads, league blogs). Pick ONE that is genuinely funny and publicly embarrassing, that fits this request from the group chat: \"" + request.slice(0, 200) + "\". It must be legal, safe, and not permanent: no tattoos, no alcohol, nothing sexual, nothing dangerous. Do not pick any of these: " + [store.punishment, ...PUNISHMENTS.slice(0, 6)].filter(Boolean).join("; ") + ". Reply with only the punishment, starting with a third-person singular verb such as wears, runs or performs, so it completes the sentence \"Last place ...\", under 110 characters, no emojis, no quotes, no period.",
      }),
      signal: AbortSignal.timeout(25000),
    });
    const out = (await res.json()) as { output?: { type: string; content?: { text?: string }[] }[] };
    const text = out.output?.filter((o) => o.type === "message").flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join(" ").trim() ?? "";
    const phrase = text.replace(/^["'\s]*(last place|the loser)\s+/i, "").replace(/\(?\[[^\]]*\]\([^)]*\)\)?/g, "").replace(/["'.!\s]+$/, "").replace(/\s+/g, " ").trim();
    return phrase.length >= 6 && phrase.length <= 160 ? phrase[0].toLowerCase() + phrase.slice(1) : null;
  } catch (e) {
    console.error("Punishment research failed", e);
    return null;
  }
}

export function ensureArt() {
  for (const p of ascending()) {
    const token = tokenOf(p.name);
    if (p.role && token && !existsSync(artDir + "/" + token + "-" + p.role + ".jpg")) void generateArt(token, p.role);
  }
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "\u2026" : s);

export function leaderboardImages(): string[] {
  const board = leaderboard();
  const version = [...JSON.stringify([board.people.map((p) => [p.name, p.nickels, p.face]), board.punishment, board.stakes, ascending().map((p) => existsSync(artDir + "/" + tokenOf(p.name) + "-" + p.role + ".jpg"))])].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
  return board.people.slice(0, 8).map((_, i) => "/card/l/" + i + ".png?v=" + version);
}

export function personCardSvg(index: number, as?: { token: string; role: string }): string | null {
  const owner = as ? store.profiles[as.token] : null;
  const found = as ? (owner ? ascending().find((x) => x.name === owner.name) ?? { name: owner.name || "You", nickels: 0, played: 0, wins: 0, losses: 0, last: "", face: null, rank: 1, n: 1, title: "", role: "" } : undefined) : ascending()[index];
  if (!found) return null;
  const p = as ? { ...found, role: as.role, title: as.role === "loser" ? "If the season ended badly" : "If the season ended well" } : found;
  const board = leaderboard();
  const token = tokenOf(p.name);
  const aiFile = artDir + "/" + token + "-" + p.role + ".jpg";
  const ai = p.role && token && existsSync(aiFile) ? "data:image/jpeg;base64," + readFileSync(aiFile).toString("base64") : "";
  const photo = token ? store.profiles[token].photo! : "";
  const src = ai || photo || (p.role ? stockArt(p.role) : "");
  const foot = p.role === "loser"
    ? board.stakes ? "Last place. Out " + board.stakes + "." : board.punishment ? "Last place " + clip(board.punishment.split(":")[0], 44) + "." : "Last place. Punishment pending."
    : clip(p.last || p.title, 52);
  return renderPersonCard({ ...p, league: board.league, foot, image: src });
}

export async function personCardPng(index: number, as?: { token: string; role: string }): Promise<Uint8Array | null> {
  const svg = personCardSvg(index, as);
  if (!svg) return null;
  if (!render) await cardPng(leaderboardCard());
  return render!(svg);
}

export function leaderboardCard() {
  const board = leaderboard();
  const top = board.people[0];
  const last = board.people[board.people.length - 1];
  return {
    kicker: "Leaderboard",
    title: top && top.nickels > 0 ? top.name + " leads" : "Leaderboard",
    sub: !top ? "Nobody has joined yet." : store.punishment ? "Last place " + store.punishment.split(":")[0] + ". Right now: " + last.name + "." : top.nickels > 0 ? top.name + " is up " + top.nickels + " Nickels." : "Nobody has scored yet.",
    league: LEAGUE_NAME,
    members: board.people.map((p) => p.name),
    hue: "#ff9500",
    path: "/l",
  };
}

function setPunishment(text: string): string {
  const custom = text.match(/punishment\s*(?:is|:|=)\s*(.{6,160})$/i)?.[1]?.trim().replace(/[.!]+$/, "");
  if (custom) store.punishment = custom.replace(/^(last place|loser)\s+/i, "");
  else {
    const pool = punishmentPool().filter((p) => p !== store.punishment);
    store.punishment = pool[Math.floor(Math.random() * pool.length)];
  }
  save();
  return store.punishment!;
}

export function recordResult(roundId: string, payload: ResultPayload & { verified?: boolean }): ArcadeReply {
  const round = getRound(roundId);
  const name = person(payload.name);
  if (!round || !name) return { ok: false };
  if (isArcadeGame(round.game)) {
    const checked = arcadeSubmission(round, name, payload, store.results, save);
    if ("reply" in checked) return checked.reply;
    payload = { ...payload, arcadeOutcome: checked.outcome, seconds: checked.seconds, tries: checked.outcome.won ? "1/1" : "X/1" };
  }
  const done: { line: string; points?: Points } | undefined = store.results.find((r) => r.roundId === roundId && (r.name === name || (round.game === "rps" && (r as typeof r & { players?: string[] }).players?.includes(name))));
  if (done) return { ok: true, line: done.line, points: done.points };
  if (round.closed || (round.game === "wordle" && !/^(?:[1-6]|X)\/6$/i.test(String(payload.tries ?? "X/6"))) || (payload.seconds !== undefined && (!Number.isFinite(payload.seconds) || payload.seconds < 0)) || (payload.rarity !== undefined && (!Number.isInteger(payload.rarity) || payload.rarity < 0 || payload.rarity > 5))) return { ok: false };
  const foe = typeof round.opponent === "string" ? round.opponent : payload.opponent;
  const rival = person(foe === name ? (typeof round.challenger === "string" ? round.challenger : "") : foe);
  if (round.game === "rps" && (!rival || rival === name || (round.challenger && name !== round.challenger && name !== round.opponent) || (payload.verified === false && nameClaimed(rival)))) return { ok: false };
  const bump = (who: string, delta: number) => { if (who) store.nickels[who] = (store.nickels[who] ?? 0) + delta; };
  const tally = (who: string, won: boolean) => { if (!who) return; const t = (store.stats[who] ??= { played: 0, wins: 0, losses: 0 }); t.played += 1; if (won) t.wins += 1; else t.losses += 1; };
  const custom = customScore(round, name);
  if (round.game === "custom" && !custom) return { ok: false };
  const scored = custom ?? scoreResult(round, payload, { name, rival }, store);
  const line = scored.line;
  let loser = "";
  if (round.game === "rps") {
    loser = payload.won ? rival : name;
    bump(name, payload.won ? scored.total : -scored.moved);
    bump(rival, payload.won ? -scored.moved : scored.total);
    tally(name, !!payload.won);
    tally(rival, !payload.won);
  } else {
    const solved = !/x/i.test(String(payload.tries ?? "X"));
    bump(name, scored.total);
    tally(name, solved);
    if (!solved) loser = name;
  }
  notePicks(name, payload);
  store.results.push({ roundId, name, line, at: Date.now(), loser: loser || undefined, ...scored.record, ...(payload.verified === true ? {} : { unverified: true }) });
  save();
  return { ok: true, line, points: scored.points, ...(isArcadeGame(round.game) ? arcadeView(round, name, store.results) : {}) };
}

export function nickelStandings(): string {
  const rows = Object.entries(store.nickels).sort((a, b) => b[1] - a[1]);
  return rows.length ? "Nickels: " + rows.slice(0, 6).map(([who, n]) => who + " " + (n > 0 ? "+" : "") + n).join(", ") + "." : "No Nickels have moved yet. First to finish a game takes the lead.";
}

export function handleTurn(input: { text: string; sender?: string; senderPhone?: string; baseUrl: string; fantasyTopic?: string; fantasyPicks?: string[]; opponent?: string; game?: string; hasPhoto?: boolean; trusted?: boolean; customPrepared?: PreparedTurn }): TurnReply {
  const text = input.text.trim();
  const lower = text.toLowerCase();
  if (!/(^|[^a-z])@?nickel([^a-z]|$)/.test(lower)) return { addressed: false };
  const contact = (input.senderPhone ?? "").replace(/[^+0-9]/g, "");
  if (contact) profileFor(contact, store.names[contact] ?? "");
  const roast = [...text.matchAll(/\b(?:roast|make fun of|mock|clown|drag|trash[- ]?talk)\s+([a-z]+)/gi)].at(-1);
  if (roast && !/\b(?:don'?t|do not|stop|quit|never)\b[^.!?]{0,25}\b(?:roast|make fun of|mock|clown|drag|trash[- ]?talk)\b/i.test(text)) {
    const requested = person(roast[1]);
    const pronouns = new Set(["Him", "Her", "Them", "Us", "Everyone", "Everybody", "Me", "Myself", "You", "Yourself", "Nickel"]);
    const named = [...new Set([...rosterNames(), ...Object.values(store.names), ...Object.values(store.profiles).map((p) => p.name)])].find((name) => name && !pronouns.has(name) && new RegExp("\\b" + name + "\\b", "i").test(text));
    const target = /^(Me|Myself)$/.test(requested) ? person(input.sender) || store.names[contact] : /^(You|Yourself|Nickel)$/.test(requested) ? "Nickel" : pronouns.has(requested) ? named : requested;
    if (!target) return { addressed: true, line: "Who am I roasting? Give me a name. No game required." };
    const lines = [
      "NAME talks a lot of shit for someone whose strongest move is opening the chat.",
      "NAME has main-character confidence and loading-screen energy.",
      "NAME treats losing like a software bug. The bug is not in the software.",
      "NAME brought a press conference to a group chat. Nobody asked for the postgame analysis.",
      "NAME is putting up historic numbers in excuses per minute.",
      "NAME has the confidence of someone who has never read the instructions. Or the room.",
    ];
    const line = quip(lines).replace("NAME", target);
    save();
    return { addressed: true, line };
  }
  const current = liveTurn(text, input.baseUrl);
  if (current) return current;
  const walletReply = walletTurn(input);
  if (walletReply) return walletReply;
  const hubReply = hubTurn(input);
  if (hubReply) return hubReply;
  const customReply = customTurn(input);
  if (customReply) return customReply;
  const fantasyTalk = /fantasy/.test(lower) && !/punish/.test(lower);
  const phone = (input.senderPhone ?? "").replace(/[^+0-9]/g, "");
  const intro = person(text.match(/\b(?:i'?m|i am|this is|call me|my name is|it'?s)\s+([A-Za-z]{2,14})\b/i)?.[1]);
  const known = person(input.sender) || (phone ? store.names[phone] ?? "" : "");
  const introduced = input.trusted !== false && intro && (!known || /\b(call me|my name is)\b/i.test(text)) && !["Down", "In", "Ready", "Up", "Here", "Back", "Game", "Not", "So", "Good", "The", "A", "Done", "Out", "Sorry", "Over", "Rigged", "Bullshit", "Unfair", "Winning", "Losing", "Bored", "Broke", "Tired", "Busy", "Late", "Next", "Sure", "Fine", "Ok", "Okay", "Just", "Still", "Going", "Gonna", "Playing", "Paying", "Joking", "Kidding", "Confused", "On", "Off", "Too", "Really", "Very", "That", "This", "What", "Your", "You", "Me", "Nickel"].includes(intro) ? intro : "";
  if (introduced && phone) {
    store.names[phone] = introduced;
    save();
  }
  const sender = introduced || (phone ? store.names[phone] ?? "" : "") || person(input.sender);
  const base = input.baseUrl.replace(/\/+$/, "");
  const reply = (line: string, card: ReturnType<typeof roundCard> | ReturnType<typeof fantasyCard> | ReturnType<typeof potCard> | ReturnType<typeof leaderboardCard> | ReturnType<typeof profileCard>): TurnReply => ({
    addressed: true,
    line,
    url: base + card.path,
    card: { kicker: (card.kicker + " \u00b7 " + card.league).toUpperCase(), title: card.title, sub: card.sub, path: card.path },
    ...(base.startsWith("https://") && {
      presentation: {
        type: "app" as const,
        id: ("nickel-" + new Date().toISOString().slice(0, 10) + card.path.replace(/[^a-z0-9]+/gi, "-")).slice(0, 128),
        url: base + card.path,
        caption: card.title.slice(0, 60),
        subcaption: card.sub.slice(0, 80),
      },
    }),
  });
  const latest = store.latestFantasy ? store.fantasy[store.latestFantasy] : null;
  const claimCard = (p: Profile) => (input.trusted ? { ...profileCard(p), path: claimPath(p.token) } : profileCard(p));

  const wantsArt = /\b(image|picture|pic|photo|draw|show|generate|make)\b.*\b(me|i|myself|my)\b/.test(lower) && /\b(los\w*|last|cry\w*|win\w*|won|first|crown\w*|champ\w*|generate|draw)\b/.test(lower) && !/\bwho\b|standings|leaderboard/.test(lower);
  if (!wantsArt && !/challenge|fantasy|buy.?in|who won|standings|leaderboard|punish|loser has to|last place|\bplay\b|i'?m in\b|\$\d/.test(lower)) {
    if (/\b(you suck|u suck|sucks?|trash|garbage|stupid|dumb|idiot|shut up|stfu|fuck (you|u|off)|hate (you|u)|useless|the worst|clown|bozo|loser)\b/.test(lower)) {
      save();
      return { addressed: true, react: { emoji: "\u{1F595}", tapback: "dislike" }, line: quip(CLAPBACKS) };
    }
    if (/\b(rigged|cheat(ed|ing|er)?|lag(ged|gy)?|didn'?t count|not fair|unfair|robbed|bullshit|bs)\b/.test(lower)) {
      save();
      return { addressed: true, react: { emoji: "\u{1F602}", tapback: "laugh" }, line: quip(EXCUSES) };
    }
  }

  if (input.hasPhoto || wantsArt) {
    const mine = profileFor(phone, sender);
    if (!mine.photo) return reply("I need your face first. Text me a photo of yourself, or add one on your card.", claimCard(mine));
    const role = input.hasPhoto || /\b(win\w*|won|first|crown\w*|champ\w*)\b/.test(lower) ? "winner" : "loser";
    const who = mine.name || "you";
    return { addressed: true, art: { token: mine.token, role }, images: [base + "/card/me/" + mine.token + "/" + role + ".png?v=" + Date.now().toString(36)], line: input.hasPhoto ? (mine.name ? "Got it, " + mine.name + ". That face is on the leaderboard now. Here is you with the crown." : "Got the photo. Now tell me your name: Nickel, I'm Sritej.") : role === "loser" ? "Here is " + who + " in last place." : "Here is " + who + " with the crown." };
  }

  if (/hasn'?t played|haven'?t played|didn'?t play|not played|up for grabs|nudge|remind/.test(lower)) {
    const idle = idleStakes();
    if (!store.latestPot) return { addressed: true, line: "No buy-in yet, so nothing is up for grabs. Say: Nickel, $5 buy-in." };
    return { addressed: true, line: idle.length ? idle.map((n) => n.name).join(" and ") + (idle.length > 1 ? " have" : " has") + " money in the pot and has not played today. It is up for grabs at midnight.".replace(idle.length > 1 ? "has not" : "have not", "have not") : "Everyone with money in the pot has played today." };
  }

  if (/\b(invite|onboard|join code|connect|how (do|can|does) (we|i|they|you|everyone|people) (join|sign|get|connect|set)|add (everyone|everybody|the others|them|the rest))\b/.test(lower) && !/buy.?in/.test(lower)) {
    return { addressed: true, line: "Everyone: text " + (process.env.NICKEL_JOIN_CODE ?? "K-HQF6D6") + " to " + (process.env.NICKEL_LINE ?? "+1 (779) 625-1378") + ". That connects your number, and I will send your player card back. One time." };
  }

  if (/\b(profile|set ?me ?up|sign ?me ?up|sign ?up|add me|player card|my (photo|picture|pic|card|account))\b/.test(lower) && !/buy.?in/.test(lower)) {
    const mine = profileFor(phone, sender);
    return reply((sender ? sender + ", your" : "Your") + " player card: name and photo. One time, then every link opens as you.", claimCard(mine));
  }

  if (/\b(demo|fake|test|real|live|stripe)\b.*\bpay(ment)?s?\b|\bpay(ment)?s?\b.*\b(demo|fake|test|real|live|stripe)\b/.test(lower) && !/\$\s?\d/.test(lower)) {
    return { addressed: true, line: "Buy-ins come out of your Nickel balance. Add money in your wallet through Whop: " + base + "/wallet" };
  }

  const money = fantasyTalk ? null : potTurn(text, lower, sender);
  if (money) {
    if (!money.pot) return { addressed: true, line: money.line };
    const card = potCard(money.pot);
    return { ...reply(money.line, { ...card, path: card.path + (sender ? "?u=" + sender.toLowerCase() : "") }), pay: money.pay };
  }

  if (fantasyTalk && (input.fantasyTopic || /(start|create|make|new|set ?up|run|open|draft|do)\b|fantasy (league )?(for|about|of|on)\b/.test(lower))) {
    const [head, list] = text.split(/:\s*/, 2);
    const topic = input.fantasyTopic ?? head.match(/\b(?:for|about|of|on)\s+(.+)$/i)?.[1] ?? head.replace(/.*fantasy\s*(league)?/i, "");
    const cleanTopic = topic.replace(/\b(league|draft|please)\b/gi, "").replace(/[.!?]+$/, "").trim() || "anything";
    const refused = liveTopicRefusal(cleanTopic);
    if (refused) return { addressed: true, line: refused };
    const picks = input.fantasyPicks?.length ? input.fantasyPicks : list ? list.split(/,|\n|\band\b/).map((s) => s.trim()).filter(Boolean) : [];
    const league = createFantasy(cleanTopic, picks, sender);
    const board = league.pool.length ? league.pool.length + " on the board, draft " + league.rosterSize + " each." : "Write in your own picks, " + league.rosterSize + " each.";
    return reply("Fantasy " + league.topic + " is open. " + board + (process.env.OPENAI_API_KEY ? " Current picks and sources are loading on the page." : ""), fantasyCard(league));
  }

  if (latest) {
    const score = text.match(/([+-]\s?\d{1,3})/);
    const pick = score && latest.pool.find((p) => lower.includes(p.name.toLowerCase()));
    if (score && pick) {
      const delta = Number(score[1].replace(/\s/g, ""));
      const scored = scorePick(latest.id, pick.name, delta, sender);
      if (!scored.ok) return reply(scored.error === "Not found" ? "Scores move 100 points at a time at most. " + pick.name + " stays at " + pick.points + "." : scored.error ?? "Could not score that pick.", fantasyCard(latest));
      const top = fantasyStandings(latest)[0];
      const tail = !pick.owner ? "Nobody owns " + pick.name + " yet, so it is still up for grabs." : top.points > 0 ? top.member + " leads Fantasy " + latest.topic + " with " + top.points + "." : "Fantasy " + latest.topic + " is still wide open.";
      return reply(pick.name + " " + (delta > 0 ? "+" : "") + delta + ". " + tail, fantasyCard(latest));
    }
    if (fantasyTalk) {
      const top = fantasyStandings(latest)[0];
      return reply(top.points > 0 ? top.member + " leads Fantasy " + latest.topic + " with " + top.points + "." : "Fantasy " + latest.topic + ": nobody has scored yet.", fantasyCard(latest));
    }
  }

  if (wantsHub(lower)) {
    const card = hubCard(leaderboard());
    return reply(hubLine(sender), { ...card, path: card.path + (sender ? "?u=" + sender.toLowerCase() : "") });
  }

  if (/punish|loser has to|last place (has|does|gets)|reroll/.test(lower)) {
    const stakes = leaderboard().stakes;
    if (stakes) return { ...reply("This one is for money: " + stakes + ", so last place just loses it. Punishments are for games with no buy-in.", leaderboardCard()), images: leaderboardImages().map((p) => base + p) };
    const fresh = !store.punishment || /\b(new|another|reroll|different|change|worse)\b|punishment\s*(is|:|=)\s*.{6}/.test(lower);
    const what = fresh ? setPunishment(text) : store.punishment!;
    const board = leaderboard();
    const last = board.people[board.people.length - 1];
    const card = leaderboardCard();
    if (!last) return reply("Last place " + what + ". Nobody is on the board yet.", card);
    return reply("Last place " + what + ". Right now that is " + last.name + ".", { ...card, path: card.path + "?u=" + last.name.toLowerCase() });
  }

  if (/who won|who'?s winning|who'?s losing|results?\b|standings|leaderboard|score\b|rankings?/.test(lower)) {
    const lastResult = store.results[store.results.length - 1];
    const line = /standings|leaderboard|winning|losing|rank/.test(lower) || !lastResult ? nickelStandings() : lastResult.line + " " + nickelStandings();
    const out = reply(line, leaderboardCard());
    if (/standings|leaderboard|rank|winning|losing/.test(lower)) {
      ensureArt();
      out.images = leaderboardImages().map((p) => base + p);
    }
    if (lastResult?.loser && !lastResult.roasted) {
      lastResult.roasted = true;
      if (lastResult.loser === sender) out.react = { emoji: "\u{1F480}", tapback: "laugh" };
      out.roast = lastResult.loser === sender ? "You asked." : quip(ROASTS).replace("NAME", lastResult.loser);
      save();
    }
    return out;
  }

  const asked = (input.game ?? "").toLowerCase();
  if (/^@?nickel[,\s]+(?:games|arcade)[.!?\s]*$/i.test(text)) return { addressed: true, line: "Wordle Blitz, One in a Krillion, Rock Paper Scissors, Reaction, Free Throw, Memory, Math Sprint, Higher or Lower. Say: Nickel, play reaction." };
  const arcade = arcadeGame(asked) ?? arcadeGame(lower);
  const game: Round["game"] = arcade ?? (asked === "wordle" || asked === "krillion" || asked === "rps" ? asked : /word/.test(lower) ? "wordle" : /krill/.test(lower) ? "krillion" : /rock|paper|scissors|rps/.test(lower) ? "rps" : /challenge|\bvs\b|versus|against|1v1/.test(lower) ? "rps" : "wordle");
  const skip = new Set(["between", "me", "and", "to", "a", "an", "the", "with", "my", "us", "him", "her", "them", "pls", "please", "plz", "thanks", "gc", "chat", "here", "now", "today", "tonight", "rn", "nickel", "for", "in", "at", "wordle", "krillion", "rps", "rock", "game"]);
  const afterVerb = text.match(/(?:challenge|vs\.?|versus|against|between|and)\s+(.+)$/i)?.[1] ?? "";
  const opponent = person(input.opponent) || person(afterVerb.split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, "")).find((w) => w && !skip.has(w.toLowerCase())));
  const wantsChallenge = /\b(challenge|vs|versus|against|1v1|between)\b|\bcall\b.*\bout\b/.test(lower) || (!!input.opponent && /\b(play|game|run it|deal|set up)\b/.test(lower));
  if (opponent && opponent !== sender && wantsChallenge) {
    const round = createRound(game, sender, opponent);
    const terms = isArcadeGame(round.game) ? round.seconds + " seconds each. High score wins; Nickels for every run." : round.game === "rps" ? "Best of 3, 5 Nickels on it." : round.seconds + " seconds, 5 Nickels on it.";
    return reply((sender ? sender + " just called out " + opponent + ". " : opponent + ", you just got called out. ") + round.title + ". " + terms, roundCard(round));
  }
  if (arcade || /play|today|game|word|krill|rock|rps|deal|start/.test(lower)) {
    const round = game === "wordle" && !/new/.test(lower) ? getRound("wordle-212")! : createRound(game, sender, "");
    return reply(round.title + " is live. " + (round.seconds ? round.seconds + " seconds on the clock." : "Best of 3."), roundCard(round));
  }
  if (introduced) return reply("Got it, " + introduced + ". Add your photo here, one time. After that every link opens as you.", claimCard(profileFor(phone, introduced)));
  if (phone && !sender) return reply("Welcome to Nickel. Set up your player card: name and photo. One time, then every link opens as you.", claimCard(profileFor(phone, "")));
  const n = store.quips;
  const line = quip(COMEBACKS) + " Try: challenge Maya, who won, punishment, or a fantasy league for anything.";
  save();
  return n % 2 === 0 ? { addressed: true, line, react: { emoji: "\u2753", tapback: "question" } } : { addressed: true, line };
}

export function cardSvg(card: { kicker: string; title: string; sub: string; league: string; members: string[]; hue: string }): string {
  const photos = Object.fromEntries(Object.values(store.profiles).filter((p) => p.name && p.photo).map((p) => [p.name, p.photo!]));
  return renderChatCard(card, photos);
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
