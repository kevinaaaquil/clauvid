---
name: make-video
description: Use when asked to make, build, draft, revise or re-render a video, reel or YouTube video in the clauvid workspace (projects/<project>/videos/<video>), including acting on the owner's feedback on a previous draft.
---

# Making a clauvid video

clauvid videos are the owner's own voiceover plus photos and animation (arrows, drawings, cycles, diagrams), built in HyperFrames. This skill is the order of work; the HyperFrames skills hold the authoring rules.

## Format

| Ask | Size | Notes |
|---|---|---|
| Reel / Short / TikTok | 1080×1920, 30 fps | Keep text and faces out of the bottom ~20% and top ~12% (platform UI). Bigger type. |
| YouTube / unspecified | 1920×1080, 30 fps | Default. |

If the owner hasn't said which and the video folder gives no hint, ask once.

## Order of work

1. **Gather.** **REQUIRED SUB-SKILL:** share-platform. Read every script in `scripts/`, its open comments, and look at everything in `assets/` and `references/`. Build from the script the owner names; otherwise the one the newest take belongs to; otherwise the newest script. Several candidates and no hint → ask.
2. **Sync to the voice.** **REQUIRED SUB-SKILL:** voiceover-sync. No take yet → build to the script with estimated timing, label the draft `vNN-no-vo`, and say so.
3. **Route.** **REQUIRED SUB-SKILL:** hyperframes (the router). Voiced topic explainers → `faceless-explainer`; anything else custom → `general-video`; a short unnarrated sting → `motion-graphics`. Then read `hyperframes-core` before writing HTML. Search `hyperframes-registry` before hand-building a named effect. Photos and image treatments → `media-use`. Music under the voice → `hyperframes-audio`, ducked.
4. **Set up `source/`** if `source/index.html` doesn't exist yet, from the video folder: `HYPERFRAMES_SKIP_SKILLS=1 npx --yes hyperframes init source --example blank --non-interactive` (the env var keeps it from reinstalling skills).
5. **Build** from `research/beats.md`: one sub-composition per scene, the take as the audio track, captions from `research/<take>.captions.json`. Reference assets by exact file name.
6. **Check:** `npm run check` in `source/`, zero errors.
7. **Render:** `npm run render` → copy to `revisions/vNN-<note>.mp4`, write `revisions/vNN-<note>.json` `{"script", "take"}` (share-platform: Publishing), and freeze the composition as `source/versions/index.vNN.html`.
8. **QA:** extract a frame per scene and at each emphasis timestamp, look at every one: legible, inside safe zones, nothing overflowing, picture hits land on the spoken words.
9. **Report:** share-platform deep link to the new revision, what changed, known weaknesses, suggested next revision.

## Feedback rounds

Owner feedback arrives as script comments, a deep link with `t=`, or chat. Pull the exact frame first, change only what was asked, render the **next** `vNN` (never overwrite), and list which notes it addresses. Promote to `final/` only when the owner approves.

## Common mistakes

- Starting to animate before reading the owner's comments and assets.
- Timing scenes from the script instead of the take.
- Placing a `references/` file in the video.
- Reporting a render you haven't looked at frame by frame.
