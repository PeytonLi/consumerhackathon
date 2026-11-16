export type Intensity = "mild" | "medium" | "brutal";

export const INTENSITIES: Intensity[] = ["mild", "medium", "brutal"];

export const PUNISHMENT_TIERS: Record<Intensity, string[]> = {
  mild: [
    "sends a good morning text to the group chat every day until next season",
    "gets the league trophy: a framed photo of the winner on their desk all season",
    "makes a three-minute apology video to the league and pins it",
    "takes the group's coffee order every morning for a week, by hand, on foot",
    "uses a profile picture the group picks on every app for a month",
    "orders coffee for a month under a name the group picks and answers to it",
    "bakes a cake decorated in the winner's honor and delivers it in person",
    "presents a 15-slide deck to the group on why they lost, with questions after",
    "mails a handwritten apology letter to every person in the group",
    "lets the winner write their out-of-office reply for a full week",
    "washes the winner's car in a costume on a weekend morning",
    "hosts movie night with a film the winner picks and buys every snack",
    "reads a two-minute vow of improvement out loud before next season starts",
  ],
  medium: [
    "retakes the SAT and posts the score in the chat",
    "does a five-minute open mic set and the group picks the topic",
    "sets up a lemonade stand and cannot leave until it makes 20 dollars",
    "wears a full suit to every class for a week and explains nothing",
    "lets the group write their dating profile and keeps it up for a month",
    "holds a sign on the busiest corner on campus that says they finished last",
    "performs karaoke of the winner's choice, sober, first song of the night",
    "cooks dinner for the whole group in a costume the winner picks",
    "runs a 5K in jeans and posts the splits",
    "takes a stuffed animal to a sit-down dinner for two and orders for both",
    "waits at airport arrivals for two hours with a sign the winner wrote",
    "plays 18 holes of golf with no ball and explains nothing",
    "runs the full NFL Combine at a public park and posts every result",
    "records a rap about their season and posts it publicly",
    "wears a rival jersey to a live game and sits with the home fans",
    "caddies a full round for the winner and takes the blame for every bad shot",
  ],
  brutal: [
    "runs a milk mile: four laps, a full glass of milk before each one",
    "spends 24 hours in a Waffle House, minus one hour per waffle eaten",
    "films a calendar shoot, one themed photo for each month, printed for everyone",
    "runs an official 5K in a full-body costume with the group's name on the back",
    "eats the full Hot Ones wing lineup on camera while answering the group's questions",
    "does an organized polar plunge in January, fully under, filmed",
    "walks a full marathon distance in one day wearing a sign that says why",
    "does one pushup for every point they finished behind first, in one session, on camera",
    "takes a flight longer than two hours with no phone, no book and no screen",
    "gets hunted for a day: shares their location and has to dodge the whole group",
    "performs a choreographed halftime routine in costume at a public game",
    "takes five rideshares dressed as a mascot and reads each driver a speech the group wrote",
    "posts a new embarrassing video every day for a month, ideas supplied by the group",
    "does one hour of interpretive dance in a public square to music the group picks",
    "sings three songs the group picks at a packed bar on a Saturday, sober, no sunglasses",
  ],
};

export const ALL_PUNISHMENTS = INTENSITIES.flatMap((tier) => PUNISHMENT_TIERS[tier]);

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
