import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Person { name: string; rank: number; nickels: number; played: number; wins: number; losses: number }
interface Slide { key: string; kicker: string; who: string | null; big: string; unit: string; title: string; sub: string }
interface JuiceApi {
  TOTAL_MS: number;
  ordinal(n: number): string;
  plan(count: number): { countMs: number; partAt: number[]; rankAt: number; burstMs: number; end: number };
  rank(before: unknown, after: unknown, me: string): { from: number | null; to: number; dir: string; text: string; passed: string[]; passedBy: string[] } | null;
  moves(seen: Record<string, number> | null | undefined, people: { name: string; rank: number }[]): Record<string, number>;
  wrapped(board: unknown, hub: unknown): Slide[];
}

const scope: { Juice?: JuiceApi } = {};
new Function("window", readFileSync(new URL("../apps/preview/juice.js", import.meta.url), "utf8"))(scope);
const Juice = scope.Juice!;

const board = (rows: [string, number, number?, number?][], extra: object = {}) => ({
  league: "Cupertino Day Ones",
  stakes: null,
  punishment: null,
  ...extra,
  people: [...rows].sort((a, b) => b[1] - a[1]).map(([name, nickels, wins = 0, losses = 0], i) => ({ name, nickels, wins, losses, played: wins + losses, rank: i + 1 })) as Person[],
});

describe("result timing", () => {
  it("lands every breakdown part and the rank line inside the 1.5 second budget", () => {
    for (let count = 0; count <= 6; count++) {
      const t = Juice.plan(count);
      expect(t.partAt).toHaveLength(count);
      expect(t.end).toBeLessThanOrEqual(Juice.TOTAL_MS);
      expect(t.countMs).toBeLessThanOrEqual(Juice.TOTAL_MS);
      expect(t.burstMs).toBeLessThanOrEqual(Juice.TOTAL_MS);
      for (const at of t.partAt) expect(at + 240).toBeLessThanOrEqual(t.rankAt);
    }
  });

  it("staggers parts one after another", () => {
    const t = Juice.plan(4);
    expect(t.partAt[0]).toBeLessThan(t.partAt[1]);
    expect(t.partAt[2]).toBeLessThan(t.partAt[3]);
  });
});

describe("rank change", () => {
  it("names the person you passed", () => {
    const r = Juice.rank(board([["Maya", 20], ["Alex", 12], ["Sritej", 9]]), board([["Maya", 20], ["Sritej", 16], ["Alex", 12]]), "Sritej")!;
    expect(r.text).toBe("3rd to 2nd, passing Alex");
    expect(r.dir).toBe("up");
    expect(r.passed).toEqual(["Alex"]);
  });

  it("summarizes a jump past several people", () => {
    const before = board([["Maya", 20], ["Alex", 12], ["Dev", 11], ["Peyton", 10], ["Sritej", 2]]);
    const after = board([["Sritej", 22], ["Maya", 20], ["Alex", 12], ["Dev", 11], ["Peyton", 10]]);
    expect(Juice.rank(before, after, "Sritej")!.text).toBe("5th to 1st, passing Maya and 3 more");
  });

  it("says who passed you on the way down", () => {
    const r = Juice.rank(board([["Maya", 20], ["Sritej", 12], ["Alex", 9]]), board([["Maya", 20], ["Alex", 14], ["Sritej", 7]]), "Sritej")!;
    expect(r.text).toBe("2nd to 3rd, Alex passed you");
    expect(r.dir).toBe("down");
  });

  it("shows the gap when the rank holds", () => {
    expect(Juice.rank(board([["Maya", 20], ["Sritej", 12]]), board([["Maya", 20], ["Sritej", 17]]), "Sritej")!.text).toBe("Still 2nd, 3 behind Maya");
    expect(Juice.rank(board([["Maya", 20], ["Sritej", 12]]), board([["Maya", 27], ["Sritej", 12]]), "Maya")!.text).toBe("Still 1st, 15 ahead of Sritej");
  });

  it("welcomes someone who was not on the board and ignores strangers", () => {
    expect(Juice.rank(board([["Maya", 20]]), board([["Maya", 20], ["Sritej", 5]]), "Sritej")!.text).toBe("In at 2nd of 2");
    expect(Juice.rank(board([["Maya", 20]]), board([["Maya", 20]]), "Sritej")).toBeNull();
    expect(Juice.rank(null, null, "Sritej")).toBeNull();
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(Juice.ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
});

describe("movement since last visit", () => {
  it("reports places gained and lost and skips the unchanged and the new", () => {
    const people = board([["Maya", 20], ["Sritej", 16], ["Alex", 12], ["Dev", 1]]).people;
    expect(Juice.moves({ Maya: 1, Alex: 2, Sritej: 3 }, people)).toEqual({ Sritej: 1, Alex: -1 });
    expect(Juice.moves(null, people)).toEqual({});
  });
});

describe("wrapped", () => {
  const b = board([["Maya", 31, 6, 1], ["Sritej", 18, 4, 3], ["Alex", 9, 2, 4], ["Dev", -6, 0, 5]], { punishment: "runs a milk mile: four laps, a full glass of milk before each one" });
  const hub = {
    people: [{ name: "Maya", memory: ["Maya has won 4 in a row", "Maya always picks rock"] }, { name: "Dev", memory: ["Dev has lost 3 in a row"] }],
    recent: [
      { line: "Alex beat Maya 2-0 at Rock Paper Scissors: 5 + 1 sweep + 2 upset = 8 Nickels. Maya drops 6.", at: 3 },
      { line: "Sritej solved Wordle Blitz in 3 tries and 20 seconds: 5 + 3 tries + 2 speed + 2 upset = 12 Nickels.", at: 2 },
      { line: "Maya solved Wordle Blitz in 2 tries and 9 seconds: 5 + 4 tries + 3 speed = 12 Nickels.", at: 1 },
    ],
  };

  it("builds six slides in a fixed order", () => {
    const slides = Juice.wrapped(b, hub);
    expect(slides.map((s) => s.key)).toEqual(["intro", "wins", "streak", "upset", "dinner", "punishment"]);
    expect(slides[0].big).toBe("25");
  });

  it("finds the win leader, the streak, the upset, the bill and the punishment", () => {
    const [, wins, streak, upset, dinner, punishment] = Juice.wrapped(b, hub);
    expect([wins.who, wins.big, wins.unit]).toEqual(["Maya", "6", "wins"]);
    expect(wins.sub).toContain("Sritej is next with 4");
    expect([streak.who, streak.big]).toEqual(["Maya", "4"]);
    expect(streak.sub).toContain("Dev has lost 3 in a row");
    expect([upset.who, upset.big, upset.title]).toEqual(["Sritej", "+12", "Sritej"]);
    expect([dinner.who, dinner.big]).toEqual(["Dev", "\u22126"]);
    expect(dinner.sub).toBe("15 Nickels behind Alex. The bill is getting close.");
    expect(punishment.title).toBe("Last place runs a milk mile");
    expect(punishment.sub).toBe("four laps, a full glass of milk before each one. Right now that is Dev.");
  });

  it("names both sides of a head-to-head upset", () => {
    const upset = Juice.wrapped(b, { ...hub, recent: hub.recent.slice(0, 1) })[3];
    expect([upset.title, upset.big]).toEqual(["Alex over Maya", "+8"]);
  });

  it("swaps the punishment for the stakes when money is on the line", () => {
    const slides = Juice.wrapped({ ...b, stakes: "$5 buy-in", punishment: null }, hub);
    expect(slides[5].title).toBe("$5 buy-in");
    expect(slides[4].sub).toBe("Last place, and out the $5 buy-in.");
  });

  it("still fills every slide for an empty league and never uses an emoji", () => {
    const empty = Juice.wrapped(board([["Maya", 0], ["Sritej", 0]]), null);
    expect(empty).toHaveLength(6);
    expect(empty[1].title).toBe("Nobody yet");
    expect(empty[2].title).toBe("No streak yet");
    expect(empty[3].title).toBe("No upsets yet");
    expect(empty[4].title).toBe("Still open");
    expect(empty[5].title).toBe("Not set yet");
    for (const s of [...empty, ...Juice.wrapped(b, hub)]) expect(s.kicker + s.title + s.sub + s.big).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
