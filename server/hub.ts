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
