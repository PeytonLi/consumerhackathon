import type { Points, ResultPayload } from "./points.js";

export const ARCADE = {
  reaction: { title: "Reaction", seconds: 15, hue: "#007aff" },
  freethrow: { title: "Free Throw", seconds: 20, hue: "#ff9500" },
  memory: { title: "Memory", seconds: 25, hue: "#5856d6" },
  math: { title: "Math Sprint", seconds: 20, hue: "#0f9fbf" },
  higherlower: { title: "Higher or Lower", seconds: 20, hue: "#5856d6" },
} as const;

export type ArcadeGame = keyof typeof ARCADE;
export interface ArcadeEvent { at: number; value: number }
export interface ArcadePayload { action: "status" | "start" | "finish"; events?: ArcadeEvent[]; abandoned?: boolean }
export interface ArcadeOutcome { score: number; label: string; won: boolean }
export interface ArcadeChallenge {
  reactionWaits: number[];
  sequence: number[];
  questions: { text: string; choices: number[]; answer: number }[];
  deck: number[];
  speeds: number[];
}
interface Attempt { startedAt: number; deadline: number }
interface ArcadeRound { id: string; game: string; arcade?: unknown; arcadeAttempts?: unknown }
interface SavedResult { roundId: string; name: string; line: string; points?: Points; arcadeOutcome?: ArcadeOutcome }
export interface ArcadeReply {
  ok: boolean;
  error?: string;
  line?: string;
  points?: Points;
  serverNow?: number;
  attempt?: Attempt | null;
  result?: (ArcadeOutcome & { points?: Points; line: string }) | null;
  board?: { name: string; score: number; label: string }[];
}

export const isArcadeGame = (game: string): game is ArcadeGame => Object.hasOwn(ARCADE, game);

export function arcadeGame(text: string): ArcadeGame | null {
  if (/\breaction\b|\breflex(?:es)?\b/i.test(text)) return "reaction";
  if (/\bfree\s*throw\b|\bbasketball\b|\bcup\s*pong\b/i.test(text)) return "freethrow";
  if (/\bmemory\b|\bsimon\b/i.test(text)) return "memory";
  if (/\bmath\b|\bmaths\b|\barithmetic\b/i.test(text)) return "math";
  if (/\bhigher\s*(?:or\s*|\/\s*)?lower\b|\bhigherlower\b/i.test(text)) return "higherlower";
  return null;
}

export function createArcade(game: ArcadeGame) {
  const int = (n: number) => Math.floor(Math.random() * n);
  const questions = Array.from({ length: 20 }, (_, i) => {
    const a = 2 + int(i < 8 ? 15 : 25), b = 2 + int(12), multiply = i % 3 === 2;
    const answer = multiply ? a * b : a + b;
    const choices = [answer, answer + 1 + int(5), answer - 1 - int(5)];
    const shift = int(3);
    return { text: a + (multiply ? " × " : " + ") + b, answer, choices: [...choices.slice(shift), ...choices.slice(0, shift)] };
  });
  const deck = [2 + int(12)];
  for (let i = 0; i < 20; i++) {
    let next = 2 + int(12);
    if (next === deck[i]) next = next === 13 ? 2 : next + 1;
    deck.push(next);
  }
  const arcade: ArcadeChallenge = {
    reactionWaits: Array.from({ length: 3 }, () => 2800 + int(1000)),
    sequence: Array.from({ length: 20 }, () => int(4)),
    questions,
    deck,
    speeds: Array.from({ length: 5 }, (_, i) => 2.1 + i * 0.35),
  };
  return { title: ARCADE[game].title, seconds: ARCADE[game].seconds, arcade };
}

export function arcadeOutcome(game: ArcadeGame, score: number): ArcadeOutcome {
  const label = game === "reaction" ? score + "/1000 reflex" : game === "freethrow" ? score + "/500 accuracy" : game === "memory" ? score + " steps" : game === "math" ? score + "/20 correct" : score + " in a row";
  const threshold = { reaction: 500, freethrow: 250, memory: 7, math: 8, higherlower: 5 };
  return { score, label, won: score >= threshold[game] };
}

export function validateArcade(game: ArcadeGame, challenge: ArcadeChallenge, events: unknown, elapsed: number): ArcadeOutcome | string {
  if (!Array.isArray(events) || events.length > 100) return "That run has too many inputs.";
  const limit = ARCADE[game].seconds * 1000;
  let last = -1;
  for (const event of events) {
    if (!event || !Number.isInteger(event.at) || !Number.isFinite(event.value) || !Number.isInteger(event.value) || event.at < 0 || event.at > limit || event.at > elapsed + 100 || event.at <= last) return "That input timing is not possible.";
    if (last >= 0 && event.at - last < 80) return "Those inputs are faster than a human run.";
    last = event.at;
  }
  const input = events as ArcadeEvent[];
  let score = 0;
  if (game === "reaction") {
    if (input.length > 3) return "Reaction has three trials.";
    let start = 0;
    for (let i = 0; i < input.length; i++) {
      const e = input[i], signal = start + challenge.reactionWaits[i];
      if (e.value === 0) {
        if (e.at >= signal) return "A false start must be before the signal.";
      } else {
        if (e.value < 120 || e.value > limit || Math.abs(e.at - signal - e.value) > 100) return "That reaction time is outside human limits.";
        score += Math.max(0, 1000 - e.value);
      }
      start = e.at + 250;
    }
    score = Math.round(score / 3);
  } else if (game === "freethrow") {
    if (input.length > 5) return "Free Throw has five shots.";
    let start = 0;
    for (let i = 0; i < input.length; i++) {
      const e = input[i];
      const expected = Math.round((Math.sin((e.at - start) / 1000 * challenge.speeds[i]) + 1) * 500);
      if (e.value < 0 || e.value > 1000 || e.at - start < 100 || Math.abs(e.value - expected) > 45) return "That shot does not match the moving bar.";
      score += Math.max(0, 100 - Math.round(Math.abs(e.value - 500) / 5));
      start = e.at + 500;
    }
  } else if (game === "memory") {
    let length = 3, cursor = 0, readyAt = 3 * 550;
    for (let i = 0; i < input.length; i++) {
      const e = input[i];
      if (e.value < 0 || e.value > 3 || e.at < readyAt) return "Wait for the memory sequence before tapping.";
      if (e.value !== challenge.sequence[cursor]) {
        if (i !== input.length - 1) return "The run ends at the first missed step.";
        break;
      }
      score++;
      cursor++;
      if (cursor === length) { length++; cursor = 0; readyAt = e.at + 350 + length * 550; }
    }
  } else if (game === "math") {
    if (input.length > 20) return "Math Sprint has twenty questions.";
    for (let i = 0; i < input.length; i++) {
      if (!challenge.questions[i].choices.includes(input[i].value)) return "Pick one of the displayed answers.";
      if (input[i].value === challenge.questions[i].answer) score++;
    }
  } else {
    if (input.length > 20) return "Higher or Lower has twenty cards.";
    for (let i = 0; i < input.length; i++) {
      if (input[i].value !== 1 && input[i].value !== -1) return "Choose higher or lower.";
      const correct = Math.sign(challenge.deck[i + 1] - challenge.deck[i]) === input[i].value;
      if (!correct) {
        if (i !== input.length - 1) return "The run ends at the first wrong card.";
        break;
      }
      score++;
    }
  }
  return arcadeOutcome(game, score);
}

export function arcadeView(round: ArcadeRound, name: string, results: SavedResult[]): ArcadeReply {
  const done = results.find((r) => r.roundId === round.id && r.name === name);
  const attempts = (round.arcadeAttempts ?? {}) as Record<string, Attempt>;
  return {
    ok: true,
    serverNow: Date.now(),
    attempt: attempts[name] ?? null,
    result: done?.arcadeOutcome ? { ...done.arcadeOutcome, points: done.points, line: done.line } : null,
    board: results.filter((r) => r.roundId === round.id && r.arcadeOutcome).map((r) => ({ name: r.name, score: r.arcadeOutcome!.score, label: r.arcadeOutcome!.label })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
  };
}

export function arcadeSubmission(round: ArcadeRound, name: string, payload: ResultPayload, results: SavedResult[], save: () => void, now = Date.now()): { reply: ArcadeReply } | { outcome: ArcadeOutcome; seconds: number } {
  if (!isArcadeGame(round.game)) return { reply: { ok: false } };
  const view = () => arcadeView(round, name, results);
  const action = payload.arcade?.action;
  if (view().result || action === "status") return { reply: view() };
  const attempts = (round.arcadeAttempts ??= {}) as Record<string, Attempt>;
  if (action === "start") {
    attempts[name] ??= { startedAt: now, deadline: now + ARCADE[round.game].seconds * 1000 };
    save();
    return { reply: view() };
  }
  const attempt = attempts[name];
  if (action !== "finish" || !attempt) return { reply: { ok: false, error: "Start the round before submitting a score." } };
  if (payload.arcade?.abandoned) return { outcome: arcadeOutcome(round.game, 0), seconds: ARCADE[round.game].seconds };
  const checked = validateArcade(round.game, round.arcade as ArcadeChallenge, payload.arcade?.events, now - attempt.startedAt);
  return typeof checked === "string" ? { reply: { ok: false, error: checked } } : { outcome: checked, seconds: Math.min(ARCADE[round.game].seconds, Math.max(0, Math.round((now - attempt.startedAt) / 1000))) };
}
