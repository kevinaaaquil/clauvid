---
name: voiceover-sync
description: Use when a clauvid video has an owner-recorded voiceover take (assets/<script>_takeN.wav) and scenes, animations or captions must be timed to it, when the owner records a new take, or when captions need to match what was actually said.
---

# Voiceover sync: script + the owner's take, read together

Run everything from the `clauvid/` root.

The owner's take is what the viewer hears, so it decides **timing** and **wording**. The script decides **intent and form**: scene boundaries, emphasis, spelling (e.g. "CDS"), punctuation. Never time a video from the script alone, and never caption from the raw transcript alone.

## Run it

```bash
node .claude/skills/voiceover-sync/scripts/align.mjs projects/<p>/videos/<v> [--take script_v2_take3.wav] [--force]
```

- No `--take`: newest take in `assets/`. If the video has takes for several scripts and the owner didn't say which, ask.
- The script comes from the take name: `script_v2_take3.wav` → `scripts/script_v2.md`.
- Transcribes once with whisper.cpp (`small.en`, word timestamps, ~2 s per minute of audio), cached as `research/<take>.json`. `--force` re-transcribes and overwrites `beats.md`.

Writes to `research/`:

| File | What it holds |
|---|---|
| `<take>.json` | Raw whisper-cli word timings |
| `<take>.captions.json` | `{take, script, duration, scenes[], words: [{text, start, end, scene, bold?, italic?, added?}]}`: transcript timing, script spelling and punctuation. Feed captions and word-synced animation from this. |
| `beats.md` | Per scene: start → end, spoken text, emphasis phrases with times, where the take differs from the script, `Visual: _todo_`. If `beats.md` already exists it writes `beats.draft.md` instead, so your filled-in visuals survive. |

## Then

1. Read `beats.md`. Check the match rate and every difference line: `+"word"` added in the take, `−"word"` dropped, `"a" → "b"` reworded. The take wins; captions already follow it.
2. Fill each scene's **Visual** line. Put the strongest visual hit on the emphasis phrases at their timestamps.
3. Build scenes from these times (scene = its first word's start to the next scene's start). Time the picture to the audio, never stretch the audio to fit.
4. Captions: use `words[]` as is. Tidy only casing or punctuation around `added` words (e.g. `Grandma. and You`), not timing.

## Common mistakes

- Using the script's durations or a words-per-minute estimate instead of the take.
- Captioning raw whisper text: it loses the script's spelling ("credit default swap" vs "Credit Default Swap") and guesses punctuation from pauses.
- Treating headings as narration. Any heading (`#`–`######`) or `---` starts a scene and names it; the aligner never treats heading text as spoken.
- New take recorded → old `beats.md` silently stale. Re-run with `--take <new>`; merge your visuals from `beats.md` into the new `beats.draft.md`.

Tests: `node --test .claude/skills/voiceover-sync/scripts/align.test.mjs`.
