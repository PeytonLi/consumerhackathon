export type Intensity = "mild" | "medium" | "brutal";

export const INTENSITIES: Intensity[] = ["mild", "medium", "brutal"];

export const PUNISHMENT_TIERS: Record<Intensity, string[]> = {
  mild: [
    "sends a dramatic good morning announcement to the league every day for one week",
    "gets the league trophy: a framed photo of the winner on their desk all season",
    "makes a three-minute apology video to the league and pins it",
    "takes the group's coffee order by hand for a week, in a paper butler bow tie",
    "uses a league-approved loser portrait as their group chat picture for one week",
    "orders coffee for a month under a name the group picks and answers to it",
    "bakes a cake decorated in the winner's honor and delivers it in person",
    "presents a 15-slide deck to the group on why they lost, with questions after",
    "mails a handwritten apology letter to every person in the group",
    "records a league-written out-of-office voice memo and reads it at every game night for a week",
    "washes the winner's car in a costume on a weekend morning",
    "hosts movie night with a film the winner picks and buys every snack",
    "reads a two-minute vow of improvement out loud before next season starts",
  ],
  medium: [
    "sits a two-hour practice SAT in silence while the group proctors, then posts the score",
    "does a five-minute open mic set and the group picks the topic",
    "runs a permitted lemonade stand in costume for two hours, with a 20-dollar sales target",
    "wears a full suit to every class for a week and explains nothing",
    "lets the league write a fictional dating profile and reads every line at game night",
    "holds an I finished last sign for 20 minutes in a permitted pedestrian spot on campus",
    "performs karaoke of the winner's choice, sober, first song of the night",
    "cooks dinner for the whole group in a costume the winner picks",
    "walks a one-mile red carpet in formalwear while the league interviews them about losing",
    "takes a stuffed animal to a sit-down dinner for two and orders for both",
    "welcomes every guest at game night with a giant airport-arrivals sign announcing their loss",
    "plays nine imaginary golf holes in the yard with a foam club while the league commentates",
    "films a mock NFL Combine with paper weights and slow-motion replays of every drill",
    "records a rap about their season and posts it publicly",
    "wears a rival jersey to the league's watch party and delivers a sincere halftime fan speech",
    "caddies nine mini-golf holes for the winner and takes the blame for every bad shot",
  ],
  brutal: [
    "walks a milk mile in a cow costume carrying a sealed carton as the baton; no drinking required",
    "hosts a two-hour diner booth residency while the league stages hourly last-place interviews",
    "films a calendar shoot, one themed photo for each month, printed for everyone",
    "walks a costume parade for one hour while the league holds a last-place finish-line ceremony",
    "films a mock Hot Ones interview with ordinary snacks and answers every question about losing",
    "wears swim goggles and gives a dramatic polar-plunge press conference beside an empty paddling pool",
    "walks 26 ceremonial laps of the living room, announcing a different excuse for losing on every lap",
    "performs one theatrical slow-motion pushup per loss, capped at ten with a chair version allowed",
    "spends two hours on a planned trip without entertainment and writes the league a paper travel diary",
    "plays a one-hour hide-and-seek hunt in a consenting friend's home wearing a mascot costume",
    "performs a choreographed halftime routine in costume at the league's watch party",
    "plays the mascot chauffeur at game night and reads a new apology speech to five consenting friends",
    "posts a new embarrassing video every day for a month, ideas supplied by the group",
    "performs a 15-minute interpretive dance about every loss at a permitted private league gathering",
    "sings three songs the group picks at a packed bar on a Saturday, sober, no sunglasses",
  ],
};

export const ALL_PUNISHMENTS = INTENSITIES.flatMap((tier) => PUNISHMENT_TIERS[tier]);

export const PUNISHMENT_SAFETY = "Agree together first. Stop or swap at any time. Venue permission, normal food portions, a 20-dollar budget and a two-hour session cap apply; never involve strangers without consent.";

const SOURCE = {
  league: "https://leaguelogs.com/fantasy-football-punishments",
  sleeper: "https://sleeper.com/blog/best-fantasy-football-punishments/",
  rotowire: "https://www.rotowire.com/football/article/fantasy-football-last-place-punishments-94933",
  directv: "https://www.directv.com/insider/creative-fantasy-football-punishments/",
  fansided: "https://fansided.com/fantasy-sports/50-fantasy-football-punishments-your-league-mates-will-love-or-hate-you-for",
};

export const sourceOf = (text: string) => {
  const tier = tierOf(text);
  const i = tier ? PUNISHMENT_TIERS[tier].indexOf(text) : -1;
  if (tier === "brutal") return [SOURCE.sleeper, SOURCE.sleeper, SOURCE.directv, SOURCE.sleeper, SOURCE.rotowire, SOURCE.league, SOURCE.league, SOURCE.league, SOURCE.fansided, SOURCE.sleeper, SOURCE.league, SOURCE.league, SOURCE.sleeper, SOURCE.league, SOURCE.league][i];
  if (tier === "mild") return i === 0 ? SOURCE.sleeper : [2, 9].includes(i) ? SOURCE.rotowire : i === 3 ? SOURCE.rotowire : SOURCE.league;
  if (tier === "medium" && [11, 13].includes(i)) return SOURCE.rotowire;
  if (tier === "medium" && i === 8) return SOURCE.sleeper;
  return tier === "medium" && [0, 9, 12, 14, 15].includes(i) ? SOURCE.fansided : SOURCE.league;
};

export const safePunishment = (text: string) => !/\b(chug|gallon|milk mile(?!.*sealed)|hot ones(?!.*ordinary)|tattoo|waxing|beer|alcohol|vodka|tequila|naked|nude|streaks|prank calls?|trespass|sleep deprivation|ice bath|polar plunge(?!.*empty)|dating app|location shar|public roast|roastme)\b/i.test(text);

export function intensityIn(text: string): Intensity | "any" | null {
  const lower = text.toLowerCase();
  if (/\b(mild|tame|light|gentle|work.?safe)\b/.test(lower)) return "mild";
  if (/\b(medium|spicy)\b/.test(lower)) return "medium";
  if (/\b(brutal|harsh|nuclear|savage|extreme|worst|diabolical)\b/.test(lower)) return "brutal";
  if (/\b(any|all|random|whatever) (intensity|level|tier)\b|\bany punishment\b/.test(lower)) return "any";
  return null;
}

export const tierOf = (punishment: string): Intensity | null => INTENSITIES.find((tier) => PUNISHMENT_TIERS[tier].includes(punishment)) ?? null;

export function threeOptions(context: string, avoid: (string | null)[], turn = 0): string[] {
  const fixed = intensityIn(context);
  const words = new Set(context.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const best = (tier: Intensity, taken: string[]) => {
    const pool = PUNISHMENT_TIERS[tier].filter((p) => !avoid.includes(p) && !taken.includes(p));
    const scored = pool.map((p, i) => ({ p, hits: (p.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => words.has(w)).length, order: (i + pool.length - (turn % pool.length)) % pool.length }));
    return scored.sort((a, b) => b.hits - a.hits || a.order - b.order)[0].p;
  };
  const out: string[] = [];
  for (const tier of fixed && fixed !== "any" ? [fixed, fixed, fixed] : INTENSITIES) out.push(best(tier, out));
  return out;
}
