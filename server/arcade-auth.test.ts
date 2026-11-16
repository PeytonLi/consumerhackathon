// @vitest-environment node
import { afterAll, expect, it, vi } from "vitest";
import { authGate } from "./auth.js";

afterAll(() => vi.unstubAllEnvs());

it("allows anonymous arcade discovery without accepting a submitted player identity", async () => {
  vi.stubEnv("NICKEL_TURN_SECRET", "test-only-secret");
  for (const text of ["Nickel, games", "Nickel, play reaction", "Nickel, play free throw", "Nickel, play memory", "Nickel, play math", "Nickel, play higher or lower", "Nickel, challenge Maya to reaction"]) {
    const gate = await authGate(new Request("https://nickel.test/api/turn", { method: "POST", headers: { host: "nickel.test", "content-type": "application/json" }, body: JSON.stringify({ text, sender: "Sritej", senderPhone: "+15550001111" }) }));
    expect(gate).not.toBeInstanceOf(Response);
    if (gate instanceof Response) throw new Error(await gate.text());
    expect(await gate.request.json()).toMatchObject({ text, sender: "", senderPhone: "" });
  }
  const denied = await authGate(new Request("https://nickel.test/api/turn", { method: "POST", headers: { host: "nickel.test", "content-type": "application/json" }, body: JSON.stringify({ text: "Nickel, cash out $5", sender: "Sritej" }) }));
  expect(denied).toBeInstanceOf(Response);
  expect((denied as Response).status).toBe(401);
});
