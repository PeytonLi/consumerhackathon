// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let brain: typeof import("./brain.js");
let dir: string;
const photo = (value: string) => "data:image/jpeg;base64," + Buffer.from(value).toString("base64");

beforeAll(async () => {
  dir = mkdtempSync(tmpdir() + "/nickel-portraits-");
  vi.stubEnv("NICKEL_DATA_DIR", dir);
  vi.stubEnv("CONVEX_URL", "");
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  brain = await import("./brain.js");
});

afterEach(() => vi.unstubAllGlobals());
afterAll(() => vi.unstubAllEnvs());

describe("portrait identity", () => {
  it("invalidates both cached roles when the profile photo changes", () => {
    const profile = brain.setPhoto("+15550001111", "Maya", photo("first"));
    mkdirSync(dir + "/art", { recursive: true });
    for (const role of ["loser", "winner"]) {
      const key = profile.token + "-" + role;
      brain.internals.store.art[key] = Date.now();
      writeFileSync(dir + "/art/" + key + ".jpg", "old portrait");
    }
    brain.setPhoto("+15550001111", "Maya", photo("second"));
    for (const role of ["loser", "winner"]) {
      const key = profile.token + "-" + role;
      expect(brain.internals.store.art[key]).toBeUndefined();
      expect(existsSync(dir + "/art/" + key + ".jpg")).toBe(false);
    }
  });

  it("discards a portrait generated from a photo replaced while the request was in flight", async () => {
    const profile = brain.setPhoto("+15550002222", "Peyton", photo("original"));
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const pending = brain.generateArt(profile.token, "winner");
    expect(fetcher).toHaveBeenCalledOnce();
    brain.setPhoto("+15550002222", "Peyton", photo("replacement"));
    finish(Response.json({ data: [{ b64_json: Buffer.from("stale portrait").toString("base64") }] }));
    await pending;
    expect(brain.internals.store.art[profile.token + "-winner"]).toBeUndefined();
    expect(existsSync(dir + "/art/" + profile.token + "-winner.jpg")).toBe(false);
  });
});
