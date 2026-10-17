# Share platform v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the clauvid share platform as a React + shadcn/ui app over a per-video folder layout, with script editing + comments, an assets manager with uploads, and two-step deletes into a trash.

**Architecture:** `server.mjs` stays dependency-free Node (`node:http`), split into small modules under `share-platform/lib/`. The UI is a Vite React app in `share-platform/ui/` built to `share-platform/dist/`, which the server serves. All writes go through one local-only guard.

**Tech Stack:** Node 24 (`node:test` for server tests), Vite, React 19, TypeScript, Tailwind v4, shadcn/ui, Tiptap 3 + `tiptap-markdown`, `react-markdown` + `remark-gfm`, lucide-react, sonner.

Spec: `docs/specs/2026-10-17-share-platform-v2-design.md`.

## Global Constraints

- Server: no npm dependencies; only Node built-ins plus `ffmpeg`/`ffprobe` on PATH.
- Slugs: `^[a-z0-9][a-z0-9-]{0,63}$`. Every resolved path must stay inside `PROJECTS_DIR`.
- Writes: local only (Host localhost/127.0.0.1, no forwarding/ngrok headers, `X-Clauvid: 1`, Origin local if present) → else `403 {"error":"edit-local-only"}`.
- Upload: ≤ 2 GB, ext allowlist `jpg jpeg png webp gif svg heic mp3 wav m4a aac mp4 mov webm pdf md txt`, never overwrite.
- Deletes move to `.trash/` with a `.meta.json` sidecar; refuse any target containing `.env*`; never read `.env` contents.
- No native `alert/confirm/prompt` anywhere in the UI.
- clauvid is not a git repo: no commit steps.

## File structure

```
share-platform/
├── server.mjs              entry: config, routing table, static/SPA serving
├── lib/
│   ├── paths.mjs           slug/name validation, safe resolve, sanitizeName, uniqueName
│   ├── scan.mjs            listProjects(), listAssets(), mediaKind(), usedNames(), duration cache
│   ├── guard.mjs           canWrite(req, port)
│   ├── http.mjs            sendJson, sendFile (range), readJson(req, limit)
│   ├── proxy.mjs           web-proxy queue (moved from server.mjs) + dropProxies(dir)
│   ├── script.mjs          readScript(), writeScript() (atomic)
│   ├── upload.mjs          handleUpload(req, dir, name)
│   └── trash.mjs           trashTarget(), listTrash(), restore(id), purge(id|all)
├── test/
│   ├── fixture.mjs         builds a temp PROJECTS_DIR, starts server on port 0, returns {base, dir, stop}
│   └── api.test.mjs        all API tests
├── ui/                     Vite app (src/ components below)
├── dist/                   build output (served)
└── index.html              legacy UI, fallback when dist/ missing
```

UI `ui/src/`:
```
main.tsx, App.tsx               routing state (project/video/item/tab) ↔ URL
lib/api.ts                      typed fetchers + write helpers (adds X-Clauvid)
lib/format.ts                   fmtSize, fmtDate, fmtDuration
lib/url.ts                      readLink(), writeLink()
components/Header.tsx           logo, project Select, project menu, Trash, Refresh
components/Sidebar.tsx          video groups, rows, characters (Sheet on mobile)
components/VideoTab.tsx         player, meta, nav, docs accordion
components/ScriptTab.tsx        view/edit, toolbar, save, comments
components/CommentsPanel.tsx
components/AssetsTab.tsx        filters, grid, preview dialog
components/UploadZone.tsx
components/DeleteDialog.tsx     two-step AlertDialog
components/TrashView.tsx
components/EmptyState.tsx
components/ui/*                 shadcn generated
```

---

### Task 1: Server core — layout scan, file routes, static UI

**Files:** Create `lib/paths.mjs`, `lib/scan.mjs`, `lib/http.mjs`, `lib/proxy.mjs`, `test/fixture.mjs`, `test/api.test.mjs`. Rewrite `server.mjs`.

**Interfaces (produces):**
- `paths.mjs`: `SLUG`, `isSlug(s)`, `safeJoin(root, ...parts) → string|null`, `sanitizeName(name) → string|null`, `uniqueName(dir, name) → string`.
- `scan.mjs`: `listProjects(root) → Project[]`, `listAssets(root, p, v) → {assets, references}`, `mediaKind(name) → 'image'|'audio'|'video'|'doc'|null`, `usedNames(sourceDir) → Set<string>`.
- `http.mjs`: `sendJson(res, code, obj)`, `sendFile(req, res, file, extraHeaders?)`, `readJson(req, limitBytes) → Promise<any>`.
- `proxy.mjs`: `createProxies(projectsRoot, cacheRoot) → {queue(file), fresh(file), path(file), queueAll(projects), drop(absDir)}`.
- `test/fixture.mjs`: `startFixture() → {base, dir, stop}`; fixture has project `demo` with video `alpha` (revisions v01-a.mp4, v02-b.mp4, final/alpha.mp4, research/findings.md, assets/photo.png used by source/index.html, assets/unused.wav, references/ref.pdf), video `beta` (empty), `shared/characters/dex/dex.svg`.

- [ ] Write tests: `/api/projects` shape (videos sorted, counts, hasScript, assetCount=2, usedCount=1); `/api/.../assets` kinds and `used`; `/files/demo/videos/alpha/revisions/v01-a.mp4` 200 + range 206; traversal `/files/demo/videos/..%2f..%2fx/final/a.mp4` → 400/404; character svg has CSP header; `/` serves dist or legacy.
- [ ] Run `node --test share-platform/test/` → FAIL.
- [ ] Implement modules + server; run tests → PASS.

### Task 2: Write guard, script API, upload

**Files:** Create `lib/guard.mjs`, `lib/script.mjs`, `lib/upload.mjs`; route in `server.mjs`; extend tests.

**Interfaces:** `canWrite(req, port) → boolean`; `readScript(videoDir) → {markdown, comments, mtime}`; `writeScript(videoDir, {markdown, comments})`; `handleUpload(req, dir, rawName, limit) → Promise<{name}>` (throws `{status, error}`). `GET /api/whoami → {canEdit}`.

- [ ] Tests: PUT script then GET → identical markdown (`# H1\n\n**b** *i*\n\n---\n\n- x\n`) and comments; PUT without `X-Clauvid` → 403; with `X-Forwarded-For` → 403; Host `aardvark…ngrok-free.app` → 403; Origin `https://evil.com` → 403; upload `My Photo.PNG` → `my-photo.png`; second upload → `my-photo-2.png`; `x.exe` → 415; whoami true locally, false with forwarded header.
- [ ] FAIL → implement → PASS.

### Task 3: Delete + trash

**Files:** Create `lib/trash.mjs`; routes `/api/delete`, `/api/trash`, `/api/trash/restore`, `/api/trash/purge`; extend tests.

**Interfaces:** `trashTarget(root, {project, video?, dir?, name?}) → {id}`; `listTrash(root) → Item[]`; `restore(root, id)`; `purge(root, id|'all')`. Trash item id = path of the trashed entry relative to `root`, base64url.

- [ ] Tests: delete revision → gone from listing, present in `/api/trash`; restore → sha256 identical; delete video `beta` → in `projects/demo/.trash/`; delete project → `projects/.trash/`; purge all → trash empty and bytes gone; folder with `.env` → 409 and untouched; delete with ngrok header → 403; restore when original exists → 409.
- [ ] FAIL → implement → PASS.

### Task 4: UI scaffold + shell (header, sidebar, video tab, empty states, deep links)

**Files:** `ui/` via `npm create vite@latest ui -- --template react-ts`, Tailwind v4 (`@tailwindcss/vite`), `npx shadcn@latest init`, components: button select dropdown-menu sheet collapsible tabs accordion badge card breadcrumb scroll-area separator alert-dialog dialog input tooltip sonner skeleton. `vite.config.ts` outDir `../dist`, dev proxy `/api` `/files` → 4747. Files per structure above.

**Interfaces (consumes):** API from Tasks 1–3. `lib/api.ts` exports `getProjects()`, `getAssets(p,v)`, `getScript(p,v)`, `putScript(p,v,body)`, `upload(p,v,to,file,onProgress)`, `del(target)`, `getTrash()`, `restore(id)`, `purge(id|'all')`, `whoami()`.

- [ ] Build: `npm run build` passes `tsc -b`.
- [ ] Headless screenshots (1280×800, 390×844 via device emulation) of: no projects, project w/o videos, video w/o renders, video with drafts, deep link `?project=demo&video=alpha&rev=v01-a&t=3`.

### Task 5: Script tab

Tiptap StarterKit (headings 1–3, bold, italic, bulletList, horizontalRule, history) + `tiptap-markdown`. Comments: highlight via decoration plugin matching `quote` text; panel lists comments.

- [ ] Round-trip check: load fixture markdown, save unchanged → file byte-identical.
- [ ] Screenshot view, edit, comment states.

### Task 6: Assets tab + upload

- [ ] Upload via XHR (progress) with `X-Clauvid: 1`; screenshot grid with Used/Not used badges; filter works.

### Task 7: Delete dialogs + trash view

- [ ] `DeleteDialog` step 1 summary, step 2 (2 s timer for files; typed name for video/project/purge/empty). Screenshots of both steps; verify via script that Delete is disabled until name typed.

### Task 8: Docs + live switch

- [ ] Update README (layout, folders, workflow step 1, deep links, share platform build + edit lock), INSTALLED.md (ui dev deps). Restart server on real `projects/`; check `/` returns built UI.
