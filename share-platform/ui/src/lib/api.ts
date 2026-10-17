import type { Assets, DeleteTarget, Project, Script, ScriptInfo, TrashItem } from "./types";

const enc = encodeURIComponent;
export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, body.error || `http-${r.status}`);
  return body as T;
}
// Every write carries X-Clauvid; the server refuses writes without it (see lib/guard.mjs).
const write = <T>(url: string, method: string, body: unknown) =>
  call<T>(url, { method, headers: { "Content-Type": "application/json", "X-Clauvid": "1" }, body: JSON.stringify(body) });

const vbase = (p: string, v: string) => `/api/projects/${enc(p)}/videos/${enc(v)}`;

export const api = {
  projects: () => call<Project[]>("/api/projects"),
  whoami: () => call<{ canEdit: boolean }>("/api/whoami"),
  createProject: (slug: string) => write<{ slug: string }>("/api/projects", "POST", { slug }),
  createVideo: (p: string, slug: string) => write<{ slug: string }>(`/api/projects/${enc(p)}/videos`, "POST", { slug }),
  assets: (p: string, v: string) => call<Assets>(`${vbase(p, v)}/assets`),
  scripts: (p: string, v: string) => call<ScriptInfo[]>(`${vbase(p, v)}/scripts`),
  script: (p: string, v: string, name: string) => call<Script>(`${vbase(p, v)}/scripts/${enc(name)}`),
  saveScript: (p: string, v: string, name: string, s: Pick<Script, "markdown" | "comments">) =>
    write<Script>(`${vbase(p, v)}/scripts/${enc(name)}`, "PUT", s),
  createScript: (p: string, v: string, from?: string) => write<Script>(`${vbase(p, v)}/scripts`, "POST", from ? { from } : {}),
  renameScript: (p: string, v: string, name: string, to: string) => write<Script>(`${vbase(p, v)}/scripts/${enc(name)}/rename`, "POST", { to }),
  del: (t: DeleteTarget) => write<TrashItem>("/api/delete", "POST", t),
  trash: () => call<TrashItem[]>("/api/trash"),
  rename: (t: Required<Pick<DeleteTarget, "project" | "video" | "dir" | "name">> & { to: string }) =>
    write<{ name: string }>("/api/rename", "POST", t),
  restore: (id: string) => write<unknown>("/api/trash/restore", "POST", { id }),
  purge: (id: string | "all") => write<{ purged: number; freed: number }>("/api/trash/purge", "POST", id === "all" ? { all: true } : { id }),

  /** XHR rather than fetch so we get upload progress. */
  upload(p: string, v: string, to: "assets" | "references", file: File, onProgress: (f: number) => void) {
    return new Promise<{ name: string }>((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("POST", `${vbase(p, v)}/upload?to=${to}&name=${enc(file.name)}`);
      x.setRequestHeader("X-Clauvid", "1");
      x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      x.onload = () => {
        let body: { name?: string; error?: string } = {};
        try { body = JSON.parse(x.responseText); } catch { /* empty */ }
        if (x.status === 200) resolve(body as { name: string });
        else reject(new ApiError(x.status, body.error || `http-${x.status}`));
      };
      x.onerror = () => reject(new ApiError(0, "network"));
      x.send(file);
    });
  },
};

export const fileUrl = (p: string, v: string, dir: string, name: string) =>
  `/files/${enc(p)}/videos/${enc(v)}/${dir}/${enc(name)}`;
export const charUrl = (p: string, c: string, name: string) => `/files/${enc(p)}/shared/characters/${enc(c)}/${enc(name)}`;

const MESSAGES: Record<string, string> = {
  "edit-forbidden": "This edit was refused (it came from another website).",
  "file-type-not-allowed": "That file type isn't allowed.",
  "too-large": "File is over the 2 GB limit.",
  "contains-env-file": "Refused: it contains a .env file.",
  "original-exists": "Can't restore: something already exists at the original path.",
  "not-found": "It's already gone.",
  exists: "A project with that name already exists.",
  "bad-name": "Names can only use letters, numbers, spaces, - and _ (no dots or slashes).",
  "script-locked": "This script is locked: a draft was built from it. Make a new version to change it.",
  "take-locked": "This take is locked: a draft was built from it. Delete that draft first to change it.",
  network: "Couldn't reach the server.",
};
export const errorText = (e: unknown) =>
  e instanceof ApiError ? MESSAGES[e.code] || `Failed (${e.code})` : "Something went wrong.";
