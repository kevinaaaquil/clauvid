// Reads the projects/<p>/videos/<v>/… tree into the shapes the API returns.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { isSlug } from "./paths.mjs";
import { listScripts } from "./script.mjs";

export const VIDEO = /\.(mp4|webm|mov)$/i;
const KINDS = {
  image: /\.(jpe?g|png|webp|gif|svg|heic)$/i,
  audio: /\.(mp3|wav|m4a|aac)$/i,
  video: VIDEO,
  doc: /\.(pdf|md|txt)$/i,
};
export const mediaKind = (name) => Object.keys(KINDS).find((k) => KINDS[k].test(name)) || null;

const statSafe = (f) => { try { return fs.statSync(f); } catch { return null; } };
const subdirs = (dir) => {
  try { return fs.readdirSync(dir).filter((n) => isSlug(n) && statSafe(path.join(dir, n))?.isDirectory()).sort(); }
  catch { return []; }
};
export function listFiles(dir, re = /./) {
  try {
    return fs.readdirSync(dir)
      .filter((n) => !n.startsWith(".") && re.test(n))
      .map((n) => ({ n, st: statSafe(path.join(dir, n)) }))
      .filter(({ st }) => st?.isFile())
      .map(({ n, st }) => ({ name: n, size: st.size, mtime: st.mtimeMs }));
  } catch { return []; }
}
const byNameDesc = (a, b) => b.name.localeCompare(a.name, undefined, { numeric: true });

// Text of the video's current source (snapshots, renders and deps excluded), for "used" detection.
const SKIP = new Set(["node_modules", ".hyperframes", "renders", "versions"]);
function sourceText(dir) {
  let out = "";
  const walk = (d, depth) => {
    if (depth > 6) return;
    let names = [];
    try { names = fs.readdirSync(d); } catch { return; }
    for (const n of names) {
      if (SKIP.has(n) || n.startsWith(".")) continue;
      const f = path.join(d, n), st = statSafe(f);
      if (st?.isDirectory()) walk(f, depth + 1);
      else if (st?.isFile() && /\.(html|css|js|mjs|json)$/i.test(n) && st.size < 5e6) out += fs.readFileSync(f, "utf8") + "\n";
    }
  };
  walk(dir, 0);
  return out;
}
export const usedSet = (sourceDir, names) => {
  const text = sourceText(sourceDir);
  return new Set(names.filter((n) => text.includes(n)));
};

// Which script and voiceover take a render was built from: a <render>.json sidecar
// ({ script, take }) wins, else the take named in that revision's frozen source
// (source/versions/index.vNN.html). Takes are <script>_takeN.<ext>, so the take names the script.
const TAKE = /([a-z0-9][a-z0-9_-]{0,63})_take(\d+)\.(?:wav|mp3|m4a|webm|ogg|flac)/;
export function madeFrom(vdir, dir, name) {
  const stem = name.replace(/\.[^.]+$/, "");
  try {
    const j = JSON.parse(fs.readFileSync(path.join(vdir, dir, `${stem}.json`), "utf8"));
    if (j && (j.script || j.take)) {
      const t = typeof j.take === "string" ? j.take.match(TAKE) : null;
      return { script: j.script ?? t?.[1] ?? null, take: j.take ?? null };
    }
  } catch {}
  const v = stem.match(/^v\d+/i)?.[0];
  if (dir !== "revisions" || !v) return undefined;
  try {
    const m = fs.readFileSync(path.join(vdir, "source", "versions", `index.${v}.html`), "utf8").match(TAKE);
    if (m) return { script: m[1], take: m[0] };
  } catch {}
  return undefined;
}

/**
 * What the video's renders were built from. A script or take in here is locked: changing it
 * would make those drafts unreproducible. Deleting the render (to Trash) unlocks it.
 * → { scripts: Map<name, render[]>, takes: Map<file, render[]> }
 */
export function usage(vdir) {
  const scripts = new Map(), takes = new Map();
  const add = (m, k, r) => { if (k) m.set(k, [...(m.get(k) ?? []), r]); };
  for (const dir of ["revisions", "final"]) {
    for (const f of listFiles(path.join(vdir, dir), VIDEO).sort(byNameDesc)) {
      const m = madeFrom(vdir, dir, f.name);
      const r = dir === "final" ? `final/${f.name}` : f.name;
      add(scripts, m?.script, r); add(takes, m?.take, r);
    }
  }
  return { scripts, takes };
}

function scanVideo(vdir, slug) {
  const withMade = (dir) => (f) => { const m = madeFrom(vdir, dir, f.name); return m ? { ...f, madeFrom: m } : f; };
  const revisions = listFiles(path.join(vdir, "revisions"), VIDEO).sort(byNameDesc).map(withMade("revisions"));
  const final = listFiles(path.join(vdir, "final"), VIDEO).map(withMade("final"));
  const docs = [
    ...listFiles(path.join(vdir, "final"), /\.md$/i).map((d) => ({ ...d, dir: "final" })),
    ...listFiles(path.join(vdir, "research"), /\.md$/i).map((d) => ({ ...d, dir: "research" })),
  ];
  const scripts = listScripts(vdir);
  const assets = listFiles(path.join(vdir, "assets")).filter((f) => mediaKind(f.name));
  const used = usedSet(path.join(vdir, "source"), assets.map((a) => a.name));
  const updated = Math.max(statSafe(vdir)?.mtimeMs || 0, ...[...revisions, ...final].map((f) => f.mtime));
  return {
    slug, updated, final, revisions, docs,
    scripts: scripts.length,
    openComments: scripts.reduce((n, s) => n + s.openComments, 0),
    assetCount: assets.length, usedCount: used.size,
  };
}

export function listProjects(root) {
  return subdirs(root).map((slug) => {
    const pdir = path.join(root, slug);
    const videos = subdirs(path.join(pdir, "videos"))
      .map((v) => scanVideo(path.join(pdir, "videos", v), v))
      .sort((a, b) => b.updated - a.updated);
    const cdir = path.join(pdir, "shared", "characters");
    const characters = subdirs(cdir).map((name) => ({
      name,
      svgs: listFiles(path.join(cdir, name), /\.svg$/i).sort((a, b) => a.name.localeCompare(b.name)),
      docs: listFiles(path.join(cdir, name), /\.md$/i),
    }));
    const updated = Math.max(statSafe(pdir)?.mtimeMs || 0, ...videos.map((v) => v.updated));
    return { slug, updated, videos, characters };
  }).sort((a, b) => b.updated - a.updated);
}

// Media duration in seconds via ffprobe, cached by path + mtime.
const durations = new Map();
function duration(file, mtime) {
  const key = file + "@" + mtime;
  if (durations.has(key)) return durations.get(key);
  const p = new Promise((resolve) => {
    execFile("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      { timeout: 10000 }, (err, out) => resolve(err ? null : Number(out.trim()) || null));
  });
  durations.set(key, p);
  return p;
}

export async function listAssets(vdir) {
  // Research also holds agent output (transcripts, caption timings), so JSON/CSV count as docs there.
  const kindIn = (dir, name) => mediaKind(name) ?? (dir === "research" && /\.(json|csv)$/i.test(name) ? "doc" : null);
  const read = async (dir, withUsed) => {
    const files = listFiles(path.join(vdir, dir)).map((f) => ({ ...f, kind: kindIn(dir, f.name) })).filter((f) => f.kind);
    const used = withUsed ? usedSet(path.join(vdir, "source"), files.map((f) => f.name)) : null;
    return Promise.all(files.sort((a, b) => b.mtime - a.mtime).map(async (f) => ({
      ...f,
      ...(used ? { used: used.has(f.name) } : {}),
      ...(f.kind === "audio" || f.kind === "video" ? { duration: await duration(path.join(vdir, dir, f.name), f.mtime) } : {}),
    })));
  };
  return { assets: await read("assets", true), references: await read("references", false), research: await read("research", false) };
}
