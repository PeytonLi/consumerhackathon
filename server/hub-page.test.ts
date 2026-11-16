// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";
type Hub = typeof import("./hub.js");
let hubCard: Hub["hubCard"], hubLine: Hub["hubLine"], wantsHub: Hub["wantsHub"];

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

let brain: typeof import("./brain.js");
beforeAll(async () => {
  process.env.NICKEL_DATA_DIR = mkdtempSync(tmpdir() + "/nickel-hub-");
  brain = await import("./brain.js");
  ({ hubCard, hubLine, wantsHub } = await import("./hub.js"));
});

const turn = (text: string, sender = "Sritej") => brain.handleTurn({ text, sender, baseUrl: "https://nickel.test/" });

describe("hub", () => {
  it("opens the hub for hub, home, dashboard and everything", () => {
    for (const word of ["hub", "home", "dashboard", "everything"]) {
      const reply = turn("Nickel, " + word);
      expect(reply.url).toBe("https://nickel.test/h?u=sritej");
      expect(reply.card).toMatchObject({ kicker: "HUB \u00b7 CUPERTINO DAY ONES", title: "Everything, one place", path: "/h?u=sritej" });
      expect(reply.line).toBe("Sritej, here is everything in one place: the board, each person, pots, payouts and what I remember.");
      expect(reply.line + JSON.stringify(reply.card)).not.toMatch(EMOJI);
    }
    expect(turn("nickel show me the hub", "").url).toBe("https://nickel.test/h");
  });

  it("leaves every other request alone", () => {
    expect(wantsHub("nickel play at home")).toBe(false);
    expect(wantsHub("nickel who won everything")).toBe(false);
    expect(wantsHub("nickel $5 buy-in for everything")).toBe(false);
    expect(wantsHub("nickel remember everything")).toBe(false);
    expect(wantsHub("nickel github")).toBe(false);
    expect(turn("who is home tonight")).toEqual({ addressed: false });
    expect(turn("nickel standings").url).toBe("https://nickel.test/l");
    expect(turn("nickel play krillion at home").url).toMatch(/\/r\/krill-/);
  });

  it("names the leader on the card once Nickels have moved", () => {
    expect(hubCard({ league: "L", stakes: null, punishment: null, people: [{ name: "Maya", nickels: 0 }] }).sub).toBe("The board, each person, pots and memory.");
    expect(hubCard({ league: "L", stakes: null, punishment: null, people: [{ name: "Maya", nickels: 5 }] })).toMatchObject({ sub: "Maya leads. The board, each person, pots and memory.", members: ["Maya"], path: "/h" });
    expect(hubLine("")).toBe("Here is everything in one place: the board, each person, pots, payouts and what I remember.");
  });

  it("ships a page on the design system with no emoji and a reduced-motion path", () => {
    const page = readFileSync(new URL("../apps/preview/hub.html", import.meta.url), "utf8");
    expect(page).toContain("<!--HUB-->");
    expect(page).toContain('href="/nickel.css"');
    expect(page).toContain("prefers-reduced-motion: reduce");
    expect(page).not.toMatch(EMOJI);
  });
});
