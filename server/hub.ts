import { getRound, internals, leaderboard, potSummary, type Pot, type TurnReply } from "./brain.js";
import { creditWin, ledgerOf } from "./wallet.js";
import { roster, standing } from "./roster.js";

export interface Fact {
  text: string;
  by: string;
  at: number;
}

export interface Payout {
  id: string;
  name: string;
  amountCents: number;
  reason: string;
  at: number;
  potId: string;
}

type SettledPot = Pot & { settled?: boolean; winner?: string; settledAt?: number; forfeitCents?: number };

interface HubState {
  memory: { people: Record<string, Fact[]>; group: Fact[] };
  payouts: Payout[];
  balances: Record<string, number>;
  picks: Record<string, Record<string, number>>;
  pots: Record<string, SettledPot>;
}

export const PERSON_FACTS = 8;
export const GROUP_FACTS = 12;
export const DERIVED_FACTS = 4;
export const FACT_LENGTH = 120;
const PAYOUTS_KEPT = 200;
const MOVES = ["rock", "paper", "scissors"];

function state() {
  const s = internals.store as typeof internals.store & Partial<HubState>;
  s.memory ??= { people: {}, group: [] };
  s.memory.people ??= {};
  s.memory.group ??= [];
  s.payouts ??= [];
  s.balances ??= {};
  s.picks ??= {};
  return s as typeof internals.store & HubState;
}

const dollars = (cents: number) => "$" + (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));
const mentions = (text: string, name: string) => new RegExp("\\b" + name + "\\b", "i").test(text);
const boardNames = () => leaderboard().people.map((p) => p.name);
const top = (counts: Record<string, number>) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

function clean(raw: string) {
  const text = raw.replace(/<\/?[a-z][^>]*>/gi, "").replace(/\p{Extended_Pictographic}|\uFE0F|\u200D|[<>]/gu, "").replace(/\s+/g, " ").trim().replace(/[.!]+$/, "").slice(0, FACT_LENGTH).trim();
  return text.replace(/^./, (c) => c.toUpperCase());
}

function events() {
  return state().results.map((r) => {
    const duel = r.line.match(/^([A-Za-z]+) beat ([A-Za-z]+) /);
    const game = getRound(r.roundId)?.title ?? "";
    return duel ? { winner: duel[1], loser: duel[2], game, at: r.at } : { winner: r.loser ? "" : r.name, loser: r.loser ?? "", game, at: r.at };
  });
}

function derivedFor(name: string, all: ReturnType<typeof events>) {
  const facts: string[] = [];
  const mine = all.filter((e) => e.winner === name || e.loser === name);
  const lostLast = mine.length > 0 && mine[mine.length - 1].loser === name;
  let streak = 0;
  for (let i = mine.length - 1; i >= 0 && (mine[i].loser === name) === lostLast; i--) streak += 1;
  if (streak >= 2) facts.push(name + " has " + (lostLast ? "lost " : "won ") + streak + " in a row");
  const picks = state().picks[name] ?? {};
  const thrown = Object.values(picks).reduce((sum, n) => sum + n, 0);
  const favorite = top(picks);
  if (favorite && thrown >= 3 && favorite[1] / thrown >= 0.6) facts.push(name + (favorite[1] === thrown ? " always picks " : " mostly picks ") + favorite[0]);
  const beaten: Record<string, number> = {};
  for (const e of mine) if (e.winner === name && e.loser) beaten[e.loser] = (beaten[e.loser] ?? 0) + 1;
  const victim = top(beaten);
  if (victim && victim[1] >= 2) facts.push(name + " has beaten " + victim[0] + " " + victim[1] + " times");
  const games: Record<string, number> = {};
  for (const e of mine) if (e.game) games[e.game] = (games[e.game] ?? 0) + 1;
  const game = top(games);
  if (game && mine.length >= 3 && game[1] >= 2) facts.push(name + " plays " + game[0] + " the most");
  return facts.slice(0, DERIVED_FACTS);
}

function derivedForGroup(all: ReturnType<typeof events>) {
  if (all.length < 3) return [];
  const hours: Record<string, number> = {};
  const games: Record<string, number> = {};
  for (const e of all) {
    const hour = new Date(e.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: true });
    hours[hour] = (hours[hour] ?? 0) + 1;
    if (e.game) games[e.game] = (games[e.game] ?? 0) + 1;
  }
  const facts = ["The group plays most at " + top(hours)[0]];
  const game = top(games);
  if (game) facts.push(game[0] + " is the group's most played game");
  return facts.slice(0, DERIVED_FACTS);
}

const opens = (text: string, name: string) => text.toLowerCase().startsWith(name.toLowerCase() + " ");
const toldAbout = (name: string) => [...(state().memory.people[name] ?? []), ...state().memory.group.filter((f) => opens(f.text, name))].map((f) => f.text);
const toldGroup = (names: string[]) => state().memory.group.filter((f) => !names.some((n) => opens(f.text, n))).map((f) => f.text);

export function memoryOf(name: string): string[] {
  return [...derivedFor(name, events()), ...toldAbout(name)];
}

export function groupMemory(): string[] {
  return [...derivedForGroup(events()), ...toldGroup(boardNames())];
}

export function remember(raw: string, by: string): { ok: boolean; about?: string | null; text?: string; error?: string } {
  const s = state();
  const text = clean(raw);
  if (text.length < 3) return { ok: false, error: "Empty" };
  const names = boardNames();
  const about = /^(i|i'?m|my|me)\b/i.test(text)
    ? names.includes(by) ? by : null
    : /^(we|our|us|the group|everyone|everybody|nobody)\b/i.test(text)
      ? null
      : names.filter((n) => mentions(text, n)).sort((a, b) => text.toLowerCase().indexOf(a.toLowerCase()) - text.toLowerCase().indexOf(b.toLowerCase()))[0] ?? null;
  const list = about ? (s.memory.people[about] ??= []) : s.memory.group;
  if (list.some((f) => f.text.toLowerCase() === text.toLowerCase())) return { ok: false, about, text, error: "Duplicate" };
  list.push({ text, by, at: Date.now() });
  list.splice(0, list.length - (about ? PERSON_FACTS : GROUP_FACTS));
  internals.save();
  return { ok: true, about, text };
}

export function forget(raw: string, by: string): { ok: boolean; removed: string[]; owner?: string } {
  const s = state();
  const query = raw.replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  const everything = /^(everything|all|anything)?\s*(about |on )?(me|myself)$/.test(query);
  if (!query || (everything && !by)) return { ok: false, removed: [] };
  const lists: [string | null, Fact[]][] = [...Object.entries(s.memory.people), [null, s.memory.group]];
  const removed: string[] = [];
  let owner: string | undefined;
  for (const [about, list] of lists) {
    for (const fact of [...list]) {
      const mine = fact.by === by || (!!by && (about === by || (!about && mentions(fact.text, by))));
      if (everything ? about !== by : !fact.text.toLowerCase().includes(query)) continue;
      if (!mine) {
        owner ??= fact.by || "Someone";
        continue;
      }
      list.splice(list.indexOf(fact), 1);
      removed.push(fact.text);
    }
  }
  if (removed.length) internals.save();
  return { ok: removed.length > 0, removed, owner: removed.length ? undefined : owner };
}

export function notePicks(name: string, payload: object) {
  const picks = (payload as { picks?: unknown }).picks;
  if (!name || !Array.isArray(picks)) return;
  const counts = (state().picks[name] ??= {});
  for (const pick of picks.slice(0, 9)) {
    const move = String(pick).toLowerCase();
    if (MOVES.includes(move)) counts[move] = (counts[move] ?? 0) + 1;
  }
}

export const balanceOf = (name: string) => state().balances[name] ?? 0;

export function renamePlayer(old: string, name: string) {
  const s = state();
  if (old in s.balances) { s.balances[name] = (s.balances[name] ?? 0) + s.balances[old]; delete s.balances[old]; }
  if (s.picks[old]) {
    const counts = (s.picks[name] ??= {});
    for (const [pick, count] of Object.entries(s.picks[old])) counts[pick] = (counts[pick] ?? 0) + count;
    delete s.picks[old];
  }
  if (s.memory.people[old]) {
    s.memory.people[name] = [...(s.memory.people[name] ?? []), ...s.memory.people[old]].slice(-PERSON_FACTS);
    delete s.memory.people[old];
  }
  for (const fact of [...Object.values(s.memory.people).flat(), ...s.memory.group]) if (fact.by === old) fact.by = name;
  for (const payout of s.payouts) if (payout.name === old) payout.name = name;
}

export function settlePot(potId: string): { ok: boolean; error?: string; payout?: Payout; balanceCents?: number } {
  const s = state();
  const pot = s.pots[potId];
  if (!pot) return { ok: false, error: "Not found" };
  if (pot.settled) return { ok: false, error: "Already settled" };
  const amountCents = potSummary(pot).paidCents + (pot.forfeitCents ?? 0);
  if (!amountCents) return { ok: false, error: "Nobody has paid in yet" };
  if (!s.results.length) return { ok: false, error: "No games played yet" };
  const winner = leaderboard().people[0]?.name;
  if (!winner) return { ok: false, error: "No games played yet" };
  const payout: Payout = { id: "pay-" + Math.random().toString(36).slice(2, 7), name: winner, amountCents, reason: "Won the " + dollars(amountCents) + " pot", at: Date.now(), potId };
  pot.settled = true;
  pot.winner = winner;
  pot.settledAt = payout.at;
  if (s.latestPot === potId) s.latestPot = null;
  s.payouts.push(payout);
  s.payouts.splice(0, s.payouts.length - PAYOUTS_KEPT);
  const balanceCents = creditWin(winner, amountCents, payout.reason, potId);
  internals.save();
  return { ok: true, payout, balanceCents };
}

export function hubTurn(input: { text: string; sender?: string; senderPhone?: string }): TurnReply | null {
  const s = state();
  const text = input.text.trim().replace(/[,\s]*@?nickel[.!?\s]*$/i, "");
  const lower = text.toLowerCase();
  const sender = s.names[(input.senderPhone ?? "").replace(/[^+0-9]/g, "")] || internals.person(input.sender) || "";
  const say = (line: string): TurnReply => ({ addressed: true, line });

  const asked = lower.match(/\b(?:what do (?:you|u)|do (?:you|u)|what'?s|anything)\b.*\b(?:know|remember|got)\b.*\babout\s+(.+?)[?.!\s]*$/)?.[1];
  if (asked) {
    if (/^(us|the group|the league|everyone|everybody|the chat|this group)$/.test(asked)) {
      const facts = groupMemory();
      return say(facts.length ? "The group: " + facts.slice(0, 5).join(". ") + "." : "Nothing on the group yet. Play a few games, or tell me: Nickel, remember that we play on Fridays.");
    }
    const who = /^(me|myself)$/.test(asked) ? sender : internals.person(asked.split(" ")[0]);
    if (!who) return say("Tell me your name first: Nickel, I'm Sritej.");
    const facts = [...new Set([...memoryOf(who), ...s.memory.group.map((f) => f.text).filter((f) => mentions(f, who))])];
    return say(facts.length ? who + ": " + facts.slice(0, 5).join(". ") + "." : "Nothing on " + who + " yet. Tell me: Nickel, remember that " + who + " always picks rock.");
  }

  const told = /\b(do|did|don'?t|can|will) (you|u|i|we) remember\b|\b(can'?t|cannot|don'?t|didn'?t|do not|never|won'?t) remember\b/.test(lower) ? undefined : text.match(/\bremember\b(?:\s+that\b)?\s*(.*)$/i)?.[1];
  if (told !== undefined) {
    const out = remember(told, sender);
    if (out.error === "Duplicate") return say("Already have that one.");
    if (!out.ok) return say("Remember what? Say: Nickel, remember that Alex owes everyone boba.");
    return say("Noted " + (out.about ? "about " + out.about : "for the group") + ": " + out.text + ".");
  }

  const dropped = text.match(/\bforget\s+(?:that\s+|about\s+)?(.+)$/i)?.[1];
  if (dropped !== undefined) {
    const out = forget(dropped, sender);
    if (out.ok) return say("Forgotten: " + out.removed.slice(0, 3).join(". ") + ".");
    return say(out.owner ? "That one is not yours to remove. " + out.owner + " added it." : "Nothing like that in memory.");
  }

  if (/\bsettle\b.*\b(pot|buy.?in|up)\b|\bpay ?out the pot\b/.test(lower)) {
    const last = Object.values(s.pots).filter((p) => p.settled && p.winner).sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0))[0];
    if (!s.latestPot) return say(last ? "That pot is already settled. " + last.winner + " took it." : "No buy-in to settle. Say: Nickel, $5 buy-in.");
    const out = settlePot(s.latestPot);
    if (!out.ok) return say(out.error === "Nobody has paid in yet" ? "Nobody has paid into the pot yet, so there is nothing to settle." : out.error === "No games played yet" ? "Nobody has played yet, so there is no leader to pay. Finish a game first." : "That pot is already settled.");
    return say(out.payout!.name + " leads the board and takes the " + dollars(out.payout!.amountCents) + " pot. " + out.payout!.name + "'s balance is " + dollars(out.balanceCents!) + ". It stays on the Nickel ledger.");
  }

  if (/\bbalances?\b|\bwinnings\b/.test(lower)) {
    if (/\bbalances\b|\beveryone|\ball\b|\bour\b/.test(lower)) {
      const rows = Object.entries(s.balances).filter(([, cents]) => cents > 0).sort((a, b) => b[1] - a[1]);
      return say(rows.length ? "Balances: " + rows.map(([who, cents]) => who + " " + dollars(cents)).join(", ") + "." : "Every balance is $0. Settle a pot to move one.");
    }
    if (!sender) return say("Tell me your name first: Nickel, I'm Sritej.");
    return say(sender + ", your balance is " + dollars(balanceOf(sender)) + ". It stays on the Nickel ledger.");
  }

  return null;
}

export function hub(me: { token: string; name: string; face: string | null } | null) {
  const s = state();
  const signed = roster();
  const board = leaderboard(signed.demo ? undefined : signed.members.map((m) => m.name));
  const all = events();
  return {
    me: me ? { token: me.token, name: me.name, face: me.face } : null,
    league: { name: board.league, stakes: board.stakes, punishment: board.punishment },
    people: board.people.map((p) => ({
      name: p.name,
      rank: p.rank,
      nickels: p.nickels,
      played: p.played,
      wins: p.wins,
      losses: p.losses,
      title: p.title,
      face: p.face,
      last: p.last,
      balanceCents: s.balances[p.name] ?? 0,
      memory: [...derivedFor(p.name, all), ...toldAbout(p.name)],
    })),
    group: { memory: [...derivedForGroup(all), ...toldGroup(board.people.map((p) => p.name))] },
    pots: Object.values(s.pots).sort((a, b) => b.createdAt - a.createdAt).map((p) => ({ id: p.id, amountCents: p.amountCents, members: p.members, settled: !!p.settled, winner: p.winner ?? null })),
    payouts: [...s.payouts].reverse().map((p) => ({ id: p.id, name: p.name, amountCents: p.amountCents, reason: p.reason, at: p.at })),
    recent: [...s.results.map((r) => ({ line: r.line, at: r.at })), ...s.payouts.map((p) => ({ line: p.name + " took the " + dollars(p.amountCents) + " pot.", at: p.at }))].sort((a, b) => b.at - a.at).slice(0, 12),
    walletLedger: me ? ledgerOf(me.name).reverse() : [],
    roster: standing(signed, board.people, all),
  };
}

type Board = { league: string; stakes: string | null; punishment: string | null; people: { name: string; nickels: number }[] };

export const wantsHub = (lower: string) =>
  /\b(hub|home|dashboard|everything)\b/.test(lower) && !/challenge|fantasy|buy.?in|who won|standings|leaderboard|punish|\bplay\b|i'?m in\b|\$\d|remember|forget|memory/.test(lower);

export const hubLine = (sender: string) => (sender ? sender + ", here" : "Here") + " is everything in one place: the board, each person, pots, payouts and what I remember.";

export function hubCard(board: Board) {
  const top = board.people[0];
  return {
    kicker: "Hub",
    title: "Everything, one place",
    sub: (top && top.nickels > 0 ? top.name + " leads. " : "") + "The board, each person, pots and memory.",
    league: board.league,
    members: board.people.map((p) => p.name),
    hue: "#5856d6",
    path: "/h",
  };
}
