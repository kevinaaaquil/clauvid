# Share platform v2 — design

Date: 2026-10-17. Status: approved by owner in chat ("write the spec and build it").

## Goal

Replace the single-file share platform UI with a React + shadcn/ui app, and grow it from a revision viewer into a small per-video workspace: watch drafts, edit the script, manage assets, delete things safely.

## 1. On-disk layout

```
projects/<project>/
├── shared/
│   └── characters/<name>/    *.svg + *.md
├── videos/<video>/
│   ├── source/               HyperFrames project
│   ├── research/             script.md, script.comments.json, findings.md, …
│   ├── assets/               used in the video: photos, voiceover, music, clips
│   ├── references/           material to work from; never "used"
│   ├── revisions/            vNN-<note>.mp4
│   ├── final/                <video>.mp4 + share.md
│   └── .trash/               deleted items from this video
└── .trash/                   deleted videos
projects/.trash/              deleted projects
```

Old flat layout (`projects/<slug>/revisions/`) is not supported; no project uses it.
Slugs (project, video): `^[a-z0-9][a-z0-9-]{0,63}$`.

## 2. Server (`share-platform/server.mjs`, still dependency-free)

Config: `PROJECTS_DIR` env (default `../projects`), port arg, existing basic auth unchanged.

Static: serves `share-platform/dist/` (built UI); SPA fallback to `dist/index.html`. If `dist/` is missing, serves legacy `index.html`.

### Read API (open to everyone the site is open to)

| Route | Returns |
|---|---|
| `GET /api/projects` | `[{ slug, updated, characters:[{name,svgs,docs}], videos:[{ slug, updated, final:[file], revisions:[file], docs:[file+dir], hasScript, assetCount, usedCount }] }]`, newest first. `file = {name,size,mtime}` |
| `GET /api/projects/:p/videos/:v/assets` | `{ assets:[file+kind+used+duration?], references:[file+kind] }`. `kind ∈ image,audio,video,doc`. `used` = filename appears in any `source/**/*.html` (excluding `node_modules`, `.hyperframes`, `renders`). |
| `GET /api/projects/:p/videos/:v/script` | `{ markdown, comments, mtime }` (empty string / `[]` if absent) |
| `GET /api/trash` | every trashed item: `{ id, project, video?, kind, name, size, deletedAt }` |
| `GET /api/whoami` | `{ canEdit }` |
| `GET /files/:p/videos/:v/:dir/:name` | dir ∈ `final, revisions, research, assets, references`; range requests; video proxy unless `?orig=1` |
| `GET /files/:p/shared/characters/:c/:name` | svg/md; SVG gets `script-src 'none'` |

Durations: `ffprobe` once per file, cached in memory by path+mtime.

### Write API (local only)

A request may write only if **all** hold, else `403 {error:"edit-local-only"}`:
- `Host` is `localhost:<port>` or `127.0.0.1:<port>`;
- no `X-Forwarded-For`, `X-Forwarded-Host`, `X-Real-IP`, `Forwarded` or `ngrok-*` header;
- header `X-Clauvid: 1` present (forces a CORS preflight; server never answers CORS → cross-site pages can't write);
- `Origin`, if present, is `http://localhost:<port>` or `http://127.0.0.1:<port>`.

| Route | Effect |
|---|---|
| `PUT /api/projects/:p/videos/:v/script` | body `{markdown, comments}` → writes `research/script.md` and `research/script.comments.json` via temp file + rename |
| `POST /api/projects/:p/videos/:v/upload?to=assets\|references&name=<file>` | streams body to disk; ≤ 2 GB; extension allowlist (jpg jpeg png webp gif svg heic mp3 wav m4a aac mp4 mov webm pdf md txt); name sanitised (lowercase, spaces→`-`, strip to `[a-z0-9._-]`); never overwrites (`-2`, `-3`, …); returns final name |
| `POST /api/delete` | body `{project, video?, dir?, name?}` → moves target into the matching `.trash/` as `<UTC-stamp>__<name>` and writes a `.meta.json` sidecar recording original path. Targets: a file in `final, revisions, assets, references`; a whole video; a whole project. Removes proxies for deleted videos. Refuses if target contains a `.env*` file. |
| `POST /api/trash/restore` | body `{id}` → moves back; refuses if the original path now exists |
| `POST /api/trash/purge` | body `{id}` or `{all:true}` → permanent delete |

All paths resolved and checked to stay inside `PROJECTS_DIR`; slugs and filenames validated; no `..`, no hidden names except `.trash`.

## 3. UI (`share-platform/ui/`, Vite + React + TS + Tailwind v4 + shadcn/ui, dark)

Build: `npm run build` → `share-platform/dist/`. Dev tools logged in `INSTALLED.md`.

- **Header:** logo · project Select (with video counts) · project ⋯ menu (Delete project) · Trash button · Refresh.
- **Sidebar** (Sheet drawer < 768px): one Collapsible group per video, newest first: name, draft count, FINAL badge, ⋯ (Delete video). Rows: Final, then revisions (name, size, date, ⋯ Delete). Characters group at bottom.
- **Main:** breadcrumb (project › video › item) and Tabs:
  - **Video:** player (starts at `t`), title + meta, Prev/Next within the video, Copy link (toast), Download (`?orig=1`), read-only rendered docs in Accordion (all `*.md` except `script.md`).
  - **Script:** rendered Markdown; **Edit** (local only) → Tiptap with toolbar H1/H2/H3, bold, italic, bullet list, page break (`---`), undo/redo. ⌘S / Save; "Unsaved changes" badge; `beforeunload` guard. Comments: select text → Comment → note. Stored `{id, quote, note, createdAt, resolved}`; highlighted in text; side list (below on mobile); resolve/delete; unmatched quote → "text changed" tag.
  - **Assets:** "N assets · M used". Filter tabs All/Images/Audio/Video/Docs. Sections Assets and References. Cards: thumbnail / audio player + duration / video poster + duration / doc icon; Used / Not used yet badge (assets only); ⋯ Delete; click opens Dialog preview. Drop zone + Upload button (local only) with destination toggle and per-file progress.
  - Character SVG: shown on checkerboard with its docs.
- **Trash view:** list with size total, Restore, Delete forever, Empty trash.
- **Empty states:** no projects; project with no videos; video with no renders (Video tab says "No renders yet").
- **Deep links:** `?project=&video=&rev=&t=` (`rev` = `final` | revision basename | `char-<name>-<svg>`). Project-only → newest video. Last project remembered in localStorage (try/catch).
- **Edit lock:** `canEdit` from `/api/whoami`; when false, every write control is hidden.

### Delete confirmation (all deletes, incl. purge / empty trash)

shadcn AlertDialog, never native dialogs.
1. Step 1: "Delete <name>?" + what goes ("1 file · 48 MB" / "4 drafts, 1 final, 12 assets, script · 620 MB"). Cancel / Continue.
2. Step 2: single file → red Delete enabled after 2 s. Video, project, purge, empty trash → type the exact name (`empty trash` for empty) to enable.
Esc / outside click cancels. Success → toast; data refreshes.

## 4. Docs

Update `README.md` (layout, project folders, workflow step 1, deep links, share-platform section, build step) and `INSTALLED.md`.

## 5. Testing

Fixture project under the session scratchpad, served with `PROJECTS_DIR`:
- API: listing shape; used-detection; script round-trip byte-identical for headings/bold/italic/lists/`---`; upload types, `-2` clash, disallowed type 415, ngrok header 403, missing `X-Clauvid` 403, bad Origin 403; delete → trash → restore identical (sha); purge frees; `.env` refusal; path traversal 400/403.
- UI: headless Chrome screenshots at 1280 and 390 wide of: no projects, project without videos, video without renders, video with drafts, script view/edit, assets, trash, both delete dialog steps.

## Out of scope

Phone uploads/edits over ngrok, multi-user comments, rich editing beyond the toolbar, real-time collaboration, legacy flat layout.
