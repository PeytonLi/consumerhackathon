// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

let brain: typeof import("./brain.js");
let hub: typeof import("./hub.js");
let auth: typeof import("./auth.js");
let roster: typeof import("./roster.js");
const dir = mkdtempSync(tmpdir() + "/nickel-roster-");
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

beforeAll(async () => {
  process.env.NICKEL_DATA_DIR = dir;
  delete process.env.NICKEL_DEMO;
  delete process.env.OPENAI_API_KEY;
  brain = await import("./brain.js");
  hub = await import("./hub.js");
  auth = await import("./auth.js");
  roster = await import("./roster.js");
});

afterEach(() => {
  delete process.env.NICKEL_DEMO;
  delete process.env.NICKEL_JOIN_CODE;
  delete process.env.NICKEL_LINE;
});

const turn = (text: string, sender = "", senderPhone = "") => brain.handleTurn({ text, sender, senderPhone, baseUrl: "https://nickel.test/" });
const signUp = (name: string, phone: string, photo?: string) => {
  const profile = brain.profileFor(phone, "");
  expect(brain.saveProfile(profile.token, { name, photo }).ok).toBe(true);
  return profile.token;
};
const duel = (challenger: string, rival: string, won: boolean) => {
  const id = turn("Nickel, challenge " + rival, challenger).card!.path.slice(3);
  return brain.recordResult(id, { name: challenger, won, score: won ? "2-0" : "0-2" } as Parameters<typeof brain.recordResult>[1]);
};

describe("an empty league", () => {
  it("shows nobody and tells the group how to join", () => {
    const view = hub.hub(null);
    expect(view.people).toEqual([]);
    expect(view.roster.members).toEqual([]);
    expect(view.roster.pending).toEqual([]);
    expect(view.roster.demo).toBe(false);
    expect(view.roster.join).toEqual({ code: "K-HQF6D6", line: "+1 (779) 625-1378", text: "Text K-HQF6D6 to +1 (779) 625-1378 to join the league on Nickel.", sms: "sms:+17796251378?&body=K-HQF6D6" });
    expect(JSON.stringify(view)).not.toMatch(/Maya|Alex|Peyton/);
  });

  it("reads the join code and number from the environment", () => {
    process.env.NICKEL_JOIN_CODE = "K-TEST99";
    process.env.NICKEL_LINE = "+1 (415) 555-0100";
    expect(roster.joinInfo()).toMatchObject({ code: "K-TEST99", line: "+1 (415) 555-0100", sms: "sms:+14155550100?&body=K-TEST99" });
  });

  it("keeps cards and chat replies working with nobody on the board", () => {
    expect(brain.leaderboard().people).toEqual([]);
    expect(brain.leaderboardCard()).toMatchObject({ title: "Leaderboard", sub: "Nobody has joined yet.", members: [] });
    expect(brain.personCardSvg(0)).toBeNull();
    expect(turn("Nickel, punishment is has to sing at dinner").line).toBe("Last place has to sing at dinner. Nobody is on the board yet.");
    expect(brain.getRound("wordle-212")).toMatchObject({ members: [], played: [], board: [] });
  });

  it("brings the demo names back only behind NICKEL_DEMO=1", () => {
    process.env.NICKEL_DEMO = "1";
    expect(brain.leaderboard().people.map((p) => p.name).sort()).toEqual(["Alex", "Dev", "Maya", "Peyton", "Sritej"]);
    expect(brain.getRound("wordle-212")!.members).toEqual(["Peyton", "Maya", "Sritej", "Alex", "Dev"]);
    const view = hub.hub(null);
    expect(view.people).toHaveLength(5);
    expect(view.roster.demo).toBe(true);
    expect(view.roster.members.every((m) => m.demo && !m.claimed && m.face === null)).toBe(true);
  });
});

describe("the real roster", () => {
  let nina = "", omar = "";

  it("lists people who signed up, with their photo and join date", () => {
    nina = signUp("Nina", "+14085550111", PHOTO);
    omar = signUp("Omar", "+14085550112");
    const { members, pending } = roster.roster();
    expect(pending).toEqual([]);
    expect(members.map((m) => m.name)).toEqual(["Nina", "Omar"]);
    expect(members[0]).toMatchObject({ token: nina, face: "/face/" + nina + "?v=" + PHOTO.length, ready: true, claimed: false, played: false, demo: false });
    expect(members[0].joinedAt).toBeGreaterThan(0);
    expect(members[1]).toMatchObject({ token: omar, face: null, ready: false });
  });

  it("flags a number that texted but has no name yet as setting up", () => {
    turn("Nickel, hub", "", "+14085550142");
    const { members, pending } = roster.roster();
    expect(members.map((m) => m.name)).toEqual(["Nina", "Omar"]);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ label: "Number ending 42", claimed: false });
    expect(JSON.stringify(pending)).not.toContain("4085550142");
  });

  it("counts a claimed card and ignores an unclaimed name with no phone", () => {
    const quinn = brain.profileFor("", "Quinn");
    const ravi = brain.profileFor("", "Ravi");
    expect(roster.rosterNames()).toEqual(["Nina", "Omar"]);
    expect(auth.claimProfile(ravi.token, auth.issueClaim(ravi.token)).ok).toBe(true);
    const members = roster.roster().members;
    expect(members.map((m) => m.name)).toEqual(["Nina", "Omar", "Ravi"]);
    expect(members[2]).toMatchObject({ claimed: true, token: ravi.token });
    expect(members.some((m) => m.token === quinn.token)).toBe(false);
  });

  it("keeps a signed-up player after their device session ends", () => {
    const ravi = Object.values(brain.internals.store.profiles).find((p) => p.name === "Ravi")!;
    expect(ravi.claimedAt).toBeGreaterThan(0);
    auth.endSessions(ravi.token);
    expect(roster.roster().members.map((m) => m.name)).toEqual(["Nina", "Omar", "Ravi"]);
  });

  it("puts exactly those people on the hub, ranked among themselves", () => {
    duel("Nina", "Omar", true);
    duel("Nina", "Omar", true);
    duel("Omar", "Zed", true);
    const solo = turn("Nickel, play rps", "Nina").card!.path.slice(3);
    brain.recordResult(solo, { name: "Nina", won: true, score: "2-1" } as Parameters<typeof brain.recordResult>[1]);
    expect(brain.leaderboard().people.map((p) => p.name)).toEqual(["Nina", "Ravi", "Omar"]);
    const view = hub.hub(null);
    expect(view.people.map((p) => p.name)).toEqual(["Nina", "Ravi", "Omar"]);
    expect(view.people.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(view.people[2].title).toBe("Paying for dinner");
    expect(view.roster.members.map((m) => [m.name, m.rank, m.role, m.played])).toEqual([["Nina", 1, "winner", true], ["Ravi", 2, "", false], ["Omar", 3, "loser", true]]);
    expect(view.roster.members[0].streak).toEqual({ won: true, count: 3 });
    expect(view.roster.members[1].streak).toBeNull();
    expect(view.roster.members[2].streak).toEqual({ won: true, count: 1 });
    expect(view.roster.pending).toHaveLength(1);
    expect(Object.keys(view).slice(-1)).toEqual(["roster"]);
    expect(Object.keys(view).slice(0, 7)).toEqual(["me", "league", "people", "group", "pots", "payouts", "recent"]);
  });

  it("uses real names for new rounds instead of the demo list", () => {
    const round = brain.getRound(turn("Nickel, challenge Omar", "Nina").card!.path.slice(3))!;
    expect(round.members).toEqual(["Nina", "Omar", "Ravi"]);
    expect(brain.getRound("wordle-212")!.members).toEqual(["Nina", "Omar", "Ravi"]);
    expect(brain.getRound("rps-dev")!.opponent).toBe("Nickel");
    expect(brain.getRound("krill-87")).not.toHaveProperty("mine");
  });

  it("picks the generated portrait, then the photo, then stock art", () => {
    const before = hub.hub(null).roster.members;
    expect(before[0]).toMatchObject({ name: "Nina", portrait: null, portraitKind: null });
    expect(before[2]).toMatchObject({ name: "Omar", portrait: "/art/stock/loser.jpg", portraitKind: "stock" });
    mkdirSync(dir + "/art", { recursive: true });
    writeFileSync(dir + "/art/" + nina + "-winner.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    expect(hub.hub(null).roster.members[0]).toMatchObject({ portrait: "/art/" + nina + "/winner.jpg?v=4", portraitKind: "ai" });
    expect(hub.hub(null).roster.members[1]).toMatchObject({ name: "Ravi", role: "", portrait: null });
  });

  it("serves portrait files and refuses anything else", () => {
    expect(roster.artImage(nina, "winner")).toHaveLength(4);
    expect(roster.artImage(nina, "loser")).toBeNull();
    expect(roster.artImage("stock", "loser")!.length).toBeGreaterThan(1000);
    expect(roster.artImage("stock", "../store")).toBeNull();
    expect(roster.artImage("../art", "winner")).toBeNull();
  });
});

describe("streaks", () => {
  it("counts the current run of wins or losses", () => {
    const games = [{ winner: "A", loser: "B" }, { winner: "B", loser: "A" }, { winner: "B", loser: "C" }, { winner: "", loser: "C" }];
    expect(roster.streakOf("B", games)).toEqual({ won: true, count: 2 });
    expect(roster.streakOf("C", games)).toEqual({ won: false, count: 2 });
    expect(roster.streakOf("A", games)).toEqual({ won: false, count: 1 });
    expect(roster.streakOf("D", games)).toBeNull();
  });
});
