// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NICKEL_CONVERSATION_RULES } from "./conversation.js";

const sdkSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("Nickel conversation configuration", () => {
  it("answers direct messages and addressed group follow-ups without interrupting unrelated chat", () => {
    expect(NICKEL_CONVERSATION_RULES).toContain("In direct messages, answer anything");
    expect(NICKEL_CONVERSATION_RULES).toContain("clear follow-ups to your own conversation");
    expect(NICKEL_CONVERSATION_RULES).toContain("do not interrupt unrelated conversation");
  });

  it("keeps ordinary conversation out of the game tool", () => {
    expect(NICKEL_CONVERSATION_RULES).toContain("answer naturally yourself");
    expect(NICKEL_CONVERSATION_RULES).toContain("Do not call send_nickel_card");
    expect(NICKEL_CONVERSATION_RULES).toContain("in ordinary conversation as a game request");
    expect(sdkSource).not.toContain("For anything that is not about money, call send_nickel_card");
    expect(sdkSource).not.toContain("Call it whenever someone addresses Nickel");
  });

  it("targets reactions to the incoming message and tolerates unavailable reactions", () => {
    expect(NICKEL_CONVERSATION_RULES).toContain("targeting that exact incoming message");
    expect(NICKEL_CONVERSATION_RULES).toContain("Never invent a message id");
    expect(NICKEL_CONVERSATION_RULES).toContain("If reactions are unavailable or fail, continue without claiming you reacted");
  });

  it("requires contextual task acknowledgment before work, followed by a result or blocker", () => {
    expect(NICKEL_CONVERSATION_RULES).toContain("acknowledgment before doing the work");
    expect(NICKEL_CONVERSATION_RULES).toContain("channel's reply/send tool if available");
    expect(NICKEL_CONVERSATION_RULES).toContain("do the work in this turn");
    expect(NICKEL_CONVERSATION_RULES).toContain("result or an honest blocker");
    expect(NICKEL_CONVERSATION_RULES).toContain("Do not send 'on it' for ordinary conversation");
  });

  it("prohibits duplicate final delivery and fabricated intermediate sends", () => {
    expect(NICKEL_CONVERSATION_RULES).toContain("do not manufacture a two-message exchange");
    expect(NICKEL_CONVERSATION_RULES).toContain("After a successful final reply, do not repeat it in plain assistant text");
    expect(NICKEL_CONVERSATION_RULES).toContain("A reaction or tool call alone is never the answer");
  });

  it("delivers acknowledgment and task completion through the channel reply tool", () => {
    expect(NICKEL_CONVERSATION_RULES).toContain("When the channel provides reply, deliver both with reply");
    expect(NICKEL_CONVERSATION_RULES).toContain("a separate reply with the actual result after the tool finishes");
    expect(NICKEL_CONVERSATION_RULES).toContain("A final reply is mandatory even when you already sent an acknowledgment");
  });

  it("uses only current explicit action hints and does not promise unstarted background work", () => {
    expect(NICKEL_CONVERSATION_RULES).toContain("never stale hints from history");
    expect(NICKEL_CONVERSATION_RULES).toContain("unless a real workflow has been started");
  });

  it("includes the shared conversation policy in the SDK system prompt", () => {
    expect(sdkSource).toMatch(/import\s*\{\s*NICKEL_CONVERSATION_RULES\s*\}\s*from\s*["']\.\/conversation\.js["']/);
    expect(sdkSource).toMatch(/NICKEL_SYSTEM_PROMPT\s*=\s*\[[\s\S]*?NICKEL_CONVERSATION_RULES\s*,/);
  });
});
