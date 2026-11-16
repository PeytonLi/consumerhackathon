import { createFantasy, fantasyCard, fantasyStandings, internals, leaderboard, leaderboardCard, recordResult, type FantasyLeague, type Round, type TurnReply } from "./brain.js";
import { applyExtras, explain, streakDays, type Points, type PointsPart, type Scored } from "./points.js";
import { ALL_PUNISHMENTS, PUNISHMENT_TIERS, PUNISHMENT_SAFETY, intensityIn, safePunishment, sourceOf, threeOptions, type Intensity } from "./punishments.js";
import { punishmentAllowed } from "./nace.js";
import { nameClaimed } from "./auth.js";
import { recordEconomyPlay } from "./game-economy.js";

export type Template = "guess" | "take" | "trivia" | "caption" | "fastest" | "unique";

export interface Plan {
  template: Template;
  title: string;
  prompt: string;
  rule: string;
  seconds: number;
  minutes: number;
  stake: number;
  answer: string;
}

export interface Entry {
  value: string;
  seconds: number;
  at: number;
  verified?: boolean;
}

export interface Row {
  name: string;
  value: string;
  note: string;
  won: boolean;
  parts: PointsPart[];
  line?: string;
  points?: Points;
}

export interface CustomGame extends Round {
  template: Template;
  prompt: string;
  rule: string;
  scoring: string;
  seconds: number;
  minutes: number;
  stake: number;
  answer: string;
  createdBy: string;
  createdAt: number;
  closesAt: number;
  entries: Record<string, Entry>;
  votes: Record<string, string>;
  outcome?: { at: number; headline: string; answer: string; by: string; rows: Row[] };
}

export type RuledLeague = FantasyLeague & { scoring?: string; seasonDays?: number; startedAt?: number };

export const leagueIsClosed = (league: RuledLeague, now = Date.now()) => !!league.seasonDays && !!league.startedAt && now >= league.startedAt + league.seasonDays * 86400000;

interface CustomState {
  latestGame: string | null;
  intensity: Intensity | null;
  options: string[];
  optionSources: string[];
  asked: number;
}

export const TEMPLATES: Record<Template, { label: string; seconds: number; runnerUp: boolean; rules: Record<string, string> }> = {
  guess: { label: "Closest Guess", seconds: 20, runnerUp: true, rules: { closest: "Closest guess to the real number wins", under: "Closest guess without going over wins" } },
  take: { label: "Hot Take", seconds: 10, runnerUp: false, rules: { majority: "Agree or disagree. The bigger side wins", minority: "Agree or disagree. The smaller side wins" } },
  trivia: { label: "Trivia", seconds: 20, runnerUp: true, rules: { fastest: "Type the answer. The fastest correct answer wins" } },
  caption: { label: "Caption This", seconds: 45, runnerUp: true, rules: { votes: "Write one line. The group votes and the most votes wins" } },
  fastest: { label: "Fastest Finger", seconds: 15, runnerUp: true, rules: { reaction: "Tap the moment the board turns. The fastest reaction wins" } },
  unique: { label: "Lowest Unique", seconds: 10, runnerUp: false, rules: { lowest: "Pick 1 to 9. The lowest number nobody else picked wins", highest: "Pick 1 to 9. The highest number nobody else picked wins" } },
};

export const TRIVIA: [string, string][] = [
  ["What is the capital of Australia?", "Canberra"],
  ["How many players does a basketball team have on the court?", "5|five"],
  ["Which planet is closest to the sun?", "Mercury"],
  ["What year did the first iPhone come out?", "2007"],
  ["What is the only US state that starts with the letter P?", "Pennsylvania"],
  ["How many keys does a standard piano have?", "88"],
  ["Which country has won the most men's World Cups?", "Brazil"],
  ["What is the smallest prime number?", "2|two"],
];
export const TAKES = ["A hot dog is a sandwich", "Cereal is a soup", "Leftover pizza is better cold", "Group projects should be banned", "Morning classes are better than night classes"];
export const CAPTIONS = ["Describe this group chat in one line", "The worst possible name for a startup", "An excuse for being late that nobody can argue with", "The group's motto, if we were honest"];

const DAY = 86400000;
const GAME_HUE = "#af52de";
const SHOWING_UP = 1;
const BULLSEYE = 3;
const sum = (parts: PointsPart[]) => parts.reduce((n, p) => n + p.points, 0);
const clamp = (n: number, low: number, high: number) => Math.min(Math.max(Math.round(n), low), high);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "\u2026" : s);
const clean = (raw: unknown, max: number) => String(raw ?? "").replace(/\p{Extended_Pictographic}|\uFE0F|\u200D|[<>]/gu, "").replace(/\s+/g, " ").trim().slice(0, max).trim();
const capFirst = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const num = (raw: string) => (/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(raw.trim()) && Number.isFinite(Number(raw.replace(/,/g, ""))) ? Number(raw.replace(/,/g, "")) : NaN);
const pretty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const loose = (s: string) => s.toLowerCase().replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9]/g, "");
const keyOf = (id: string, name: string) => [...(id + name)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
const plural = (n: number, word: string) => n + " " + word + (n === 1 ? "" : "s");

function state() {
  const s = internals.store as typeof internals.store & { custom?: Partial<CustomState> };
  s.custom ??= {};
  s.custom.latestGame ??= null;
  s.custom.intensity ??= null;
  s.custom.options ??= [];
  s.custom.optionSources ??= [];
  s.custom.asked ??= 0;
  return s.custom as CustomState;
}

const isCustom = (round: Round | null | undefined): round is CustomGame => !!round && (round.game as string) === "custom";

export function scoringText(plan: { template: Template; rule: string; stake: number }): string {
  const t = TEMPLATES[plan.template];
  const second = t.runnerUp ? (plan.template === "trivia" ? ", other correct answers take " : ", second takes ") + Math.ceil(plan.stake / 2) : "";
  return (t.rules[plan.rule] ?? Object.values(t.rules)[0]) + ". " + (plan.template === "take" ? "Each winner takes " : "The winner takes ") + plural(plan.stake, "Nickel") + second + ", and everyone else gets " + SHOWING_UP + " for showing up.";
}

const STOP = new Set("guess how many much long far the a an of is was did do does today tonight this that for to in on at and or best worst funniest caption trivia quiz hot take vote who what which when where will with by it be are our your my we you i closest number game about make new one line word".split(" "));

export function planGame(request: string, forced?: Template): Plan {
  let text = clean(request, 240).replace(/^[\s:,.\-]+/, "");
  const said = text.match(/[\s,;.(]+(?:the\s+)?answer(?:\s+is|\s*[:=])?\s+(.+?)\)?[.!]*$/i);
  let answer = said ? clean(said[1], 60) : "";
  if (said) text = text.slice(0, said.index).trim();
  const lowerAll = text.toLowerCase();
  const secs = lowerAll.match(/\b(\d{1,2})\s?(?:s|secs?|seconds?)\b/);
  const span = lowerAll.match(/\b(?:closes? in|open for|within|for)\s+(\d{1,3}|an?)\s?(m|mins?|minutes?|h|hrs?|hours?)\b/);
  const bet = lowerAll.match(/\bfor\s+(\d{1,2})\s+nickels?\b/);
  text = text.replace(/[,;]?\s*\b(?:in\s+|with\s+)?\d{1,2}\s?(?:s|secs?|seconds?)\b(?:\s+each)?/i, "").replace(/[,;]?\s*\b(?:closes? in|open for|within|for)\s+(?:\d{1,3}|an?)\s?(?:minutes?|mins?|m|hours?|hrs?|h)\b/i, "").replace(/[,;]?\s*\bfor\s+\d{1,2}\s+nickels?\b/i, "").trim();
  const lower = text.toLowerCase();
  const template: Template = forced ?? (
    /\b(fastest|reaction|reflex|quick.?draw|first to tap)\b/.test(lower) ? "fastest"
    : /\b(unique|number nobody|lowest number|highest number)\b/.test(lower) ? "unique"
    : /\b(trivia|quiz)\b/.test(lower) || (answer && Number.isNaN(num(answer))) ? "trivia"
    : /\bhow (many|much|long|far|old|tall|fast|late|heavy)\b|\bguess\b|\bclosest\b|\bwhat time\b|\bover.?under\b|\bprice\b/.test(lower) || answer ? "guess"
    : /\bhot take\b|\bagree\b|\bvote\b|\bwould you rather\b|\boverrated\b|\bunderrated\b|\bbetter than\b|\byes or no\b|\btrue or false\b/.test(lower) ? "take"
    : /\bcaption\b|\bbest\b|\bfunniest\b|\bworst\b|\bone word\b|\bone line\b|\bname for\b|\broast\b|\bdescribe\b/.test(lower) ? "caption"
    : /^(who|what|which|where|when)\b.*\?$/.test(lower) ? "trivia"
    : "caption"
  );
  const t = TEMPLATES[template];
  const rule = template === "guess" && /without going over|price is right|not over/.test(lower) ? "under"
    : template === "take" && /minority|contrarian|unpopular|smaller side/.test(lower) ? "minority"
    : template === "unique" && /highest/.test(lower) ? "highest"
    : Object.keys(t.rules)[0];
  let prompt = text.replace(/^(?:a\s+)?(?:trivia|quiz|hot take|vote|fastest finger|lowest unique|highest unique)\s*(?:question|game|round)?\s*(?:[:,\-]|\babout\b|\bon\b)?\s*/i, "").replace(/[.!\s]+$/, "").trim();
  const pick = (list: number) => Object.keys(internals.store.rounds).length % list;
  if (template === "guess") prompt = prompt.replace(/^guess\s+/i, "");
  if (template === "trivia" && !answer) {
    const [question, known] = TRIVIA[pick(TRIVIA.length)];
    if (prompt.length < 4) [prompt, answer] = [question, known];
  }
  if (template === "guess" && prompt.length < 4) [prompt, answer] = ["Guess the number between 1 and 100", String(1 + Math.floor(Math.random() * 100))];
  if (template === "take" && prompt.length < 4) prompt = TAKES[pick(TAKES.length)];
  if (template === "caption" && prompt.length < 4) prompt = CAPTIONS[pick(CAPTIONS.length)];
  if (template === "fastest") prompt = "Tap the moment the board turns blue";
  if (template === "unique") prompt = "Pick the " + rule + " number nobody else picks";
  prompt = capFirst(prompt);
  if (/^(how|what|who|which|where|when|is|are|does|do|did|will)\b/i.test(prompt) && !/\?$/.test(prompt)) prompt += "?";
  const words = prompt.replace(/[^A-Za-z0-9' ]/g, " ").split(" ").filter((w) => w.length > 1 && !STOP.has(w.toLowerCase())).slice(0, 3);
  const label = template === "unique" && rule === "highest" ? "Highest Unique" : t.label;
  const title = ["fastest", "unique", "trivia"].includes(template) || !words.length ? label : clip(words.map((w) => (w === w.toLowerCase() ? capFirst(w) : w)).join(" "), 24);
  return {
    template,
    title,
    prompt: clip(prompt, 120),
    rule,
    seconds: clamp(secs ? Number(secs[1]) : t.seconds, 5, 60),
    minutes: clamp(span ? (/^an?$/.test(span[1]) ? 1 : Number(span[1])) * (span[2].startsWith("h") ? 60 : 1) : 60, 1, 1440),
    stake: clamp(bet ? Number(bet[1]) : 6, 2, 15),
    answer,
  };
}

export async function planGameAI(request: string, forced?: Template): Promise<Plan | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const base = planGame(request, forced);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({
        model: process.env.NICKEL_RESEARCH_MODEL ?? "gpt-5.4-mini",
        input: "You set up a one-move party game for a friend group chat. Turn this request into one game: \"" + clean(request, 240) + "\". " +
          (forced ? "The template is " + forced + ". " : "Choose the template that fits best. ") +
          "Templates and their rules: guess (everyone guesses a number; rules: closest, under), take (agree or disagree with one statement, never an open question; rules: majority, minority), trivia (one question with one short typed answer; rule: fastest), caption (everyone writes one line or one name and the group votes, use it for open questions; rule: votes), fastest (reaction time tap; rule: reaction), unique (pick 1 to 9; rules: lowest, highest). " +
          "Reply with only a JSON object with these keys: template, title (at most 22 characters), prompt (what players see, at most 110 characters, keep names from the request), rule, seconds (5 to 60, how long one person gets), answer (trivia: the correct short answer, with alternatives separated by |; guess: the real number only if the request states it or it is a fixed well-known fact, otherwise an empty string; every other template: an empty string). No emojis anywhere.",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const out = (await res.json()) as { output?: { type: string; content?: { text?: string }[] }[] };
    const text = out.output?.filter((o) => o.type === "message").flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join(" ") ?? "";
    const found = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Partial<Record<keyof Plan, unknown>>;
    let template = forced ?? (Object.keys(TEMPLATES).includes(String(found.template)) ? (found.template as Template) : base.template);
    if (!forced && template === "take" && /^(who|what|which|where|when|how)\b/i.test(clean(found.prompt, 120))) template = "caption";
    const t = TEMPLATES[template];
    const rule = Object.keys(t.rules).includes(String(found.rule)) ? String(found.rule) : template === base.template ? base.rule : Object.keys(t.rules)[0];
    const prompt = clean(found.prompt, 120);
    const title = clean(found.title, 24);
    let answer = base.answer || clean(found.answer, 60);
    if (template === "guess" && Number.isNaN(num(answer))) answer = "";
    if (prompt.length < 4 || !title || (template === "trivia" && !answer)) return base;
    return { ...base, template, rule, title, prompt: capFirst(prompt), answer: ["guess", "trivia"].includes(template) ? answer : "", seconds: clamp(Number(found.seconds) || t.seconds, 5, 60) };
  } catch (e) {
    console.error("Game planning failed", e);
    return base;
  }
}

export function createGame(plan: Plan, sender: string): CustomGame {
  const board = leaderboard();
  const who = internals.person(sender);
  const names = board.people.map((p) => p.name);
  const now = Date.now();
  const game: CustomGame = {
    id: "game-" + Math.random().toString(36).slice(2, 7),
    game: "custom",
    title: plan.title,
    league: board.league,
    members: who && !names.includes(who) ? [...names, who] : names,
    template: plan.template,
    prompt: plan.prompt,
    rule: plan.rule,
    scoring: scoringText(plan),
    seconds: plan.seconds,
    minutes: plan.minutes,
    stake: plan.stake,
    answer: plan.answer,
    createdBy: who || "Someone",
    createdAt: now,
    closesAt: now + plan.minutes * 60000,
    entries: {},
    votes: {},
  };
  internals.store.rounds[game.id] = game;
  state().latestGame = game.id;
  internals.save();
  return game;
}

const needsAnswer = (game: CustomGame) => (game.template === "guess" || game.template === "trivia") && !game.answer;

function rank(game: CustomGame): { headline: string; rows: Row[] } {
  const on = " on " + game.title;
  const all = Object.entries(game.entries).map(([name, e]) => ({ name, ...e })).sort((a, b) => a.at - b.at);
  const blank = (name: string): Row => ({ name, value: "", note: "ran out the clock" + on, won: false, parts: [] });
  const win = (extra: PointsPart[] = []): PointsPart[] => [{ label: "win", points: game.stake }, ...extra];
  const half = (label: string): PointsPart[] => [{ label, points: Math.ceil(game.stake / 2) }];
  const solo = all.length < 2;
  let headline = "";
  let rows: Row[] = [];

  if (game.template === "take") {
    const agree = all.filter((e) => e.value === "agree").length;
    const disagree = all.filter((e) => e.value === "disagree").length;
    const side = agree === disagree ? "" : (agree > disagree) === (game.rule === "majority") ? "agree" : "disagree";
    headline = side ? capFirst(side) + " takes it, " + Math.max(agree, disagree) + " to " + Math.min(agree, disagree) : "Split room, " + agree + " to " + disagree;
    rows = all.map((e) => !e.value ? blank(e.name) : {
      name: e.name,
      value: capFirst(e.value),
      won: !solo && (!side || e.value === side),
      note: (!side ? "split the room" : e.value === side ? (game.rule === "majority" ? "read the room" : "stood alone and won") : "got outvoted") + on,
      parts: solo ? [] : !side ? [{ label: "split room", points: Math.ceil(game.stake / 2) }] : e.value === side ? win() : [],
    });
  } else if (game.template === "unique") {
    const count = (v: string) => all.filter((e) => e.value === v).length;
    const lone = all.filter((e) => e.value && count(e.value) === 1).sort((a, b) => (game.rule === "highest" ? Number(b.value) - Number(a.value) : Number(a.value) - Number(b.value)));
    const top = solo ? undefined : lone[0];
    headline = top ? top.name + " wins with a lone " + top.value : "Nobody stood alone";
    rows = all.map((e) => !e.value ? blank(e.name) : {
      name: e.name,
      value: e.value,
      won: e.name === top?.name,
      note: (e.name === top?.name ? "won " + game.title + " with a lone " + e.value : count(e.value) > 1 ? "picked " + e.value + " with company" + on : "picked a lone " + e.value + on),
      parts: e.name === top?.name ? win() : [],
    });
    rows.sort((a, b) => Number(b.won) - Number(a.won));
  } else {
    const target = num(game.answer);
    const accepted = game.answer.split(/\s*\|\s*|\s+or\s+/i).map(loose).filter(Boolean);
    const tally = (name: string) => Object.values(game.votes).filter((v) => v === name).length;
    const scored = all.map((e) => {
      const v = num(e.value);
      const badness = !e.value ? Infinity
        : game.template === "guess" ? (Number.isNaN(v) || (game.rule === "under" && v > target) ? Infinity : Math.abs(v - target))
        : game.template === "trivia" ? (accepted.includes(loose(e.value)) ? e.seconds : Infinity)
        : game.template === "fastest" ? (Number.isNaN(v) ? Infinity : v)
        : -tally(e.name);
      return { ...e, badness };
    }).sort((a, b) => a.badness - b.badness || a.at - b.at);
    const votesCast = Object.keys(game.votes).length;
    const live = (e: { badness: number }) => Number.isFinite(e.badness) && !(game.template === "caption" && votesCast === 0);
    const top = !solo && scored[0] && live(scored[0]) ? scored[0] : undefined;
    rows = scored.map((e, i) => {
      if (!e.value) return blank(e.name);
      const first = e.name === top?.name;
      const second = !!top && !first && live(e) && (game.template === "trivia" || (i === 1 && scored.length >= 3 && (game.template !== "caption" || tally(e.name) > 0)));
      const v = num(e.value);
      if (game.template === "guess") {
        const off = Math.abs(v - target);
        const bust = Number.isNaN(v) || (game.rule === "under" && v > target);
        return { name: e.name, value: Number.isNaN(v) ? e.value : pretty(v), won: first, note: first ? (off === 0 ? "nailed " + game.title + " exactly with " + pretty(v) : "won " + game.title + " with " + pretty(v) + ", " + pretty(off) + " off") : bust ? "went over" + on + " with " + e.value : "guessed " + pretty(v) + on + ", " + pretty(off) + " off", parts: first ? win(off === 0 ? [{ label: "bullseye", points: BULLSEYE }] : []) : second ? half("runner-up") : [] };
      }
      if (game.template === "trivia") {
        const right = live(e);
        return { name: e.name, value: e.value, won: right && !solo, note: first ? "got " + game.title + " first in " + plural(e.seconds, "second") : right ? "got " + game.title + " right" : "missed" + on + " with " + e.value, parts: first ? win() : second ? half("correct") : [] };
      }
      if (game.template === "fastest") return { name: e.name, value: pretty(v) + " ms", won: first, note: (first ? "won " + game.title + " in " : "tapped in ") + pretty(v) + " ms" + (first ? "" : on), parts: first ? win() : second ? half("runner-up") : [] };
      return { name: e.name, value: e.value, won: first, note: first ? "won " + game.title + " with " + plural(tally(e.name), "vote") : "got " + plural(tally(e.name), "vote") + on, parts: first ? win() : second ? half("runner-up") : [] };
    });
    headline = top ? top.name + " wins" : game.template === "caption" && votesCast === 0 && !solo ? "Nobody voted" : game.template === "trivia" && !solo ? "Nobody got it" : "";
  }
  if (solo) headline = all.length ? "Only " + all[0].name + " showed up" : "Nobody played";
  if (!headline) headline = game.template === "guess" && game.rule === "under" ? "Everyone went over" : "No winner this round";
  rows.sort((a, b) => Number(b.won) - Number(a.won));
  for (const row of rows) if (!row.parts.length) row.parts = [{ label: "showing up", points: SHOWING_UP }];
  return { headline, rows };
}

export function customScore(round: Round, name: string): Scored | null {
  if (!isCustom(round)) return null;
  const row = round.outcome?.rows.find((r) => r.name === name);
  if (!row) return null;
  const points = applyExtras(row.parts, { streakDays: streakDays(internals.store.results, name) });
  return { total: points.total, moved: 0, line: name + " " + row.note + ": " + explain(points) + ".", points, record: { points, players: [name], solved: row.won, base: sum(row.parts) } };
}

export function settleGame(id: string, by = "", answer = ""): { ok: boolean; error?: string; game?: CustomGame } {
  const game = internals.store.rounds[id];
  if (!isCustom(game)) return { ok: false, error: "Not found" };
  if (game.outcome) return { ok: true, game };
  if (needsAnswer(game)) {
    const given = clean(answer, 60);
    if (!given || (game.template === "guess" && Number.isNaN(num(given)))) return { ok: false, error: game.template === "guess" ? "Enter the real number" : "Enter the real answer" };
    game.answer = given;
  }
  const { headline, rows } = rank(game);
  game.outcome = { at: Date.now(), headline, answer: game.template === "guess" ? pretty(num(game.answer)) : game.template === "trivia" ? game.answer.split("|")[0] : "", by: internals.person(by), rows };
  for (const row of [...rows].sort((a, b) => Number(b.won) - Number(a.won))) {
    const out = recordResult(game.id, { name: row.name, tries: row.won ? "1" : "X", seconds: game.entries[row.name]?.seconds, verified: game.entries[row.name]?.verified });
    row.line = out.line;
    row.points = out.points;
  }
  internals.save();
  return { ok: true, game };
}

function settleIfDue(game: CustomGame, now = Date.now()) {
  if (game.outcome || needsAnswer(game)) return;
  if (now >= game.closesAt && Object.keys(game.entries).length) settleGame(game.id);
}

export function getGame(id: string, now = Date.now()): CustomGame | null {
  const game = internals.store.rounds[id];
  if (!isCustom(game)) return null;
  settleIfDue(game, now);
  return game;
}

export function submitAnswer(id: string, name: string, raw: unknown, seconds: unknown, verified = false, authenticatedPhone?: string): { ok: boolean; error?: string } {
  const game = getGame(id);
  const who = internals.person(name);
  if (!game || !who) return { ok: false, error: "Not found" };
  if (game.outcome) return { ok: false, error: "This game is closed" };
  if (Date.now() >= game.closesAt) return { ok: false, error: "Answers are closed. Waiting for the real answer." };
  if (game.entries[who]) return { ok: false, error: "You already answered" };
  let value = clean(raw, 80);
  if (value && game.template === "guess") {
    if (Number.isNaN(num(value))) return { ok: false, error: "Enter a number" };
    value = String(num(value));
  }
  if (value && game.template === "take" && !["agree", "disagree"].includes((value = value.toLowerCase()))) return { ok: false, error: "Agree or disagree" };
  if (value && game.template === "unique" && !/^[1-9]$/.test(value)) return { ok: false, error: "Pick 1 to 9" };
  if (value && game.template === "fastest") {
    if (Number.isNaN(num(value)) || num(value) < 80) return { ok: false, error: "Too early" };
    value = String(clamp(num(value), 80, 10000));
  }
  if (!game.members.includes(who)) game.members.push(who);
  game.entries[who] = { value, seconds: clamp(Number(seconds) || 0, 0, game.seconds), at: Date.now(), verified };
  if (verified && authenticatedPhone) recordEconomyPlay(game.league, authenticatedPhone, 0);
  internals.save();
  settleIfDue(game);
  return { ok: true };
}

export function castVote(id: string, name: string, key: string): { ok: boolean; error?: string } {
  const game = getGame(id);
  const who = internals.person(name);
  if (!game || !who || game.template !== "caption") return { ok: false, error: "Not found" };
  if (game.outcome) return { ok: false, error: "This game is closed" };
  if (!game.entries[who]) return { ok: false, error: "Write yours first" };
  const author = Object.keys(game.entries).find((n) => n !== who && game.entries[n].value && keyOf(game.id, n) === key);
  if (!author) return { ok: false, error: "Pick someone else's line" };
  game.votes[who] = author;
  internals.save();
  settleIfDue(game);
  return { ok: true };
}

export function revealGame(id: string, name: string, answer = ""): { ok: boolean; error?: string } {
  const game = getGame(id);
  const who = internals.person(name);
  if (!game || !who) return { ok: false, error: "Not found" };
  if (game.outcome) return { ok: true };
  if (!game.entries[who]) return { ok: false, error: "Answer first" };
  if (Object.keys(game.entries).length < 2) return { ok: false, error: "Wait for one more person" };
  const out = settleGame(id, who, answer);
  return { ok: out.ok, error: out.error };
}

export function gameView(game: CustomGame, viewer = "") {
  const who = internals.person(viewer);
  const names = Object.keys(game.entries);
  const players = game.outcome ? game.outcome.rows.map((r) => r.name) : [];
  return {
    id: game.id,
    template: game.template,
    label: TEMPLATES[game.template].label,
    title: game.title,
    prompt: game.prompt,
    scoring: game.scoring,
    rule: game.rule,
    seconds: game.seconds,
    stake: game.stake,
    closesAt: game.closesAt,
    league: game.league,
    members: game.members,
    createdBy: game.createdBy,
    state: game.outcome ? "settled" : "open",
    expired: Date.now() >= game.closesAt,
    needsAnswer: needsAnswer(game),
    answered: names,
    mine: game.entries[who] ?? null,
    captions: game.template === "caption" && game.entries[who] && !game.outcome ? names.filter((n) => n !== who && game.entries[n].value).map((n) => ({ key: keyOf(game.id, n), text: game.entries[n].value })).sort((a, b) => a.key.localeCompare(b.key)) : [],
    myVote: game.votes[who] ? keyOf(game.id, game.votes[who]) : "",
    votesIn: Object.keys(game.votes).length,
    outcome: game.outcome ?? null,
    standing: leaderboard().people.filter((p) => players.includes(p.name)).map((p) => ({ name: p.name, rank: p.rank, nickels: p.nickels })),
  };
}

export function gameCard(game: CustomGame) {
  const played = Object.keys(game.entries).length;
  return {
    kicker: TEMPLATES[game.template].label,
    title: game.title,
    sub: game.outcome ? clip(game.outcome.headline + ". " + played + " played.", 60) : clip(game.prompt, 60),
    league: game.league,
    members: game.members,
    hue: GAME_HUE,
    path: "/g/" + game.id,
  };
}

const newGameCard = () => ({ kicker: "Custom game", title: "Make a game", sub: "Guess, vote, trivia, captions and more.", league: leaderboard().league, members: leaderboard().people.map((p) => p.name), hue: GAME_HUE, path: "/g/new" });

export function punishmentPool(): string[] {
  const tier = state().intensity;
  return tier ? PUNISHMENT_TIERS[tier] : ALL_PUNISHMENTS;
}

export const wantsResearch = (text: string) => /punish/i.test(text) && /research|look.?up|\bfind\b|search|google|internet|online|ideas?\b|suggest|come up|options|what do (people|leagues)/i.test(text);

export interface PunishmentOption { text: string; source: string }

export async function researchPunishments(request: string): Promise<PunishmentOption[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const tier = intensityIn(request);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({
        model: process.env.NICKEL_RESEARCH_MODEL ?? "gpt-5.4-mini",
        tools: [{ type: "web_search" }],
        input: "Search the web for real last place punishments that friend groups and fantasy leagues actually do (Reddit threads, league blogs). Pick THREE different ones that are genuinely funny and publicly embarrassing, that fit this request from the group chat: \"" + clean(request, 200) + "\". " +
          (tier && tier !== "any" ? "All three should be " + tier + " in intensity. " : "Order them from mildest to most brutal. ") +
          "Each must be legal, safe, and not permanent: no tattoos, no alcohol, nothing sexual, nothing dangerous, no public harassment, no forced eating, strenuous exercise, cold exposure or location tracking. Adapt unsafe traditions into private costume performances. " + PUNISHMENT_SAFETY + " Do not pick any of these: " + [internals.store.punishment, ...ALL_PUNISHMENTS.slice(0, 3), ...PUNISHMENT_TIERS.medium.slice(0, 3), ...PUNISHMENT_TIERS.brutal.slice(0, 3)].filter(Boolean).join("; ") + ". Reply only with a JSON array of three objects with text (a third-person singular verb phrase completing Last place, under 110 characters, no emojis, no final period) and source (the exact https article URL you read).",
      }),
      signal: AbortSignal.timeout(25000),
    });
    const out = (await res.json()) as { output?: { type: string; content?: { text?: string }[] }[] };
    const text = out.output?.filter((o) => o.type === "message").flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("\n") ?? "";
    const parsed: unknown = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    if (!Array.isArray(parsed)) return null;
    const found: PunishmentOption[] = [];
    for (const item of parsed.slice(0, 3)) {
      const phrase = clean(item?.text, 110).replace(/^(last place|the loser)\s+/i, "").replace(/[.!]+$/, "");
      const source = String(item?.source ?? "");
      if (phrase.length < 6 || !/^https:\/\/[^\s<>"']+$/.test(source) || !safePunishment(phrase) || !(await punishmentAllowed(phrase))) return null;
      found.push({ text: phrase[0].toLowerCase() + phrase.slice(1), source });
    }
    return found.length === 3 && new Set(found.map((p) => p.text)).size === 3 ? found : null;
  } catch (e) {
    console.error("Punishment research failed", e);
    return null;
  }
}

const gameRequest = (text: string) => {
  const rest = text.match(/\b(?:make|create|new|start|custom)\b[^:]{0,24}?\bgame\b\s*(.*)$/i)?.[1];
  if (rest === undefined || /\b(wordle|krillion|rock|scissors|rps|fantasy|challenge|between|versus|vs|against)\b/i.test(text)) return null;
  return rest.replace(/^[\s:,.\-]+/, "").replace(/^(?:where|about|that|called)\s+/i, "").replace(/[,\s]*@?nickel[.!?\s]*$/i, "").trim();
};

export interface PreparedTurn { text: string; options?: PunishmentOption[]; plan?: Plan }

export async function prepareTurn(text: string): Promise<PreparedTurn | undefined> {
  if (!/(^|[^a-z])@?nickel([^a-z]|$)/i.test(text)) return;
  if (wantsResearch(text)) {
    const options = await researchPunishments(text);
    if (options) return { text, options };
    return;
  }
  const request = gameRequest(text);
  if (request && request.length >= 3) {
    const plan = await planGameAI(request);
    if (plan) return { text, plan };
  }
}

export function leagueRules(league: RuledLeague, now = Date.now()): string {
  const scoring = league.scoring ?? "the group scores it from the chat, for example: Nickel, " + (league.pool[0]?.name ?? "your pick") + " +10";
  let season = "no end date yet";
  if (league.seasonDays) {
    const weeks = league.seasonDays % 7 === 0;
    const unit = weeks ? 7 * DAY : DAY;
    const total = league.seasonDays / (weeks ? 7 : 1);
    const current = Math.floor((now - (league.startedAt ?? now)) / unit) + 1;
    const top = fantasyStandings(league)[0];
    season = plural(total, weeks ? "week" : "day") + ", " + (current > total ? "and it is over. " + (top && top.points > 0 ? top.member + " won with " + top.points : "Nobody scored") : (weeks ? "week " : "day ") + current + " now");
  }
  return "Fantasy " + league.topic + " rules. Scoring: " + scoring + ". Season: " + season + ". Draft " + league.rosterSize + " each.";
}

export function configureLeague(id: string, name: string, scoring: unknown, seasonDays: unknown): { ok: boolean; error?: string; league?: RuledLeague } {
  const league: RuledLeague | undefined = internals.store.fantasy[id];
  if (!league) return { ok: false, error: "Not found" };
  if (internals.person(name) !== league.createdBy) return { ok: false, error: "Only the league creator can change its rules" };
  const rule = clean(scoring, 160).replace(/[.!]+$/, "");
  const days = Number(seasonDays);
  if (rule.length < 4 || !Number.isInteger(days) || days < 1 || days > 364) return { ok: false, error: "Add a scoring rule and a season of 1 to 364 days" };
  if (league.seasonDays !== days || !league.startedAt) league.startedAt = Date.now();
  league.scoring = rule;
  league.seasonDays = days;
  internals.save();
  return { ok: true, league };
}

export function customTurn(input: { text: string; sender?: string; senderPhone?: string; baseUrl: string; customPrepared?: PreparedTurn }): TurnReply | null {
  const s = state();
  const store = internals.store;
  const text = input.text.trim().replace(/[,\s]*@?nickel[.!?\s]*$/i, "");
  const lower = text.toLowerCase();
  const sender = internals.person(input.sender) || store.names[(input.senderPhone ?? "").replace(/[^+0-9]/g, "")] || "";
  const base = input.baseUrl.replace(/\/+$/, "");
  const ready = input.customPrepared?.text === input.text ? input.customPrepared : null;
  const reply = (line: string, card: { kicker: string; league: string; title: string; sub: string; path: string }): TurnReply => ({
    addressed: true,
    line,
    url: base + card.path,
    card: { kicker: (card.kicker + " \u00b7 " + card.league).toUpperCase(), title: card.title, sub: card.sub, path: card.path },
  });
  const lastPlace = (lead: string) => {
    const board = leaderboard();
    const last = board.people[board.people.length - 1];
    const card = leaderboardCard();
    return reply(lead + "Last place " + store.punishment + ". Right now that is " + last.name + ".", { ...card, path: card.path + "?u=" + last.name.toLowerCase() });
  };

  const nth = ["first", "second", "third"].findIndex((w) => new RegExp("\\bthe " + w + " (one|option)\\b").test(lower)) + 1;
  const choice = s.options.length ? Number(lower.match(/\b(?:option|number|pick|choose|go with)\s*#?\s*([123])\b/)?.[1] ?? lower.match(/^\W*(?:nickel\W+)?#?([123])\W*$/)?.[1] ?? nth) : 0;
  if (choice && !leaderboard().stakes) {
    store.punishment = s.options[Number(choice) - 1];
    s.options = [];
    internals.save();
    return lastPlace("Locked in. ");
  }

  if (/punish/.test(lower) && !leaderboard().stakes && !/punishment\s*(is|:|=)\s*.{6}/.test(lower)) {
    if (wantsResearch(lower)) {
      const options = ready?.options ?? threeOptions(text.replace(/\b(nickel|research|punishments?|for|a|the|find|look|up|ideas?|options|suggest)\b/gi, " "), [store.punishment], s.asked).map((text) => ({ text, source: sourceOf(text) }));
      s.options = options.map((p) => p.text);
      s.optionSources = options.map((p) => p.source);
      s.asked += 1;
      internals.save();
      return { addressed: true, line: "Three options for last place. " + s.options.map((p, i) => i + 1 + ": " + p + ". Source: " + s.optionSources[i]).join("\n") + "\nPick one: Nickel, option 2. " + PUNISHMENT_SAFETY };
    }
    const tier = intensityIn(lower);
    if (tier) {
      s.intensity = tier === "any" ? null : tier;
      const pool = punishmentPool().filter((p) => p !== store.punishment);
      store.punishment = pool[Math.floor(Math.random() * pool.length)];
      internals.save();
      return lastPlace(tier === "any" ? "Any intensity it is. " : capFirst(tier) + " it is. ");
    }
    return null;
  }

  const latest: RuledLeague | null = store.latestFantasy ? store.fantasy[store.latestFantasy] ?? null : null;
  const createLeague = text.match(/\b(?:make|create|start|new|set up)\s+(?:a\s+)?(?:fantasy\s+)?league\s+(?:for|about|on)\s+(.+)$/i);
  if (createLeague && (!/fantasy/i.test(text) || /\b(scoring|rules|season)\s*[:=]/i.test(text))) {
    const pieces = createLeague[1].split(/\s*;\s*/);
    const topic = pieces.shift()!.trim();
    const fields = Object.fromEntries(pieces.map((p) => { const at = p.indexOf(":"); return [p.slice(0, at).trim().toLowerCase(), p.slice(at + 1).trim()]; }));
    const league = createFantasy(topic, (fields.picks ?? "").split(",").filter(Boolean), sender);
    const length = fields.season?.match(/(\d+)\s*(days?|weeks?)/i);
    if (fields.scoring || fields.rules || length) configureLeague(league.id, sender, fields.scoring ?? fields.rules ?? "The group assigns points to each pick", length ? Number(length[1]) * (/week/i.test(length[2]) ? 7 : 1) : 28);
    return reply("Fantasy " + league.topic + " is open. " + leagueRules(league), fantasyCard(league));
  }
  const season = lower.match(/\bseason\b[^.]*?\b(\d{1,2})\s*(weeks?|days?)\b/);
  const scoring = (text.match(/\b(?:league|fantasy)\s+(?:scoring|rules?)\s*(?:is|are|:|=)\s*(.{4,200})$/i) ?? text.match(/\bscoring\s*(?:rule\s*)?(?:is|:|=)\s*(.{4,200})$/i))?.[1];
  if (season || scoring || /\b(league|fantasy)\s+(rules?|scoring|settings)\b|\brules (of|for) the league\b/.test(lower)) {
    if (!latest) return { addressed: true, line: "No league yet. Say: Nickel, start a fantasy league for anything." };
    const rule = clean((scoring ?? "").replace(/[,.;]?\s*(?:and\s+)?(?:the\s+)?season\b.*$/i, "").replace(/[.!]+$/, ""), 160);
    if (rule.length >= 4) latest.scoring = rule;
    if (season) {
      latest.seasonDays = clamp(Number(season[1]), 1, 52) * (season[2].startsWith("week") ? 7 : 1);
      latest.startedAt = Date.now();
    }
    if (rule.length >= 4 || season) internals.save();
    return reply((rule.length >= 4 || season ? "Saved. " : "") + leagueRules(latest), fantasyCard(latest));
  }

  const open = s.latestGame ? getGame(s.latestGame) : null;
  const told = text.match(/\b(?:real |right |correct |actual )?answer\s*(?:is|was|:|=)\s*(.+?)[.!]*$/i)?.[1];
  if (told && open && !open.outcome && needsAnswer(open) && !/\bgame\b/.test(lower)) {
    const given = clean(told, 60);
    if (open.template === "guess" && Number.isNaN(num(given))) return { addressed: true, line: "I need a number for " + open.title + "." };
    if (Object.keys(open.entries).length < 2) {
      open.answer = given;
      internals.save();
      return reply("Answer saved for " + open.title + ". It stays hidden until the game closes.", gameCard(open));
    }
    settleGame(open.id, sender, given);
    return reply(open.outcome!.headline + ". " + (open.outcome!.rows[0].line ?? ""), gameCard(open));
  }

  const request = gameRequest(text);
  if (request === null) return null;
  if (request.length < 3) return /\b(custom|make|create)\b/.test(lower) ? reply("Tell me the game, or build one here. Try: Nickel, make a game: guess how many steps Dev walked today.", newGameCard()) : null;
  const game = createGame(ready?.plan ?? planGame(request), sender);
  const t = TEMPLATES[game.template];
  return reply(game.title + " is live. " + (["fastest", "unique"].includes(game.template) ? "" : game.prompt + (/[.?!]$/.test(game.prompt) ? " " : ". ")) + (t.rules[game.rule] ?? Object.values(t.rules)[0]) + ". " + plural(game.seconds, "second") + " each, closes in " + (game.minutes >= 60 && game.minutes % 60 === 0 ? plural(game.minutes / 60, "hour") : plural(game.minutes, "minute")) + ".", gameCard(game));
}

type RouteResult =
  | { kind: "json"; data: unknown; status: number }
  | { kind: "page"; game: ReturnType<typeof gameView> | null; card: ReturnType<typeof gameCard> | null; league?: RuledLeague | null }
  | { kind: "card"; card: ReturnType<typeof gameCard> };

export async function customRoute(method: string, url: URL, read: () => Promise<unknown>, actor?: string, authenticatedPhone?: string): Promise<RouteResult | null> {
  const path = url.pathname;
  const requested = internals.person(url.searchParams.get("u") ?? "");
  const viewer = actor || (nameClaimed(requested) ? "" : requested);
  if (/^\/api\/rounds\/game-[a-z0-9]+\/result$/.test(path)) return { kind: "json", data: { ok: false }, status: 200 };
  if (path === "/api/games" && method === "POST") {
    const body = ((await read()) ?? {}) as { request?: string; template?: string; answer?: string; minutes?: number; name?: string };
    const name = actor || (typeof body.name === "string" ? internals.person(body.name) : "");
    if (!name) return { kind: "json", data: { ok: false, error: "Add your name" }, status: 400 };
    const forced = Object.keys(TEMPLATES).includes(String(body.template)) ? (body.template as Template) : undefined;
    const request = clean(body.request, 240) + (clean(body.answer, 60) ? ", answer is " + clean(body.answer, 60) : "");
    if (!forced && clean(body.request, 240).length < 3) return { kind: "json", data: { ok: false, error: "Describe the game" }, status: 400 };
    const plan = (await planGameAI(request, forced)) ?? planGame(request, forced);
    if (Number(body.minutes) > 0) plan.minutes = clamp(Number(body.minutes), 1, 1440);
    const game = createGame(plan, name);
    return { kind: "json", data: { ok: true, id: game.id, path: "/g/" + game.id, game: gameView(game, name) }, status: 200 };
  }
  const api = path.match(/^\/api\/games\/(game-[a-z0-9]+)$/);
  if (api) {
    let result: { ok: boolean; error?: string } = { ok: true };
    let name = viewer;
    if (method === "POST") {
      const body = ((await read()) ?? {}) as { action?: string; name?: string; value?: unknown; seconds?: unknown; key?: string; answer?: string; verified?: boolean };
      name = actor || (typeof body.name === "string" ? body.name : "");
      result = body.action === "answer" ? submitAnswer(api[1], name, body.value, body.seconds, !!actor, authenticatedPhone) : body.action === "vote" ? castVote(api[1], name, String(body.key ?? "")) : body.action === "reveal" ? revealGame(api[1], name, body.answer) : { ok: false, error: "Unknown action" };
    }
    const game = getGame(api[1]);
    if (!game) return { kind: "json", data: { ok: false, error: "Not found" }, status: 404 };
    return { kind: "json", data: { ...result, game: gameView(game, name) }, status: result.ok ? 200 : 409 };
  }
  if (path === "/api/leagues" && method === "POST") {
    const body = ((await read()) ?? {}) as { name?: string; topic?: string; scoring?: string; seasonDays?: number; picks?: string };
    const name = internals.person(actor || (typeof body.name === "string" ? body.name : ""));
    const topic = clean(body.topic, 48);
    const days = Number(body.seasonDays);
    if (!name || topic.length < 2 || clean(body.scoring, 160).length < 4 || !Number.isInteger(days) || days < 1 || days > 364) return { kind: "json", status: 400, data: { ok: false, error: "Add your name, a topic, scoring and a season of 1 to 364 days" } };
    const league = createFantasy(topic, clean(body.picks, 900).split(",").filter(Boolean), name);
    configureLeague(league.id, name, body.scoring, days);
    return { kind: "json", status: 200, data: { ok: true, league, path: "/f/" + league.id } };
  }
  const leagueApi = path.match(/^\/api\/leagues\/(fantasy-[a-z0-9]+)$/);
  if (leagueApi) {
    const body = method === "POST" ? ((await read()) ?? {}) as { name?: string; scoring?: string; seasonDays?: number } : {};
    const league = internals.store.fantasy[leagueApi[1]];
    if (!league) return { kind: "json", status: 404, data: { ok: false, error: "Not found" } };
    const result = method === "POST" ? configureLeague(league.id, actor || (typeof body.name === "string" ? body.name : ""), body.scoring, body.seasonDays) : { ok: true };
    return { kind: "json", status: result.ok ? 200 : 409, data: { ...result, league, rules: leagueRules(league) } };
  }
  const leaguePage = path.match(/^\/leagues\/(new|fantasy-[a-z0-9]+)\/?$/);
  if (leaguePage) {
    const league = internals.store.fantasy[leaguePage[1]] ?? null;
    return { kind: "page", game: null, card: league ? fantasyCard(league) : null, league };
  }
  const og = path.match(/^\/og\/g\/(game-[a-z0-9]+|new)\.png$/);
  if (og) {
    const game = getGame(og[1]);
    return game ? { kind: "card", card: gameCard(game) } : og[1] === "new" ? { kind: "card", card: newGameCard() } : { kind: "json", data: { ok: false }, status: 404 };
  }
  const page = path.match(/^\/g\/([a-z0-9-]+)\/?$/);
  if (page) {
    const game = getGame(page[1]);
    return { kind: "page", game: game ? gameView(game, viewer) : null, card: game ? gameCard(game) : page[1] === "new" ? newGameCard() : null };
  }
  return null;
}
