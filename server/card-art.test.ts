import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import { renderChatCard, renderPersonCard, type ChatCardArt } from "./card-art.js";

const base: ChatCardArt = { kicker: "Nickel", title: "Wordle Blitz #212", sub: "45 seconds. Closes tonight.", league: "Cupertino Day Ones", members: ["Maya", "Sritej", "Peyton"], hue: "#ff9500" };
const fontFiles = ["Inter-Regular.otf", "Inter-SemiBold.otf"].map((name) => new URL("./fonts/" + name, import.meta.url).pathname);
const render = (svg: string, width: number) => new Resvg(svg, { font: { fontFiles, loadSystemFonts: false }, fitTo: { mode: "width", value: width } }).render();

describe("Social Club card art", () => {
  it.each([
    ["Nickel", "Play now"], ["Challenge", "Your move"], ["Fantasy league", "Open draft"],
    ["Buy-in", "See the pot"], ["Leaderboard", "See the board"], ["Player card", "Make it yours"], ["Hub", "Come on in"],
  ])("renders %s at full and iMessage sizes", (kicker, action) => {
    const svg = renderChatCard({ ...base, kicker });
    expect(svg).toContain(action);
    expect(svg).toContain("Wordle Blitz #212");
    expect(svg).toContain("Cupertino Day Ones");
    expect(render(svg, 1200).width).toBe(1200);
    expect(render(svg, 300).height).toBe(158);
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(svg)).toBe(false);
  });

  it("gives each card type a distinct composition", () => {
    const cards = ["Nickel", "Challenge", "Fantasy league", "Buy-in", "Leaderboard", "Player card", "Hub"].map((kicker) => renderChatCard({ ...base, kicker }));
    expect(new Set(cards).size).toBe(7);
  });

  it("escapes text and never loads a remote portrait or arbitrary SVG", () => {
    const svg = renderChatCard({ ...base, title: '<script>"bad"</script>', league: "A&B", hue: '\" onload=\"bad' }, { Maya: 'https://example.com/track', Sritej: 'data:image/svg+xml,<svg onload="bad"/>' });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("onload=");
    expect(svg).not.toContain("example.com");
    expect(svg).toContain("A&#38;B");
    expect(render(svg, 300).width).toBe(300);
  });

  it("embeds an available raster photo instead of replacing it with an initial", () => {
    const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=";
    expect(renderChatCard(base, { Maya: photo })).toContain('href="' + photo + '"');
  });

  it.each(["winner", "loser", ""])("renders a %s person card without clipping its rank metadata", (role) => {
    const svg = renderPersonCard({ name: "Maya", nickels: 42, rank: 1, n: 5, title: "Front runner", role, league: base.league, foot: "Last place. Punishment pending.", image: "" });
    expect(svg).toContain(">Maya<");
    expect(svg).toContain("1st of 5");
    expect(svg).toContain("Last place. Punishment pending.");
    expect(render(svg, 300).height).toBe(300);
  });
});
