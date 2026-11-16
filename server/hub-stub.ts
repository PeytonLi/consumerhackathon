type Person = { name: string; rank: number; nickels: number; played: number; wins: number; losses: number; title: string; face: string | null; last: string };

export function hubStub(board: { league: string; stakes: string | null; punishment: string | null; people: Person[] }, me: { token: string; name: string; face: string | null } | null) {
  return {
    me: me ? { token: me.token, name: me.name, face: me.face } : null,
    league: { name: board.league, stakes: board.stakes, punishment: board.punishment },
    people: board.people.map((p) => ({ name: p.name, rank: p.rank, nickels: p.nickels, played: p.played, wins: p.wins, losses: p.losses, title: p.title, face: p.face, last: p.last, balanceCents: 0, memory: [] as string[] })),
    group: { memory: [] as string[] },
    pots: [] as { id: string; amountCents: number; members: Record<string, "in" | "paid">; settled: boolean; winner: string | null }[],
    payouts: [] as { id: string; name: string; amountCents: number; reason: string; at: number }[],
    recent: [...new Set(board.people.map((p) => p.last).filter(Boolean))].map((line) => ({ line, at: 0 })),
  };
}
