// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const read = (file: string) => readFileSync(new URL("../apps/preview/" + file, import.meta.url), "utf8");
const mockApi = read("mock-api.js");

type Fetch = (input: string, init?: { method?: string; body?: string }) => Promise<Response>;
let clock = Date.UTC(2026, 10, 16, 17);
class MockDate extends Date {
  static now() { return clock; }
}
function mocked(search: string) {
  const store = new Map<string, string>();
  const original: Fetch = async () => new Response(JSON.stringify({ real: true }), { status: 200 });
  const window: { fetch: Fetch; ME?: { name: string } } = { fetch: original };
  runInNewContext(mockApi, {
    window,
    location: new URL("http://nickel.test/wallet" + search),
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    Response, URL, URLSearchParams, setTimeout, structuredClone, Date: MockDate,
  });
  const call = async (path: string, body?: unknown) => {
    const res = await window.fetch(path, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
    return { status: res.status, data: (await res.json()) as Record<string, any> };
  };
  return { window, original, call };
}

describe("money pages", () => {
  it("ship on the design system with the shared helpers, the mock layer and no emoji", () => {
    for (const file of ["wallet.html", "chest.html", "heist.html"]) {
      const page = read(file);
      expect(page).toContain('href="/nickel.css"');
      expect(page).toContain('src="/nickel.js"');
      expect(page).toContain('src="/mock-api.js"');
      for (const id of ['class="bar"', 'id="stage"', 'id="dock"', 'id="toast"', 'id="sheet"']) expect(page).toContain(id);
      expect(page).not.toMatch(EMOJI);
    }
    expect(read("nickel.js")).not.toMatch(EMOJI);
    expect(mockApi).not.toMatch(EMOJI);
    expect(read("nickel.css")).toContain("prefers-reduced-motion: reduce");
    expect(read("chest.html")).toContain("reduced() ? 150 : 1200");
  });

  it("calls exactly the contract endpoints", () => {
    expect(read("wallet.html")).toMatch(/"\/api\/wallet"[\s\S]*"\/api\/wallet\/topup"[\s\S]*"\/api\/wallet\/limit"[\s\S]*"\/api\/wallet\/cashout"/);
    expect(read("chest.html")).toMatch(/"\/api\/chest"[\s\S]*"\/api\/chest\/skip"[\s\S]*"\/api\/chest\/open"/);
    expect(read("heist.html")).toMatch(/"\/api\/heist"[\s\S]*"\/api\/heist\/" \+ encodeURIComponent\(l\.id\) \+ "\/peek"[\s\S]*"\/api\/heist\/" \+ encodeURIComponent\(l\.id\) \+ "\/start"[\s\S]*"\/api\/heist\/" \+ encodeURIComponent\(l\.id\) \+ "\/attempt"/);
    const play = read("play.html");
    expect(play).toContain('fetch("/api/wallet")');
    expect(play).toContain("d.moneyCents");
    expect(play).toContain('src="/mock-api.js"');
  });

  it("serves the three pages from the Bun server", () => {
    const server = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(server).toContain('if (path === "/wallet") return page((await Bun.file(site + "wallet.html").text()).replace("<!--WALLET-->", headTags(walletCard(), base, "")));');
    expect(server).toContain('if (path === "/chest") return page(await Bun.file(site + "chest.html").text());');
    expect(server).toContain('if (path === "/heist") return page(await Bun.file(site + "heist.html").text());');
  });

  it("leaves fetch alone without ?mock", () => {
    const { window, original } = mocked("");
    expect(window.fetch).toBe(original);
    expect(window.ME).toBeUndefined();
  });

  it("answers the wallet contract", async () => {
    const { call, window } = mocked("?mock=1");
    expect(window.ME).toEqual({ name: "Peyton" });
    const { data: w } = await call("/api/wallet");
    expect(Object.keys(w).sort()).toEqual(["activity", "balanceCents", "consent", "dailyLimitCents", "kyc", "spentTodayCents"]);
    expect(w.balanceCents).toBe(w.activity.reduce((n: number, a: { amountCents: number }) => n + a.amountCents, 0));
    for (const a of w.activity) expect(Object.keys(a).sort()).toEqual(["amountCents", "at", "note", "reason"]);
    expect((await call("/api/wallet/topup", { amountCents: 50 })).status).toBe(400);
    expect((await call("/api/wallet/topup", { amountCents: 500 })).data.checkoutUrl).toMatch(/^\/wallet\?.*paid=500/);
    expect((await call("/api/wallet/limit", { dailyLimitCents: 200 })).status).toBe(400);
    expect((await call("/api/wallet/limit", { dailyLimitCents: 200, consent: true })).data).toEqual({ ok: true });
    expect((await call("/api/wallet")).data.dailyLimitCents).toBe(200);
    expect((await call("/api/wallet/cashout", { amountCents: 99999 })).status).toBe(400);
    expect((await call("/api/wallet/cashout", { amountCents: 435 })).data.url).toMatch(/onboarded=1/);
  });

  it("pays out once ID is verified and shows the low and new states", async () => {
    const verified = mocked("?mock=verified");
    expect((await verified.call("/api/wallet/cashout", { amountCents: 435 })).data).toEqual({ ok: true, status: "pending" });
    expect((await verified.call("/api/wallet")).data.balanceCents).toBe(0);
    expect((await mocked("?mock=low").call("/api/wallet")).data.balanceCents).toBe(10);
    expect((await mocked("?mock=new").call("/api/wallet")).data).toMatchObject({ balanceCents: 0, consent: false, activity: [] });
  });

  it("credits a returning checkout once", async () => {
    const { call } = mocked("?mock=new&paid=500&t=1");
    expect((await call("/api/wallet")).data.balanceCents).toBe(500);
  });

  it("opens the chest once with a contract-shaped result and shows the odds", async () => {
    const { call } = mocked("?mock=1");
    const before = (await call("/api/chest")).data;
    expect(before).toMatchObject({ available: true, opened: null });
    expect(before.odds.reduce((n: number, o: { pct: number }) => n + o.pct, 0)).toBe(100);
    const { result } = (await call("/api/chest/open", {})).data;
    expect(["points", "perk", "cash"]).toContain(result.kind);
    expect(typeof result.label).toBe("string");
    if (result.kind === "points") expect(result.points).toBeGreaterThan(0);
    if (result.kind === "perk") expect(["lock", "double_steal", "peek", "shield"]).toContain(result.perk);
    if (result.kind === "cash") expect(result.amountCents).toBeGreaterThan(0);
    expect((await call("/api/chest/open", {})).status).toBe(409);
    expect((await call("/api/chest")).data).toMatchObject({ available: false, opened: result });
    expect((await mocked("?mock=skipped").call("/api/chest")).data).toMatchObject({ available: false, opened: null });
  });

  it("hides unpeeked ghosts and peeks with a perk", async () => {
    const { call } = mocked("?mock=1");
    const { data } = await call("/api/heist");
    expect(Object.keys(data.perks).sort()).toEqual(["double_steal", "lock", "peek", "shield"]);
    for (const l of data.loose) expect(Object.keys(l).sort()).toEqual(["cents", "endsAt", "ghostMs", "id", "nickels", "peek", "victim"]);
    expect(data.loose.map((l: { id: string; ghostMs: number | null }) => [l.id, l.ghostMs])).toEqual([["lz-dev", 212], ["lz-alex", null], ["lz-maya", null]]);
    expect((await call("/api/heist/lz-alex/peek", {})).data).toEqual({ ghostMs: 148 });
    expect((await call("/api/heist/lz-maya/peek", {})).status).toBe(409);
    const after = (await call("/api/heist")).data;
    expect(after.perks.peek).toBe(0);
    expect(after.loose.map((l: { ghostMs: number | null }) => l.ghostMs)).toEqual([212, 148, null]);
    expect((await mocked("?mock=empty").call("/api/heist")).data.loose).toEqual([]);
  });

  it("scores the heist on its own clock from one start: closer to 5.000s than the ghost takes it", async () => {
    const { call } = mocked("?mock=1");
    expect((await call("/api/heist/lz-dev/start", {})).data).toEqual({ ok: true, limitMs: 15000 });
    expect((await call("/api/heist/lz-dev/start", {})).status).toBe(409);
    expect((await call("/api/heist")).data.loose.map((l: { id: string }) => l.id)).toEqual(["lz-alex", "lz-maya"]);
    clock += 5100;
    expect((await call("/api/heist/lz-dev/attempt", { ms: 5000 })).data).toEqual({ won: true, ghostMs: 212, ms: 5000, took: { nickels: 1, cents: 5 } });
    expect((await call("/api/heist/lz-dev/attempt", { ms: 5000 })).status).toBe(404);
    await call("/api/heist/lz-alex/start", {});
    clock += 5600;
    expect((await call("/api/heist/lz-alex/attempt", { ms: 5000 })).data).toEqual({ won: false, ghostMs: 148, ms: 5600, took: { nickels: 0, cents: 0 } });
    expect((await call("/api/heist/lz-maya/attempt", { ms: 5000 })).data).toEqual({ won: false, ghostMs: 300, ms: null, took: { nickels: 0, cents: 0 } });
    expect((await call("/api/heist")).data.loose).toEqual([]);
    const late = mocked("?mock=1");
    await late.call("/api/heist/lz-maya/start", {});
    clock += 15001;
    expect((await late.call("/api/heist/lz-maya/attempt", { ms: 5000 })).data).toMatchObject({ won: false, ms: null });
  });

  it("adds a money delta to round results and passes other calls through", async () => {
    const { call } = mocked("?mock=1");
    expect((await call("/api/rounds/wordle-212/result", { name: "Peyton", tries: "2/6" })).data).toEqual({ real: true, moneyCents: 15 });
    expect((await call("/api/rounds/rps-dev/result", { name: "Peyton", won: false })).data.moneyCents).toBe(-5);
    expect((await call("/api/leaderboard")).data).toEqual({ real: true });
  });
});
