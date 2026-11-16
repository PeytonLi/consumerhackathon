// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

let brain: typeof import("./brain.js");
beforeAll(async () => {
  process.env.NICKEL_DATA_DIR = mkdtempSync(tmpdir() + "/nickel-");
  brain = await import("./brain.js");
});

const turn = (text: string, sender = "Sritej", extra = {}) => brain.handleTurn({ text, sender, baseUrl: "https://nickel.test/", ...extra });

describe("group chat turns", () => {
  it("stays quiet unless addressed by name", () => {
    expect(turn("who is up for dinner")).toEqual({ addressed: false });
    expect(turn("nickelback tonight")).toEqual({ addressed: false });
  });

  it("turns a challenge into a head-to-head round and a link", () => {
    const reply = turn("Nickel, challenge Maya");
    expect(reply.line).toBe("Sritej just called out Maya. Rock Paper Scissors. Best of 3, 5 Nickels on it.");
    expect(reply.url).toMatch(/^https:\/\/nickel\.test\/r\/rps-[a-z0-9]+$/);
    const round = brain.getRound(reply.card!.path.slice(3))!;
    expect(round.opponent).toBe("Maya");
    expect(brain.cardSvg(brain.roundCard(round))).toContain("Sritej vs Maya");
    const loose = turn("nickel can u set up a wordle challenge between me and peyton", "");
    expect(loose.line).toBe("Peyton, you just got called out. Wordle Blitz. 45 seconds, 5 Nickels on it.");
    expect(loose.card!.title).toBe("You vs Peyton");
    expect(turn("nickel run it", "", { opponent: "alex", game: "krillion" }).line).toBe("Alex, you just got called out. One in a Krillion. 25 seconds, 5 Nickels on it.");
  });

  it("opens today's game when asked to play", () => {
    expect(turn("@nickel play").url).toBe("https://nickel.test/r/wordle-212");
    expect(turn("nickel play krillion").url).toMatch(/\/r\/krill-/);
  });

  it("runs a custom fantasy league on any topic: create, draft, write in, score", () => {
    const made = turn("Nickel, start a fantasy league for boba shops: Boba Guys, Teaspoon, Tpumps", "Maya");
    const id = made.card!.path.slice(3);
    expect(made.line).toBe("Fantasy Boba shops is open. 3 on the board, draft 3 each.");
    expect(brain.getFantasy(id)!.pool.map((p) => p.name)).toEqual(["Boba Guys", "Teaspoon", "Tpumps"]);

    expect(brain.draftPick(id, "Maya", "Teaspoon").ok).toBe(true);
    expect(brain.draftPick(id, "Alex", "teaspoon")).toMatchObject({ ok: false, error: "Maya already has Teaspoon" });
    expect(brain.draftPick(id, "Alex", "Happy Lemon").ok).toBe(true);
    expect(brain.getFantasy(id)!.pool).toHaveLength(4);

    const scored = turn("nickel teaspoon +10", "Alex");
    expect(scored.line).toBe("Teaspoon +10. Maya leads Fantasy Boba shops with 10.");
    expect(brain.fantasyStandings(brain.getFantasy(id)!)[0]).toMatchObject({ member: "Maya", points: 10 });

    brain.draftPick(id, "Maya", "Boba Guys");
    brain.draftPick(id, "Maya", "Tpumps");
    expect(brain.draftPick(id, "Maya", "Sharetea")).toMatchObject({ ok: false, error: "Your roster is full" });
  });

  it("learns names by phone, records results, and reports who won", () => {
    expect(turn("nickel standings").line).toBe("No Nickels have moved yet. First to finish a game takes the lead.");
    expect(turn("Nickel, I'm Sritej", "", { senderPhone: "+1 (480) 233-6330" }).line).toBe("Got it, Sritej. Add your photo here, one time. After that every link opens as you.");
    const duel = turn("nickel challenge peyton", "", { senderPhone: "+14802336330" });
    expect(duel.line).toBe("Sritej just called out Peyton. Rock Paper Scissors. Best of 3, 5 Nickels on it.");
    const id = duel.card!.path.slice(3);
    expect(brain.recordResult(id, { name: "Sritej", opponent: "Peyton", score: "2–1", won: true }).line).toBe("Sritej beat Peyton 2-1 at Rock Paper Scissors. 5 Nickels moved.");
    brain.recordResult(id, { name: "Sritej", opponent: "Peyton", score: "2–1", won: true });
    expect(turn("nickel who won").line).toBe("Sritej beat Peyton 2-1 at Rock Paper Scissors. 5 Nickels moved. Nickels: Sritej +5, Peyton -5.");
    expect(brain.recordResult("wordle-212", { name: "Maya", tries: "3/6", time: "0:22" }).line).toBe("Maya solved Wordle Blitz in 3 (0:22). Plus 5 Nickels.");
    expect(turn("nickel leaderboard").line).toBe("Nickels: Sritej +5, Maya +5, Peyton -5.");
  });

  it("runs a buy-in: propose, agree, pay, status", () => {
    expect(turn("nickel who's in on the pot", "Maya").line).toBe("No buy-in yet. Say: Nickel, $5 buy-in.");
    const made = turn("Nickel, $5 buy-in", "Sritej");
    expect(made.line).toBe('Sritej proposed a $5 buy-in. Say "Nickel, I\'m in" to agree. Nobody pays until you tap the card.');
    expect(made.url).toMatch(/\/p\/pot-[a-z0-9]+\?u=sritej$/);
    const id = made.card!.path.slice(3).split("?")[0];
    const joined = turn("nickel im in", "Maya");
    expect(joined.line).toBe("Maya is in. 2 in, $10 pot. Tap the card to pay your $5.");
    expect(joined.pay).toEqual({ amountCents: 500, memo: "Nickel buy-in, Cupertino Day Ones" });
    expect(turn("nickel i'm in", "").line).toBe("Tell me your name first: Nickel, I'm Sritej. Then say you are in.");
    brain.joinPot(id, "Maya", "paid");
    brain.joinPot(id, "Maya", "in");
    expect(brain.getPot(id)!.members).toEqual({ Sritej: "in", Maya: "paid" });
    expect(turn("nickel who paid", "Alex").line).toBe("$5 buy-in. 2 in, $5 of $10 paid. Still owed: Sritej.");
    expect(brain.potCard(brain.getPot(id)!).sub).toBe("2 in for a $10 pot. 1 paid.");
    expect(turn("nickel $500 buy in", "Alex").line).toBe("Buy-ins run from $1 to $100. Pick a number in there.");
  });

  it("takes the topic and picks the agent supplies", () => {
    const made = turn("nickel fantasy professors", "Dev", { fantasyTopic: "Berkeley professors", fantasyPicks: ["Sahai", "DeNero", "Hug"] });
    expect(brain.getFantasy(made.card!.path.slice(3))).toMatchObject({ topic: "Berkeley professors", rosterSize: 3 });
    expect(brain.fantasyCard(brain.getFantasy(made.card!.path.slice(3))!).sub).toBe("Draft 3 picks each. 3 on the board.");
  });

  it("keeps a leaderboard with a card per person and a real punishment", () => {
    const before = (name: string) => ({ played: 0, wins: 0, losses: 0, ...brain.leaderboard().people.find((p) => p.name === name) });
    const [m0, a0] = [before("Maya"), before("Alex")];
    const made = turn("Nickel, challenge Maya", "Alex");
    const id = made.card!.path.slice(3);
    expect(brain.recordResult(id, { name: "Alex", won: false, score: "0-2" }).line).toBe("Maya beat Alex 0-2 at Rock Paper Scissors. 5 Nickels moved.");
    const board = brain.leaderboard();
    const maya = board.people.find((p) => p.name === "Maya")!;
    const alex = board.people.find((p) => p.name === "Alex")!;
    expect(maya).toMatchObject({ wins: m0.wins + 1, losses: m0.losses, played: m0.played + 1 });
    expect(alex).toMatchObject({ wins: a0.wins, losses: a0.losses + 1, played: a0.played + 1 });
    expect(maya.rank).toBeLessThan(alex.rank);
    expect(board.people[board.people.length - 1].title).toBe("Paying for dinner");
    const doom = turn("nickel what's the punishment", "Maya");
    expect(brain.PUNISHMENTS).toContain(brain.leaderboard().punishment);
    expect(doom.line).toMatch(/^Last place .+\. Right now that is \w+\.$/);
    expect(doom.url).toMatch(/\/l\?u=/);
    const same = brain.leaderboard().punishment;
    turn("nickel what is the punishment again", "Maya");
    expect(turn("nickel new punishment", "Maya").line).not.toContain(same!);
    expect(turn("nickel punishment is runs ten milk miles", "Maya").line).toContain("Last place runs ten milk miles.");
    expect(turn("nickel leaderboard", "Maya").url).toBe("https://nickel.test/l");
  });

  it("roasts a loss once and only claps back when someone earns it", () => {
    const made = turn("Nickel, challenge Dev", "Peyton");
    brain.recordResult(made.card!.path.slice(3), { name: "Peyton", won: false, score: "1-2" });
    const asked = turn("nickel who won", "Peyton");
    expect(asked.react).toEqual({ emoji: "\u{1F480}", tapback: "laugh" });
    expect(asked.roast).toBe("You asked.");
    expect(turn("nickel who won", "Peyton").react).toBeUndefined();
    const rude = turn("nickel you suck", "Peyton");
    expect(rude.react).toEqual({ emoji: "\u{1F595}", tapback: "dislike" });
    expect(brain.CLAPBACKS).toContain(rude.line);
    const excuse = turn("nickel that was rigged", "Peyton");
    expect(excuse.react!.tapback).toBe("laugh");
    expect(brain.EXCUSES).toContain(excuse.line);
    expect(turn("Nickel, challenge Maya", "Peyton").react).toBeUndefined();
    expect(turn("nickel play krillion", "Peyton").react).toBeUndefined();
    expect(turn("Nickel, $5 buy-in", "Peyton").react).toBeUndefined();
    const huh = [turn("nickel asdf qwerty"), turn("nickel hmm ok")];
    expect(huh.filter((r) => r.react).length).toBe(1);
    expect(brain.COMEBACKS.some((c) => huh[0].line!.startsWith(c))).toBe(true);
  });

  it("hands out a personal player card the pages load from", () => {
    const say = (text: string) => brain.handleTurn({ text, senderPhone: "+15550001111", baseUrl: "https://nickel.test" });
    const intro = say("nickel i'm Abhi");
    expect(intro.line).toBe("Got it, Abhi. Add your photo here, one time. After that every link opens as you.");
    const token = intro.card!.path.slice(4);
    expect(intro.url).toBe("https://nickel.test/me/" + token);
    expect(say("nickel set me up").url).toBe(intro.url);
    expect(brain.saveProfile(token, { name: "abhi", photo: "javascript:alert(1)" }).ok).toBe(false);
    expect(brain.saveProfile(token, { name: "abhi", account: "@abhi-v", photo: "data:image/jpeg;base64,/9j/4AAQ" })).toMatchObject({ ok: true, profile: { name: "Abhi", account: "@abhi-v" } });
    expect(brain.facePhoto(token)!.type).toBe("image/jpeg");
    expect(brain.getProfile(token)!.face).toMatch(new RegExp("^/face/" + token));
    expect(brain.leaderboard().people.find((p) => p.name === "Abhi")!.face).toBe(brain.getProfile(token)!.face);
    expect(brain.saveProfile("me-nope", { name: "x" }).ok).toBe(false);
  });

  it("sends the leaderboard as images, loser first, and swaps punishment for money once a pot is paid", () => {
    const reply = turn("nickel leaderboard", "Maya");
    const board = brain.leaderboard();
    expect(reply.images).toHaveLength(Math.min(board.people.length, 8));
    expect(reply.images![0]).toMatch(/^https:\/\/nickel\.test\/card\/l\/0\.png\?v=/);
    const loser = brain.personCardSvg(0)!;
    const winner = brain.personCardSvg(board.people.length - 1)!;
    expect(loser).toContain(">" + board.people[board.people.length - 1].name + "<");
    expect(loser).toContain(board.people.length + "th of " + board.people.length);
    expect(loser).toContain("Last place");
    expect(winner).toContain(">" + board.people[0].name + "<");
    expect(winner).toContain("1st of");
    expect(brain.personCardSvg(99)).toBeNull();
    expect(turn("nickel who won", "Maya").images).toBeUndefined();
    expect(board.stakes).toBeNull();
    const pot = turn("Nickel, $10 buy-in", "Alex");
    const id = pot.card!.path.slice(3).split("?")[0];
    brain.joinPot(id, "Alex", "paid");
    brain.joinPot(id, "Dev", "paid");
    expect(brain.leaderboard()).toMatchObject({ stakes: "$10 buy-in", punishment: null });
    expect(turn("nickel punishment", "Maya").line).toBe("This one is for money: $10 buy-in, so last place just loses it. Punishments are for games with no buy-in.");
    expect(brain.personCardSvg(0)).toContain("Last place. Out $10 buy-in.");
  });

  it("turns a texted photo into a portrait and nudges paid players who skip a day", () => {
    const say = (text: string, extra = {}) => brain.handleTurn({ text, senderPhone: "+15550002222", baseUrl: "https://nickel.test", ...extra });
    say("nickel i'm Zed");
    expect(say("nickel generate an image of me if I was to lose").line).toBe("I need your face first. Text me a photo of yourself, or add one on your card.");
    const mine = brain.setPhoto("+15550002222", "", "data:image/jpeg;base64,/9j/4AAQ");
    const got = say("nickel", { hasPhoto: true });
    expect(got.line).toBe("Got it, Zed. That face is on the leaderboard now. Here is you with the crown.");
    const lose = say("nickel generate an image of me if I was to lose");
    expect(lose.line).toBe("Here is Zed in last place.");
    expect(lose.art).toEqual({ token: mine.token, role: "loser" });
    expect(lose.images![0]).toContain("/card/me/" + mine.token + "/loser.png");
    expect(brain.personCardSvg(0, { token: mine.token, role: "loser" })).toContain(">Zed<");
    expect(brain.personCardSvg(0, { token: "me-nope", role: "loser" })).toBeNull();
    const pot = turn("Nickel, $5 buy-in", "Zed");
    const id = pot.card!.path.slice(3).split("?")[0];
    brain.joinPot(id, "Zed", "paid");
    brain.joinPot(id, "Maya", "paid");
    const round = turn("nickel play krillion", "Maya");
    brain.recordResult(round.card!.path.slice(3), { name: "Maya", tries: "1/1" });
    expect(brain.idleStakes().map((n) => n.name)).toEqual(["Zed"]);
    expect(turn("nickel who hasn't played", "Maya").line).toBe("Zed has money in the pot and has not played today. It is up for grabs at midnight.");
    expect(brain.dueNudges()).toEqual([{ name: "Zed", phone: "+15550002222", text: "Zed, you have $5 in the pot and you have not played today. Play before midnight or it is up for grabs." }]);
    expect(brain.dueNudges()).toEqual([]);
  });

  it("switches between demo and Stripe payments from the chat", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(brain.payMode()).toBe("demo");
    expect(turn("nickel real payments", "Maya").line).toBe("Stripe is not connected yet, so payments stay in demo mode. No card is charged.");
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    expect(turn("nickel test payments", "Maya").line).toBe("Payments run through Stripe in test mode. Use card 4242 4242 4242 4242, any future date, any CVC. No real money moves.");
    expect(turn("nickel fake payments for the demo", "Maya").line).toBe("Payments are in demo mode. The pay button marks you paid and no card is charged.");
    expect(brain.payMode()).toBe("demo");
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    expect(turn("nickel make payments real", "Maya").line).toMatch(/^Payments are live through Stripe/);
    expect(brain.payMode()).toBe("live");
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("answers a first text from an unknown number with their player card", () => {
    const first = brain.handleTurn({ text: "nickel K-HQF6D6", senderPhone: "+15550003333", baseUrl: "https://nickel.test" });
    expect(first.line).toBe("Welcome to Nickel. Set up your player card: name and photo. One time, then every link opens as you.");
    expect(first.url).toMatch(/^https:\/\/nickel\.test\/me\/me-[a-z0-9]+$/);
    expect(first.react).toBeUndefined();
    const loose = turn("nickel can u set up a wordle game between us pls", "Sritej");
    expect(loose.line).not.toContain("Pls");
  });

  it("posts the number and join code when asked to invite the group", () => {
    const line = "Everyone: text K-HQF6D6 to +1 (779) 625-1378. That connects your number, and I will send your player card back. One time.";
    expect(turn("nickel invite everyone", "Sritej")).toEqual({ addressed: true, line });
    expect(turn("nickel how do we join", "Maya").line).toBe(line);
  });
});
