# Nickel walkthrough

Editable HyperFrames project with a 74.25-second, 1920×1080 / 30 fps narrated cut. The presenter and paired Wordle Blitz #233 and Krillion #109 recordings come from the supplied footage. Prototype concepts and simulated wallet activity are explicitly labelled.

## Preview and render

```bash
npm ci
npm run check
npx hyperframes snapshot --review
npx hyperframes preview --background --port 3007
npm run render:delivery
npm run contact-sheet
```

The MP4 is written to `~/.capy/work/nickel-video/final.mp4` and the contact sheet beside it. Run `npx hyperframes preview --status` to confirm Studio is listening, and `npx hyperframes preview --stop` after review.

## Editing

`index.html` is the master timeline. Each file in `compositions/` is an editable scene; timing is in seconds. The supplied narration is on its own editable `voiceoverTrack` lane, with the original words retained and only the initial and trailing silence trimmed. The music and sound cues are generated locally by `scripts/build-audio.py`. All footage derivatives are muted; the narrator is a separate audio track. Recordings and the rendered export stay outside the repository.

The wallet captures are local demos, not real transactions. Narration describes a product vision that includes features and rules not all present in the current app; the matching sequences carry prototype/demo labels.
