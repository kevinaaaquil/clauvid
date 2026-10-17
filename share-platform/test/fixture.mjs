// Builds a throwaway PROJECTS_DIR and runs server.mjs against it on a free port.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, "..", "server.mjs");

let media; // generated once per process, copied into each fixture
function makeMedia() {
  if (media) return media;
  media = fs.mkdtempSync(path.join(os.tmpdir(), "clauvid-media-"));
  const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
  ff("-f", "lavfi", "-i", "color=c=blue:s=64x64:d=1", "-f", "lavfi", "-i", "sine=d=1", "-shortest",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(media, "clip.mp4"));
  ff("-f", "lavfi", "-i", "color=c=red:s=32x32", "-frames:v", "1", path.join(media, "photo.png"));
  ff("-f", "lavfi", "-i", "sine=d=2", path.join(media, "tone.wav"));
  return media;
}

export function buildTree(root) {
  const m = makeMedia();
  const put = (rel, data) => {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (data instanceof URL || (typeof data === "string" && data.startsWith("@")))
      fs.copyFileSync(path.join(m, data.slice(1)), f);
    else fs.writeFileSync(f, data);
  };
  const a = "demo/videos/alpha";
  put(`${a}/revisions/v01-a.mp4`, "@clip.mp4");
  put(`${a}/revisions/v02-b.mp4`, "@clip.mp4");
  put(`${a}/final/alpha.mp4`, "@clip.mp4");
  put(`${a}/final/share.md`, "# Alpha\n\nShare text.\n");
  put(`${a}/research/findings.md`, "# Findings\n");
  put(`${a}/assets/photo.png`, "@photo.png");
  put(`${a}/assets/unused.wav`, "@tone.wav");
  put(`${a}/references/ref.pdf`, "%PDF-1.4\n%%EOF\n");
  put(`${a}/source/index.html`, '<img src="../assets/photo.png">');
  put(`${a}/source/node_modules/x/index.html`, '<audio src="unused.wav">');
  put(`${a}/source/versions/index.v01.html`, '<audio id="vo" src="assets/script_v2_take3.wav">');
  put(`${a}/final/alpha.json`, JSON.stringify({ script: "script", take: "script_take1.wav" }));
  // locks/videos/g also gets a draft with a full set of companions for the trash tests.
  put("locks/videos/g/revisions/v02-y.mp4", "@clip.mp4");
  put("locks/videos/g/revisions/v02-y.json", JSON.stringify({ script: null, take: null }));
  put("locks/videos/g/source/renders/v02-y.mp4", "@clip.mp4");
  put("locks/videos/g/source/versions/index.v02.html", "<p>v02</p>");
  fs.mkdirSync(path.join(root, "demo/videos/beta"), { recursive: true });
  // locks/videos/g: v01 was built from script.md + script_take1.wav.
  const g = "locks/videos/g";
  put(`${g}/revisions/v01-x.mp4`, "@clip.mp4");
  put(`${g}/source/versions/index.v01.html`, '<audio id="vo" src="assets/script_take1.wav">');
  put(`${g}/scripts/script.md`, "# Locked\n\nHello.\n");
  put(`${g}/scripts/other.md`, "# Free\n");
  put(`${g}/assets/script_take1.wav`, "@tone.wav");
  put("demo/shared/characters/dex/dex.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>');
  put("demo/shared/characters/dex/dex.md", "# Dex\n");
}

export async function startFixture({ empty = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clauvid-fx-"));
  const projects = path.join(dir, "projects");
  fs.mkdirSync(projects);
  if (!empty) buildTree(projects);
  const child = spawn(process.execPath, [SERVER, "0"], {
    env: { ...process.env, PROJECTS_DIR: projects, PROXY_DIR: path.join(dir, "proxies"), PROXIES: "0" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const port = await new Promise((resolve, reject) => {
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d;
      const m = /localhost:(\d+)/.exec(buf);
      if (m) resolve(Number(m[1]));
    });
    child.on("exit", (c) => reject(new Error("server exited " + c)));
  });
  return {
    base: `http://localhost:${port}`,
    port,
    dir: projects,
    stop: () => { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}
