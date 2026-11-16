# Nickel conversation behavior

`packages/keiki-agent/src/conversation.ts` holds the conversation rules used by the SDK agent. The same rules were applied to the hosted Nickel agent on November 15, 2026. The hosted authored tool, not the SDK package, currently serves the group line, so publishing this repository alone does not configure that agent.

Direct messages can be ordinary conversation. Addressed group messages and clear follow-ups receive replies; unrelated group chatter stays quiet. Casual conversation does not require a player card or call the game tool. Tasks receive a contextual acknowledgment before work and a separate final result through the channel's `reply` tool. Reactions target the actual incoming provider message ID, when the channel exposes a reaction tool.

## Verification and limits

- Two hosted synthetic turns discussed an exhausting day and work without calling `send_nickel_card`; both returned conversational replies through `reply`.
- Trace `27bcbc8c6b3a6be4e97b567b1f85d294` verifies `Nickel, games`: successful acknowledgment reply, then `send_nickel_card`, then a successful second reply containing the returned eight-game menu. The final model step did not duplicate that reply. Trace `749f803801a13fbb6d96f2bf18056ec2` verifies a subsequent tired-day conversation used only `reply`, without a game call or task acknowledgment.
- Eight offline configuration tests and TypeScript checking pass. These tests guard the configured policy, not model behavior or phone delivery.
- The latest inspected real group trace, `88a8d023f2641622222e1d53864f1ded`, has an incoming provider message ID and exposes `reply`, but does not expose `react_to_message`. It predates this policy update. A prompt cannot inject that missing capability. Native tapbacks on this route need Keiki/provider support; no emoji text is sent to impersonate a tapback.
- Synthetic conversations expose a reaction tool but omit a real incoming message ID, so they cannot prove real tapback delivery. Actual phone delivery of the updated behavior remains to be checked.
- After Dynamic UI was enabled, non-sending group-route probe `60d324f0de9825c88c8f6be21f2a1440` still reported channel `sms` and omitted every reaction tool from `load_context`. Dynamic UI alone does not expose native tapbacks on this route. The probe refused contact delivery and is not evidence of a phone reply or reaction.
- Real group trace `788e748111993e1a68ca35a40254e2c9` confirms the acknowledgment was sent for the follow-up `games pls`, but revealed that the old exact-match menu parser launched Wordle. The parser now accepts polite menu requests, with nine regressions; the hosted policy also canonicalizes menu aliases for compatibility with the existing preview runtime. Hosted retest `4354d8c6eb121759812a2b0af5ceb7a5` confirms the exact phrase `Nickel, games pls` produces acknowledgment, the full game list and a separate final reply. The real group's tool list still contains no reaction tool after Dynamic UI enablement.

No payment tools, line credentials or routing were changed by this update.
