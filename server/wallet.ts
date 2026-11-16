import { getPot, internals, joinPot, leaderboard, payMode, type Pot, type TurnReply } from "./brain.js";
import { dayKey } from "./points.js";

export type WalletType = "topup" | "buyin" | "win" | "refund" | "withdrawal" | "forfeit_out" | "forfeit_in";

export interface WalletEntry {
  id: string;
  name: string;
  type: WalletType;
  amountCents: number;
  reason: string;
  at: number;
  potId?: string;
  sessionId?: string;
  stakeCents?: number;
  status?: "pending";
  simulated?: true;
}

export interface Forfeit {
  day: string;
  out: string[];
  shares: Record<string, number>;
  keptCents: number;
  line: string;
}

type WalletPot = Pot & { settled?: boolean; cancelled?: boolean; paidAt?: Record<string, number>; sweptDay?: string; forfeitCents?: number; forfeits?: Forfeit[] };

interface WalletState {
  balances: Record<string, number>;
  wallet: { ledger: WalletEntry[]; credited: Record<string, number>; news: string[] };
  pots: Record<string, WalletPot>;
}

export const TOPUP_MIN = 100;
export const TOPUP_MAX = 1000;
export const WALLET_CAP = 5000;
export const QUICK_AMOUNTS = [100, 200, 500, 1000];
const SHOWN = 30;

const dollars = (cents: number) => "$" + (cents % 100 ? Math.floor(cents / 100) + "." + String(cents % 100).padStart(2, "0") : String(cents / 100));
const list = (names: string[]) => (names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names.join(""));

function state() {
  const s = internals.store as typeof internals.store & Partial<WalletState>;
  s.balances ??= {};
  if (!s.wallet) {
    s.wallet = { ledger: [], credited: {}, news: [] };
    for (const [name, cents] of Object.entries(s.balances)) if (cents) s.wallet.ledger.push({ id: entryId(), name, type: "win", amountCents: cents, reason: "Winnings before the wallet", at: Date.now() });
  }
  s.wallet.news ??= [];
  return s as typeof internals.store & WalletState;
}

const entryId = () => "wal-" + Math.random().toString(36).slice(2, 9);

function move(name: string, type: WalletType, amountCents: number, reason: string, extra: Partial<WalletEntry> = {}): WalletEntry | null {
  const s = state();
  const balance = s.balances[name] ?? 0;
  if (!name || !Number.isInteger(amountCents) || balance + amountCents < 0) return null;
  const entry: WalletEntry = { id: entryId(), name, type, amountCents, reason, at: Date.now(), ...extra };
  s.wallet.ledger.push(entry);
  s.balances[name] = balance + amountCents;
  return entry;
}

export const walletBalance = (name: string) => state().balances[name] ?? 0;
export const ledgerOf = (name: string) => state().wallet.ledger.filter((e) => e.name === name);
export const ledgerSum = (name: string) => ledgerOf(name).reduce((sum, e) => sum + e.amountCents, 0);

export function creditWin(name: string, amountCents: number, reason: string, potId: string): number {
  move(name, "win", amountCents, reason, { potId });
  return walletBalance(name);
}

export function walletView(name: string) {
  return {
    name,
    balanceCents: name ? walletBalance(name) : 0,
    ledger: name ? ledgerOf(name).reverse().slice(0, SHOWN) : [],
    limits: { minCents: TOPUP_MIN, maxCents: TOPUP_MAX, capCents: WALLET_CAP, quick: QUICK_AMOUNTS },
  };
}

export function walletViewer(sessionName: string | undefined, asked: string | null): string {
  if (sessionName) return sessionName;
  const name = internals.person(asked ?? "");
  const s = state() as ReturnType<typeof state> & { auth?: { sessions: Record<string, { token: string }> } };
  const claimed = Object.values(s.auth?.sessions ?? {}).some((x) => s.profiles[x.token]?.name === name);
  return claimed ? "" : name;
}

export function topUpError(name: string, amountCents: number): string | null {
  if (!name) return "Tell me who you are first.";
  if (!Number.isInteger(amountCents) || amountCents < TOPUP_MIN || amountCents > TOPUP_MAX) return "Top-ups run from " + dollars(TOPUP_MIN) + " to " + dollars(TOPUP_MAX) + " at a time.";
  const room = WALLET_CAP - walletBalance(name);
  if (amountCents > room) return "A wallet holds up to " + dollars(WALLET_CAP) + ". You have " + dollars(walletBalance(name)) + (room >= TOPUP_MIN ? ", so you can add up to " + dollars(Math.min(room, TOPUP_MAX)) + "." : ", so it is full.");
  return null;
}

export function topUp(member: string, amountCents: number): { ok: boolean; error?: string; balanceCents?: number } {
  const name = internals.person(member);
  const error = topUpError(name, amountCents);
  if (error) return { ok: false, error };
  move(name, "topup", amountCents, "Added " + dollars(amountCents));
  internals.save();
  return { ok: true, balanceCents: walletBalance(name) };
}

export async function startTopUp(member: string, amountCents: number, base: string): Promise<{ ok: boolean; error?: string; checkoutUrl?: string }> {
  const name = internals.person(member);
  const error = topUpError(name, amountCents);
  if (error) return { ok: false, error };
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]": "Nickel wallet top-up",
    "metadata[kind]": "wallet",
    "metadata[member]": name,
    success_url: base + "/wallet?u=" + name.toLowerCase() + "&paid={CHECKOUT_SESSION_ID}",
    cancel_url: base + "/wallet?u=" + name.toLowerCase(),
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: "Bearer " + process.env.STRIPE_SECRET_KEY, "content-type": "application/x-www-form-urlencoded" }, body: form });
  const out = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!out.url) console.error("Stripe checkout failed", res.status, out.error?.message);
  return out.url ? { ok: true, checkoutUrl: out.url } : { ok: false, error: "Stripe did not open a checkout. Try again." };
}

export async function confirmTopUp(sessionId: string): Promise<boolean> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId) || !process.env.STRIPE_SECRET_KEY) return false;
  if (state().wallet.credited[sessionId]) return false;
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions/" + sessionId, { headers: { authorization: "Bearer " + process.env.STRIPE_SECRET_KEY } });
  const out = (await res.json()) as { id?: string; payment_status?: string; amount_total?: number; currency?: string; metadata?: { kind?: string; member?: string } };
  const name = internals.person(out.metadata?.member);
  const cents = out.amount_total;
  if (out.id !== sessionId || out.payment_status !== "paid" || out.metadata?.kind !== "wallet" || !name || out.currency !== "usd") return false;
  if (typeof cents !== "number" || !Number.isInteger(cents) || cents < TOPUP_MIN || cents > TOPUP_MAX) return false;
  const s = state();
  if (s.wallet.credited[sessionId]) return false;
  s.wallet.credited[sessionId] = Date.now();
  move(name, "topup", cents, "Added " + dollars(cents) + " by card", { sessionId });
  internals.save();
  return true;
}

export function withdraw(member: string, amountCents: number): { ok: boolean; error?: string; balanceCents?: number; entry?: WalletEntry } {
  const name = internals.person(member);
  if (!name) return { ok: false, error: "Tell me who you are first." };
  const balance = walletBalance(name);
  if (!Number.isInteger(amountCents) || amountCents < TOPUP_MIN) return { ok: false, error: "Cash out at least " + dollars(TOPUP_MIN) + "." };
  if (amountCents > balance) return { ok: false, error: "You have " + dollars(balance) + ". You cannot cash out more than that." };
  const entry = move(name, "withdrawal", -amountCents, "Cash out " + dollars(amountCents) + ", arrives in 1 to 2 days", { status: "pending", simulated: true });
  if (!entry) return { ok: false, error: "You have " + dollars(balance) + ". You cannot cash out more than that." };
  internals.save();
  return { ok: true, balanceCents: walletBalance(name), entry };
}

export function payBuyIn(potId: string, member: string): { ok: boolean; error?: string; pot?: Pot; shortCents?: number; balanceCents?: number } {
  const name = internals.person(member);
  const joined = joinPot(potId, name, "in");
  const pot = joined.pot as WalletPot | undefined;
  if (!joined.ok || !pot) return { ok: false, error: joined.error };
  const balance = walletBalance(name);
  if (pot.members[name] === "paid") return { ok: true, pot, balanceCents: balance };
  if (balance < pot.amountCents) return { ok: false, pot, shortCents: pot.amountCents - balance, balanceCents: balance, error: "Your wallet is " + dollars(pot.amountCents - balance) + " short of the " + dollars(pot.amountCents) + " buy-in." };
  move(name, "buyin", -pot.amountCents, dollars(pot.amountCents) + " buy-in", { potId });
  pot.members[name] = "paid";
  (pot.paidAt ??= {})[name] = Date.now();
  internals.save();
  return { ok: true, pot, balanceCents: walletBalance(name) };
}

export function cancelPot(potId: string, by: string): { ok: boolean; error?: string; refunded?: string[]; pot?: Pot } {
  const s = state();
  const pot = s.pots[potId];
  if (!pot) return { ok: false, error: "Not found" };
  if (pot.settled) return { ok: false, error: pot.cancelled ? "That pot is already cancelled." : "That pot is already settled." };
  if (!by || pot.proposer !== by) return { ok: false, error: "Only " + pot.proposer + " can cancel this pot." };
  if (pot.forfeitCents) return { ok: false, error: "This pot holds forfeited money, so it cannot be cancelled. Settle it instead." };
  const bought = (name: string) => s.wallet.ledger.some((e) => e.type === "buyin" && e.potId === potId && e.name === name);
  const refunded = Object.keys(pot.members).filter((name) => pot.members[name] === "paid" && bought(name));
  for (const name of refunded) move(name, "refund", pot.amountCents, "Refund, " + dollars(pot.amountCents) + " buy-in cancelled", { potId });
  pot.settled = true;
  pot.cancelled = true;
  if (s.latestPot === potId) s.latestPot = null;
  internals.save();
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
        move(name, "forfeit_out", 0, "Forfeited the " + dollars(pot.amountCents) + " buy-in, did not play " + when, { potId: pot.id, stakeCents: pot.amountCents });
      }
      for (const name of active) move(name, "forfeit_in", share, "Collected " + dollars(share) + " from " + list(idle) + ", who did not play " + when, { potId: pot.id });
      pot.forfeitCents = (pot.forfeitCents ?? 0) + keptCents;
      const forfeit: Forfeit = { day, out: idle, shares: Object.fromEntries(active.map((name) => [name, share])), keptCents, line };
      (pot.forfeits ??= []).push(forfeit);
      s.wallet.news.push(line);
      done.push(forfeit);
    }
  }
  if (touched) internals.save();
  return done;
}

export function withForfeitNews(turn: TurnReply): TurnReply {
  const s = state();
  if (!turn.addressed || !turn.line || !s.wallet.news.length) return turn;
  const news = s.wallet.news.splice(0).join(" ");
  internals.save();
  return { ...turn, line: news + " " + turn.line };
}

export function walletCard(name: string, addCents = 0) {
  const board = leaderboard();
  const balance = name ? walletBalance(name) : 0;
  return {
    kicker: "Wallet",
    title: name ? dollars(balance) + " in your wallet" : "Your wallet",
    sub: "Add " + dollars(TOPUP_MIN) + " to " + dollars(TOPUP_MAX) + " at a time. Buy-ins come out of it.",
    league: board.league,
    members: name ? [name] : board.people.map((p) => p.name),
    hue: "#34c759",
    path: "/wallet" + (name ? "?u=" + name.toLowerCase() + (addCents ? "&add=" + Math.min(Math.max(addCents, TOPUP_MIN), TOPUP_MAX) : "") : ""),
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
  const sender = internals.person(input.sender) || s.names[(input.senderPhone ?? "").replace(/[^+0-9]/g, "")] || "";
  const say = (line: string): TurnReply => ({ addressed: true, line });
  const found = lower.match(/(\d{1,5})(?:\.(\d{1,2}))?/);
  const cents = found ? Number(found[1]) * 100 + (found[2] ? Number(found[2].padEnd(2, "0")) : 0) : 0;

  if (/\b(cancel|scrap|kill|call off)\b.*\b(pot|buy.?in)\b/.test(lower)) {
    if (!s.latestPot) return say("There is no open pot to cancel.");
    const out = cancelPot(s.latestPot, sender);
    if (!out.ok) return say(out.error!);
    return say("The " + dollars(out.pot!.amountCents) + " pot is cancelled. " + (out.refunded!.length ? list(out.refunded!) + (out.refunded!.length > 1 ? " each get " : " gets ") + dollars(out.pot!.amountCents) + " back in the wallet." : "Nobody had paid, so nothing moves."));
  }

  if (/\b(cash ?out|withdraw)\b/.test(lower)) {
    if (!sender) return say("Tell me your name first: Nickel, I'm Sritej.");
    const amount = /\b(everything|all)\b/.test(lower) ? walletBalance(sender) : cents;
    if (!walletBalance(sender)) return say(sender + ", your wallet is empty. There is nothing to cash out.");
    if (!amount) return cardReply(sender + ", you have " + dollars(walletBalance(sender)) + ". Say how much: Nickel, cash out $5.", walletCard(sender), input.baseUrl);
    const out = withdraw(sender, amount);
    if (!out.ok) return say(sender + ", " + out.error!.replace(/^./, (c) => c.toLowerCase()));
    return cardReply(sender + ", cash out of " + dollars(amount) + " is on its way. It arrives in 1 to 2 days. " + dollars(out.balanceCents!) + " left in your wallet.", walletCard(sender), input.baseUrl);
  }

  if (/buy.?in|\bpot\b/.test(lower)) return null;
  const adding = /\b(top.?up|deposit)\b/.test(lower) || (/\b(add|load)\b/.test(lower) && /\$\s?\d|\d\s?(dollars?|bucks)\b/.test(lower)) || (/\b(add|load|put)\b/.test(lower) && /\bwallet\b/.test(lower));
  if (!adding && !/\bwallet\b/.test(lower)) return null;
  if (!sender) return say("Tell me your name first: Nickel, I'm Sritej.");
  if (!adding || !cents) return cardReply(sender + ", you have " + dollars(walletBalance(sender)) + " in your wallet. Add " + dollars(TOPUP_MIN) + " to " + dollars(TOPUP_MAX) + " at a time.", walletCard(sender), input.baseUrl);
  const error = topUpError(sender, cents);
  if (error) return cardReply(error, walletCard(sender), input.baseUrl);
  return cardReply(sender + ", tap the card to add " + dollars(cents) + " to your wallet. You have " + dollars(walletBalance(sender)) + " now." + (payMode() === "demo" ? " Demo mode, no card is charged." : ""), walletCard(sender, cents), input.baseUrl);
}

export function potView(potId: string) {
  const pot = getPot(potId) as WalletPot | null;
  return pot ? { ...pot, cancelled: !!pot.cancelled, forfeitCents: pot.forfeitCents ?? 0, forfeits: pot.forfeits ?? [] } : null;
}
