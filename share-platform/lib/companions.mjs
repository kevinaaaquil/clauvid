// Files that belong to another file and must go to Trash (and come back) with it,
// so deleting something never leaves owner-less leftovers behind.
//   scripts/<name>.md        → scripts/<name>.comments.json
//   revisions/<draft>.<ext>  → revisions/<draft>.json (script + take it used),
//                              source/renders/<draft>.* (the raw render output),
//                              source/versions/index.vNN.html (its frozen composition,
//                              unless another draft still has that vNN)
//   final/<cut>.<ext>        → final/<cut>.json, source/renders/<cut>.*
import fs from "node:fs";
import path from "node:path";
import { VIDEO } from "./scan.mjs";

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
const stemOf = (n) => n.replace(/\.[^.]+$/, "");

export function companionsOf(vdir, dir, name) {
  const out = [];
  const add = (p) => { if (isFile(p)) out.push(p); };
  const stem = stemOf(name);
  if (dir === "scripts" && name.endsWith(".md")) add(path.join(vdir, "scripts", `${stem}.comments.json`));
  if ((dir === "revisions" || dir === "final") && VIDEO.test(name)) {
    add(path.join(vdir, dir, `${stem}.json`));
    for (const f of ls(path.join(vdir, "source", "renders"))) if (stemOf(f) === stem && VIDEO.test(f)) add(path.join(vdir, "source", "renders", f));
  }
  if (dir === "revisions" && VIDEO.test(name)) {
    const v = stem.match(/^v\d+/i)?.[0];
    const shared = v && ls(path.join(vdir, "revisions")).some((f) => f !== name && VIDEO.test(f) && stemOf(f).match(/^v\d+/i)?.[0] === v);
    if (v && !shared) add(path.join(vdir, "source", "versions", `index.${v}.html`));
  }
  return out;
}
