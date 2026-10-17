import fs from "node:fs";
import path from "node:path";

export const MIME = {
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".heic": "image/heic",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac",
  ".pdf": "application/pdf", ".json": "application/json",
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
};

export class HttpError extends Error {
  constructor(status, error) { super(error); this.status = status; this.error = error; }
}

export function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

export function sendFile(req, res, file, headers = {}) {
  let st;
  try { st = fs.statSync(file); } catch { res.writeHead(404).end("not found"); return; }
  if (!st.isFile()) { res.writeHead(404).end("not found"); return; }
  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  const base = { "Content-Type": type, "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff", ...headers };
  // Uploaded SVGs could carry script; never let one run on this origin.
  if (type === "image/svg+xml") base["Content-Security-Policy"] = "sandbox; script-src 'none'";
  if (range) {
    const start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }).end(); return; }
    res.writeHead(206, { ...base, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...base, "Content-Length": st.size });
    fs.createReadStream(file).pipe(res);
  }
}

export function readJson(req, limit = 5e6) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, "too-large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(new HttpError(400, "bad-json")); }
    });
    req.on("error", reject);
  });
}
