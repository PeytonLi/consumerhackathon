import { describe, expect, it } from "vitest";
import { buildCardReply, cardSvg, cardViewFromUrl, injectCardMeta } from "./card.js";
import { parseIntent } from "../shared/league.js";

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

describe("chat card", () => {
  it("treats @nickel or the bare name as addressing the agent, and nothing else", () => {
    expect(parseIntent("@nickel word blitz").addressed).toBe(true);
    expect(parseIntent("Nickel, who is winning?").addressed).toBe(true);
    expect(parseIntent("yo nickel").addressed).toBe(true);
    expect(parseIntent("anyone want dinner").addressed).toBe(false);
    expect(parseIntent("nickelback is playing").addressed).toBe(false);
  });

  it("maps the message to the right card and link", () => {
    const game = buildCardReply({ text: "@nickel cup pong", baseUrl: "https://nickel.test/", handle: "maya" });
    expect(game.url).toBe("https://nickel.test/c/KRILL5?g=cup_pong&u=maya");
    const standings = buildCardReply({ text: "nickel show the leaderboard", baseUrl: "https://nickel.test" });
    expect(standings.url).toBe("https://nickel.test/c/KRILL5?tab=league");
    expect(buildCardReply({ text: "nickel wrapped", baseUrl: "https://nickel.test" }).tab).toBe("wrapped");
  });

  it("renders an emoji-free card and unfurl tags that point at the PNG", () => {
    const view = cardViewFromUrl(new URL("https://nickel.test/c/krill5?g=wordle"))!;
    expect(view).toEqual({ code: "KRILL5", game: "wordle", tab: "play" });
    const svg = cardSvg(view);
    expect(svg).toContain("Word Blitz");
    expect(svg).toContain("CUPERTINO DAY ONES");
    expect(EMOJI.test(svg)).toBe(false);
    const html = injectCardMeta("<head><!--card-meta--><title>Nickel</title><!--/card-meta--></head>", view, "https://nickel.test", "?g=wordle");
    expect(html).toContain('property="og:image" content="https://nickel.test/og/KRILL5.png?g=wordle"');
    expect(html).toContain("<title>Word Blitz - Cupertino Day Ones</title>");
  });
});
