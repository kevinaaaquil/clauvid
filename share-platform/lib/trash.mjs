// Delete = move into the nearest .trash/ with a sidecar recording where it came from.
//   file in a video → projects/<p>/videos/<v>/.trash/
//   whole video     → projects/<p>/.trash/
//   whole project   → projects/.trash/
import fs from "node:fs";
import path from "node:path";
import { HttpError } from "./http.mjs";
import { DELETE_DIRS, isFileName, isSlug, safeJoin } from "./paths.mjs";

const TRASH = ".trash";
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const encodeId = (rel) => Buffer.from(rel).toString("base64url");
const decodeId = (id) => Buffer.from(String(id), "base64url").toString("utf8");

function sizeOf(p) {
  const st = fs.lstatSync(p);
  if (!st.isDirectory()) return st.size;
  return fs.readdirSync(p).reduce((s, n) => s + sizeOf(path.join(p, n)), 0);
}
function hasEnv(p) {
  const st = fs.lstatSync(p);
  if (!st.isDirectory()) return path.basename(p).startsWith(".env");
  return fs.readdirSync(p).some((n) => n.startsWith(".env") || hasEnv(path.join(p, n)));
}

// Resolve a delete target to { abs, trashDir, kind, name, project, video, dir }.
export function resolveTarget(root, { project, video, dir, name } = {}) {
  if (!isSlug(project)) throw new HttpError(400, "bad-target");
  const pdir = safeJoin(root, project);
  if (video === undefined) return { abs: pdir, trashDir: path.join(root, TRASH), kind: "project", name: project, project };
  if (!isSlug(video)) throw new HttpError(400, "bad-target");
  const vdir = safeJoin(pdir, "videos", video);
  if (dir === undefined) return { abs: vdir, trashDir: path.join(pdir, TRASH), kind: "video", name: video, project, video };
  if (!DELETE_DIRS.has(dir) || !isFileName(name)) throw new HttpError(400, "bad-target");
  return { abs: safeJoin(vdir, dir, name), trashDir: path.join(vdir, TRASH), kind: "file", name, project, video, dir };
}

/**
 * `companions`: absolute paths of files that belong to the target (see companions.mjs).
 * They are stored beside the entry in <entry>.with/ and restored or purged with it.
 */
export function trashTarget(root, target, companions = []) {
  const t = resolveTarget(root, target);
  if (!t.abs || !fs.existsSync(t.abs)) throw new HttpError(404, "not-found");
  if (hasEnv(t.abs)) throw new HttpError(409, "contains-env-file");
  fs.mkdirSync(t.trashDir, { recursive: true });
  const entry = path.join(t.trashDir, `${stamp()}__${t.name}`);
  const extra = companions.filter((c) => c !== t.abs && fs.existsSync(c));
  const size = sizeOf(t.abs) + extra.reduce((s, c) => s + sizeOf(c), 0);
  fs.renameSync(t.abs, entry);
  const withList = extra.map((c, i) => {
    const stored = `${i}__${path.basename(c)}`;
    fs.mkdirSync(entry + ".with", { recursive: true });
    fs.renameSync(c, path.join(entry + ".with", stored));
    return { original: path.relative(root, c), stored };
  });
  const meta = { kind: t.kind, name: t.name, project: t.project, video: t.video, dir: t.dir,
    original: path.relative(root, t.abs), size, deletedAt: Date.now(), ...(withList.length && { with: withList }) };
  fs.writeFileSync(entry + ".meta.json", JSON.stringify(meta, null, 2));
  return { id: encodeId(path.relative(root, entry)), abs: t.abs, ...meta };
}

function trashDirs(root) {
  const dirs = [path.join(root, TRASH)];
  const kids = (d) => { try { return fs.readdirSync(d).filter(isSlug); } catch { return []; } };
  for (const p of kids(root)) {
    dirs.push(path.join(root, p, TRASH));
    for (const v of kids(path.join(root, p, "videos"))) dirs.push(path.join(root, p, "videos", v, TRASH));
  }
  return dirs;
}

export function listTrash(root) {
  const items = [];
  for (const d of trashDirs(root)) {
    let names = [];
    try { names = fs.readdirSync(d); } catch { continue; }
    for (const n of names.filter((n) => n.endsWith(".meta.json"))) {
      const entry = path.join(d, n.slice(0, -".meta.json".length));
      if (!fs.existsSync(entry)) continue;
      let meta;
      try { meta = JSON.parse(fs.readFileSync(path.join(d, n), "utf8")); } catch { continue; }
      items.push({ id: encodeId(path.relative(root, entry)), kind: meta.kind, name: meta.name, project: meta.project,
        video: meta.video, dir: meta.dir, original: meta.original, size: meta.size, deletedAt: meta.deletedAt,
        with: (meta.with ?? []).map((w) => w.original) });
    }
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
}

function entryFor(root, id) {
  const rel = decodeId(id);
  const entry = safeJoin(root, rel);
  if (!entry || !rel.split(path.sep).includes(TRASH) || !fs.existsSync(entry + ".meta.json")) throw new HttpError(404, "not-found");
  return entry;
}

export function restore(root, id) {
  const entry = entryFor(root, id);
  const meta = JSON.parse(fs.readFileSync(entry + ".meta.json", "utf8"));
  const dest = safeJoin(root, meta.original);
  if (!dest) throw new HttpError(400, "bad-target");
  const extra = (meta.with ?? []).map((w) => ({ from: path.join(entry + ".with", path.basename(w.stored)), to: safeJoin(root, w.original) }));
  if (extra.some((x) => !x.to)) throw new HttpError(400, "bad-target");
  // All or nothing: refuse before moving anything if any original path is taken again.
  if (fs.existsSync(dest) || extra.some((x) => fs.existsSync(x.to))) throw new HttpError(409, "original-exists");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(entry, dest);
  for (const x of extra) {
    if (!fs.existsSync(x.from)) continue;
    fs.mkdirSync(path.dirname(x.to), { recursive: true });
    fs.renameSync(x.from, x.to);
  }
  fs.rmSync(entry + ".with", { recursive: true, force: true });
  fs.rmSync(entry + ".meta.json");
  return meta;
}

export function purge(root, id) {
  const ids = id === "all" ? listTrash(root).map((i) => i.id) : [id];
  let freed = 0;
  for (const i of ids) {
    const entry = entryFor(root, i);
    freed += sizeOf(entry) + (fs.existsSync(entry + ".with") ? sizeOf(entry + ".with") : 0);
    fs.rmSync(entry, { recursive: true, force: true });
    fs.rmSync(entry + ".with", { recursive: true, force: true });
    fs.rmSync(entry + ".meta.json", { force: true });
  }
  return { purged: ids.length, freed };
}
