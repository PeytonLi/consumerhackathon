import { getPot, internals, leaderboard, type Pot, type TurnReply } from "./brain.js";
import { moneyApi, playerKey, potChat } from "./money.js";
import { dayKey } from "./points.js";

export interface Forfeit {
  day: string;
  out: string[];
  shares: Record<string, number>;
  keptCents: number;
  line: string;
}

export interface PotMove {
  key: string;
  potId: string;
  name: string;
  cents: number;
  kind: "win" | "refund" | "forfeit";
  note: string;
  failed?: string;
}

type WalletPot = Pot & { settled?: boolean; cancelled?: boolean; paidAt?: Record<string, number>; sweptDay?: string; forfeitCents?: number; forfeits?: Forfeit[] };

interface WalletState {
  wallet: { news: string[]; outbox: PotMove[]; failed: PotMove[] };
  pots: Record<string, WalletPot>;
}

export const TOPUP_MIN = 100;
export const TOPUP_MAX = 50000;

const dollars = (cents: number) => "$" + (cents % 100 ? Math.floor(cents / 100) + "." + String(cents % 100).padStart(2, "0") : String(cents / 100));
const list = (names: string[]) => (names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names.join(""));

function state() {
  const s = internals.store as typeof internals.store & { wallet?: Partial<WalletState["wallet"]> };
  s.wallet ??= {};
  s.wallet.news ??= [];
  s.wallet.outbox ??= [];
  s.wallet.failed ??= [];
  return s as typeof internals.store & WalletState;
}

function queue(move: PotMove) {
  const s = state();
  if (s.wallet.outbox.some((m) => m.key === move.key)) return;
  s.wallet.outbox.push(move);
  internals.save();
}

export const pendingPotMoves = () => [...state().wallet.outbox];
export const failedPotMoves = () => [...state().wallet.failed];

export function renameWallet(old: string, name: string) {
  const s = state();
  for (const move of [...s.wallet.outbox, ...s.wallet.failed]) if (move.name === old) move.name = name;
}

let flushing: Promise<void> | null = null;
export function flushPotMoves(): Promise<void> {
  flushing ??= drain().finally(() => (flushing = null));
  return flushing;
}

async function drain() {
  const api = moneyApi();
  if (!api) return;
  const s = state();
  for (const move of [...s.wallet.outbox]) {
    const pot = getPot(move.potId);
    const key = playerKey(move.name);
    let out: { ok: boolean; reason?: string };
    try {
      if (!pot || !key) out = { ok: false, reason: "player" };
      else {
        const playerId = await api.mutation<string>("payments:ensurePlayer", { phone: key, name: move.name });
        const refund = move.kind === "refund";
        out = await api.mutation("payments:potMove", { chatId: potChat(pot.league), playerId, key: move.key, note: move.note, ...(refund ? { refundOf: "pot:" + pot.id + ":" + playerId } : { amountCents: move.cents }) });
      }
    } catch (e) {
      console.error("Pot money move will retry", move.key, e);
      continue;
    }
    s.wallet.outbox = s.wallet.outbox.filter((m) => m.key !== move.key);
    if (!out.ok) {
      console.error("Pot money move refused", move.key, out.reason);
      s.wallet.failed.push({ ...move, failed: out.reason ?? "refused" });
    }
    internals.save();
  }
}

export function creditWin(name: string, amountCents: number, reason: string, potId: string) {
  queue({ key: "win:" + potId, potId, name, cents: amountCents, kind: "win", note: reason });
  void flushPotMoves();
}

export function cancelPot(potId: string, by: string): { ok: boolean; error?: string; refunded?: string[]; pot?: Pot } {
  const s = state();
  const pot = s.pots[potId];
  if (!pot) return { ok: false, error: "Not found" };
  if (pot.settled) return { ok: false, error: pot.cancelled ? "That pot is already cancelled." : "That pot is already settled." };
  if (!by || pot.proposer !== by) return { ok: false, error: "Only " + pot.proposer + " can cancel this pot." };
  if (pot.forfeitCents || pot.forfeits?.length) return { ok: false, error: "This pot holds forfeited money, so it cannot be cancelled. Settle it instead." };
  const refunded = Object.keys(pot.members).filter((name) => pot.members[name] === "paid");
  for (const name of refunded) queue({ key: "refund:" + potId + ":" + name, potId, name, cents: pot.amountCents, kind: "refund", note: "Refund, " + dollars(pot.amountCents) + " buy-in cancelled" });
  pot.settled = true;
  pot.cancelled = true;
  if (s.latestPot === potId) s.latestPot = null;
  internals.save();
  void flushPotMoves();
  return { ok: true, refunded, pot };
}

const nextDay = (day: string) => new Date(Date.parse(day + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);

export function sweepForfeits(now = Date.now()): Forfeit[] {
  const s = state();
  const today = dayKey(now);
  const done: Forfeit[] = [];
  let touched = false;
  for (const pot of Object.values(s.pots)) {
    if (pot.settled) continue;
    for (let day = pot.sweptDay ? nextDay(pot.sweptDay) : dayKey(pot.createdAt); day < today; day = nextDay(day)) {
      pot.sweptDay = day;
      touched = true;
      const results = s.results.filter((r) => dayKey(r.at) === day);
      const paid = Object.keys(pot.members).filter((name) => pot.members[name] === "paid" && dayKey(pot.paidAt?.[name] ?? pot.createdAt) <= day);
      const active = paid.filter((name) => results.some((r) => r.name === name || r.loser === name || r.line.includes(name)));
      const idle = paid.filter((name) => !active.includes(name));
      if (!active.length || !idle.length) continue;
      const forfeited = idle.length * pot.amountCents;
      const share = Math.min(Math.floor(forfeited / active.length), pot.amountCents);
      const keptCents = forfeited - share * active.length;
      const when = nextDay(day) === today ? "yesterday" : "on " + day;
      const line = list(idle) + " did not play " + when + ". " + (idle.length > 1 ? "Their " + dollars(pot.amountCents) + " buy-ins" : idle[0] + "'s " + dollars(pot.amountCents)) + " went to " + list(active) + (active.length > 1 ? ", " + dollars(share) + " each" : "") + "." + (keptCents ? " " + dollars(keptCents) + " stays in the pot." : "");
      for (const name of idle) {
        delete pot.members[name];
        if (pot.paidAt) delete pot.paidAt[name];
      }
      for (const name of active) queue({ key: "forfeit:" + pot.id + ":" + day + ":" + name, potId: pot.id, name, cents: share, kind: "forfeit", note: "Collected from " + list(idle) + ", who did not play " + when });
      pot.forfeitCents = (pot.forfeitCents ?? 0) + keptCents;
      const forfeit: Forfeit = { day, out: idle, shares: Object.fromEntries(active.map((name) => [name, share])), keptCents, line };
      (pot.forfeits ??= []).push(forfeit);
      s.wallet.news.push(line);
      done.push(forfeit);
    }
  }
  if (touched) internals.save();
  if (done.length) void flushPotMoves();
  return done;
}

export function withForfeitNews(turn: TurnReply): TurnReply {
  const s = state();
  if (!turn.addressed || !turn.line || !s.wallet.news.length) return turn;
  const news = s.wallet.news.splice(0).join(" ");
  internals.save();
  return { ...turn, line: news + " " + turn.line };
}

export function walletCard(addCents = 0, cashout = false) {
  const query = cashout ? "?cashout=1" : addCents ? "?add=" + Math.min(Math.max(addCents, TOPUP_MIN), TOPUP_MAX) : "";
  return {
    kicker: "Wallet",
    title: cashout ? "Cash out" : addCents ? "Add " + dollars(Math.max(addCents, TOPUP_MIN)) : "Your wallet",
    sub: "Your Nickel balance. Buy-ins and stakes come out of it.",
    league: leaderboard().league,
    members: [] as string[],
    hue: "#34c759",
    path: "/wallet" + query,
  };
}

const cardReply = (line: string, card: ReturnType<typeof walletCard>, baseUrl: string): TurnReply => ({
  addressed: true,
  line,
  url: baseUrl.replace(/\/+$/, "") + card.path,
  card: { kicker: (card.kicker + " \u00b7 " + card.league).toUpperCase(), title: card.title, sub: card.sub, path: card.path },
});

export function walletTurn(input: { text: string; sender?: string; senderPhone?: string; baseUrl: string }): TurnReply | null {
  const s = state();
  const lower = input.text.trim().toLowerCase().replace(/@?nickel/g, " ");
  if (/\b(remember|forget|fantasy)\b/.test(lower)) return null;
  const sender = s.names[(input.senderPhone ?? "").replace(/[^+0-9]/g, "")] || internals.person(input.sender) || "";
  const say = (line: string): TurnReply => ({ addressed: true, line });
  const found = lower.match(/(\d{1,5})(?:\.(\d{1,2}))?/);
  const cents = found ? Number(found[1]) * 100 + (found[2] ? Number(found[2].padEnd(2, "0")) : 0) : 0;

  if (/\b(cancel|scrap|kill|call off)\b.*\b(pot|buy.?in)\b/.test(lower)) {
    if (!s.latestPot) return say("There is no open pot to cancel.");
    const out = cancelPot(s.latestPot, sender);
    if (!out.ok) return say(out.error!);
    return say("The " + dollars(out.pot!.amountCents) + " pot is cancelled. " + (out.refunded!.length ? list(out.refunded!) + (out.refunded!.length > 1 ? " each get " : " gets ") + dollars(out.pot!.amountCents) + " back in the wallet." : "Nobody had paid, so nothing moves."));
  }

  if (/\b(cash ?out|withdraw)\b/.test(lower)) return cardReply((sender ? sender + ", cash" : "Cash") + " out from your wallet. Whop checks your ID the first time.", walletCard(0, true), input.baseUrl);

  if (/buy.?in|\bpot\b/.test(lower)) return null;
  const adding = /\b(top.?up|deposit)\b/.test(lower) || (/\b(add|load)\b/.test(lower) && /\$\s?\d|\d\s?(dollars?|bucks)\b/.test(lower)) || (/\b(add|load|put)\b/.test(lower) && /\bwallet\b/.test(lower));
  if (!adding && !/\bwallet\b/.test(lower)) return null;
  if (!adding || !cents) return cardReply((sender ? sender + ", your" : "Your") + " balance is in your wallet. Add " + dollars(TOPUP_MIN) + " or more at a time.", walletCard(), input.baseUrl);
  if (cents < TOPUP_MIN || cents > TOPUP_MAX) return cardReply("Top-ups run from " + dollars(TOPUP_MIN) + " to " + dollars(TOPUP_MAX) + " at a time.", walletCard(), input.baseUrl);
  return cardReply((sender ? sender + ", tap" : "Tap") + " the card to add " + dollars(cents) + " to your wallet.", walletCard(cents), input.baseUrl);
}

export function potView(potId: string) {
  const pot = getPot(potId) as WalletPot | null;
  return pot ? { ...pot, cancelled: !!pot.cancelled, forfeitCents: pot.forfeitCents ?? 0, forfeits: pot.forfeits ?? [] } : null;
}
