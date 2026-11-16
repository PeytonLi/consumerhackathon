// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it, vi } from "vitest";

let brain: typeof import("./brain.js");
let custom: typeof import("./custom.js");
let punishments: typeof import("./punishments.js");
beforeAll(async () => {
  process.env.NICKEL_DATA_DIR = mkdtempSync(tmpdir() + "/nickel-custom-");
  delete process.env.OPENAI_API_KEY;
  delete process.env.CONVEX_URL;
  delete process.env.NACE_API_KEY;
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

  it("keeps simultaneous AI plans request-scoped and uses the Responses model", async () => {
    process.env.OPENAI_API_KEY = "test-only";
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("gpt-5.4-mini");
      const title = body.input.includes("Dev walked") ? "Dev Steps" : "Maya Tabs";
      return Response.json({ output: [{ type: "message", content: [{ text: JSON.stringify({ template: "guess", title, prompt: title + "?", rule: "closest", seconds: 20, answer: "" }) }] }] });
    });
    try {
      const texts = ["Nickel, make a game: guess how many steps Dev walked today", "Nickel, make a game: guess how many tabs Maya has"];
      const prepared = await Promise.all(texts.map((text) => custom.prepareTurn(text)));
      const replies = texts.map((text, i) => brain.handleTurn({ text, sender: "Maya", baseUrl: "https://nickel.test", customPrepared: prepared[i] }));
      expect(replies.map((r) => r.card!.title)).toEqual(["Dev Steps", "Maya Tabs"]);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      fetcher.mockRestore();
      delete process.env.OPENAI_API_KEY;
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
    expect(take.outcome!.rows.map((r) => [r.name, r.won])).toEqual([["Maya", true], ["Dev", true], ["Sritej", false]]);

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
    const start = league.startedAt!;
    league.startedAt = Date.now() - 60 * 86400000;
    expect(brain.scorePick(id, "Teaspoon", 5, "Maya")).toEqual({ ok: false, error: "This league's season has ended" });
    expect(brain.draftPick(id, "Dev", "Boba Guys")).toEqual({ ok: false, error: "This league's season has ended" });
    expect(turn("Nickel, Teaspoon +5", "Maya").line).toBe("This league's season has ended");
    league.startedAt = start;
    expect(turn("Nickel, the season is 10 days").line).toContain("Season: 10 days, day 1 now.");
    expect(turn("Nickel, fantasy standings").line).toBe("Maya leads Fantasy Boba shops with 7.");
  });

  it("creates and edits a league from the web without rebuilding fantasy", async () => {
    const made = await custom.customRoute("POST", new URL("https://nickel.test/api/leagues"), async () => ({ topic: "Reality TV", scoring: "5 per rose, minus 2 per elimination", seasonDays: 56, picks: "Dev, Maya, Alex", name: "Maya" }));
    expect(made).toMatchObject({ kind: "json", status: 200, data: { ok: true, league: { topic: "Reality TV", scoring: "5 per rose, minus 2 per elimination", seasonDays: 56, createdBy: "Maya" } } });
    const id = (made as { data: { league: { id: string } } }).data.league.id;
    expect(brain.getFantasy(id)!.pool.map((p) => p.name)).toEqual(["Dev", "Maya", "Alex"]);
    expect(custom.configureLeague(id, "Dev", "10 per rose", 28)).toEqual({ ok: false, error: "Only the league creator can change its rules" });
    expect(custom.configureLeague(id, "Maya", "10 per rose", 400).ok).toBe(false);
    expect(custom.configureLeague(id, "Maya", "10 per rose", 28)).toMatchObject({ ok: true, league: { scoring: "10 per rose", seasonDays: 28 } });
    expect(await custom.customRoute("GET", new URL("https://nickel.test/leagues/" + id), async () => null)).toMatchObject({ kind: "page", league: { id }, game: null });
    expect(await custom.customRoute("POST", new URL("https://nickel.test/api/leagues"), async () => ({ name: "Maya", topic: "x", seasonDays: 0 }))).toMatchObject({ status: 400 });
  });

  it("accepts a league with rules and a season in the creation message", () => {
    const made = turn("Nickel, make a league for reality TV; scoring: 5 points per rose; season: 8 weeks; picks: Dev, Maya", "Maya");
    expect(made.line).toContain("Scoring: 5 points per rose. Season: 8 weeks, week 1 now.");
    expect(brain.getFantasy(made.card!.path.slice(3))!.pool.map((p) => p.name)).toEqual(["Dev", "Maya"]);
  });
});

describe("custom integration safety", () => {
  it("cannot record a custom result before the server resolves it", () => {
    const game = custom.createGame(custom.planGame("lowest unique number"), "Sritej");
    const before = brain.internals.store.results.length;
    expect(brain.recordResult(game.id, { name: "Sritej", tries: "1" })).toEqual({ ok: false });
    expect(brain.internals.store.results).toHaveLength(before);
  });

  it("rejects late submissions even when the real answer is not known yet", () => {
    const game = custom.createGame(custom.planGame("guess how many steps Dev walked today"), "Sritej");
    game.closesAt = Date.now() - 1;
    expect(custom.submitAnswer(game.id, "Dev", "42", 1)).toEqual({ ok: false, error: "Answers are closed. Waiting for the real answer." });
    expect(custom.submitAnswer(game.id, "Dev", "1e309", 1).ok).toBe(false);
  });

  it("extends the existing signed-session, body limit and cross-origin gate", async () => {
    const auth = await import("./auth.js");
    const profile = brain.profileFor("+15550100678", "Verified");
    const claim = auth.claimProfile(profile.token, auth.issueClaim(profile.token));
    if (!claim.ok) throw new Error(claim.error);
    const post = (path: string, body: unknown, origin = "https://nickel.test") => auth.authGate(new Request("https://nickel.test" + path, { method: "POST", headers: { "content-type": "application/json", host: "nickel.test", origin, cookie: "nickel_sid=" + claim.sid }, body: JSON.stringify(body) }), "203.0.113.88");
    const wrong = await post("/api/games", { name: "Maya" });
    expect(wrong).toBeInstanceOf(Response);
    expect((wrong as Response).status).toBe(403);
    expect(((await post("/api/leagues", {}, "https://evil.test")) as Response).status).toBe(403);
    expect(((await post("/api/games", { request: "x".repeat(5000) })) as Response).status).toBe(413);
    const passed = await post("/api/games", { request: "lowest unique number" });
    if (passed instanceof Response) throw new Error("Unexpected auth denial");
    expect(await passed.request.json()).toMatchObject({ name: "Verified", verified: true });
    const game = custom.createGame(custom.planGame("lowest unique number"), "Verified");
    await custom.customRoute("POST", new URL("https://nickel.test/api/games/" + game.id), async () => ({ action: "answer", name: "Maya", value: "2", seconds: 3 }), "Verified");
    expect(game.entries.Verified).toMatchObject({ value: "2", verified: true });
    expect(game.entries.Maya).toBeUndefined();
    const stranger = await custom.customRoute("GET", new URL("https://nickel.test/api/games/" + game.id + "?u=Verified"), async () => null);
    expect(stranger).toMatchObject({ data: { game: { mine: null } } });
  });
});

describe("punishment research", () => {
  it("ships a tiered list of at least 30 that keeps the good originals", () => {
    expect(punishments.ALL_PUNISHMENTS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(punishments.ALL_PUNISHMENTS).size).toBe(punishments.ALL_PUNISHMENTS.length);
    expect(brain.PUNISHMENTS).toBe(punishments.ALL_PUNISHMENTS);
    expect(punishments.PUNISHMENT_TIERS.brutal).toContain("walks a milk mile in a cow costume carrying a sealed carton as the baton; no drinking required");
    expect(punishments.tierOf("sits a two-hour practice SAT in silence while the group proctors, then posts the score")).toBe("medium");
    for (const p of punishments.ALL_PUNISHMENTS) {
      expect(p).not.toMatch(emoji);
      expect(p).not.toMatch(/tattoo|beer|vodka|wax/i);
      expect(p.length).toBeLessThanOrEqual(110);
      expect(punishments.sourceOf(p)).toMatch(/^https:\/\//);
      expect(punishments.safePunishment(p)).toBe(true);
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
    expect(offer.line).toMatch(/^Three options for last place\. 1: .+\n2: .+\n3: .+\nPick one: Nickel, option 2\./);
    expect(offer.line).toContain(punishments.PUNISHMENT_SAFETY);
    expect(offer.line!.match(/Source: https:\/\//g)).toHaveLength(3);
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
