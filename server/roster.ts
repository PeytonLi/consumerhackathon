import { existsSync, readFileSync, statSync } from "node:fs";
import { internals } from "./brain.js";

export interface Member {
  name: string;
  token: string | null;
  face: string | null;
  claimed: boolean;
  joinedAt: number | null;
  played: boolean;
  ready: boolean;
  demo: boolean;
}

export interface Pending {
  label: string;
  joinedAt: number | null;
  claimed: boolean;
}

export type Role = "winner" | "loser" | "";
export type Outcome = { winner: string; loser: string };

const artDir = (process.env.NICKEL_DATA_DIR ?? new URL("../.data/", import.meta.url).pathname) + "/art";

export const demoMode = () => process.env.NICKEL_DEMO === "1";

export function joinInfo() {
  const code = process.env.NICKEL_JOIN_CODE ?? "K-HQF6D6";
  const line = process.env.NICKEL_LINE ?? "+1 (779) 625-1378";
  return { code, line, text: "Text " + code + " to " + line + " to join the league on Nickel.", sms: "sms:" + line.replace(/[^+0-9]/g, "") + "?&body=" + encodeURIComponent(code) };
}

export function roster() {
  const store = internals.store as typeof internals.store & { auth?: { sessions: Record<string, { token: string; at: number }> } };
  const claimed = new Set([...Object.values(store.auth?.sessions ?? {}).map((s) => s.token), ...Object.values(store.profiles).filter((p) => p.claimedAt !== undefined).map((p) => p.token)]);
  const hasPlayed = (name: string) => (store.stats[name]?.played ?? 0) > 0 || store.results.some((r) => r.name === name);
  const signed = Object.values(store.profiles).filter((p) => p.phone || claimed.has(p.token)).sort((a, b) => a.createdAt - b.createdAt);
  const byName = new Map<string, Member>();
  for (const p of signed) {
    const name = p.name || (p.phone ? store.names[p.phone] ?? "" : "");
    if (!name) continue;
    const seen = byName.get(name);
    if (seen && (seen.face || !p.photo)) {
      seen.claimed ||= claimed.has(p.token);
      continue;
    }
    byName.set(name, { name, token: p.token, face: p.photo ? "/face/" + p.token + "?v=" + p.photo.length : null, claimed: claimed.has(p.token) || !!seen?.claimed, joinedAt: seen?.joinedAt ?? p.createdAt, played: hasPlayed(name), ready: !!p.photo, demo: false });
  }
  for (const name of Object.values(store.names)) if (name && !byName.has(name)) byName.set(name, { name, token: null, face: null, claimed: false, joinedAt: null, played: hasPlayed(name), ready: false, demo: false });
  const pending: Pending[] = signed
    .filter((p) => !p.name && !(p.phone && store.names[p.phone]))
    .map((p) => ({ label: p.phone ? "Number ending " + p.phone.slice(-2) : "New player", joinedAt: p.createdAt, claimed: claimed.has(p.token) }));
  return { members: [...byName.values()], pending, join: joinInfo(), demo: demoMode() };
}

export const rosterNames = () => roster().members.map((m) => m.name);

export function streakOf(name: string, outcomes: Outcome[]): { won: boolean; count: number } | null {
  const mine = outcomes.filter((o) => o.winner === name || o.loser === name);
  if (!mine.length) return null;
  const won = mine[mine.length - 1].winner === name;
  let count = 0;
  for (let i = mine.length - 1; i >= 0 && (mine[i].winner === name) === won; i--) count += 1;
  return { won, count };
}

const artFile = (token: string, role: string) => artDir + "/" + token + "-" + role + ".jpg";

function portraitOf(member: Member, role: Role): { url: string; kind: "ai" | "stock" } | null {
  if (!role) return null;
  const token = member.face ? member.token : null;
  if (token && existsSync(artFile(token, role))) return { url: "/art/" + token + "/" + role + ".jpg?v=" + statSync(artFile(token, role)).size, kind: "ai" };
  return member.face ? null : { url: "/art/stock/" + role + ".jpg", kind: "stock" };
}

export function artImage(owner: string, role: string): Uint8Array | null {
  if (!/^(loser|winner)$/.test(role) || !/^[a-z0-9-]+$/.test(owner)) return null;
  const file = owner === "stock" ? new URL("../apps/preview/art/" + role + ".jpg", import.meta.url).pathname : artFile(owner, role);
  return existsSync(file) ? readFileSync(file) : null;
}

export function standing(signed: ReturnType<typeof roster>, people: { name: string; rank: number; last: string }[], outcomes: Outcome[]) {
  const known = new Map(signed.members.map((m) => [m.name, m]));
  const shown = signed.demo ? people.map((p) => known.get(p.name) ?? { name: p.name, token: null, face: null, claimed: false, joinedAt: null, played: outcomes.some((o) => o.winner === p.name || o.loser === p.name), ready: false, demo: true }) : people.filter((p) => known.has(p.name)).map((p) => known.get(p.name)!);
  const n = people.length;
  return {
    members: shown.map((m) => {
      const row = people.find((p) => p.name === m.name)!;
      const role: Role = n > 1 && row.rank === n ? "loser" : n > 1 && row.rank === 1 ? "winner" : "";
      const art = portraitOf(m, role);
      return { ...m, rank: row.rank, role, portrait: art?.url ?? null, portraitKind: art?.kind ?? null, streak: streakOf(m.name, outcomes), last: row.last };
    }),
    pending: signed.pending,
    join: signed.join,
    demo: signed.demo,
  };
}
