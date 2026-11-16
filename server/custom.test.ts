// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

let brain: typeof import("./brain.js");
let custom: typeof import("./custom.js");
let punishments: typeof import("./punishments.js");
beforeAll(async () => {
  process.env.NICKEL_DATA_DIR = mkdtempSync(tmpdir() + "/nickel-custom-");
  delete process.env.OPENAI_API_KEY;
  delete process.env.CONVEX_URL;
  custom = await import("./custom.js");
  brain = await import("./brain.js");
  punishments = await import("./punishments.js");
});

const turn = (text: string, sender = "Sritej") => brain.handleTurn({ text, sender, baseUrl: "https://nickel.test/" });
const nickels = (name: string) => brain.leaderboard().people.find((p) => p.name === name)?.nickels ?? 0;
const emoji = /\p{Extended_Pictographic}/u;

describe("custom game planning", () => {
  it("turns a loose request into a template, title, prompt and scoring rule without a key", () => {
    expect(custom.planGame("guess how many steps Dev walked today")).toMatchObject({ template: "guess", title: "Steps Dev Walked", prompt: "How many steps Dev walked today?", rule: "closest", seconds: 20, minutes: 60, stake: 6, answer: "" });
    expect(custom.planGame("best caption for this")).toMatchObject({ template: "caption", title: "Caption This", rule: "votes" });
    expect(custom.planGame("hot take, pineapple belongs on pizza, 10 seconds")).toMatchObject({ template: "take", prompt: "Pineapple belongs on pizza", seconds: 10 });
    expect(custom.planGame("who won the 2016 NBA finals? answer is Cavaliers")).toMatchObject({ template: "trivia", prompt: "Who won the 2016 NBA finals?", answer: "Cavaliers" });
    expect(custom.planGame("fastest finger for 10 nickels")).toMatchObject({ template: "fastest", stake: 10 });
    expect(custom.planGame("highest unique number, closes in 2 hours")).toMatchObject({ template: "unique", rule: "highest", title: "Highest Unique", minutes: 120 });
    expect(custom.planGame("guess the price of my shoes without going over, answer 140")).toMatchObject({ template: "guess", rule: "under", answer: "140" });
    expect(custom.planGame("trivia").answer).not.toBe("");
  });

  it("falls back to the deterministic plan when there is no OpenAI key", async () => {
    expect(await custom.planGameAI("guess how many steps Dev walked today")).toBeNull();
    expect(await custom.researchPunishments("nickel research a punishment")).toBeNull();
  });

  it("describes every scoring rule in plain words with no emojis", () => {
    for (const [template, t] of Object.entries(custom.TEMPLATES)) {
      for (const rule of Object.keys(t.rules)) {
        const text = custom.scoringText({ template: template as import("./custom.js").Template, rule, stake: 6 });
        expect(text).toContain("6 Nickels");
        expect(text).not.toMatch(emoji);
      }
    }
  });
});

describe("custom games from the chat", () => {
  it("makes a game with a card and a page link", () => {
    const reply = turn("Nickel, make a game: guess how many steps Dev walked today");
    expect(reply.line).toBe("Steps Dev Walked is live. How many steps Dev walked today? Closest guess to the real number wins. 20 seconds each, closes in 1 hour.");
    expect(reply.url).toMatch(/^https:\/\/nickel\.test\/g\/game-[a-z0-9]+$/);
    expect(reply.card).toMatchObject({ kicker: "CLOSEST GUESS \u00b7 CUPERTINO DAY ONES", title: "Steps Dev Walked" });
    const game = custom.getGame(reply.card!.path.slice(3))!;
    expect(brain.cardSvg(custom.gameCard(game))).toContain("Steps Dev Walked");
    expect(turn("Nickel, new game: best caption for this", "Maya").card!.title).toBe("Caption This");
  });

  it("leaves the built-in games and bare requests alone", () => {
    expect(turn("nickel can u set up a wordle game between us pls", "").url).toMatch(/\/r\/wordle-/);
    expect(turn("nickel play krillion").url).toMatch(/\/r\/krill-/);
    expect(turn("Nickel, custom game").url).toBe("https://nickel.test/g/new");
  });

  it("scores a closest guess through the result path and moves the leaderboard", () => {
    const id = turn("Nickel, make a game: guess how many steps Dev walked today").card!.path.slice(3);
    const before = { maya: nickels("Maya"), sritej: nickels("Sritej"), dev: nickels("Dev") };
    expect(custom.submitAnswer(id, "Sritej", "7,000", 8)).toEqual({ ok: true });
    expect(custom.submitAnswer(id, "Sritej", "9000", 8)).toEqual({ ok: false, error: "You already answered" });
    expect(custom.submitAnswer(id, "Maya", "lots", 8)).toEqual({ ok: false, error: "Enter a number" });
    expect(custom.revealGame(id, "Sritej", "8412")).toEqual({ ok: false, error: "Wait for one more person" });
    custom.submitAnswer(id, "Maya", "8400", 5);
    custom.submitAnswer(id, "Dev", "9100", 5);
    const hidden = custom.gameView(custom.getGame(id)!, "Maya");
    expect(hidden).toMatchObject({ state: "open", needsAnswer: true, answered: ["Sritej", "Maya", "Dev"], outcome: null });
    expect(JSON.stringify(hidden)).not.toContain("7000");
    expect(custom.revealGame(id, "Peyton", "8412")).toEqual({ ok: false, error: "Answer first" });
    expect(custom.revealGame(id, "Maya", "")).toEqual({ ok: false, error: "Enter the real number" });
    expect(custom.revealGame(id, "Maya", "8,412")).toEqual({ ok: true });
    const view = custom.gameView(custom.getGame(id)!, "Maya");
    expect(view.outcome).toMatchObject({ headline: "Maya wins", answer: "8,412", by: "Maya" });
    expect(view.outcome!.rows.map((r) => [r.name, r.won, r.points!.total])).toEqual([["Maya", true, 6], ["Dev", false, 3], ["Sritej", false, 1]]);
    expect(view.outcome!.rows[0].line).toBe("Maya won Steps Dev Walked with 8,400, 12 off: 6 Nickels.");
    expect(nickels("Maya") - before.maya).toBe(6);
    expect(nickels("Dev") - before.dev).toBe(3);
    expect(nickels("Sritej") - before.sritej).toBe(1);
    expect(brain.recordResult(id, { name: "Maya", tries: "1" }).line).toBe(view.outcome!.rows[0].line);
    expect(nickels("Maya") - before.maya).toBe(6);
    expect(custom.submitAnswer(id, "Alex", "8412", 2)).toEqual({ ok: false, error: "This game is closed" });
    expect(turn("nickel who won", "Alex").line).toContain("Nickels:");
  });

  it("takes the real answer from the chat and pays a bullseye", () => {
    const id = turn("Nickel, make a game: guess how many tabs Peyton has open").card!.path.slice(3);
    custom.submitAnswer(id, "Alex", "212", 4);
    custom.submitAnswer(id, "Peyton", "90", 4);
    const reply = turn("Nickel, the answer is 212", "Peyton");
    expect(reply.line).toContain("Alex wins. Alex nailed");
    expect(custom.getGame(id)!.outcome!.rows[0].parts).toEqual([{ label: "win", points: 6 }, { label: "bullseye", points: 3 }]);
  });

  it("runs a caption round with hidden authors and group votes", () => {
    const game = custom.createGame(custom.planGame("worst name for a startup"), "Sritej");
    custom.submitAnswer(game.id, "Sritej", "Uber for Regret", 12);
    custom.submitAnswer(game.id, "Maya", "Nickelback Capital", 20);
    custom.submitAnswer(game.id, "Dev", "Theranos 2", 9);
    const seen = custom.gameView(game, "Maya");
    expect(seen.captions.map((c) => c.text).sort()).toEqual(["Theranos 2", "Uber for Regret"]);
    expect(JSON.stringify(seen.captions)).not.toMatch(/Sritej|Dev/);
    const key = seen.captions.find((c) => c.text === "Uber for Regret")!.key;
    expect(custom.castVote(game.id, "Sritej", key)).toEqual({ ok: false, error: "Pick someone else's line" });
    expect(custom.castVote(game.id, "Alex", key)).toEqual({ ok: false, error: "Write yours first" });
    expect(custom.castVote(game.id, "Maya", key)).toEqual({ ok: true });
    expect(custom.castVote(game.id, "Dev", key)).toEqual({ ok: true });
    expect(custom.revealGame(game.id, "Dev")).toEqual({ ok: true });
    expect(game.outcome!.rows[0]).toMatchObject({ name: "Sritej", won: true, note: "won Name Startup with 2 votes" });
  });

  it("scores hot takes, trivia, fastest finger and lowest unique", () => {
    const take = custom.createGame(custom.planGame("hot take: a hot dog is a sandwich"), "Sritej");
    custom.submitAnswer(take.id, "Sritej", "agree", 3);
    custom.submitAnswer(take.id, "Maya", "disagree", 3);
    custom.submitAnswer(take.id, "Dev", "Disagree", 3);
    custom.revealGame(take.id, "Dev");
    expect(take.outcome!.headline).toBe("Disagree takes it, 2 to 1");
    expect(take.outcome!.rows.map((r) => [r.name, r.won])).toEqual([["Sritej", false], ["Maya", true], ["Dev", true]]);

    const trivia = custom.createGame(custom.planGame("what is the capital of Australia? answer is Canberra"), "Sritej");
    expect(custom.gameView(trivia, "Maya").needsAnswer).toBe(false);
    custom.submitAnswer(trivia.id, "Sritej", "Sydney", 3);
    custom.submitAnswer(trivia.id, "Maya", "canberra", 9);
    custom.submitAnswer(trivia.id, "Dev", "Canberra", 4);
    custom.revealGame(trivia.id, "Dev");
    expect(trivia.outcome!.rows.map((r) => [r.name, r.parts[0].label, r.parts[0].points])).toEqual([["Dev", "win", 6], ["Maya", "correct", 3], ["Sritej", "showing up", 1]]);

    const fastest = custom.createGame(custom.planGame("fastest finger"), "Sritej");
    expect(custom.submitAnswer(fastest.id, "Maya", "40", 1)).toEqual({ ok: false, error: "Too early" });
    custom.submitAnswer(fastest.id, "Sritej", "312", 3);
    custom.submitAnswer(fastest.id, "Maya", "288", 3);
    custom.revealGame(fastest.id, "Maya");
    expect(fastest.outcome!.headline).toBe("Maya wins");

    const unique = custom.createGame(custom.planGame("lowest unique number"), "Sritej");
    expect(custom.submitAnswer(unique.id, "Sritej", "12", 1)).toEqual({ ok: false, error: "Pick 1 to 9" });
    custom.submitAnswer(unique.id, "Sritej", "1", 3);
    custom.submitAnswer(unique.id, "Maya", "1", 3);
    custom.submitAnswer(unique.id, "Dev", "3", 3);
    custom.submitAnswer(unique.id, "Alex", "2", 3);
    custom.revealGame(unique.id, "Alex");
    expect(unique.outcome!.headline).toBe("Alex wins with a lone 2");
  });

  it("closes itself at the time limit and pays nobody a win for playing alone", () => {
    const game = custom.createGame(custom.planGame("hot take: cereal is a soup"), "Sritej");
    custom.submitAnswer(game.id, "Sritej", "agree", 3);
    expect(custom.getGame(game.id, game.closesAt - 1)!.outcome).toBeUndefined();
    expect(custom.getGame(game.id, game.closesAt + 1)!.outcome).toMatchObject({ headline: "Only Sritej showed up" });
    expect(game.outcome!.rows[0].parts).toEqual([{ label: "showing up", points: 1 }]);
  });

  it("serves the page, the create form and the api, and blocks the raw result route", async () => {
    const read = (body: unknown) => async () => body;
    const made = await custom.customRoute("POST", new URL("https://nickel.test/api/games"), read({ request: "Guess the number of jelly beans", answer: "431", minutes: 10, name: "Maya" }));
    expect(made).toMatchObject({ kind: "json", status: 200, data: { ok: true } });
    const id = (made as { data: { id: string } }).data.id;
    expect(custom.getGame(id)).toMatchObject({ template: "guess", answer: "431", minutes: 10, createdBy: "Maya" });
    expect(await custom.customRoute("POST", new URL("https://nickel.test/api/games"), read({ request: "" }))).toMatchObject({ status: 400 });
    expect(await custom.customRoute("POST", new URL("https://nickel.test/api/games/" + id), read({ action: "answer", name: "Maya", value: "400", seconds: 3 }))).toMatchObject({ status: 200, data: { ok: true, game: { mine: { value: "400" } } } });
    expect(await custom.customRoute("GET", new URL("https://nickel.test/g/" + id), read(null))).toMatchObject({ kind: "page", game: { id, mine: null }, card: { path: "/g/" + id } });
    expect(await custom.customRoute("GET", new URL("https://nickel.test/g/new"), read(null))).toMatchObject({ kind: "page", game: null, card: { path: "/g/new" } });
    expect(await custom.customRoute("GET", new URL("https://nickel.test/og/g/" + id + ".png"), read(null))).toMatchObject({ kind: "card" });
    expect(await custom.customRoute("POST", new URL("https://nickel.test/api/rounds/" + id + "/result"), read({ name: "Maya" }))).toEqual({ kind: "json", data: { ok: false }, status: 200 });
    expect(await custom.customRoute("GET", new URL("https://nickel.test/l"), read(null))).toBeNull();
  });
});

describe("custom leagues", () => {
  it("sets a scoring rule and season length in plain words and reports them", () => {
    expect(turn("Nickel, league rules").line).toBe("No league yet. Say: Nickel, start a fantasy league for anything.");
    const made = turn("Nickel, start a fantasy league for boba shops: Boba Guys, Teaspoon", "Maya");
    const id = made.card!.path.slice(3);
    expect(turn("Nickel, league rules").line).toBe("Fantasy Boba shops rules. Scoring: the group scores it from the chat, for example: Nickel, Boba Guys +10. Season: no end date yet. Draft 3 each.");
    const saved = turn("Nickel, league scoring: 1 point per new drink, 5 for a line out the door, season is 8 weeks", "Maya");
    expect(saved.line).toBe("Saved. Fantasy Boba shops rules. Scoring: 1 point per new drink, 5 for a line out the door. Season: 8 weeks, week 1 now. Draft 3 each.");
    expect(saved.url).toBe("https://nickel.test/f/" + id);
    const league = brain.getFantasy(id) as import("./custom.js").RuledLeague;
    expect(league).toMatchObject({ scoring: "1 point per new drink, 5 for a line out the door", seasonDays: 56 });
    expect(custom.leagueRules(league, league.startedAt! + 15 * 86400000)).toContain("Season: 8 weeks, week 3 now.");
    brain.draftPick(id, "Maya", "Teaspoon");
    brain.scorePick(id, "Teaspoon", 7, "Maya");
    expect(custom.leagueRules(league, league.startedAt! + 60 * 86400000)).toContain("Season: 8 weeks, and it is over. Maya won with 7.");
    expect(turn("Nickel, the season is 10 days").line).toContain("Season: 10 days, day 1 now.");
    expect(turn("Nickel, fantasy standings").line).toBe("Maya leads Fantasy Boba shops with 7.");
  });
});

describe("punishment research", () => {
  it("ships a tiered list of at least 30 that keeps the good originals", () => {
    expect(punishments.ALL_PUNISHMENTS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(punishments.ALL_PUNISHMENTS).size).toBe(punishments.ALL_PUNISHMENTS.length);
    expect(brain.PUNISHMENTS).toBe(punishments.ALL_PUNISHMENTS);
    expect(punishments.PUNISHMENT_TIERS.brutal).toContain("runs a milk mile: four laps, a full glass of milk before each one");
    expect(punishments.tierOf("retakes the SAT and posts the score in the chat")).toBe("medium");
    for (const p of punishments.ALL_PUNISHMENTS) {
      expect(p).not.toMatch(emoji);
      expect(p).not.toMatch(/tattoo|beer|vodka|wax/i);
      expect(p.length).toBeLessThanOrEqual(110);
    }
  });

  it("lets the group pick the intensity and keeps it for rerolls", () => {
    const mild = turn("Nickel, punishment, mild", "Maya");
    expect(mild.line).toMatch(/^Mild it is\. Last place .+\. Right now that is \w+\.$/);
    expect(punishments.PUNISHMENT_TIERS.mild).toContain(brain.leaderboard().punishment);
    for (let i = 0; i < 6; i++) {
      turn("nickel new punishment", "Maya");
      expect(punishments.PUNISHMENT_TIERS.mild).toContain(brain.leaderboard().punishment);
    }
    expect(turn("Nickel, brutal punishment").line).toMatch(/^Brutal it is\./);
    expect(punishments.PUNISHMENT_TIERS.brutal).toContain(brain.leaderboard().punishment);
    expect(turn("Nickel, punishment, any intensity").line).toMatch(/^Any intensity it is\./);
    expect(custom.punishmentPool()).toBe(punishments.ALL_PUNISHMENTS);
  });

  it("offers three researched options and sets the one the group picks", () => {
    const current = brain.leaderboard().punishment;
    const offer = turn("Nickel, research a punishment for a group that hates running", "Maya");
    const options = [...offer.line!.matchAll(/\d: (.+?)\. /g)].map((m) => m[1]);
    expect(offer.line).toMatch(/^Three options for last place\. 1: .+ 2: .+ 3: .+ Pick one: Nickel, option 2\.$/);
    expect(options).toHaveLength(3);
    expect(new Set(options).size).toBe(3);
    expect(brain.leaderboard().punishment).toBe(current);
    expect(punishments.threeOptions("anything", []).map(punishments.tierOf)).toEqual(["mild", "medium", "brutal"]);
    expect(punishments.threeOptions("brutal ones only", []).map(punishments.tierOf)).toEqual(["brutal", "brutal", "brutal"]);
    const picked = turn("Nickel, option 2", "Dev");
    expect(picked.line).toContain("Locked in. Last place " + options[1]);
    expect(brain.leaderboard().punishment!.split(":")[0]).toBe(options[1]);
    expect(turn("Nickel, option 2", "Dev").line).not.toContain("Locked in");
  });

  it("keeps the original punishment commands working", () => {
    expect(turn("nickel what's the punishment").line).toContain("Last place " + brain.leaderboard().punishment);
    const same = brain.leaderboard().punishment!;
    expect(turn("nickel new punishment").line).not.toContain(same);
    expect(turn("nickel punishment is runs ten milk miles").line).toContain("Last place runs ten milk miles.");
  });
});
