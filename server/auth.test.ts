// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

let brain: typeof import("./brain.js");
let auth: typeof import("./auth.js");
let dir: string;
beforeAll(async () => {
  dir = mkdtempSync(tmpdir() + "/nickel-auth-");
  process.env.NICKEL_DATA_DIR = dir;
  delete process.env.NICKEL_TURN_SECRET;
  brain = await import("./brain.js");
  auth = await import("./auth.js");
});

const base = "https://nickel.test";
const setUp = (phone: string, name: string, trusted = true) => brain.handleTurn({ text: "Nickel, I'm " + name + ". Set me up", senderPhone: phone, baseUrl: base, trusted });
const linkParts = (url: string) => {
  const parsed = new URL(url);
  return { token: parsed.pathname.slice(4), code: parsed.searchParams.get("k") ?? "" };
};
const post = (path: string, body: unknown, sid = "", headers: Record<string, string> = {}) =>
  auth.authGate(new Request(base + path, { method: "POST", headers: { "content-type": "application/json", host: "nickel.test", ...(sid ? { cookie: "theme=dark; nickel_sid=" + sid } : {}), ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }), "203.0.113." + Math.floor(Math.random() * 250));
const claim = async (url: string) => {
  const res = (await post("/api/claim", linkParts(url))) as Response;
  return { res, sid: res.headers.getSetCookie().join(";").match(/nickel_sid=([a-f0-9]{64})/)?.[1] ?? "" };
};
const passed = async (gate: Awaited<ReturnType<typeof post>>) => {
  if (gate instanceof Response) throw new Error("rejected with " + gate.status);
  return (await gate.request.json()) as Record<string, unknown>;
};
const stored = () => JSON.parse(readFileSync(dir + "/store.json", "utf8")) as { results: { roundId: string; name: string; unverified?: boolean }[]; auth: { sessions: Record<string, unknown>; claims: Record<string, unknown> } };

describe("claiming a player card", () => {
  it("mints a one-time claim link only for a trusted turn", () => {
    const open = setUp("+15550100001", "Maya", false);
    expect(open.url).toMatch(/\/me\/me-[a-z0-9]+$/);
    const first = setUp("+15550100001", "Maya");
    expect(first.url).toMatch(/\/me\/me-[a-z0-9]+\?k=[a-f0-9]{48}$/);
    expect(first.card!.path).toBe(new URL(first.url!).pathname + new URL(first.url!).search);
  });

  it("lets one device claim, sets a hardened cookie, and rejects a second device", async () => {
    const { url } = setUp("+15550100002", "Alex");
    const { token, code } = linkParts(url!);
    expect(auth.claimStatus(null, token, code)).toBe("open");
    const first = await claim(url!);
    expect(first.res.status).toBe(200);
    const cookie = first.res.headers.getSetCookie().find((c) => c.startsWith("nickel_sid="))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Secure/);
    expect(first.sid).toHaveLength(64);
    expect(auth.sessionFor(first.sid)).toEqual({ token, name: "Alex" });
    expect(auth.claimStatus(auth.sessionFor(first.sid), token, null)).toBe("owner");

    const second = await claim(url!);
    expect(second.res.status).toBe(403);
    expect(second.sid).toBe("");
    expect(auth.claimStatus(null, token, code)).toBe("locked");
    expect(auth.claimProfile(token, "")).toMatchObject({ ok: false });
    expect(auth.sessionFor(token)).toBeNull();
    expect(auth.sessionFor("f".repeat(64))).toBeNull();
  });

  it("leaves the Secure flag off on localhost and never stores the raw session id or code", async () => {
    const { url } = setUp("+15550100003", "Dev");
    const res = (await auth.authGate(new Request("http://localhost:5173/api/claim", { method: "POST", headers: { host: "localhost:5173" }, body: JSON.stringify(linkParts(url!)) }), "127.0.0.1")) as Response;
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("nickel_sid="))!;
    expect(cookie).not.toMatch(/Secure/);
    const sid = cookie.match(/nickel_sid=([a-f0-9]{64})/)![1];
    const again = setUp("+15550100003", "Dev");
    const raw = readFileSync(dir + "/store.json", "utf8");
    expect(raw).not.toContain(sid);
    expect(raw).not.toContain(linkParts(again.url!).code);
    expect(Object.keys(stored().auth.sessions).length).toBeGreaterThan(0);
  });

  it("re-issues a fresh link when the owner asks again, and the new claim signs the old device out", async () => {
    const one = setUp("+15550100004", "Peyton");
    const old = await claim(one.url!);
    expect(auth.sessionFor(old.sid)?.name).toBe("Peyton");

    const two = setUp("+15550100004", "Peyton");
    const three = setUp("+15550100004", "Peyton");
    expect(linkParts(three.url!).code).not.toBe(linkParts(two.url!).code);
    expect((await claim(two.url!)).res.status).toBe(403);
    expect(auth.sessionFor(old.sid)?.name).toBe("Peyton");

    const fresh = await claim(three.url!);
    expect(fresh.res.status).toBe(200);
    expect(auth.sessionFor(fresh.sid)?.name).toBe("Peyton");
    expect(auth.sessionFor(old.sid)).toBeNull();
    expect((await claim(three.url!)).res.status).toBe(403);
  });

  it("expires an unused claim link", () => {
    const { url } = setUp("+15550100005", "Quinn");
    const { token, code } = linkParts(url!);
    expect(auth.claimOpen(token, code)).toBe(true);
    expect(auth.claimOpen(token, code, Date.now() + 25 * 60 * 60 * 1000)).toBe(false);
  });
});

describe("identity on writes", () => {
  let sid = "";
  let token = "";
  let roundId = "";
  beforeAll(async () => {
    const mine = setUp("+15550100010", "Sritej");
    token = linkParts(mine.url!).token;
    sid = (await claim(mine.url!)).sid;
    roundId = brain.handleTurn({ text: "nickel play krillion", sender: "Sritej", baseUrl: base }).card!.path.slice(3);
  });

  it("takes the actor from the session and records a verified result", async () => {
    const body = await passed(await post("/api/rounds/" + roundId + "/result", { tries: "3/6", verified: false }, sid));
    expect(body).toMatchObject({ name: "Sritej", verified: true });
    brain.recordResult(roundId, body);
    const saved = stored().results.find((r) => r.roundId === roundId && r.name === "Sritej")!;
    expect(saved.unverified).toBeUndefined();
  });

  it("rejects a spoofed name on result, pot, draft and score", async () => {
    for (const [path, body] of [["/api/rounds/" + roundId + "/result", { name: "Maya" }], ["/api/pot/pot-abc12", { member: "maya", action: "pay" }], ["/api/fantasy/fantasy-abc12/draft", { member: "Maya", pick: "Claude" }], ["/api/fantasy/fantasy-abc12/score", { member: "Maya", pick: "Claude", delta: 5 }]] as const) {
      const res = (await post(path, body, sid)) as Response;
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("This phone plays as Sritej.");
    }
    expect(await passed(await post("/api/pot/pot-abc12", { member: "sritej", action: "agree" }, sid))).toMatchObject({ member: "Sritej", action: "agree" });
    expect(await passed(await post("/api/fantasy/fantasy-abc12/draft", { pick: "Claude" }, sid))).toMatchObject({ member: "Sritej", pick: "Claude" });
  });

  it("keeps the name picker working without a session and marks the result unverified", async () => {
    const body = await passed(await post("/api/rounds/" + roundId + "/result", { name: "zoe", tries: "2/6", verified: true }));
    expect(body).toMatchObject({ name: "zoe", verified: false });
    expect(brain.recordResult(roundId, body).ok).toBe(true);
    expect(stored().results.find((r) => r.roundId === roundId && r.name === "Zoe")!.unverified).toBe(true);
    expect(await passed(await post("/api/pot/pot-abc12", { member: "Zoe", action: "agree" }))).toMatchObject({ member: "Zoe" });
    expect(await passed(await post("/api/fantasy/fantasy-abc12/draft", { member: "Zoe", pick: "GPT" }))).toMatchObject({ member: "Zoe" });
  });

  it("does not let a device with no session play as someone who claimed a card", async () => {
    const res = (await post("/api/rounds/" + roundId + "/result", { name: "Sritej", tries: "1/6" })) as Response;
    expect(res.status).toBe(403);
    expect(((await post("/api/pot/pot-abc12", { member: "Sritej", action: "pay" })) as Response).status).toBe(403);
    expect(((await post("/api/rounds/" + roundId + "/result", { name: "Sritej" }, "a".repeat(64))) as Response).status).toBe(403);
  });

  it("allows profile edits only from the session that owns the card", async () => {
    expect(((await post("/api/me/" + token, { name: "Hacked" })) as Response).status).toBe(403);
    const other = setUp("+15550100011", "Rival");
    const otherSid = (await claim(other.url!)).sid;
    expect(((await post("/api/me/" + token, { name: "Hacked" }, otherSid)) as Response).status).toBe(403);
    expect(((await post("/api/me/" + linkParts(other.url!).token, { name: "Sritej" }, otherSid)) as Response).status).toBe(409);
    const body = await passed(await post("/api/me/" + token, { name: "Sritej", account: "@sritej" }, sid));
    expect(brain.saveProfile(token, body)).toMatchObject({ ok: true, profile: { name: "Sritej", account: "@sritej" } });
  });

  it("rejects cross-site posts and leaves reads alone", async () => {
    expect(((await post("/api/pot/pot-abc12", { action: "agree" }, sid, { origin: "https://evil.test" })) as Response).status).toBe(403);
    expect(await passed(await post("/api/pot/pot-abc12", { action: "agree" }, sid, { origin: "https://nickel.test" }))).toMatchObject({ member: "Sritej" });
    const read = await auth.authGate(new Request(base + "/r/" + roundId, { headers: { cookie: "nickel_sid=" + sid } }));
    expect(read).toMatchObject({ session: { token, name: "Sritej" } });
  });
});

describe("abuse limits", () => {
  it("caps body size per route", async () => {
    expect(((await post("/api/rounds/wordle-212/result", { name: "Zoe", time: "x".repeat(5000) })) as Response).status).toBe(413);
    expect(((await post("/api/me/me-nope", { name: "Zoe", photo: "x".repeat(400001) })) as Response).status).toBe(413);
    expect(((await post("/api/turn", { text: "x".repeat(64001) })) as Response).status).toBe(413);
  });

  it("limits writes per IP and per session", async () => {
    const hit = (ip: string, sid = "") => auth.authGate(new Request(base + "/api/pot/pot-abc12", { method: "POST", headers: { host: "nickel.test", ...(sid ? { cookie: "nickel_sid=" + sid } : {}) }, body: JSON.stringify({ member: sid ? undefined : "Zoe", action: "agree" }) }), ip);
    let status = 0;
    for (let i = 0; i < 121; i++) {
      const out = await hit("198.51.100.7");
      status = out instanceof Response ? out.status : 200;
      if (i === 119) expect(status).toBe(200);
    }
    expect(status).toBe(429);
    expect(await hit("198.51.100.8")).not.toBeInstanceOf(Response);

    const mine = setUp("+15550100020", "Busy");
    const sid = (await claim(mine.url!)).sid;
    for (let i = 0; i < 61; i++) {
      const out = await hit("198.51.100." + (20 + i), sid);
      status = out instanceof Response ? out.status : 200;
      if (i === 59) expect(status).toBe(200);
    }
    expect(status).toBe(429);
  });

  it("guards wallet, chest and heist writes with the same-site check, size cap and rate limit", async () => {
    const paths = ["/api/wallet", "/api/wallet/topup", "/api/wallet/cashout", "/api/chest/open", "/api/chest/skip", "/api/heist/abc_12-X/start", "/api/heist/abc_12-X/attempt", "/api/heist/abc_12-X/peek"];
    for (const path of paths) {
      const cross = (await post(path, { ms: 5000 }, "", { origin: "https://evil.test" })) as Response;
      expect([path, cross.status]).toEqual([path, 403]);
      expect([path, ((await post(path, { pad: "x".repeat(2001) })) as Response).status]).toEqual([path, 413]);
      const ok = await post(path, { ms: 5000 }, "", { origin: "https://nickel.test" });
      expect(ok).not.toBeInstanceOf(Response);
      expect(await (ok as { request: Request }).request.json()).toEqual({ ms: 5000 });
    }
    expect(await post("/api/walletx", { a: 1 }, "", { origin: "https://evil.test" })).not.toBeInstanceOf(Response);
    let status = 0;
    for (let i = 0; i < 121; i++) {
      const out = await auth.authGate(new Request(base + "/api/heist/abc/start", { method: "POST", headers: { host: "nickel.test" }, body: "{}" }), "198.51.100.150");
      status = out instanceof Response ? out.status : 200;
      if (i === 119) expect(status).toBe(200);
    }
    expect(status).toBe(429);
  });

  it("limits claim attempts per IP", async () => {
    let status = 0;
    for (let i = 0; i < 11; i++) status = ((await auth.authGate(new Request(base + "/api/claim", { method: "POST", headers: { host: "nickel.test" }, body: JSON.stringify({ token: "me-nope", code: "0".repeat(48) }) }), "198.51.100.99")) as Response).status;
    expect(status).toBe(429);
  });

  it("uses the forwarded address only behind a local proxy", () => {
    const req = new Request(base + "/l", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(auth.clientIp(req, "127.0.0.1")).toBe("5.6.7.8");
    expect(auth.clientIp(req, "9.9.9.9")).toBe("9.9.9.9");
  });

  it("requires the shared secret on turns once one is configured", () => {
    process.env.NICKEL_TURN_SECRET = "s3cret";
    expect(auth.turnTrusted(new Request(base + "/api/turn", { method: "POST" }))).toBe(false);
    expect(auth.turnTrusted(new Request(base + "/api/turn", { method: "POST", headers: { "x-nickel-secret": "s3cret" } }))).toBe(true);
    expect(auth.turnTrusted(new Request(base + "/api/turn", { method: "POST", headers: { authorization: "Bearer s3cret" } }))).toBe(true);
    delete process.env.NICKEL_TURN_SECRET;
  });
});
