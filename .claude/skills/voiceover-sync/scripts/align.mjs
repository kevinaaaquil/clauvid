#!/usr/bin/env node
// Align an owner's voiceover take with its script.
//
//   node align.mjs <video-dir> [--take <file.wav>] [--force]
//
// Picks the newest take in assets/ unless --take is given, finds its script from the name
// (script_v2_take3.wav → scripts/script_v2.md), transcribes it with whisper.cpp once
// (research/<take>.json), then writes:
//   research/<take>.captions.json  word captions: transcript timing, script spelling
//   research/beats.md              scene beat sheet (beats.draft.md if beats.md exists; --force overwrites)
// No dependencies beyond Node 20+, whisper-cli and ffmpeg.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const MODEL = path.join(ROOT, ".cache/hyperframes/whisper/models/ggml-small.en.bin");
const TAKE = /^(.+)_take(\d+)\.(wav|mp3|m4a|webm|ogg|flac)$/i;

// ---------- script → words ----------

/** Narration words with their scene and emphasis. Headings name scenes and are not spoken. */
export function parseScript(md) {
  const scenes = [{ name: "Intro", words: [] }];
  let pendingName = null;
  const cur = () => scenes[scenes.length - 1];
  const open = (name) => {
    if (cur().words.length) scenes.push({ name: name ?? `Scene ${scenes.length + 1}`, words: [] });
    else if (name) cur().name = name;
  };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { open(pendingName); pendingName = null; continue; }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) { const name = stripMd(h[1]).trim(); if (cur().words.length) open(name); else cur().name = name; continue; }
    if (!line || line === "\\") continue;
    tokenize(line).forEach((w) => cur().words.push(w));
  }
  const out = scenes.filter((s) => s.words.length);
  out.forEach((s, i) => s.words.forEach((w) => (w.scene = i)));
  return out;
}

const stripMd = (s) => s.replace(/\*\*|__|[*_`]/g, "");

function tokenize(line) {
  const words = [];
  let bold = false, italic = false;
  // Split on whitespace, track **bold** and *italic* runs across words.
  const text = line.replace(/^[-*+]\s+/, "").replace(/^>\s?/, "").replace(/\\$/, "");
  for (let tok of text.split(/\s+/).filter(Boolean)) {
    let b = bold, it = italic;
    // Opening markers.
    while (/^[("'“‘]*(\*\*|__|\*|_)/.test(tok)) {
      const m = tok.match(/^([("'“‘]*)(\*\*|__|\*|_)/);
      tok = m[1] + tok.slice(m[0].length);
      if (m[2].length === 2) bold = b = true; else italic = it = true;
    }
    // Closing markers (possibly followed by punctuation).
    let closeB = false, closeI = false;
    for (;;) {
      const m = tok.match(/(\*\*|__|\*|_)([)"'”’.,!?;:]*)$/);
      if (!m) break;
      tok = tok.slice(0, m.index) + m[2];
      if (m[1].length === 2) closeB = true; else closeI = true;
    }
    const display = tok.replace(/\\/g, "");
    const norm = normalize(display);
    if (norm) words.push({ display, norm, bold: b, italic: it });
    else if (words.length) words[words.length - 1].display += display; // stray punctuation
    if (closeB) bold = false;
    if (closeI) italic = false;
  }
  return words;
}

const NUM = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
export const normalize = (w) => {
  const n = w.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]/g, "");
  return NUM[n] ?? n;
};

// ---------- transcript → words ----------

/** whisper-cli -oj output, or an array of { text, start, end } in seconds (hyperframes transcribe). */
export function parseTranscript(json) {
  const raw = Array.isArray(json)
    ? json.map((w) => ({ text: w.text ?? w.word ?? "", start: +w.start, end: +w.end }))
    : (json.transcription ?? []).map((t) => ({ text: t.text, start: t.offsets.from / 1000, end: t.offsets.to / 1000 }));
  const pieces = !Array.isArray(json); // whisper-cli tokens carry a leading space per new word
  const words = [];
  for (const r of raw) {
    const text = r.text.trim();
    if (!text) continue;
    const norm = normalize(text);
    // Whisper sometimes splits a word into pieces (" C", "DS"): glue pieces without a leading space.
    const glue = pieces && words.length && !/^\s/.test(r.text) && norm;
    if (!norm || glue) {
      const last = words[words.length - 1];
      if (!last) continue;
      last.text += text; last.end = Math.max(last.end, r.end); last.norm = normalize(last.text);
      continue;
    }
    words.push({ text, norm, start: r.start, end: r.end });
  }
  return words;
}

// ---------- alignment ----------

const lev = (a, b) => {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
};
const similar = (a, b) => a === b || (Math.max(a.length, b.length) >= 4 && lev(a, b) / Math.max(a.length, b.length) <= 0.3);

/**
 * Global alignment (Needleman–Wunsch). Returns ops in order:
 * { s, t } match/sub, { s } script word not spoken, { t } spoken word not in script.
 */
export function align(S, T) {
  const n = S.length, m = T.length, W = m + 1;
  const cost = new Float64Array((n + 1) * W), back = new Uint8Array((n + 1) * W);
  for (let i = 1; i <= n; i++) { cost[i * W] = i; back[i * W] = 1; }
  for (let j = 1; j <= m; j++) { cost[j] = j; back[j] = 2; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const sub = cost[(i - 1) * W + j - 1] + (S[i - 1].norm === T[j - 1].norm ? 0 : similar(S[i - 1].norm, T[j - 1].norm) ? 0.4 : 1.2);
    const del = cost[(i - 1) * W + j] + 1, ins = cost[i * W + j - 1] + 1;
    const k = i * W + j;
    if (sub <= del && sub <= ins) { cost[k] = sub; back[k] = 0; }
    else if (del <= ins) { cost[k] = del; back[k] = 1; }
    else { cost[k] = ins; back[k] = 2; }
  }
  const ops = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    const b = back[i * W + j];
    if (i > 0 && j > 0 && b === 0) ops.push({ s: S[--i], t: T[--j] });
    else if (i > 0 && (j === 0 || b === 1)) ops.push({ s: S[--i] });
    else ops.push({ t: T[--j] });
  }
  return ops.reverse();
}

// ---------- outputs ----------

const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;

export function build(scenes, transcript) {
  const S = scenes.flatMap((s) => s.words);
  const ops = align(S, transcript);
  const captions = [], diffs = [];
  let scene = 0;
  for (const op of ops) {
    if (op.s) scene = op.s.scene;
    if (op.s && op.t) {
      const same = similar(op.s.norm, op.t.norm);
      captions.push({
        text: same ? op.s.display : op.t.text, start: op.t.start, end: op.t.end, scene,
        ...(op.s.bold && { bold: true }), ...(op.s.italic && { italic: true }),
      });
      if (!same) diffs.push({ at: op.t.start, scene, kind: "reworded", script: op.s.display, said: op.t.text });
    } else if (op.t) {
      captions.push({ text: op.t.text, start: op.t.start, end: op.t.end, scene, added: true });
      diffs.push({ at: op.t.start, scene, kind: "added", said: op.t.text });
    } else {
      diffs.push({ at: captions.at(-1)?.end ?? 0, scene, kind: "dropped", script: op.s.display });
    }
  }
  const matched = ops.filter((o) => o.s && o.t && o.s.norm === o.t.norm).length;
  return { captions, diffs, matchRate: S.length ? matched / S.length : 0 };
}

export function beatsMarkdown({ take, script, duration, scenes, captions, diffs, matchRate }) {
  const lines = [
    `# Beats: ${take}`,
    "",
    `Script \`scripts/${script}.md\` · take \`assets/${take}\` · ${fmt(duration)} · ${Math.round(matchRate * 100)}% of script words spoken as written, ${diffs.length} differences.`,
    "Times come from the transcript (what the viewer hears). Generated by voiceover-sync; fill in the visual ideas.",
    "",
  ];
  scenes.forEach((sc, i) => {
    const words = captions.filter((c) => c.scene === i);
    if (!words.length) { lines.push(`## ${i + 1}. ${sc.name} (not spoken)`, ""); return; }
    const start = words[0].start, end = words.at(-1).end;
    lines.push(`## ${i + 1}. ${sc.name} · ${fmt(start)} → ${fmt(end)} (${(end - start).toFixed(1)} s)`, "");
    lines.push(`> ${words.map((w) => w.text).join(" ")}`, "");
    // Consecutive emphasised words form one phrase.
    const em = [];
    words.forEach((w, k) => {
      if (!(w.bold || w.italic)) return;
      const prev = words[k - 1], last = em.at(-1);
      if (last && prev && (prev.bold || prev.italic) && !!prev.bold === !!w.bold) { last.text += " " + w.text; last.end = w.end; }
      else em.push({ text: w.text, start: w.start, end: w.end, style: w.bold ? "bold" : "italic" });
    });
    if (em.length) lines.push(`- **Emphasis:** ${em.map((e) => `${e.style} \`${e.text}\` @${e.start.toFixed(2)}–${e.end.toFixed(2)}`).join("; ")}`);
    const d = diffs.filter((x) => x.scene === i);
    if (d.length) lines.push(`- **Take differs from script:** ${d.map((x) =>
      x.kind === "added" ? `+"${x.said}" @${x.at.toFixed(2)}`
        : x.kind === "dropped" ? `−"${x.script}"`
        : `"${x.script}" → "${x.said}" @${x.at.toFixed(2)}`).join("; ")}`);
    lines.push("- **Visual:** _todo_", "");
  });
  return lines.join("\n");
}

// ---------- CLI ----------

function newestTake(assets) {
  const takes = fs.readdirSync(assets).filter((f) => TAKE.test(f));
  if (!takes.length) throw new Error(`no <script>_takeN audio in ${assets}`);
  return takes.map((f) => ({ f, t: fs.statSync(path.join(assets, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0].f;
}

function transcribe(wav, outBase) {
  const tmp = `${outBase}.16k.wav`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ar", "16000", "-ac", "1", tmp]);
  try {
    execFileSync("whisper-cli", ["-m", MODEL, "-f", tmp, "-ml", "1", "-sow", "-oj", "-of", outBase, "-np"], { stdio: "pipe" });
  } catch (e) {
    throw new Error(`whisper-cli failed: ${String(e.stderr || e.message).trim().split("\n").slice(-3).join(" / ")}`);
  } finally { fs.rmSync(tmp, { force: true }); }
}

function main(argv) {
  const args = argv.slice(2);
  const vdir = path.resolve(args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--take") ?? ".");
  const ti = args.indexOf("--take"), force = args.includes("--force");
  const take = ti >= 0 ? path.basename(args[ti + 1]) : newestTake(path.join(vdir, "assets"));
  const m = take.match(TAKE);
  if (!m) throw new Error(`take name must be <script>_takeN.<ext>, got ${take}`);
  const script = m[1], stem = take.replace(/\.[^.]+$/, "");
  const mdFile = path.join(vdir, "scripts", `${script}.md`);
  if (!fs.existsSync(mdFile)) throw new Error(`no script ${mdFile} for take ${take}`);
  const research = path.join(vdir, "research");
  fs.mkdirSync(research, { recursive: true });

  const jsonFile = path.join(research, `${stem}.json`);
  if (!fs.existsSync(jsonFile) || force) transcribe(path.join(vdir, "assets", take), path.join(research, stem));
  const transcript = parseTranscript(JSON.parse(fs.readFileSync(jsonFile, "utf8")));
  const scenes = parseScript(fs.readFileSync(mdFile, "utf8"));
  const res = build(scenes, transcript);
  const duration = transcript.at(-1)?.end ?? 0;

  const capFile = path.join(research, `${stem}.captions.json`);
  fs.writeFileSync(capFile, JSON.stringify({ take, script, duration, scenes: scenes.map((s) => s.name), words: res.captions }, null, 1) + "\n");
  let beats = path.join(research, "beats.md");
  if (fs.existsSync(beats) && !force) beats = path.join(research, "beats.draft.md");
  fs.writeFileSync(beats, beatsMarkdown({ take, script, duration, scenes, ...res }));

  console.log(`take     assets/${take} (${fmt(duration)})`);
  console.log(`script   scripts/${script}.md: ${scenes.length} scenes, ${Math.round(res.matchRate * 100)}% words as written, ${res.diffs.length} differences`);
  console.log(`wrote    ${path.relative(vdir, jsonFile)}, ${path.relative(vdir, capFile)}, ${path.relative(vdir, beats)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv); } catch (e) { console.error(`align: ${e.message}`); process.exit(1); }
}
