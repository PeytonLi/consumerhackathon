// @vitest-environment node
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { expect, it, vi } from "vitest";

const html = readFileSync(new URL("../apps/preview/wallet.html", import.meta.url), "utf8");
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join("\n");

it("gives signed-out checkout returns a player-card recovery action without claiming payment success", async () => {
  const elements = new Map<string, { innerHTML: string; onclick?: unknown }>();
  const stage = { className: "" };
  const dock = { hidden: true, innerHTML: "" };
  const nowhere = vi.fn();
  const toast = vi.fn();
  const redirect = vi.fn();
  const timers: (() => Promise<void>)[] = [];
  const context = createContext({
    params: new URLSearchParams("paid=1"), stage, dock, nowhere, toast,
    api: vi.fn().mockRejectedValue(Object.assign(new Error("Sign in"), { status: 401 })),
    setMe: vi.fn(),
    $: (id: string) => {
      if (!elements.has(id)) elements.set(id, { innerHTML: "" });
      return elements.get(id);
    },
    setTimeout: (callback: () => Promise<void>) => { timers.push(callback); return 1; },
    sessionStorage: { getItem: () => "/p/pot-example", removeItem: vi.fn() },
    location: { assign: redirect },
  });
  runInContext(source, context);
  expect(await runInContext("load()", context)).toBe(false);
  expect(nowhere).toHaveBeenCalledWith("Open your player card", expect.stringContaining("on this device"));
  expect(dock.innerHTML).toContain("Get my player card");
  expect(dock.innerHTML).toContain("retry-wallet");
  expect(toast).not.toHaveBeenCalledWith("Payment sent");
  for (const timer of timers) await timer();
  expect(redirect).not.toHaveBeenCalled();
});

it("distinguishes service failures from a missing player session", async () => {
  const nowhere = vi.fn();
  const context = createContext({
    params: new URLSearchParams(), stage: { className: "" }, dock: { hidden: true, innerHTML: "" },
    nowhere, api: vi.fn().mockRejectedValue(Object.assign(new Error("Offline"), { status: 503 })),
    setMe: vi.fn(), $: () => ({}), sessionStorage: { getItem: () => null },
  });
  runInContext(source, context);
  expect(await runInContext("load()", context)).toBe(false);
  expect(nowhere).toHaveBeenCalledWith("Wallet unavailable", expect.stringContaining("Try again"));
});
