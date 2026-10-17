// Streams one uploaded file into videos/<v>/assets|references, never overwriting.
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { HttpError } from "./http.mjs";
import { sanitizeName, uniqueName } from "./paths.mjs";

export const UPLOAD_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg", "heic", "mp3", "wav", "m4a", "aac",
  "mp4", "mov", "webm", "pdf", "md", "txt"]);
export const UPLOAD_LIMIT = 2 * 1024 ** 3;

export async function handleUpload(req, vdir, to, rawName) {
  if (!["assets", "references"].includes(to)) throw new HttpError(400, "bad-destination");
  if (!fs.existsSync(vdir)) throw new HttpError(404, "no-video");
  const clean = sanitizeName(rawName);
  if (!clean || !UPLOAD_EXT.has(clean.split(".").pop())) throw new HttpError(415, "file-type-not-allowed");
  if (Number(req.headers["content-length"]) > UPLOAD_LIMIT) throw new HttpError(413, "too-large");

  const dir = path.join(vdir, to);
  fs.mkdirSync(dir, { recursive: true });
  const name = uniqueName(dir, clean);
  const tmp = path.join(dir, `.${name}.${process.pid}.upload`);
  let size = 0;
  const limit = new Transform({
    transform(chunk, _e, cb) {
      size += chunk.length;
      cb(size > UPLOAD_LIMIT ? new HttpError(413, "too-large") : null, chunk);
    },
  });
  try {
    await pipeline(req, limit, fs.createWriteStream(tmp, { flags: "wx" }));
    // Re-check: another upload may have taken the name while this one streamed.
    const final = uniqueName(dir, name);
    fs.renameSync(tmp, path.join(dir, final));
    return { name: final, size };
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e instanceof HttpError ? e : new HttpError(500, "upload-failed");
  }
}
