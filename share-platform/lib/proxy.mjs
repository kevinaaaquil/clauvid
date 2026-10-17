// Web proxies: each video re-encoded for smooth streaming/seeking (keyframe every 1s,
// ~2.5 Mbps, faststart). Built lazily in the background, one at a time; originals untouched.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export function createProxies(projectsRoot, cacheRoot, enabled = true) {
  const queue = [];
  let busy = false;
  const proxyPath = (file) => path.join(cacheRoot, path.relative(projectsRoot, file));
  const fresh = (file) => {
    try { return fs.statSync(proxyPath(file)).mtimeMs >= fs.statSync(file).mtimeMs; } catch { return false; }
  };
  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    const file = queue.shift();
    const out = proxyPath(file), tmp = out + ".part.mp4";
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const ff = spawn("ffmpeg", ["-v", "error", "-y", "-i", file,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-maxrate", "2500k", "-bufsize", "5000k",
      "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", tmp], { stdio: "ignore" });
    ff.on("close", (code) => {
      if (code === 0 && fs.existsSync(file)) fs.renameSync(tmp, out); else fs.rmSync(tmp, { force: true });
      console.log(`proxy ${code === 0 ? "ok" : "FAILED"}: ${path.relative(projectsRoot, file)}`);
      busy = false;
      pump();
    });
  }
  const add = (file) => {
    if (!enabled || fresh(file) || queue.includes(file)) return;
    queue.push(file);
    pump();
  };
  return {
    fresh,
    path: proxyPath,
    queue: add,
    queueAll(projects) {
      for (const p of projects) for (const v of p.videos) for (const [dir, files] of [["final", v.final], ["revisions", v.revisions]])
        for (const f of files) add(path.join(projectsRoot, p.slug, "videos", v.slug, dir, f.name));
    },
    // Remove cached copies for a deleted file or folder.
    drop(absPath) { fs.rmSync(proxyPath(absPath), { recursive: true, force: true }); },
  };
}
