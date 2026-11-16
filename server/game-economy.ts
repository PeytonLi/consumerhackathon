import { onPlayed, onRoundClosed, onRoundOpened } from "./economy.js";

interface Table {
  chatId: string;
  roundId: string;
  closesAt: number;
  members: Record<string, { opened?: boolean }>;
  closed?: boolean;
  plays: Record<string, { score: number; done?: boolean }>;
}

export interface GameEconomyStore { gameEconomy?: Record<string, Table> }

const zone = "America/Los_Angeles";
const date = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
const hour = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" });
const phoneIsValid = (phone: string) => /^\+\d{7,15}$/.test(phone);

export function dailyWindow(now: number) {
  const day = date.format(now);
  const midnight = Date.parse(day + "T00:00:00Z");
  const candidate = midnight + 29 * 3600000;
  const closesAt = candidate + (21 - Number(hour.format(candidate))) * 3600000;
  return { day, closesAt };
}

let source: () => GameEconomyStore = () => ({});
let persist = () => {};
let flushing: Promise<void> | undefined;

export function attachGameEconomy(get: () => GameEconomyStore, save: () => void) {
  source = get;
  persist = save;
}

function tableFor(league: string, phone: string, now: number): Table | null {
  if (!league || !phoneIsValid(phone)) return null;
  const { day, closesAt } = dailyWindow(now);
  if (now >= closesAt) return null;
  const tables = source().gameEconomy ??= {};
  const chatId = "league:" + league;
  const key = JSON.stringify([chatId, day]);
  const table = tables[key] ??= { chatId, roundId: "daily:" + day, closesAt, members: {}, plays: {} };
  table.members[phone] ??= {};
  return table;
}

export function openDailyEconomy(league: string, phone: string, now = Date.now()) {
  if (!tableFor(league, phone, now)) return;
  persist();
  void flushGameEconomy();
}

export function recordEconomyPlay(league: string, phone: string, score: number, now = Date.now()) {
  if (!Number.isFinite(score)) return;
  const table = tableFor(league, phone, now);
  if (!table) return;
  table.plays[phone] ??= { score };
  persist();
  void flushGameEconomy();
}

export function flushGameEconomy(): Promise<void> {
  if (flushing) return flushing;
  flushing = flush().catch((error) => console.error("Game economy retry failed", error)).finally(() => { flushing = undefined; });
  return flushing;
}

async function flush() {
  for (const table of Object.values(source().gameEconomy ?? {})) {
    if (table.closed) continue;
    for (const [phone, member] of Object.entries(table.members)) {
      if (member.opened || Date.now() >= table.closesAt) continue;
      const opened = await onRoundOpened(table.chatId, table.roundId, [phone]);
      if (!opened) continue;
      member.opened = true;
      persist();
    }
    for (const [phone, play] of Object.entries(table.plays)) {
      if (play.done) continue;
      if (!table.members[phone]?.opened && Date.now() < table.closesAt) continue;
      const played = await onPlayed(table.chatId, table.roundId, phone, play.score);
      if (!played) continue;
      play.done = true;
      persist();
    }
    if (Date.now() < table.closesAt || Object.values(table.plays).some((play) => !play.done)) continue;
    const closed = await onRoundClosed(table.chatId, table.roundId);
    if (!closed) continue;
    table.closed = true;
    persist();
  }
}
