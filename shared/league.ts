export type GameKind = "krillion" | "wordle" | "cup_pong" | "mini_golf" | "salvo";
export type TabKind = "play" | "board" | "league" | "wrapped";
export type RewardMode = "points_only" | "cash_only" | "hybrid";
export type Cadence = "weekly" | "biweekly" | "monthly";
export type ThemeType = "arcade_mix" | "hockey" | "basketball" | "football" | "ai_models" | "custom";

export const GAME_ORDER: GameKind[] = ["krillion", "wordle", "cup_pong", "mini_golf", "salvo"];

export const GAMES: Record<GameKind, { title: string; seconds: number; blurb: string }> = {
  krillion: { title: "One in a Krillion", seconds: 25, blurb: "Name the rarest answer you can. Deeper is better." },
  wordle: { title: "Word Blitz", seconds: 45, blurb: "Four guesses at the group's five-letter word." },
  cup_pong: { title: "Cup Pong", seconds: 20, blurb: "Five throws. Release when the marker is over the cup." },
  mini_golf: { title: "Mini Golf", seconds: 10, blurb: "One putt. Closest to the pin takes it." },
  salvo: { title: "Salvo", seconds: 15, blurb: "Five shots at a hidden fleet." },
};

export const TAB_TITLES: Record<TabKind, string> = {
  play: "Play",
  board: "Board",
  league: "League",
  wrapped: "Wrapped",
};

export const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: "Every week",
  biweekly: "Every two weeks",
  monthly: "Every month",
};

export const THEME_LABELS: Record<ThemeType, string> = {
  arcade_mix: "Arcade mix",
  hockey: "Fantasy hockey",
  basketball: "Fantasy basketball",
  football: "Fantasy football",
  ai_models: "Fantasy AI models",
  custom: "Custom",
};

export interface League {
  code: string;
  name: string;
  rewardMode: RewardMode;
  customRewardLabel: string;
  themeType: ThemeType;
  cadence: Cadence;
  daysLeft: number;
  buyInCents: number;
  potBalanceCents: number;
  squadStreakDays: number;
  squadMultiplier: number;
  krillionPrompt: string;
  wordleTarget: string;
}

export interface Member {
  id: string;
  name: string;
  handle: string;
  school: string;
  played: boolean;
  answer: string;
  tier: string;
  pointsToday: number;
  seasonPoints: number;
  nickels: number;
  unclaimed: number;
  poachable: boolean;
  poached: number;
  krillions: number;
  fades: number;
}

export const DEMO_LEAGUES: League[] = [
  {
    code: "KRILL5",
    name: "Cupertino Day Ones",
    rewardMode: "hybrid",
    customRewardLabel: "Last place buys Thanksgiving KBBQ",
    themeType: "arcade_mix",
    cadence: "biweekly",
    daysLeft: 11,
    buyInCents: 500,
    potBalanceCents: 2500,
    squadStreakDays: 8,
    squadMultiplier: 1.4,
    krillionPrompt: "Name a real marine animal.",
    wordleTarget: "CRISP",
  },
  {
    code: "AIMOD5",
    name: "Fantasy AI Lab",
    rewardMode: "points_only",
    customRewardLabel: "Loser buys boba for the lab",
    themeType: "ai_models",
    cadence: "weekly",
    daysLeft: 4,
    buyInCents: 0,
    potBalanceCents: 0,
    squadStreakDays: 5,
    squadMultiplier: 1.2,
    krillionPrompt: "Name a real AI model.",
    wordleTarget: "TOKEN",
  },
];

export const DEMO_MEMBERS: Member[] = [
  { id: "u_sritej", name: "Sritej", handle: "sritej", school: "UC Berkeley", played: false, answer: "", tier: "", pointsToday: 0, seasonPoints: 620, nickels: 25, unclaimed: 5, poachable: false, poached: 10, krillions: 2, fades: 1 },
  { id: "u_peyton", name: "Peyton", handle: "peyton", school: "UCLA", played: true, answer: "Coelacanth", tier: "One in a Krillion", pointsToday: 140, seasonPoints: 640, nickels: 30, unclaimed: 0, poachable: false, poached: 15, krillions: 3, fades: 0 },
  { id: "u_alex", name: "Alex", handle: "alex", school: "UIUC", played: true, answer: "Pangolin", tier: "Rare", pointsToday: 84, seasonPoints: 510, nickels: 18, unclaimed: 0, poachable: false, poached: 5, krillions: 1, fades: 4 },
  { id: "u_maya", name: "Maya", handle: "maya", school: "UT Austin", played: true, answer: "Axolotl", tier: "Schooler", pointsToday: 42, seasonPoints: 555, nickels: 22, unclaimed: 0, poachable: false, poached: 5, krillions: 1, fades: 0 },
  { id: "u_jordan", name: "Jordan", handle: "jordan", school: "UMich", played: false, answer: "", tier: "", pointsToday: 0, seasonPoints: 390, nickels: 12, unclaimed: 5, poachable: true, poached: 0, krillions: 0, fades: 0 },
];

export function findLeague(code: string | null | undefined): League {
  const wanted = (code ?? "").toUpperCase();
  return DEMO_LEAGUES.find((l) => l.code === wanted) ?? DEMO_LEAGUES[0];
}

export function potLabel(league: League): string {
  if (league.rewardMode === "points_only") return league.customRewardLabel;
  const dollars = "$" + (league.potBalanceCents / 100).toFixed(0);
  return league.rewardMode === "cash_only" ? dollars + " pot" : dollars + " pot and nickels";
}

export function parseIntent(text: string): { addressed: boolean; game: GameKind; tab: TabKind } {
  const lower = text.toLowerCase();
  const addressed = /(^|[^a-z])@?nickel([^a-z]|$)/.test(lower);
  const game: GameKind = /word/.test(lower)
    ? "wordle"
    : /pong|cup/.test(lower)
      ? "cup_pong"
      : /golf|putt/.test(lower)
        ? "mini_golf"
        : /salvo|battleship/.test(lower)
          ? "salvo"
          : "krillion";
  const tab: TabKind = /wrapped|recap/.test(lower)
    ? "wrapped"
    : /\b(league|standings?|leaderboard|pot|payout|winning|settings)\b/.test(lower)
      ? "league"
      : /\b(bets?|odds|wagers?|over|under|board)\b/.test(lower)
        ? "board"
        : "play";
  return { addressed, game, tab };
}

export function cardPath(params: { code: string; game?: GameKind; tab?: TabKind; handle?: string; vs?: string }): string {
  const query = new URLSearchParams();
  if (params.tab && params.tab !== "play") query.set("tab", params.tab);
  if (params.game && (!params.tab || params.tab === "play")) query.set("g", params.game);
  if (params.handle) query.set("u", params.handle);
  if (params.vs) query.set("vs", params.vs);
  const qs = query.toString();
  return "/c/" + params.code.toUpperCase() + (qs ? "?" + qs : "");
}
