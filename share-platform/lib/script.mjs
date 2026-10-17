// A video's scripts: videos/<v>/scripts/<name>.md, each with <name>.comments.json beside it.
import fs from "node:fs";
import path from "node:path";
import { HttpError } from "./http.mjs";

// Script names allow "_" (script_v2) on top of the usual slug characters.
const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const isName = (s) => typeof s === "string" && NAME.test(s);

const files = (vdir, name) => {
  if (!isName(name)) throw new HttpError(400, "bad-name");
  return {
    md: path.join(vdir, "scripts", `${name}.md`),
    comments: path.join(vdir, "scripts", `${name}.comments.json`),
  };
};

const readComments = (file) => {
  try { const c = JSON.parse(fs.readFileSync(file, "utf8")); return Array.isArray(c) ? c : []; } catch { return []; }
};

/** Newest first: [{ name, size, mtime, openComments }] */
export function listScripts(vdir) {
  let names = [];
  try { names = fs.readdirSync(path.join(vdir, "scripts")); } catch { return []; }
  return names
    .filter((n) => n.endsWith(".md") && isName(n.slice(0, -3)))
    .map((n) => {
      const name = n.slice(0, -3), f = files(vdir, name), st = fs.statSync(f.md);
      return { name, size: st.size, mtime: st.mtimeMs, openComments: readComments(f.comments).filter((c) => !c.resolved).length };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function readScript(vdir, name) {
  const f = files(vdir, name);
  if (!fs.existsSync(f.md)) throw new HttpError(404, "no-script");
  return { name, markdown: fs.readFileSync(f.md, "utf8"), comments: readComments(f.comments), mtime: fs.statSync(f.md).mtimeMs };
}

// Temp file + rename, so a crash never leaves a half-written script.
function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

const cleanComment = (c) => ({
  id: String(c.id).slice(0, 64), quote: String(c.quote).slice(0, 2000), note: String(c.note).slice(0, 5000),
  createdAt: Number(c.createdAt) || Date.now(), resolved: !!c.resolved,
});

export function writeScript(vdir, name, body) {
  if (typeof body?.markdown !== "string" || !Array.isArray(body.comments ?? []))
    throw new HttpError(400, "bad-script");
  const f = files(vdir, name);
  if (!fs.existsSync(f.md)) throw new HttpError(404, "no-script");
  atomicWrite(f.md, body.markdown);
  atomicWrite(f.comments, JSON.stringify((body.comments ?? []).map(cleanComment), null, 2) + "\n");
  return readScript(vdir, name);
}

/**
 * script, then script_v2, script_v3, … after the highest in use. Takes in assets count as in use,
 * so a new script never inherits takes recorded for an old one of the same name.
 */
function defaultName(vdir) {
  let takes = [];
  try { takes = fs.readdirSync(path.join(vdir, "assets")).map((n) => /^(script(?:_v\d+)?)_take\d+\./.exec(n)?.[1]).filter(Boolean); } catch {}
  const names = [...listScripts(vdir).map((s) => s.name), ...takes];
  const nums = names.map((n) => (n === "script" ? 1 : Number(/^script_v(\d+)$/.exec(n)?.[1] ?? 0)));
  const top = Math.max(0, ...nums);
  return top === 0 ? "script" : `script_v${top + 1}`;
}

export function createScript(vdir, name, title, from) {
  if (!fs.existsSync(vdir)) throw new HttpError(404, "no-video");
  const n = name ?? defaultName(vdir);
  const f = files(vdir, n);
  if (fs.existsSync(f.md)) throw new HttpError(409, "exists");
  // A new version starts as a copy of another script's text (its comments stay behind).
  const body = from != null ? readScript(vdir, from).markdown : `# ${String(title || "Untitled script").slice(0, 200)}\n`;
  atomicWrite(f.md, body);
  return readScript(vdir, n);
}

/** "Short Cut" → "short-cut". Anything path-like is refused rather than cleaned. */
export function renameScript(vdir, name, to) {
  if (typeof to !== "string" || /[\\/.]/.test(to)) throw new HttpError(400, "bad-name");
  const next = to.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").replace(/-+/g, "-").replace(/^[-_]+|[-_]+$/g, "");
  const from = files(vdir, name), dest = files(vdir, next);
  if (!fs.existsSync(from.md)) throw new HttpError(404, "no-script");
  if (next === name) return readScript(vdir, name);
  if (fs.existsSync(dest.md)) throw new HttpError(409, "exists");
  fs.renameSync(from.md, dest.md);
  if (fs.existsSync(from.comments)) fs.renameSync(from.comments, dest.comments);
  return readScript(vdir, next);
}

/** Paths that go to Trash together when a script is deleted. */
export const scriptFiles = (vdir, name) => Object.values(files(vdir, name)).filter((f) => fs.existsSync(f));
