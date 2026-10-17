// clauvid share platform: review drafts, edit scripts, manage assets. No npm deps.
// Usage: [VIEWER_USER=… VIEWER_PASS=…] [PROJECTS_DIR=…] [PROXY_DIR=…] node server.mjs [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError, readJson, sendFile, sendJson } from "./lib/http.mjs";
import { DELETE_DIRS, READ_DIRS, VIDEO_DIRS, isFileName, isSlug, safeJoin, sanitizeName, videoDir } from "./lib/paths.mjs";
import { VIDEO, listAssets, listProjects, usage } from "./lib/scan.mjs";
import { companionsOf } from "./lib/companions.mjs";
import { createProxies } from "./lib/proxy.mjs";
import { canWrite, canWriteRequest } from "./lib/guard.mjs";
import { createScript, listScripts, readScript, renameScript, writeScript } from "./lib/script.mjs";
import { handleUpload } from "./lib/upload.mjs";
import { listTrash, purge, restore, trashTarget } from "./lib/trash.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.PROJECTS_DIR || path.join(HERE, "..", "projects"));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4747);
const HOST = process.env.HOST;
const USER = process.env.VIEWER_USER, PASS = process.env.VIEWER_PASS;
const DIST = path.join(HERE, "dist");
fs.mkdirSync(ROOT, { recursive: true });

const proxies = createProxies(ROOT, path.resolve(process.env.PROXY_DIR || path.join(HERE, "..", ".cache", "share-platform")),
  process.env.PROXIES !== "0");

function authed(req) {
  if (!USER || !PASS) return true;
  const [, b64] = (req.headers.authorization || "").split(" ");
  return !!b64 && Buffer.from(b64, "base64").toString() === `${USER}:${PASS}`;
}

const need = (cond, status = 400, error = "bad-request") => { if (!cond) throw new HttpError(status, error); };
const vdirOf = (p, v) => {
  const d = videoDir(ROOT, p, v);
  need(d, 400, "bad-target");
  return d;
};

// A render's script and take can't be changed, renamed or deleted while the render exists.
function lockCheck(project, video, dir, name) {
  if (!video || typeof name !== "string" || (dir !== "scripts" && dir !== "assets")) return;
  const u = usage(vdirOf(project, video));
  if (dir === "scripts") need(!u.scripts.has(name.replace(/\.md$/, "")), 409, "script-locked");
  else need(!u.takes.has(name), 409, "take-locked");
}

// [method, pattern, handler(req, res, match, url)]; write routes are marked and go through the guard.
const routes = [
  ["GET", /^\/api\/projects$/, (req, res) => {
    const list = listProjects(ROOT);
    proxies.queueAll(list);
    sendJson(res, 200, list);
  }],
  ["POST", /^\/api\/projects$/, async (req, res) => {
    const { slug } = await readJson(req);
    need(isSlug(slug), 400, "bad-name");
    const dir = safeJoin(ROOT, slug);
    need(dir && !fs.existsSync(dir), 409, "exists");
    fs.mkdirSync(path.join(dir, "videos"), { recursive: true });
    sendJson(res, 200, { slug });
  }, "write"],
  ["POST", /^\/api\/projects\/([^/]+)\/videos$/, async (req, res, m) => {
    const { slug } = await readJson(req);
    need(isSlug(m[1]) && fs.existsSync(safeJoin(ROOT, m[1])), 404, "no-project");
    need(isSlug(slug), 400, "bad-name");
    const dir = vdirOf(m[1], slug);
    need(!fs.existsSync(dir), 409, "exists");
    for (const d of VIDEO_DIRS) fs.mkdirSync(path.join(dir, d), { recursive: true });
    sendJson(res, 200, { slug });
  }, "write"],
  ["GET", /^\/api\/whoami$/, (req, res) => sendJson(res, 200, { canEdit: canWrite(req) })],
  ["GET", /^\/api\/projects\/([^/]+)\/videos\/([^/]+)\/assets$/, async (req, res, m) => {
    const d = vdirOf(m[1], m[2]);
    need(fs.existsSync(d), 404, "no-video");
    const a = await listAssets(d), { takes } = usage(d);
    for (const x of a.assets) if (takes.has(x.name)) x.lockedBy = takes.get(x.name);
    sendJson(res, 200, a);
  }],
  ["GET", /^\/api\/projects\/([^/]+)\/videos\/([^/]+)\/scripts$/, (req, res, m) => {
    const d = vdirOf(m[1], m[2]);
    need(fs.existsSync(d), 404, "no-video");
    const { scripts } = usage(d);
    sendJson(res, 200, listScripts(d).map((s) => ({ ...s, lockedBy: scripts.get(s.name) ?? [] })));
  }],
  ["POST", /^\/api\/projects\/([^/]+)\/videos\/([^/]+)\/scripts$/, async (req, res, m) => {
    const { name, title, from } = await readJson(req);
    sendJson(res, 200, createScript(vdirOf(m[1], m[2]), name, title, from));
  }, "write"],
  ["POST", /^\/api\/projects\/([^/]+)\/videos\/([^/]+)\/scripts\/([^/]+)\/rename$/, async (req, res, m) => {
    const d = vdirOf(m[1], m[2]);
    need(!usage(d).scripts.has(m[3]), 409, "script-locked");
    sendJson(res, 200, renameScript(d, m[3], (await readJson(req)).to));
  }, "write"],
  ["GET", /^\/api\/projects\/([^/]+)\/videos\/([^/]+)\/scripts\/([^/]+)$/, (req, res, m) => {
    const d = vdirOf(m[1], m[2]);
    sendJson(res, 200, { ...readScript(d, m[3]), lockedBy: usage(d).scripts.get(m[3]) ?? [] });
  }],
  ["PUT", /^\/api\/projects\/([^/]+)\/videos\/([^/]+)\/scripts\/([^/]+)$/, async (req, res, m) => {
    const d = vdirOf(m[1], m[2]), body = await readJson(req);
    // Locked scripts still take comments; only their text is frozen.
    if (usage(d).scripts.has(m[3])) need(body?.markdown === readScript(d, m[3]).markdown, 409, "script-locked");
    sendJson(res, 200, writeScript(d, m[3], body));
  }, "write"],
  ["POST", /^\/api\/projects\/([^/]+)\/videos\/([^/]+)\/upload$/, async (req, res, m, url) => {
    sendJson(res, 200, await handleUpload(req, vdirOf(m[1], m[2]), url.searchParams.get("to"), url.searchParams.get("name")));
  }, "write"],
  ["GET", /^\/api\/trash$/, (req, res) => sendJson(res, 200, listTrash(ROOT))],
  ["POST", /^\/api\/delete$/, async (req, res) => {
    const target = await readJson(req);
    lockCheck(target.project, target.video, target.dir, target.name);
    // A file's companions (script comments; a draft's note, render copy, frozen source) go with it.
    const extra = target.video && target.dir && typeof target.name === "string" && !/[\\/]/.test(target.name)
      ? companionsOf(vdirOf(target.project, target.video), target.dir, target.name) : [];
    const out = trashTarget(ROOT, target, extra);
    proxies.drop(out.abs);
    const { abs, ...item } = out;
    sendJson(res, 200, item);
  }, "write"],
  ["POST", /^\/api\/rename$/, async (req, res) => {
    const { project, video, dir, name, to } = await readJson(req);
    need(DELETE_DIRS.has(dir) && dir !== "scripts" && isFileName(name) && typeof to === "string", 400, "bad-target");
    const folder = safeJoin(vdirOf(project, video), dir);
    need(fs.existsSync(path.join(folder, name)), 404, "not-found");
    lockCheck(project, video, dir, name);
    const ext = path.extname(name).toLowerCase();
    const clean = sanitizeName(path.basename(to).replace(/\.[^.]+$/, "") + ext);
    need(clean, 400, "bad-name");
    if (clean !== name) {
      need(!fs.existsSync(path.join(folder, clean)), 409, "exists");
      fs.renameSync(path.join(folder, name), path.join(folder, clean));
      proxies.drop(path.join(folder, name));
    }
    sendJson(res, 200, { name: clean });
  }, "write"],
  ["POST", /^\/api\/trash\/restore$/, async (req, res) => sendJson(res, 200, restore(ROOT, (await readJson(req)).id)), "write"],
  ["POST", /^\/api\/trash\/purge$/, async (req, res) => {
    const b = await readJson(req);
    sendJson(res, 200, purge(ROOT, b.all === true ? "all" : b.id));
  }, "write"],
  // /files/<p>/videos/<v>/<dir>/<name>
  ["GET", /^\/files\/([^/]+)\/videos\/([^/]+)\/([^/]+)\/([^/]+)$/, (req, res, m, url) => {
    need(READ_DIRS.has(m[3]) && isFileName(m[4]), 404, "not-found");
    const file = safeJoin(vdirOf(m[1], m[2]), m[3], m[4]);
    need(file, 404, "not-found");
    // Stream the web proxy when ready (Download asks for ?orig=1).
    if (VIDEO.test(file) && ["final", "revisions"].includes(m[3]) && url.searchParams.get("orig") !== "1") {
      if (proxies.fresh(file)) return sendFile(req, res, proxies.path(file));
      proxies.queue(file);
    }
    const dl = url.searchParams.get("orig") === "1" ? { "Content-Disposition": `attachment; filename="${m[4]}"` } : {};
    sendFile(req, res, file, dl);
  }],
  // /files/<p>/shared/characters/<c>/<name.svg|md>
  ["GET", /^\/files\/([^/]+)\/shared\/characters\/([^/]+)\/([^/]+\.(?:svg|md))$/i, (req, res, m) => {
    need(isSlug(m[1]) && isSlug(m[2]) && isFileName(m[3]), 404, "not-found");
    const file = safeJoin(ROOT, m[1], "shared", "characters", m[2], m[3]);
    sendFile(req, res, file, file.endsWith(".svg") ? { "Content-Security-Policy": "script-src 'none'" } : {});
  }],
];

function serveStatic(req, res, p) {
  if (!fs.existsSync(path.join(DIST, "index.html"))) return sendFile(req, res, path.join(HERE, "index.html"));
  const file = safeJoin(DIST, "." + p);
  if (file && p !== "/" && fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    const cache = p.startsWith("/assets/") ? { "Cache-Control": "public, max-age=31536000, immutable" } : {};
    return sendFile(req, res, file, cache);
  }
  sendFile(req, res, path.join(DIST, "index.html"), { "Cache-Control": "no-cache" });
}

const server = http.createServer(async (req, res) => {
  if (!authed(req)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="clauvid"' }).end("auth required");
    return;
  }
  const url = new URL(req.url, "http://x");
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { return sendJson(res, 400, { error: "bad-path" }); }
  try {
    for (const [method, re, handler, kind] of routes) {
      const m = re.exec(p);
      if (!m) continue;
      if (req.method !== method) continue;
      if (kind === "write" && !canWriteRequest(req)) return sendJson(res, 403, { error: "edit-forbidden" });
      return await handler(req, res, m, url);
    }
    if (p.startsWith("/api/") || p.startsWith("/files/")) return sendJson(res, 404, { error: "not-found" });
    if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "method" });
    serveStatic(req, res, p);
  } catch (e) {
    if (res.headersSent) return res.destroy();
    if (e instanceof HttpError) return sendJson(res, e.status, { error: e.error });
    console.error(e);
    sendJson(res, 500, { error: "server-error" });
  }
});

server.listen(PORT, HOST, () => {
  const { port } = server.address();
  proxies.queueAll(listProjects(ROOT));
  console.log(`clauvid viewer on http://localhost:${port} (projects: ${ROOT})`);
});
