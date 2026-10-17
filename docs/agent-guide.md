# clauvid: agent guide

A workspace for making videos with code: reels, YouTube videos, explainers.
Agents write the video as code (HTML/GSAP or Python), render it to MP4, and publish every draft to a small share platform where the owner reviews it from any device.

**If you are an agent starting work here, read this whole file first, then the house rules at the bottom.** (The public overview is `README.md`; this is the working guide.)

---

## Layout

```
clauvid/
├── README.md            ← public overview (what clauvid is, screenshots, quick start)
├── docs/agent-guide.md  ← you are here (layout, toolchain, workflow, house rules)
├── CLAUDE.md            ← imports this guide for Claude Code
├── setup.sh             ← installs the video toolchain after a clone (--check, --minimal)
├── INSTALLED.md         ← log of everything installed for this workspace (keep it updated)
├── projects/<project>/  ← a project holds several videos (see "Project folders")
├── share-platform/      ← review/edit UI + server, runs in Docker (see "Share platform")
├── docs/                ← specs and plans (share platform v2)
├── bin/manim            ← Manim wrapper (venv + LaTeX on PATH)
├── (voices/ removed 2026-10-17; see INSTALLED.md)
├── .venv-media/         ← Python 3.12: MusicGen, Manim (Kokoro removed)
├── .tools/              ← TinyTeX (LaTeX), uv-managed Python 3.12
├── .cache/              ← model caches: hyperframes (Chrome, whisper), huggingface (MusicGen), uv
├── .claude/skills/      ← clauvid skills: make-video, share-platform, voiceover-sync
├── .claude/settings.json← env: HYPERFRAMES_PYTHON, HF_HOME, UV_CACHE_DIR, UV_PYTHON_INSTALL_DIR
└── hyperframes/         ← scratch starter; experiments only
```

### Project folders

A **project** is a series or channel (e.g. `things-explained`); each **video** in it has its own folder and its own drafts.
Slugs are short kebab-case: `^[a-z0-9][a-z0-9-]{0,63}$`.

```
projects/<project>/
├── shared/
│   └── characters/<name>/     SVG rig + character.md (look, palette, rules) + usage docs, shared by the project's videos
├── videos/<video>/
│   ├── source/                the renderable project. HyperFrames by default; Manim if asked
│   ├── scripts/               <name>.md voiceover scripts (script.md, script_v2.md, …), each with <name>.comments.json
│   ├── research/              findings.md, notes
│   ├── assets/                goes IN the video: owner's photos, voiceover, music, clips, Manim renders
│   ├── references/            material to work FROM: screenshots, inspiration, PDFs; never placed in the video
│   ├── revisions/             every rendered draft: vNN-<short-note>.mp4 (v01-mvp.mp4, v02-voiceover.mp4, …)
│   ├── final/                 only the current approved cut, <video>.mp4, plus share.md (title + 2–3 sentence description)
│   └── .trash/                files deleted from the share platform (restorable there)
└── .trash/                    videos deleted from the share platform
```

The owner uploads photos and references through the share platform's **Assets** tab, and writes scripts in `scripts/<name>.md` (and leaves comments on them) in the **Script** tab. Before building, read the scripts, their `<name>.comments.json` (open comments are owner feedback), and look at everything in `assets/` and `references/`. An asset counts as **Used** when its file name appears in the video's `source/` (HTML/CSS/JS/JSON, excluding `node_modules`, `renders`, `versions`).

---

## Toolchain

| Need | Tool | How |
|---|---|---|
| Main video framework | **HyperFrames** (HTML + CSS + GSAP → MP4) | In `source/`: `npm run check`, `npm run render`, `npm run dev` (preview). The CLI is `npx --yes hyperframes <cmd>` (0.8.168; a project's `package.json` may pin an older one). |
| Math/science animation | **Manim** + TinyTeX (LaTeX) | `clauvid/bin/manim -qh scene.py SceneName` (always use the wrapper; it puts LaTeX on PATH). Drop the MP4 into a HyperFrames comp as a clip, or use it standalone. |
| Voiceover | Owner records it | Recorded in the share platform's Script tab. Align it to the script with the `voiceover-sync` skill. (Kokoro TTS was removed 2026-10-17; reinstall steps in `INSTALLED.md`.) |
| Background music (local, open source) | **MusicGen** | Via the `media-use` skill (`resolve` BGM → generate on catalog miss). Keep music ducked under narration (`hyperframes-audio` skill). |
| Captions | **whisper.cpp** (`small.en`) | `voiceover-sync` writes `research/<take>.captions.json`: transcript timing, script spelling. |
| Launch video for a repo | `/brag` plugin | Run `/brag` inside the target repo; copy `brag-output/brag.mp4` into a project's `revisions/`. |

`HYPERFRAMES_PYTHON` must point at `clauvid/.venv-media/bin/python` for TTS and music. It is set in `.claude/settings.json`; if you run a shell outside Claude Code, export it yourself.

### Skills: read before authoring

Open the relevant `SKILL.md` rather than guessing.

- **clauvid skills** (`.claude/skills/`, ours): `make-video` (start here for any video task: order of work, reel vs YouTube), `share-platform` (where the owner's scripts, comments, takes and uploads live; publishing drafts; deep links; trash-safe deletes), `voiceover-sync` (align a take with its script → `research/beats.md` + captions).
- **HyperFrames skills** (global, `~/.claude/skills/`, kept current with `npx hyperframes skills update`): `hyperframes` (router), `hyperframes-core`, `-animation`, `-keyframes`, `-creative`, `-cli`, `-audio`, `-registry`, `-studio`, `media-use`; workflows `faceless-explainer` (voiced explainers), `general-video`, `motion-graphics`. Other workflows (slideshow, captions-on-footage, PR/product videos…) install on demand when the router picks one.
- Before hand-building a named visual (chart, code block, glitch…), search `hyperframes-registry`: about 400 ready-made blocks.

---

## Making a video: standard workflow

1. **Create the video.** `mkdir -p projects/<project>/videos/<video>/{research,assets,references,revisions,final}`, then in that video folder run `HYPERFRAMES_SKIP_SKILLS=1 npx --yes hyperframes init source --example blank --non-interactive`. The env var stops it re-installing skills. (Or create it from the share platform: **New video** makes every folder.)
2. **Research.** Write `research/findings.md`. For a codebase, verify claims from source, tests, git history and by running it (see house rules).
3. **Script.** Write `scripts/script.md` (or another `scripts/<name>.md`): scenes, on-screen text, narration lines and durations. The owner's voiceover takes for it are `assets/<name>_takeN.wav`.
4. **Audio: script + the owner's voice, read together.** The owner records takes in the share platform (`assets/<script>_takeN.wav`); ask which take to use if it isn't obvious (otherwise the newest take of the chosen script). Then:
   - **Transcribe and align** in one step: `node .claude/skills/voiceover-sync/scripts/align.mjs projects/<p>/videos/<v> [--take <file>]` (whisper.cpp `small.en`, word timestamps). It writes `research/<take>.json`, `research/<take>.captions.json` and a draft `research/beats.md`. See the `voiceover-sync` skill.
   - **Align it to the script.** The transcript is the truth for *what was said and when*: timing, pace, pauses, and any words the owner added, dropped or reworded while reading. The script is the truth for *intent and form*: scene boundaries (`---` page breaks, plus any headings already in the file), emphasis (**bold**/*italic*), spelling of names and terms (e.g. "CDS"), and punctuation.
   - **Build an aligned beat sheet** in `research/beats.md`: for each scene, its start and end time from the transcript, the spoken text, the script's emphasis words with their timestamps, and the visual idea. Note every place the take differs from the script and follow the take (it is what the viewer hears).
   - **Captions** use the transcript's word timings with the script's spelling, capitalisation and punctuation laid over them, so they match the voice exactly and read like the script.
   - Time scenes to the audio, never the other way round. Add music only if asked, ducked under the voice.

5. **Build** the composition in `source/`. Use one GSAP timeline and keep it deterministic and seek-safe.
6. **Check:** `npm run check`. Fix every error.
7. **Render:** `npm run render`, then copy the output to `revisions/vNN-<note>.mp4`.
8. **QA.** Extract frames (`ffmpeg -ss <sec> -i file.mp4 -frames:v 1 f.png`) at every scene, view them, and confirm the text is legible, nothing overflows, and audio and visuals stay in sync. Fix and re-render as a new `vNN` if anything is broken.
9. **Promote** only when the owner approves a revision: copy it to `final/<video>.mp4` and update `final/share.md`.
10. **Report** with share-platform deep links (below).

---

## Known gotchas

- **Revision sources:** HyperFrames lint rejects extra root compositions, so frozen per-revision copies go in `source/versions/index.vNN.html`. `source/index.html` is the working copy. To re-render an old revision, copy its snapshot over `index.html`.
- **Ducking:** `hyperframes-audio/scripts/carve.mjs` adds a *second* `data-automation` attribute instead of merging with an existing fade lane. Browsers keep only the first, so the duck silently disappears. Merge the lanes by hand and re-measure.
- **Volume:** a volume automation lane overrides `data-volume` on the same element, so set music level inside the lane.
- **Transcript spelling:** whisper spells jargon by ear ("credit default swap" vs "CDS", names). Captions take spelling from the script; check `beats.md` difference lines for misheard words before trusting them.
- **MusicGen long beds:** continuation can collapse into silence. Generate in chunks with level checks. (The old `musicgen_long.py` helper was deleted with crossbar-evals on 2026-10-17; rewrite it if needed.)
- **Loudness target:** about -16 LUFS integrated, voice about 15 dB above the music, no clipping. Measure with `ffmpeg -af ebur128`.

## Share platform

React + shadcn/ui front end (`share-platform/ui/`, built to `share-platform/dist/`) over a dependency-free Node server (`server.mjs` + `lib/`). Runs in Docker; works on laptop and phone widths.

Per video it has three tabs: **Video** (drafts + final, Prev/Next, Copy link, Download, notes; portrait drafts play upright; beside the player the script the draft was built from plus the voice take, each a link into the Script tab), **Script** (switch between the video's `scripts/*.md`; **New script** makes `script.md`, then `script_v2.md`, `script_v3.md`, …, and each can be renamed (comments move with it); the open one is rendered; Edit gives headings, bold, italic, lists, page breaks; comments on selected text; **Record** does a 3 s countdown, then records the owner's voiceover and on Stop saves it straight into `assets/` named after the open script, `script_take1.wav`, `script_take2.wav`, `script_v2_take1.wav`, … (16-bit mono WAV); the Takes list beside the script plays, renames and deletes takes), **Assets** (grid of `assets/` and `references/`, Used / Not used yet, drag-and-drop upload; plus a **Research** section listing `research/`: `.md` opens formatted, `.json` pretty-printed). A script or take a draft was built from is **locked** while that draft exists (from `revisions/<draft>.json` `{script, take}`, else the take named in `source/versions/index.vNN.html`): no edits, renames or deletes, but comments, new takes and **New version** (a copy to edit) still work. Projects and videos can be created from the UI (**New project** in the header, **New video** in the sidebar); a new video gets all its folders at once, so uploads work immediately. Drafts, assets, takes, scripts and videos are deleted with one in-page confirmation, since they go to `.trash/` and can be restored from the **Trash** view. Files that belong to something go with it as one Trash item and come back together: a script takes its `.comments.json`; a draft takes its `revisions/<draft>.json`, its `source/renders/<draft>.mp4` and its `source/versions/index.vNN.html` (unless another draft shares that vNN). Logic in `share-platform/lib/companions.mjs`. Deleting a whole project, **Delete forever** and **Empty trash** need a second step where the name is typed.

- **Start:** `share-platform/start.sh` → http://localhost:4747. **After any server change (`server.mjs`, `lib/`), run `docker compose restart` in `share-platform/`**, or the running container keeps the old API while the browser loads the new UI. Builds the UI if `dist/` is missing, then `docker compose up -d --build`. Stop: `cd share-platform && docker compose down`. `--auth` enables basic auth from `share-platform/.auth`; `--native [port]` runs it without Docker.
- **Docker:** bind mounts only, no Docker volumes: `share-platform/` → `/app` (read-only), `projects/` → `/data/projects`, `.cache/share-platform/` → `/data/proxies`. Port is bound to `127.0.0.1`, so it is not reachable from the network. After changing server code, `docker compose restart`; after changing the UI, `cd share-platform/ui && npm run build` (no restart needed).
- **Editing from anywhere:** wherever the platform is reachable (this Mac, the LAN, a tunnel), it can save, upload and delete, and every change lands on the machine running it. The only thing refused is another website writing through your browser: writes need `X-Clauvid: 1` (forces a CORS preflight the server never answers) and a browser `Origin`, when sent, must match the page's own host (`Host` or `X-Forwarded-Host`). Implemented in `share-platform/lib/guard.mjs`.
- **Deep links:** `?project=<p>&video=<v>&rev=<final|vNN-note>&tab=<video|script|assets>&t=<seconds>`, e.g. `http://localhost:4747/?project=things-explained&video=black-holes&rev=v02-music&t=40`. When you receive one, map it to `projects/<p>/videos/<v>/revisions/<rev>.mp4` (or `final/`), seek to `t`, and extract that frame to see what the owner means. Characters: `?project=<p>&rev=char-<name>-<svg-basename>`.
- **Streaming proxies:** the player streams a web copy of each draft (H.264, keyframe every 1s, about 1.3–2.5 Mbps, faststart), built in the background into `.cache/share-platform/`. Until it's ready the original is served. **Download** always gets the original (`?orig=1`). Never point agents at the proxies as deliverables.
- **API (read):** `GET /api/projects`, `/api/projects/<p>/videos/<v>/assets`, `…/videos/<v>/scripts`, `…/videos/<v>/scripts/<name>`, `/api/trash`, `/api/whoami`; files at `/files/<p>/videos/<v>/<final|revisions|research|assets|references>/<name>` and `/files/<p>/shared/characters/<c>/<name>`. **API (write; send `X-Clauvid: 1`):** `POST /api/projects` `{slug}` (new project), `POST /api/projects/<p>/videos` `{slug}` (new video with all its folders), `POST …/videos/<v>/scripts` (new script, default name; `{from}` copies another script), `POST …/videos/<v>/scripts/<name>/rename` `{to}`, `PUT …/videos/<v>/scripts/<name>`, `POST …/upload?to=assets|references&name=`, `POST /api/rename` `{project, video, dir, name, to}` (keeps the extension, never overwrites), `POST /api/delete`, `POST /api/trash/restore`, `POST /api/trash/purge`.
- **Tests:** `node --test 'share-platform/test/*.test.mjs'` (server API, uses a temp fixture). Design: `docs/specs/2026-10-17-share-platform-v2-design.md`.

---

## House rules

1. **Verify, don't trust docs.** When a video is about a codebase, READMEs and `.md` files are hints, not facts. Establish behaviour from source, tests, git history and running it. Every claim in `findings.md` cites a file path or command. Note doc-vs-code mismatches, and never present an unbuilt feature as current.
2. **Your own analysis for "what's next".** Future ideas must come from gaps you find in the code (stubs, missing extension points, unused functions, comparison with mature tools), not from copying a roadmap doc.
3. **Subject repos are read-only.** Never edit, commit to or reformat a repo you are making a video about. Running its tests or CLI is fine.
4. **Never touch `.env` files**: don't read, create, copy or delete them, anywhere.
5. **No paid APIs or secrets without asking.** Prefer local tools (MusicGen, whisper.cpp). If something needs a key or costs money, stop and ask.
6. **Never overwrite a revision.** Each render gets the next `vNN`, and `final/` holds only the current approved cut.
7. **MVP first.** Ship a correct, clear, watchable cut, then iterate on the owner's feedback. Don't gold-plate v01.
8. **QA before you report.** Run `npm run check` clean, then do frame-extraction review of every scene. Never claim a render is good without having looked at it.
9. **Keep storage project-level.** Models, caches and tools belong in `clauvid/.cache/` or `clauvid/.tools/`, not in `~`. `~/.cache/hyperframes` and `~/.cache/huggingface` are symlinks into `clauvid/.cache/`; don't replace them with real folders. If a new tool downloads to a global path, move it in and link it back, then log it.
10. **Log every install.** Anything installed (brew, pip, npm global, plugins, models, global skills) goes in `INSTALLED.md` with version, reason and removal command, and into `setup.sh` so a fresh clone gets it too (run `./setup.sh --check` afterwards). Prefer workspace-local installs (`.venv-media`, project `node_modules`) over global ones.
11. **Remote access is the owner's.** The share platform is meant to be used from anywhere; the owner runs their own tunnel to it. Agents don't open tunnels, change its auth, or restrict where it can be edited from unless the owner asks.
12. **Keep the structure.** One folder per project, using the subfolders above. Scratch work goes in the agent's scratchpad, not in `projects/`.
13. **Report with links.** End every video task with share-platform deep links to the new revision, plus a short list of known weaknesses and suggested next revisions.
