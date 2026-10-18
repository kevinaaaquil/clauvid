---
name: share-platform
description: Use when working on a clauvid video and reading what the owner put in the share platform (scripts, script comments, voiceover takes, uploaded assets or references), when the owner sends a localhost:4747 deep link or feedback on a draft, when publishing a rendered draft or final cut, or when deleting, renaming or creating projects, videos and files under clauvid/projects.
---

# Share platform: how agents work with it

Paths and commands are relative to the `clauvid/` root.

The share platform (http://localhost:4747) is the owner's side of every video. It is a view over the files in `clauvid/projects/`, so agents **read and publish through the filesystem** and use the HTTP API only for operations that must go through Trash.

## Where the owner's input lives

For `projects/<p>/videos/<v>/`:

| Owner did this in the UI | File | Read it as |
|---|---|---|
| Wrote a script (Script tab) | `scripts/<name>.md` | Markdown. `---` = page break = scene boundary. `**bold**`/`*italic*` = emphasis to land visually. Headings are labels, not narration. |
| Commented on script text | `scripts/<name>.comments.json` | `[{id, quote, note, createdAt, resolved}]`. `quote` is the selected script text, `note` the feedback. Unresolved = open feedback; act on all of them. |
| Recorded a voiceover | `assets/<script>_takeN.wav` | The take belongs to script `<script>`. Newest N is the latest. **REQUIRED:** use voiceover-sync before timing anything to it. |
| Uploaded media | `assets/` | Goes in the video. Look at every file (open images, `ffprobe` audio/video). |
| Uploaded references | `references/` | Material to work *from*. Never place in the video. |

"Used" on the Assets tab means the file name appears in `source/` text, so reference assets by their exact file name.

## Publishing

| Deliverable | Do |
|---|---|
| Draft | Copy the render to `revisions/vNN-<short-note>.mp4` (next unused NN, two digits). Never overwrite one. Beside it write `revisions/vNN-<short-note>.json`: `{"script": "<script name, no .md>", "take": "<take file>"}`. The Video tab shows that script and take next to the player, and **locks** them (below). It appears on refresh; a streaming proxy builds in the background. |
| Notes for the owner | Any `research/*.md` or `final/*.md` shows as a doc beside the player (`findings.md`, `beats.md`). |
| Approved cut | Replace `final/<video>.mp4` and update `final/share.md` (title + 2–3 sentences). |

Report with deep links: `http://localhost:4747/?project=<p>&video=<v>&rev=<vNN-note|final>[&tab=script|assets][&t=<sec>]`.

## Owner feedback via deep link

`rev` = file stem in `revisions/` (or `final`), `t` = seconds. Pull that exact frame and look at it before answering:

```bash
ffmpeg -loglevel error -ss <t> -i projects/<p>/videos/<v>/revisions/<rev>.mp4 -frames:v 1 <scratchpad>/frame.png
```

Never review the proxies in `.cache/share-platform/`; always the original.

## Changing things

- **Create** a video: `curl -s -X POST localhost:4747/api/projects/<p>/videos -H 'X-Clauvid: 1' -H 'Content-Type: application/json' -d '{"slug":"<v>"}'` (makes every folder). Projects: `POST /api/projects {slug}`. Slugs: `^[a-z0-9][a-z0-9-]{0,63}$`.
- **Delete** a file: `POST /api/delete` with `{"project","video","dir","name"}` (same headers), `dir` one of `assets`, `references`, `scripts` (name with `.md`; takes its comments too), `revisions`, `final`. A whole video: `{"project","video"}`. A draft's `.json` note, render copy and frozen source, and a script's comments, go to Trash in the same item and are restored with it, so never clean those up by hand. It goes to `.trash/` and is restorable. Never `rm` files under `projects/`, never touch `.trash/` directly, never purge.
- **Rename** a file: `POST /api/rename {project, video, dir, name, to}`. Scripts: `POST …/videos/<v>/scripts/<name>/rename {to}` (moves comments with it).
- **Locks:** a script or take named by any draft's `.json` (or by its frozen `source/versions/index.vNN.html`) is locked while that draft exists. Its text can't be saved, renamed or deleted (`409 script-locked` / `take-locked`). Comments, new takes and new scripts still work. To change a locked script, make a new version: `POST …/videos/<v>/scripts {"from": "<name>"}` copies it to the next `script_vN`. Never get around a lock by editing the file on disk.
- **Owner's scripts and comments:** don't edit them unless asked. If asked, write the `.md` (keep its existing structure) and tell the owner to reload the Script tab, since an open editor saves over the file. Don't mark comments resolved; say which ones you addressed.
- Every write needs the `X-Clauvid: 1` header. A `403 edit-forbidden` means it was missing, or a browser sent an `Origin` from a different site.

## Platform health

- Up? `curl -s localhost:4747/api/whoami` → `{"canEdit":true}`. Down → `./run.sh` (stop with `./run.sh stop`).
- Changed `share-platform/server.mjs` or `lib/`? `cd share-platform && docker compose restart`, or the old API keeps serving.
- Changed `share-platform/ui/`? `cd share-platform/ui && npm run build` (no restart).
- Tests: `node --test 'share-platform/test/*.test.mjs'`.
