# Installed for clauvid

Log of everything installed to set up video-making with code. Use this to audit or remove things later.
Setup date: 2026-10-03. Already present before setup (not installed by us): Node v24.12.0, npm 11.6.2, FFmpeg 8.0.1, Python 3.14.2, Homebrew, Docker Desktop app, Google Chrome.

## Homebrew formulae (system-wide)

| Package | Version | Why | Remove |
|---|---|---|---|
| uv | 0.12.22 | Python env/package manager; builds `.venv-media` with Python 3.12 | `brew uninstall uv` |
| pkgconf | 3.0.7 | Build dep for Manim (cairo/pango bindings) | `brew uninstall pkgconf` |
| cairo | 1.18.6 | Manim rendering | `brew uninstall cairo` |
| pango | 1.58.2 | Manim text rendering | `brew uninstall pango` |
| glib, harfbuzz (+ other deps pulled in) | 2.90.0, 14.5.1 | Dependencies of cairo/pango | `brew autoremove` after removing the above |
| whisper.cpp | 1.9.4 | Local speech-to-text → auto captions (HyperFrames `transcribe`) | `brew uninstall whisper.cpp` |
| ca-certificates | 2026-09-25 | Updated as a dependency during whisper.cpp install | leave it |

Note: `brew` printed `Cask 'vlc' definition is invalid` and `update-report should not be called directly!` during installs. Those are pre-existing Homebrew issues, unrelated. Installs succeeded.

## Project-level storage (everything heavy lives inside `clauvid/`)

Moved here from global locations on 2026-10-03 23:49. Total about 5.7 GB. Deleting `clauvid/` removes all of it, except the Homebrew formulae above and the two symlinks noted below.

| What | Path (inside `clauvid/`) | Size | How tools find it |
|---|---|---|---|
| Python 3.12 venv: `kokoro-onnx`, `soundfile`, `transformers`, `torch` 2.14.1, `numpy`, `manim` 0.21.0, `yt-dlp` 2026.8.19 (reference-video download, added 2026-10-04) + deps | `.venv-media/` | 1.1 GB | `HYPERFRAMES_PYTHON` |
| uv-managed CPython 3.12.15 (base interpreter of the venv) | `.tools/uv-python/` | 72 MB | `UV_PYTHON_INSTALL_DIR`; venv `pyvenv.cfg` + `bin/python` repointed here |
| TinyTeX (TeX Live 2026, LaTeX for Manim `MathTex`) + tlmgr pkgs: standalone preview doublestroke setspace rsfs relsize ragged2e fundus-calligra microtype wasysym physics dvisvgm jknapltx wasy cm-super babel-english gnu-freefont mathastext cbfonts-fd amsfonts everysel | `.tools/TinyTeX/` | 356 MB | `bin/manim` wrapper puts it on PATH |
| HyperFrames cache: headless Chrome (193 MB), Kokoro model + voices (348 MB), whisper `ggml-small.en` (488 MB), fonts | `.cache/hyperframes/` | 1.0 GB | symlink `~/.cache/hyperframes → clauvid/.cache/hyperframes` (paths are hard-coded in HyperFrames); fonts also via `HYPERFRAMES_FONT_CACHE_DIR` |
| MusicGen `facebook/musicgen-small` (Hugging Face) | `.cache/huggingface/` | 2.2 GB | `HF_HOME`, plus symlink `~/.cache/huggingface → clauvid/.cache/huggingface` (HyperFrames checks the default path) |
| uv package cache (wheels: torch etc.) | `.cache/uv/` | 1.0 GB | `UV_CACHE_DIR` |
| Share-platform streaming proxies (auto-generated web copies of every final/revision video) | `.cache/share-platform/` | ~100 MB, grows with revisions | built by `share-platform/server.mjs`; safe to delete anytime (rebuilt on demand) |

The env vars are set in `clauvid/.claude/settings.json`, so they apply to Claude sessions in `clauvid/`. In a plain shell, export them yourself.
Why 3.12: torch/kokoro don't support system Python 3.14 yet.
Run Manim via `clauvid/bin/manim`. Verified after the move: venv imports, `uv python find`, HF cache hit (no re-download), Manim MathTex render, Kokoro TTS, and `hyperframes doctor` all pass.

**Remove all:** `rm -rf clauvid/.venv-media clauvid/.tools clauvid/.cache` then `rm ~/.cache/hyperframes ~/.cache/huggingface` (these two are symlinks).
**Still global (tiny or unmovable):** `~/.cache/dvisvgm` (empty), `~/.npm/_npx` (shared npx cache), Homebrew formulae.

## Claude Code config

| What | Where | Remove |
|---|---|---|
| HyperFrames agent skills (13, latest from `heygen-com/hyperframes`): hyperframes, -animation, -audio, -cli, -core, -creative, -keyframes, -registry, -studio, media-use, motion-graphics, faceless-explainer, general-video | GLOBAL: `~/.claude/skills/` and `~/.agents/skills/` (the CLI installs there; it has no project scope) | `npx hyperframes skills update` refreshes; delete the folders to remove. Other workflows install on demand when the router picks them. `HYPERFRAMES_SKIP_SKILLS=1` stops `init` re-installing |
| clauvid skills (ours): `make-video`, `share-platform`, `voiceover-sync` (+ `scripts/align.mjs`) | `clauvid/.claude/skills/` | delete the folder |
| Env vars `HYPERFRAMES_PYTHON`, `HF_HOME`, `UV_CACHE_DIR`, `UV_PYTHON_INSTALL_DIR`, `HYPERFRAMES_FONT_CACHE_DIR` | `clauvid/.claude/settings.json` | delete the `env` entries |
| `/brag` plugin + `latent-spaces/brag` marketplace | user scope (`~/.claude`) | `claude plugin uninstall brag@brag` and `claude plugin marketplace remove brag` |

## npm

- `npx hyperframes` (0.8.168 latest; old projects may pin 0.8.114), `create-video`, `skills` CLIs: cached in the global `~/.npm/_npx`, shared with other Node projects (`npm cache clean --force` to clear).
- Project `node_modules` under `clauvid/remotion/`, `clauvid/hyperframes/`.

## Services

- Docker Desktop: was installed but stopped. We only started it (`open -a Docker`). Quit it whenever; it's optional (only some cloud render paths need it).

## Scratch installs (crossbar-evals v03/v04 audio pass)

- `@hyperframes/core@0.8.114` (~70 MB) went into the session scratchpad only, for `hyperframes-audio/scripts/carve.mjs`. Nothing global; it is deleted with the scratchpad.
- That pass also downloaded the MusicGen weights and whisper model. Both now live in `clauvid/.cache/` (table above).

## yt-test (2026-10-04)

- Nothing new installed or downloaded. It used the existing Kokoro voices, the whisper `small.en` model and MusicGen weights (run with `HF_HUB_OFFLINE=1`, a cache hit). The Dex character rig is plain JS in `projects/yt-test/characters/dev/` with no dependencies.

## yt-test v2 work (2026-10-04, second session)

| What | Where | Why | Remove |
|---|---|---|---|
| JetBrains Mono 2.304 webfonts (Regular, Medium, Bold, ExtraBold) + `OFL.txt` (SIL Open Font License), from the official GitHub release zip | `projects/yt-test/assets/fonts/` (also visible as `source/assets/fonts/`) | Bundled monospace for in-world terminal screens via `@font-face` | `rm -rf projects/yt-test/assets/fonts` |
| HyperFrames registry component `grain-overlay` (`npx hyperframes add grain-overlay`) | `projects/yt-test/source/compositions/components/grain-overlay.html` | Reference for the paper/grain texture pass (its CSS animation is infinite, so it would be adapted to seeded GSAP steps before use) | `rm -rf projects/yt-test/source/compositions` |

No models, packages or global tools were installed. Kokoro, whisper `small.en` and MusicGen output were reused from the existing caches.

## yt-test final cut (2026-10-04, third session: v04–v06)

Nothing new installed or downloaded. Kokoro (`bm_george`, from the existing `voices-v1.0.bin`), whisper `small.en`, the cached Inter webfonts and the existing MusicGen raw bed were all reused. The grain overlay is the already-installed registry component, inlined into `source/index.html` (CSS keyframes, seeked by the HyperFrames runtime; `npm run check` passes).

## Removed: Kokoro voice stack (2026-10-17, to save storage)

The owner records their own voiceovers now, so the local AI voice was removed. About 450 MB freed.

| What | Was at | Size | Why it was installed |
|---|---|---|---|
| Kokoro-82M v1.0 model (`kokoro-v1.0.onnx`) + voice pack (`voices-v1.0.bin`, 54 voices) + `synth-v3.py` | `.cache/hyperframes/tts/` | 337 MB | Local open-source TTS narration (`hyperframes tts`) |
| Voice catalogue: README + one sample `.wav` per voice + `all-voices.mp3` | `voices/` | 12 MB | Auditioning voices |
| Python packages `kokoro-onnx` 0.6.1, `onnxruntime` 1.30.0, `espeakng-loader` 0.2.4, `phonemizer` 3.4.0 | `.venv-media/` | ~100 MB | Kokoro runtime |

Voices used before removal: `af_heart` (crossbar-evals v04 final), `am_michael` at speed 1.1 (yt-test v01–v03), `bm_george` (yt-test v04–v06), `am_adam` (first smoke test). Auditioned: `af_heart`, `am_adam`, `am_michael`, `bm_george`, `bf_emma`. Rendered voiceover `.wav` files inside `projects/*/assets/` were kept.

Kept: whisper `small.en` (transcribing the owner's own voiceovers, captions), MusicGen, torch, Manim.

**Reinstall:** `uv pip install --python .venv-media/bin/python kokoro-onnx`, then run `npx hyperframes tts --list`; HyperFrames re-downloads the model and voice pack into `.cache/hyperframes/tts/`.

## Removed: Remotion (2026-10-17)

Not used by any project; HyperFrames is the only framework. About 530 MB freed.

| What | Was at | Why it was installed |
|---|---|---|
| Remotion scratch starter (`create-video --blank`) + its `node_modules` | `remotion/` (529 MB) | Alternative React → MP4 framework, for comparison |
| 12 Remotion agent skills (`remotion-best-practices`, `-captions`, `-create`, `-docs`, `-interactivity`, `-maps`, `-markup`, `-multimedia`, `-render`, `-saas`, `-studio`, `-upgrade`) + their `skills-lock.json` entries | `.claude/skills/` | Agent guidance for Remotion |

Kept: `remotion-to-hyperframes` (a HyperFrames skill for porting Remotion code; the HyperFrames router links to it, 380 KB). Archived in the skills overhaul below; the router reinstalls it on demand.
**Reinstall:** `npx create-video@latest --yes --blank remotion`; skills via `npx skills add remotion-dev/skills`.

## Share platform v2 (2026-10-17)

| What | Where | Why | Remove |
|---|---|---|---|
| UI build tooling: Vite 6, React 19, TypeScript 5.7, Tailwind 4, shadcn/ui (Radix, "nova" preset, restyled to the "Edit bay" palette) components, Geist / Geist Mono / Newsreader fonts (fontsource), Tiptap 3 (+ `tiptap-markdown`, table ext), react-markdown + remark-gfm, lucide-react, sonner | `share-platform/ui/node_modules` (~250 MB) | Builds the UI into `share-platform/dist/` (~1.4 MB, Geist font included) | `rm -rf share-platform/ui/node_modules` (rebuild needs `npm install`) |
| Docker image `clauvid-share:local` (`node:24.12.0-alpine` + `ffmpeg`) and container `clauvid-share` | Docker Desktop | Runs the share platform; all data via bind mounts | `cd share-platform && docker compose down --rmi local` |
| `puppeteer-core` (QA screenshots only) | session scratchpad, not in clauvid | UI testing during the build | deleted with the scratchpad |

The old single-file UI is kept as `share-platform/index.html` (served only if `dist/` is missing).

## Skills overhaul (2026-10-17)

The 21 HyperFrames skills vendored in `clauvid/.claude/skills/` were two weeks stale and shadowed the newer global copies (two copies of every skill, the project's winning). Moved to `.cache/archive/skills-2026-10-17/` together with `skills-lock.json` (~10 MB). `.cache/` is gitignored, so that folder is only a local convenience; git history has the real copy, so it's safe to delete.

- Refreshed the global HyperFrames skills: `npx hyperframes skills update` (9 updated) and installed the two workflows clauvid uses, `faceless-explainer` and `general-video`. All 13 current.
- Not installed any more: `embedded-captions`, `figma`, `music-to-video`, `pr-to-video`, `product-launch-video`, `remotion-to-hyperframes`, `slideshow`, `talking-head-recut`. The router installs one on demand if a request ever needs it.
- New clauvid skills in `.claude/skills/`: `make-video` (order of work, formats), `share-platform` (where the owner's scripts, comments, takes and uploads live; publishing; deep links; trash-safe deletes), `voiceover-sync` (`align.mjs`: whisper transcript + script → `research/beats.md` and `<take>.captions.json`).

**Restore the old copies:** `git checkout 1786576 -- .claude/skills skills-lock.json` (from git history; works even after the archive folder is deleted).
