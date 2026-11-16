export type Game = "wordle" | "krillion" | "rps";

export interface PointsPart {
  label: string;
  points: number;
}

export interface Points {
  total: number;
  parts: PointsPart[];
}

export interface Extras {
  streakDays?: number;
  first?: boolean;
  upset?: boolean;
}

export interface ResultPayload {
  name?: string;
  opponent?: string;
  won?: boolean;
  score?: string;
  tries?: string;
  time?: string;
  seconds?: number;
  rarity?: number;
}

export interface PastResult {
  roundId: string;
  name: string;
  at: number;
  loser?: string;
  players?: string[];
  solved?: boolean;
  base?: number;
}

export interface Scored {
  total: number;
  moved: number;
  line: string;
  points: Points;
  record: { points: Points; players: string[]; solved: boolean; base: number };
}

export const POINTS_CAP = 20;
export const FIRST_BONUS = 2;
export const UPSET_BONUS = 2;
export const KRILLION_TIERS = ["Wipeout", "Plankton", "Schooler", "Rare", "Deep Cut", "One in a Krillion"];

const sum = (parts: PointsPart[]) => parts.reduce((n, p) => n + p.points, 0);
const speed = (max: number, seconds: number | undefined, limit: number) => (seconds === undefined || limit <= 0 ? 0 : Math.round(max * (1 - Math.min(Math.max(seconds, 0), limit) / limit)));
const plural = (n: number, word: string) => n + " " + word + (n === 1 ? "" : "s");

export const streakMultiplier = (days: number) => 1 + Math.min(Math.max(Math.floor(days) - 1, 0), 5) / 10;

export function scoreWordle(input: { solved: boolean; tries?: number; seconds?: number; limit?: number }): PointsPart[] {
  if (!input.solved) return [{ label: "showing up", points: 1 }];
  const tries = Math.min(Math.max(Math.floor(input.tries ?? 6), 1), 6);
  return [
    { label: "solve", points: 5 },
    { label: "tries", points: 6 - tries },
    { label: "speed", points: speed(4, input.seconds, input.limit ?? 45) },
  ].filter((p) => p.points > 0);
}

export function scoreKrillion(input: { valid: boolean; rarity?: number; seconds?: number; limit?: number }): PointsPart[] {
  if (!input.valid) return [{ label: "showing up", points: 1 }];
  return [
    { label: "answer", points: 5 },
    { label: "rarity", points: Math.min(Math.max(Math.floor(input.rarity ?? 1), 1), 5) - 1 },
    { label: "speed", points: speed(3, input.seconds, input.limit ?? 25) },
  ].filter((p) => p.points > 0);
}

export function scoreRps(input: { stake: number; winnerScore?: number; loserScore?: number }): PointsPart[] {
  const sweep = (input.winnerScore ?? 0) >= 2 && input.loserScore === 0;
  return [
    { label: "stake", points: input.stake },
    { label: "sweep", points: sweep ? 1 : 0 },
  ].filter((p) => p.points > 0);
}

export function applyExtras(base: PointsPart[], extras: Extras = {}, cap = POINTS_CAP): Points {
  const parts = [...base];
  if (extras.first) parts.push({ label: "first in", points: FIRST_BONUS });
  if (extras.upset) parts.push({ label: "upset", points: UPSET_BONUS });
  const streak = Math.round(sum(base) * (streakMultiplier(extras.streakDays ?? 1) - 1));
  if (streak > 0) parts.push({ label: "streak", points: streak });
  if (sum(parts) > cap) parts.push({ label: "cap", points: cap - sum(parts) });
  return { total: sum(parts), parts };
}

export function explain(points: Points): string {
  const nickels = plural(points.total, "Nickel");
  if (points.parts.length === 1) return nickels + (points.parts[0].label === "showing up" ? " for showing up" : "");
  return points.parts.map((p, i) => (i === 0 ? String(p.points) : (p.points < 0 ? "- " : "+ ") + Math.abs(p.points) + " " + p.label)).join(" ") + " = " + nickels;
}

export const dayKey = (at: number) => new Date(at).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

const involves = (r: PastResult, who: string) => r.name === who || r.loser === who || !!r.players?.includes(who);

export function streakDays(results: PastResult[], who: string, now = Date.now()): number {
  const days = new Set(results.filter((r) => involves(r, who)).map((r) => dayKey(r.at)));
  let count = 1;
  while (days.has(dayKey(now - count * 86400000))) count += 1;
  return count;
}

export function parseSeconds(payload: ResultPayload): number | undefined {
  if (typeof payload.seconds === "number" && Number.isFinite(payload.seconds)) return Math.max(0, Math.round(payload.seconds));
  const clock = String(payload.time ?? "").match(/^(\d+):(\d{1,2})$/);
  return clock ? Number(clock[1]) * 60 + Number(clock[2]) : undefined;
}

export function scoreResult(
  round: { id: string; game: Game; title: string; stake?: unknown; seconds?: unknown },
  payload: ResultPayload,
  who: { name: string; rival: string },
  state: { results: PastResult[]; nickels: Record<string, number> },
  now = Date.now(),
): Scored {
  const stake = typeof round.stake === "number" ? round.stake : 5;
  const limit = typeof round.seconds === "number" ? round.seconds : undefined;
  const owned = (name: string) => state.nickels[name] ?? 0;
  const { name, rival } = who;

  if (round.game === "rps") {
    const winner = payload.won ? name : rival;
    const loser = payload.won ? rival : name;
    const digits = (String(payload.score ?? "").match(/\d+/g) ?? []).map(Number).sort((a, b) => b - a);
    const base = scoreRps({ stake, winnerScore: digits[0], loserScore: digits[1] });
    const moved = sum(base);
    const points = applyExtras(base, { streakDays: streakDays(state.results, winner, now), upset: !!winner && !!loser && owned(winner) < owned(loser) });
    const head = winner + " beat " + loser + (digits.length === 2 ? " " + digits[0] + "-" + digits[1] : "") + " at Rock Paper Scissors";
    const line = points.parts.length === 1 ? head + ". " + plural(moved, "Nickel") + " moved." : head + ": " + explain(points) + ". " + loser + " drops " + moved + ".";
    return { total: points.total, moved, line, points, record: { points, players: [name, rival].filter(Boolean), solved: true, base: moved } };
  }

  const solved = !/x/i.test(String(payload.tries ?? "X"));
  const tries = parseInt(String(payload.tries ?? ""), 10);
  const seconds = parseSeconds(payload);
  const base = round.game === "wordle"
    ? scoreWordle({ solved, tries: Number.isFinite(tries) ? tries : undefined, seconds, limit })
    : scoreKrillion({ valid: solved, rarity: payload.rarity, seconds, limit });
  const earlier = state.results.filter((r) => r.roundId === round.id && r.name !== name);
  const points = applyExtras(base, {
    streakDays: streakDays(state.results, name, now),
    first: solved && !earlier.some((r) => r.solved !== false),
    upset: solved && earlier.some((r) => r.base !== undefined && sum(base) > r.base && owned(name) < owned(r.name)),
  });
  const pace = seconds === undefined ? "" : plural(seconds, "second");
  const tier = KRILLION_TIERS[Math.floor(payload.rarity ?? 0)];
  const what = round.game === "wordle"
    ? (solved ? " solved " + round.title + " in " + (tries === 1 ? "1 try" : (Number.isFinite(tries) ? tries : 6) + " tries") + (pace ? " and " + pace : "") : " missed " + round.title)
    : (solved ? " locked in " + round.title + (payload.rarity && tier ? " with a " + tier + " answer" : "") + (pace ? " in " + pace : "") : " wiped out on " + round.title);
  return { total: points.total, moved: 0, line: name + what + ": " + explain(points) + ".", points, record: { points, players: [name], solved, base: sum(base) } };
}
