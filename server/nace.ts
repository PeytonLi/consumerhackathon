import { NaceClient, choice, noul, score, type Questions, type SystemOneResult } from "nace-sdk";
import { COMEBACKS, getRound, internals, leaderboard, type TurnReply } from "./brain.js";
import { KRILLION_TIERS, type ResultPayload } from "./points.js";

export const NACE_BUDGET_MS = 1500;
export type NaceUse = "krillion" | "turn" | "punishment";

interface UseStats { calls: number; ok: number; fallbacks: number; cacheHits: number; lastMs: number | null; totalMs: number; maxMs: number }
const fresh = (): UseStats => ({ calls: 0, ok: 0, fallbacks: 0, cacheHits: 0, lastMs: null, totalMs: 0, maxMs: 0 });
const stats: Record<NaceUse, UseStats> = { krillion: fresh(), turn: fresh(), punishment: fresh() };
const budget = () => Number(process.env.NACE_TIMEOUT_MS) || NACE_BUDGET_MS;

let client: NaceClient | null = null;
let clientKey = "";
function drex(): NaceClient | null {
  const key = process.env.NACE_API_KEY ?? "";
  if (!key) return null;
  if (!client || key !== clientKey) {
    client = new NaceClient({ apiKey: key, defaultModel: process.env.NACE_MODEL ?? "drex-latest", timeout: budget(), retry: { maxRetries: 0 }, logLevel: "off", clientInfo: "nickel/1.0" });
    clientKey = key;
  }
  return client;
}

export const naceEnabled = () => !!process.env.NACE_API_KEY;

export function naceStats() {
  const uses = Object.fromEntries(Object.entries(stats).map(([use, s]) => [use, { calls: s.calls, ok: s.ok, fallbacks: s.fallbacks, cacheHits: s.cacheHits, lastMs: s.lastMs, avgMs: s.ok ? Math.round(s.totalMs / s.ok) : null, maxMs: s.maxMs }]));
  return { enabled: naceEnabled(), model: process.env.NACE_MODEL ?? "drex-latest", budgetMs: budget(), uses };
}

export async function decide<const Q extends Questions>(use: NaceUse, state: string | Record<string, string>, questions: Q): Promise<SystemOneResult<Q>["answers"] | null> {
  const nace = drex();
  if (!nace) return null;
  const s = stats[use];
  s.calls += 1;
  const started = performance.now();
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<null>((resolve) => { timer = setTimeout(() => { abort.abort(); resolve(null); }, budget()); });
    const result = await Promise.race([nace.systemOne({ state, questions }, { signal: abort.signal }), late]);
    if (!result) throw new Error("over the " + budget() + "ms budget");
    const ms = Math.round(performance.now() - started);
    s.ok += 1;
    s.lastMs = ms;
    s.totalMs += ms;
    s.maxMs = Math.max(s.maxMs, ms);
    return result.answers;
  } catch (e) {
    s.fallbacks += 1;
    console.error("Nace " + use + " fell back to local: " + (e instanceof Error ? e.message : String(e)));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const top = (probabilities: Record<string, number>) => Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0];

export interface KrillionGrade { valid: boolean; rarity: number; tier: string }

const RARITY_LEVELS: [string, ...string[]] = [
  "One of the first answers nearly everyone gives",
  "A well known answer that many people would give",
  "A less common answer that only some people would think of",
  "A deep cut that few people would think of",
  "So obscure that almost nobody would name it",
];
const GRADE_CACHE_MAX = 500;
const grades = new Map<string, KrillionGrade>();
const grade = (rarity: number): KrillionGrade => ({ valid: rarity > 0, rarity, tier: KRILLION_TIERS[rarity] });

export async function gradeKrillion(prompt: string, answer: string): Promise<KrillionGrade | null> {
  const clean = answer.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!naceEnabled() || !prompt.trim() || !clean) return null;
  const letters = prompt.match(/exactly (\d+) letters/i);
  if (letters && clean.replace(/[^a-z]/gi, "").length !== Number(letters[1])) return grade(0);
  const key = prompt.trim().toLowerCase() + "|" + clean.toLowerCase();
  const cached = grades.get(key);
  if (cached) {
    stats.krillion.cacheHits += 1;
    return cached;
  }
  const answers = await decide("krillion", { prompt: prompt.trim(), answer: clean }, {
    valid: noul("Is the answer a real, correct example of what the prompt asks for?", { true: "A real thing that truly fits the prompt, minor misspellings allowed", false: "Made up, a joke, gibberish, or a real thing that does not fit the prompt" }),
    rarity: score("If a group of friends each named one answer to the prompt, how rare would this answer be?", RARITY_LEVELS),
  });
  if (!answers) return null;
  const graded = grade(answers.valid.noul >= 0.5 ? Number(top(answers.rarity.probabilities)[0]) + 1 : 0);
  if (grades.size >= GRADE_CACHE_MAX) grades.delete(grades.keys().next().value!);
  grades.set(key, graded);
  return graded;
}

export async function gradedResult(round: { game: string; prompt?: unknown } | null, payload: ResultPayload & { answer?: unknown }): Promise<ResultPayload> {
  if (!round || round.game !== "krillion" || typeof payload.answer !== "string") return payload;
  const graded = await gradeKrillion(String(round.prompt ?? ""), payload.answer);
  return graded ? { ...payload, tries: graded.valid ? "1/1" : "X/1", rarity: graded.rarity } : payload;
}

export const INTENTS = {
  challenge: "Call out or challenge one specific friend to a head-to-head game",
  play: "Start or open a game to play now, with nobody specific called out",
  fantasy: "A fantasy league: start one, draft, or ask how it is going",
  buy_in: "Putting money on it: a buy-in, a pot, stakes, who is in, who has paid",
  leaderboard: "Standings, rankings, who is winning or losing, who won, results",
  punishment: "What the loser or last place has to do",
  player_card: "Setting up or seeing my own profile, name, photo or player card",
  invite: "How friends join, connect, or get added to Nickel",
  memory: "What Nickel knows or remembers about a person or the group",
  payments: "Balances, winnings, or how much money someone has won",
  none: "Anything else: small talk, an insult, a complaint, a joke, or gibberish",
} as const;
export type Intent = keyof typeof INTENTS;

export interface MessageRead { intent: Intent; game: "wordle" | "krillion" | "rps" | "unspecified"; insult: boolean; excuse: boolean; nonsense: boolean }

const INTENT_FLOOR = 0.55;
const REACTION_FLOOR = 0.7;

export async function readMessage(text: string, lastResult = ""): Promise<MessageRead | null> {
  const answers = await decide("turn", { message: text.slice(0, 400), last_game_result: lastResult || "none yet" }, {
    intent: choice("Nickel is a bot that runs games and a league in a group chat. Which command is this message asking Nickel for?", INTENTS),
    game: choice("Which game does the message name?", { wordle: "Wordle or a word game", krillion: "One in a Krillion, the rare answer game", rps: "Rock Paper Scissors", unspecified: "No game is named" }),
    insult: noul("Is the message insulting, mocking, or trash talking Nickel itself?"),
    excuse: noul("Is the sender making an excuse for losing, or complaining that a result was unfair?"),
    nonsense: noul("Is the message gibberish or too incoherent to act on?"),
  });
  if (!answers) return null;
  const [intent, sure] = top(answers.intent.probabilities);
  return {
    intent: sure >= INTENT_FLOOR ? (intent as Intent) : "none",
    game: answers.game.choice,
    insult: answers.insult.noul >= REACTION_FLOOR,
    excuse: answers.excuse.noul >= REACTION_FLOOR,
    nonsense: answers.nonsense.noul >= 0.5,
  };
}

export function commandFor(read: MessageRead, text: string, sender = ""): string | null {
  const me = internals.person(sender);
  const known = new Set([...(getRound("wordle-212")?.members ?? []), ...leaderboard().people.map((p) => p.name), ...Object.values(internals.store.names)]);
  const named = text.split(/[^A-Za-z]+/).map((w) => internals.person(w)).find((w) => w !== "Nickel" && w !== me && known.has(w)) ?? "";
  const game = read.game === "unspecified" ? "" : read.game === "rps" ? " rock paper scissors" : " " + read.game;
  const mine = /\b(me|my|mine|i|i'?ve)\b/i.test(text);
  switch (read.intent) {
    case "challenge": return named ? "nickel challenge " + named + game : "nickel play" + game;
    case "play": return "nickel play" + game;
    case "fantasy": {
      const topic = text.match(/.*\b(?:for|about|on)\s+(.+)$/i)?.[1]?.replace(/[.!?]+$/, "").trim();
      return topic ? "nickel start a fantasy league for " + topic : internals.store.latestFantasy ? "nickel fantasy" : null;
    }
    case "buy_in": {
      const amount = text.match(/\$?\s?(\d{1,3})\b/)?.[1];
      return amount ? "nickel $" + amount + " buy-in" : "nickel buy-in";
    }
    case "leaderboard": return "nickel leaderboard";
    case "punishment": return "nickel punishment";
    case "player_card": return "nickel player card";
    case "invite": return "nickel invite";
    case "memory": return "nickel what do you know about " + (named || (mine ? "me" : "us"));
    case "payments": return mine ? "nickel balance" : "nickel balances";
    default: return read.insult ? "nickel you suck" : read.excuse ? "nickel that was rigged" : null;
  }
}

const lost = (turn: TurnReply) => !!turn.line && COMEBACKS.some((c) => turn.line!.startsWith(c + " Try:"));

export async function assistTurn(run: (text: string) => TurnReply, text: string, sender = ""): Promise<TurnReply> {
  const first = run(text);
  if (!first.addressed || !lost(first) || !naceEnabled()) return first;
  const read = await readMessage(text, internals.store.results[internals.store.results.length - 1]?.line);
  if (!read) return first;
  const command = commandFor(read, text, sender);
  if (!command) {
    if (read.nonsense || !first.react) return first;
    const { react: _react, ...quiet } = first;
    return quiet;
  }
  internals.store.quips = Math.max(0, internals.store.quips - 1);
  const next = run(command);
  return lost(next) ? first : next;
}

export async function punishmentAllowed(phrase: string): Promise<boolean> {
  const answers = await decide("punishment", "A friend group's last place punishment: last place " + phrase, {
    illegal: noul("Would doing this break the law?"),
    dangerous: noul("Could this plausibly cause physical injury or serious harm?"),
    permanent: noul("Does this leave a permanent or long lasting mark, such as a tattoo, a piercing, or shaving hair off?"),
    sexual: noul("Is this sexual, or does it involve nudity or being undressed in public, such as streaking?"),
    alcohol: noul("Does this involve alcohol or drugs?"),
  });
  if (!answers) return true;
  return Object.values(answers).every((a) => a.noul < 0.5);
}
