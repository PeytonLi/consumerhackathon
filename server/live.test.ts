import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FantasyLeague } from "./brain.js";

let live: typeof import("./live.js");
let brain: typeof import("./brain.js");
let records: Record<string, FantasyLeague>;
const source = "https://sports.example.com/results";
const now = new Date("2026-11-15T22:00:00Z").getTime();
const fetcher = vi.fn<typeof fetch>();
const research = (quotes = false) => ({ safe: true, finance: quotes, mode: quotes ? "quotes" : "events", summary: "The current week is underway. Teams are playing for the lead.", source, positiveEvent: "an official game win", negativeEvent: "an official game loss", picks: Array.from({ length: 12 }, (_, i) => ({ name: "Team " + i, reason: "Playing in the current week.", source, ...(quotes ? { ticker: "T" + i } : { nextEventAt: new Date(now + 86400000).toISOString() }) })) });
const web = (data: unknown, sources = [source]) => Response.json({ output: [{ type: "web_search_call", action: { sources: sources.map((url) => ({ url })) } }, { type: "message", content: [{ type: "output_text", text: JSON.stringify(data) }] }] });
const quote = (ticker = "T0", price = 100, at = now - 60000) => Response.json({ chart: { result: [{ meta: { symbol: ticker, currency: "USD", instrumentType: "EQUITY", regularMarketPrice: price, regularMarketTime: at / 1000 } }] } });
function league(topic: string): FantasyLeague {
  const l: FantasyLeague = { id: "fantasy-" + topic, topic, league: "Friends", members: ["Maya"], rosterSize: 3, pool: [], log: [], createdBy: "Maya" };
  records[l.id] = l;
  return l;
}

beforeAll(async () => {
  process.env.NICKEL_DATA_DIR = mkdtempSync(tmpdir() + "/nickel-live-");
  vi.stubEnv("OPENAI_API_KEY", "");
  live = await import("./live.js");
  brain = await import("./brain.js");
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
  records = {};
  live.attachLive(() => records, vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("live topic leagues", () => {
  it("builds a sourced current pool with a frozen rule and caches concurrent topics for an hour", async () => {
    fetcher.mockResolvedValue(web(research()));
    const a = league("Current basketball"), b = league("current basketball");
    a.pool.push({ name: "My write-in", owner: "Maya", points: 7 });
    await Promise.all([live.openLiveLeague(a), live.openLiveLeague(b)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a.pool).toHaveLength(13);
    expect(a.pool[0]).toMatchObject({ reason: "Playing in the current week.", source });
    expect(a.pool.at(-1)).toMatchObject({ name: "My write-in", owner: "Maya", points: 7 });
    expect(a.live).toMatchObject({ status: "ready", mode: "events", startedAt: now, endsAt: now + 7 * 86400000 });
    expect(a.live!.scoringRule).toContain("5 points for an official game win");
    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({ model: "gpt-5.4-mini", tool_choice: "required", tools: [{ type: "web_search", search_context_size: "low" }] });
    vi.setSystemTime(now + live.LIVE_CACHE_MS + 1);
    fetcher.mockResolvedValue(web(research()));
    await live.researchTopic("Current basketball");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps fallback picks when no key, a failed call, invalid JSON or ungrounded links prevent research", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const a = league("No key");
    a.pool = [{ name: "Original", points: 0, owner: null }];
    await live.openLiveLeague(a);
    expect(a.live!.status).toBe("fallback");
    expect(a.pool[0].name).toBe("Original");
    expect(await live.scoreLiveLeague(a)).toContain("could not check");
    await live.researchTopic(a.topic);
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    for (const [topic, response] of [["failed", new Response("bad", { status: 500 })], ["invalid", Response.json({ output: [{ type: "message", content: [{ text: "not json" }] }] })], ["ungrounded", web(research(), ["https://other.example.org/"])]] as const) {
      fetcher.mockResolvedValue(response);
      const l = league(topic);
      await live.openLiveLeague(l);
      expect(l.live!.status).toBe("fallback");
    }
  });

  it("refuses private-life and tragedy topics before the network, and honors researched refusals", async () => {
    for (const topic of ["Maya dating Alex", "who is sleeping with who", "earthquake victims", "celebrity cancer", "this week's school shooting"]) {
      expect(live.liveTopicRefusal(topic)).toContain("private lives or tragedies");
      expect(live.liveTurn("Nickel, what's happening with " + topic, "https://nickel.test")?.line).toContain("private lives or tragedies");
    }
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(web({ safe: false }));
    const l = league("Sensitive euphemism");
    await live.openLiveLeague(l);
    expect(l.live!.status).toBe("refused");
    expect(l.pool).toEqual([]);
  });

  it("rejects a sports pool whose games resolve outside the league window", async () => {
    const late = research();
    late.picks = late.picks.map((p) => ({ ...p, nextEventAt: new Date(now + 10 * 86400000).toISOString() }));
    fetcher.mockResolvedValue(web(late));
    const l = league("Wrong calendar week");
    await live.openLiveLeague(l);
    expect(l.live!.status).toBe("fallback");
    expect(l.pool).toEqual([]);
  });

  it("accepts source URLs actually opened by web search, not just search-result URLs", async () => {
    fetcher.mockResolvedValue(Response.json({ output: [{ type: "web_search_call", action: { type: "open_page", url: source } }, { type: "message", content: [{ text: JSON.stringify(research()) }] }] }));
    const l = league("Opened source");
    await live.openLiveLeague(l);
    expect(l.live!.status).toBe("ready");
    expect(l.pool[0].source).toBe(source);
  });

  it("supports unscheduled public milestone leagues anchored to recent reporting", async () => {
    const data = { ...research(), picks: research().picks.map((p) => ({ name: p.name, reason: p.reason, source: p.source, currentAsOf: new Date(now - 3600000).toISOString() })) };
    fetcher.mockResolvedValue(web(data));
    const l = league("Public technology milestones");
    await live.openLiveLeague(l);
    expect(l.live!.status).toBe("ready");
    expect(l.pool[0].currentAsOf).toBe(now - 3600000);
  });

  it("scores sourced post-opening outcomes once, including across concurrent checks and persisted state", async () => {
    fetcher.mockResolvedValue(web(research()));
    const l = league("Weekly hockey");
    await live.openLiveLeague(l);
    const events = [
      { pick: "Team 0", outcome: "positive", occurredAt: new Date(now + 60000).toISOString(), reason: "Team 0 won its official game.", source },
      { pick: "Team 0", outcome: "positive", occurredAt: new Date(now + 61000).toISOString(), reason: "Another article about the same win.", source },
      { pick: "Team 1", outcome: "negative", occurredAt: new Date(now - 1000).toISOString(), reason: "Too old.", source },
      { pick: "Team 2", outcome: "negative", occurredAt: new Date(now + 200000).toISOString(), reason: "In the future.", source },
      { pick: "Team 3", outcome: "positive", occurredAt: new Date(now + 60000).toISOString(), reason: "Unverified source.", source: "https://invented.example.com/" },
    ];
    vi.setSystemTime(now + 120000);
    fetcher.mockResolvedValue(web({ events }));
    const before = fetcher.mock.calls.length;
    const [first, second] = await Promise.all([live.scoreLiveLeague(l), live.scoreLiveLeague(l)]);
    expect(first).toBe(second);
    expect(fetcher.mock.calls.length - before).toBe(1);
    expect(l.pool[0].points).toBe(5);
    expect(l.log).toHaveLength(1);
    expect(l.log[0]).toMatchObject({ delta: 5, by: "Nickel live", reason: events[0].reason, source });
    expect(await live.scoreLiveLeague(l)).toContain("Already checked");
    const restored = JSON.parse(JSON.stringify(l)) as FantasyLeague;
    records[l.id] = restored;
    vi.setSystemTime(now + live.LIVE_INTERVAL_MS + 120001);
    fetcher.mockResolvedValue(web({ events: [events[0]] }));
    await live.scoreLiveLeague(restored);
    expect(restored.pool[0].points).toBe(5);
    expect(restored.log).toHaveLength(1);
  });

  it("uses real quote metadata rather than model prices, computes cumulative deltas and preserves manual points", async () => {
    fetcher.mockImplementation(async (url) => String(url).includes("api.openai.com") ? web(research(true)) : quote(String(url).match(/chart\/([^?]+)/)![1]));
    const l = league("Chip stocks");
    await live.openLiveLeague(l);
    expect(l.live!.quotes.T0.price).toBe(100);
    l.pool[0].points = 10;
    vi.setSystemTime(now + 120000);
    fetcher.mockImplementation(async (url) => quote(String(url).match(/chart\/([^?]+)/)![1], 102, now + 60000));
    await live.scoreLiveLeague(l);
    expect(l.pool[0].points).toBe(12);
    expect(l.log[0]).toMatchObject({ delta: 2, source: "https://finance.yahoo.com/quote/T0/" });
    expect(l.log[0].reason).toContain("Yahoo regular-market quote");
    vi.setSystemTime(now + live.LIVE_INTERVAL_MS + 120001);
    fetcher.mockImplementation(async (url) => quote(String(url).match(/chart\/([^?]+)/)![1], 101, now + 180000));
    await live.scoreLiveLeague(l);
    expect(l.pool[0].points).toBe(11);
    expect(l.log.at(-12)?.delta).toBe(-1);
    vi.setSystemTime(now + 2 * live.LIVE_INTERVAL_MS + 120002);
    fetcher.mockImplementation(async (url) => quote(String(url).match(/chart\/([^?]+)/)![1], 102, now + 60000));
    await live.scoreLiveLeague(l);
    expect(l.pool[0].points).toBe(11);
    vi.setSystemTime(now + 3 * live.LIVE_INTERVAL_MS + 120003);
    fetcher.mockImplementation(async (url) => quote(String(url).match(/chart\/([^?]+)/)![1], 104, now + 240000));
    await live.scoreLiveLeague(l);
    expect(l.pool[0].points).toBe(14);
    expect(live.liveTurn("Nickel, $5 buy-in on Chip stocks", "https://nickel.test")?.line).toContain("points-only");
  });

  it("rejects mismatched, stale or invalid quotes and never substitutes a model guess", async () => {
    fetcher.mockResolvedValue(quote("OTHER"));
    expect(await live.publicQuote("T0")).toBeNull();
    fetcher.mockResolvedValue(quote("T0", 100, now - 8 * 86400000));
    expect(await live.publicQuote("T0")).toBeNull();
    fetcher.mockResolvedValue(quote("T0", -1));
    expect(await live.publicQuote("T0")).toBeNull();
    expect(await live.publicQuote("../private")).toBeNull();
  });

  it("does not advance the verified watermark or invent awards when scoring fails", async () => {
    fetcher.mockResolvedValue(web(research()));
    const l = league("Failed tennis score");
    await live.openLiveLeague(l);
    fetcher.mockRejectedValue(new Error("offline"));
    expect(await live.scoreLiveLeague(l)).toContain("could not check");
    expect(l.live!.lastCheckedAt).toBeUndefined();
    expect(l.log).toEqual([]);
    expect(l.pool.every((p) => p.points === 0)).toBe(true);
    expect(await live.scoreLiveLeague(l)).toContain("Already checked");
  });

  it("does not score more often than every four hours, or after a week", async () => {
    fetcher.mockResolvedValue(web(research()));
    const l = league("Weekly baseball");
    await live.openLiveLeague(l);
    const calls = fetcher.mock.calls.length;
    await live.tickLiveLeagues();
    expect(fetcher.mock.calls.length).toBe(calls);
    vi.setSystemTime(now + live.LIVE_INTERVAL_MS);
    fetcher.mockResolvedValue(web({ events: [] }));
    await live.tickLiveLeagues();
    expect(fetcher.mock.calls.length).toBe(calls + 1);
    await live.tickLiveLeagues();
    expect(fetcher.mock.calls.length).toBe(calls + 1);
    vi.setSystemTime(now + 8 * 86400000);
    expect(await live.scoreLiveLeague(l)).toContain("window has ended");
  });

  it("returns a two-sentence summary with one grounded link and ignores unaddressed messages", async () => {
    fetcher.mockResolvedValue(web(research()));
    const reply = live.liveTurn("Nickel, what's happening with tennis", "https://nickel.test")!;
    expect((await live.finishLiveTurn(reply)).line).toBe(research().summary + " " + source);
    expect(live.liveTurn("what's happening with tennis", "https://nickel.test")).toBeNull();
    expect(live.liveTurn("Nickel, Team 0 +10", "https://nickel.test")).toBeNull();
  });

  it("keeps chat replies fast while research finishes and preserves manual scoring", async () => {
    let complete!: (value: Response) => void;
    fetcher.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    live.attachLive(() => brain.internals.store.fantasy, brain.internals.save);
    const reply = brain.handleTurn({ text: "Nickel, start a fantasy league for current rugby: Test pick", sender: "Maya", baseUrl: "https://nickel.test" });
    const l = brain.getFantasy(reply.card!.path.slice(3))!;
    expect(reply.line).toContain("is open");
    expect(l.live!.status).toBe("researching");
    expect(brain.draftPick(l.id, "Maya", "Test pick").ok).toBe(true);
    complete(web(research()));
    await live.openLiveLeague(l);
    expect(l.pool.find((p) => p.name === "Test pick")?.owner).toBe("Maya");
    expect(brain.handleTurn({ text: "Nickel, Test pick +10", sender: "Maya", baseUrl: "https://nickel.test" }).line).toContain("Test pick +10");
    expect(l.pool.find((p) => p.name === "Test pick")?.points).toBe(10);
    expect(brain.handleTurn({ text: "Nickel, start a fantasy league for Maya's dating life", baseUrl: "https://nickel.test" }).card).toBeUndefined();
    fetcher.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const summary = live.liveTurn("Nickel, what's happening with slow swimming", "https://nickel.test")!;
    expect((await live.finishLiveTurn(summary, 1)).line).toContain("Researching current news");
    complete(web(research()));
  });
});
