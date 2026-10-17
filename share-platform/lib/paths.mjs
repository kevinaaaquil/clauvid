// Name validation and safe path building. Every path the server touches goes through here.
import fs from "node:fs";
import path from "node:path";

export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const isSlug = (s) => typeof s === "string" && SLUG.test(s);

// Video-level folders the API may read files from, and the subset uploads/deletes may touch.
export const READ_DIRS = new Set(["final", "revisions", "research", "scripts", "assets", "references"]);
export const DELETE_DIRS = new Set(["final", "revisions", "scripts", "assets", "references", "research"]);
// Every folder a new video starts with.
export const VIDEO_DIRS = ["source", "research", "scripts", "assets", "references", "revisions", "final"];

// A plain file name: no separators, not hidden, not "." / "..".
export const isFileName = (n) => typeof n === "string" && n.length > 0 && n.length <= 200 &&
  !n.startsWith(".") && !/[\\/\0]/.test(n);

// Join under root and refuse anything that resolves outside it.
export function safeJoin(root, ...parts) {
  const out = path.resolve(root, ...parts);
  return out === root || out.startsWith(root + path.sep) ? out : null;
}

export const videoDir = (root, p, v) => (isSlug(p) && isSlug(v) ? safeJoin(root, p, "videos", v) : null);

// "My Photo (1).PNG" → "my-photo-1.png". Returns null if nothing usable is left.
export function sanitizeName(name) {
  if (typeof name !== "string") return null;
  const base = path.basename(name).toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const clean = (s) => s.replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  const stem = clean(base.slice(0, dot)), ext = clean(base.slice(dot + 1));
  return stem && ext ? `${stem}.${ext}` : null;
}

// First free name in dir: a.png, a-2.png, a-3.png, …
export function uniqueName(dir, name) {
  const dot = name.lastIndexOf(".");
  const stem = name.slice(0, dot), ext = name.slice(dot);
  for (let i = 1; ; i++) {
    const n = i === 1 ? name : `${stem}-${i}${ext}`;
    if (!fs.existsSync(path.join(dir, n))) return n;
  }
}
