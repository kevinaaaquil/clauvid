import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { startFixture } from "./fixture.mjs";

let fx;
before(async () => { fx = await startFixture(); });
after(() => fx.stop());

const get = (p, opts) => fetch(fx.base + p, opts);
const json = async (p, opts) => (await get(p, opts)).json();
const W = { "X-Clauvid": "1" };
const write = (p, method, body, headers = {}) => get(p, {
  method, headers: { ...W, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

describe("read API", () => {
  test("projects listing", async () => {
    const [p] = await json("/api/projects");
    assert.equal(p.slug, "demo");
    assert.deepEqual(p.videos.map((v) => v.slug).sort(), ["alpha", "beta"]);
    const a = p.videos.find((v) => v.slug === "alpha");
    assert.deepEqual(a.revisions.map((r) => r.name), ["v02-b.mp4", "v01-a.mp4"]);
    assert.deepEqual(a.final.map((r) => r.name), ["alpha.mp4"]);
    assert.equal(a.assetCount, 2);
    assert.equal(a.usedCount, 1);
    assert.equal(a.scripts, 0);
    assert.ok(a.docs.some((d) => d.name === "findings.md" && d.dir === "research"));
    assert.deepEqual(p.characters.map((c) => c.name), ["dex"]);
  });

  test("renders say which script and take they were built from", async () => {
    const [p] = await json("/api/projects");
    const a = p.videos.find((v) => v.slug === "alpha");
    const rev = Object.fromEntries(a.revisions.map((r) => [r.name, r.madeFrom]));
    assert.deepEqual(rev["v01-a.mp4"], { script: "script_v2", take: "script_v2_take3.wav" });
    assert.equal(rev["v02-b.mp4"], undefined);
    assert.deepEqual(a.final[0].madeFrom, { script: "script", take: "script_take1.wav" });
  });

  test("assets listing includes research docs", async () => {
    const a = await json("/api/projects/demo/videos/alpha/assets");
    assert.deepEqual(a.research.map((f) => [f.name, f.kind]), [["findings.md", "doc"]]);
  });

  test("assets listing with kinds and used flag", async () => {
    const r = await json("/api/projects/demo/videos/alpha/assets");
    const by = Object.fromEntries(r.assets.map((x) => [x.name, x]));
    assert.equal(by["photo.png"].kind, "image");
    assert.equal(by["photo.png"].used, true);
    assert.equal(by["unused.wav"].kind, "audio");
    assert.equal(by["unused.wav"].used, false); // node_modules match ignored
    assert.ok(by["unused.wav"].duration > 1.5);
    assert.equal(r.references[0].kind, "doc");
  });

  test("files: full and range", async () => {
    const r = await get("/files/demo/videos/alpha/revisions/v01-a.mp4");
    assert.equal(r.status, 200);
    await r.arrayBuffer();
    const rr = await get("/files/demo/videos/alpha/revisions/v01-a.mp4", { headers: { Range: "bytes=0-9" } });
    assert.equal(rr.status, 206);
    assert.equal((await rr.arrayBuffer()).byteLength, 10);
  });

  test("files: assets and references served", async () => {
    assert.equal((await get("/files/demo/videos/alpha/assets/photo.png")).status, 200);
    assert.equal((await get("/files/demo/videos/alpha/references/ref.pdf")).status, 200);
  });

  test("traversal rejected", async () => {
    for (const p of ["/files/demo/videos/..%2f..%2fetc/final/x.mp4", "/files/demo/videos/alpha/final/..%2f..%2f..%2fx",
      "/api/projects/..%2f/videos/alpha/assets", "/files/Demo/videos/alpha/final/alpha.mp4"]) {
      const r = await get(p);
      assert.ok([400, 404].includes(r.status), p + " → " + r.status);
    }
  });

  test("character svg has CSP", async () => {
    const r = await get("/files/demo/shared/characters/dex/dex.svg");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-security-policy"), /script-src 'none'/);
  });

  test("uploaded svg asset is sandboxed", async () => {
    fs.writeFileSync(path.join(fx.dir, "demo/videos/alpha/references/x.svg"), "<svg/>");
    const r = await get("/files/demo/videos/alpha/references/x.svg");
    assert.match(r.headers.get("content-security-policy"), /sandbox/);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    fs.rmSync(path.join(fx.dir, "demo/videos/alpha/references/x.svg"));
  });

  test("root serves html", async () => {
    const r = await get("/");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/html/);
  });
});

describe("write guard", () => {
  test("whoami", async () => {
    assert.equal((await json("/api/whoami")).canEdit, true);
    assert.equal((await json("/api/whoami", { headers: { "X-Forwarded-For": "1.2.3.4" } })).canEdit, true);
    assert.equal((await json("/api/whoami", { headers: { Origin: "https://evil.example" } })).canEdit, false);
  });

  const md = "# Title\n\n## Scene 1\n\n**bold** and *italic*\n\n---\n\n- one\n- two\n";
  const body = { markdown: md, comments: [{ id: "c1", quote: "bold", note: "louder", createdAt: 1, resolved: false }] };
  const url = "/api/projects/demo/videos/alpha/scripts/guard";

  // node:http instead of fetch, because fetch silently drops a custom Host header.
  const rawPut = (headers) => new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: fx.port, path: url, method: "PUT",
      headers: { "Content-Type": "application/json", ...headers } }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });

  for (const [name, headers] of [
    ["no X-Clauvid", { Host: "localhost" }],
    ["foreign origin", { ...W, Host: "localhost", Origin: "https://evil.example" }],
    ["foreign origin through a tunnel", { ...W, Host: "abc.ngrok-free.app", Origin: "https://evil.example" }],
    ["bad origin", { ...W, Host: "localhost", Origin: "not a url" }],
  ]) {
    test("blocks " + name, async () => {
      const r = await rawPut(headers);
      assert.equal(r.status, 403);
      assert.equal(r.body.error, "edit-forbidden");
    });
  }

  for (const [name, headers] of [
    ["a tunnel (same origin)", { ...W, Host: "abc.ngrok-free.app", Origin: "https://abc.ngrok-free.app", "X-Forwarded-For": "1.2.3.4", "ngrok-skip-browser-warning": "1" }],
    ["a tunnel that rewrites Host", { ...W, Host: "localhost:4747", "X-Forwarded-Host": "abc.ngrok-free.app", Origin: "https://abc.ngrok-free.app" }],
    ["the LAN", { ...W, Host: "192.168.1.7:4747", Origin: "http://192.168.1.7:4747" }],
    ["no origin (curl, agents)", { ...W, Host: "example.com" }],
  ]) {
    test("allows edits from " + name, async () => {
      fs.mkdirSync(path.join(fx.dir, "demo/videos/alpha/scripts"), { recursive: true });
      fs.writeFileSync(path.join(fx.dir, "demo/videos/alpha/scripts/guard.md"), "# x\n");
      const r = await rawPut(headers);
      assert.equal(r.status, 200);
    });
  }

  test("allows local with marker", async () => {
    fs.mkdirSync(path.join(fx.dir, "demo/videos/alpha/scripts"), { recursive: true });
    fs.writeFileSync(path.join(fx.dir, "demo/videos/alpha/scripts/guard.md"), "x");
    assert.equal((await rawPut({ ...W, Host: "localhost:4747", Origin: "http://localhost:4747" })).status, 200);
    fs.rmSync(path.join(fx.dir, "demo/videos/alpha/scripts/guard.md")); fs.rmSync(path.join(fx.dir, "demo/videos/alpha/scripts/guard.comments.json"));
  });

  test("scripts: create, list, round-trip, delete with comments", async () => {
    const base = "/api/projects/demo/videos/alpha/scripts";
    assert.deepEqual(await json(base), []);
    let r = await write(base, "POST", { name: "main", title: "Black holes" });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).markdown, "# Black holes\n");
    assert.equal((await write(base, "POST", { name: "main" })).status, 409);
    assert.equal((await write(base, "POST", { name: "Bad Name" })).status, 400);
    assert.equal((await write(base + "/main", "PUT", body)).status, 200);
    const s = await json(base + "/main");
    assert.equal(s.markdown, md);
    assert.deepEqual(s.comments, body.comments);
    assert.equal(fs.readFileSync(path.join(fx.dir, "demo/videos/alpha/scripts/main.md"), "utf8"), md);
    assert.equal((await write(base + "/nope", "PUT", body)).status, 404);
    await write(base, "POST", { name: "alt" });
    assert.deepEqual((await json(base)).map((x) => x.name).sort(), ["alt", "main"]);
    const [p] = await json("/api/projects");
    const a = p.videos.find((v) => v.slug === "alpha");
    assert.equal(a.scripts, 2);
    assert.equal(a.openComments, 1);
    r = await write("/api/delete", "POST", { project: "demo", video: "alpha", dir: "scripts", name: "alt.md" });
    assert.equal(r.status, 200);
    assert.deepEqual((await json(base)).map((x) => x.name), ["main"]);
    r = await write("/api/delete", "POST", { project: "demo", video: "alpha", dir: "scripts", name: "main.md" });
    assert.equal(r.status, 200);
    assert.ok(!fs.existsSync(path.join(fx.dir, "demo/videos/alpha/scripts/main.comments.json")), "comments trashed with script");
    assert.equal((await write("/api/rename", "POST", { project: "demo", video: "alpha", dir: "scripts", name: "x.md", to: "y" })).status, 400);
  });
});

describe("create project", () => {
  test("creates folder, rejects bad or existing names, blocks cross-site", async () => {
    let r = await write("/api/projects", "POST", { slug: "new-series" });
    assert.equal(r.status, 200);
    assert.ok(fs.statSync(path.join(fx.dir, "new-series/videos")).isDirectory());
    assert.ok((await json("/api/projects")).some((p) => p.slug === "new-series"));
    assert.equal((await write("/api/projects", "POST", { slug: "new-series" })).status, 409);
    for (const slug of ["Bad Name", "../x", "", ".trash", "-x"])
      assert.equal((await write("/api/projects", "POST", { slug })).status, 400, slug);
    assert.equal((await write("/api/projects", "POST", { slug: "remote" }, { Origin: "https://evil.example" })).status, 403);
    fs.rmSync(path.join(fx.dir, "new-series"), { recursive: true });
  });
});

describe("create video", () => {
  test("creates the video's folders, rejects bad or existing names, blocks cross-site", async () => {
    let r = await write("/api/projects/demo/videos", "POST", { slug: "gamma-ray" });
    assert.equal(r.status, 200);
    for (const d of ["source", "research", "scripts", "assets", "references", "revisions", "final"])
      assert.ok(fs.statSync(path.join(fx.dir, "demo/videos/gamma-ray", d)).isDirectory(), d);
    const [p] = await json("/api/projects");
    assert.ok(p.videos.some((v) => v.slug === "gamma-ray"));
    assert.equal((await write("/api/projects/demo/videos", "POST", { slug: "gamma-ray" })).status, 409);
    assert.equal((await write("/api/projects/demo/videos", "POST", { slug: "Bad Name" })).status, 400);
    assert.equal((await write("/api/projects/nope/videos", "POST", { slug: "x" })).status, 404);
    assert.equal((await write("/api/projects/demo/videos", "POST", { slug: "y" }, { Origin: "https://evil.example" })).status, 403);
    fs.rmSync(path.join(fx.dir, "demo/videos/gamma-ray"), { recursive: true });
  });
});

describe("script names", () => {
  test("default names script, script_v2, …; rename moves comments; no clobbering", async () => {
    const base = "/api/projects/demo/videos/beta/scripts";
    const dir = path.join(fx.dir, "demo/videos/beta/scripts");
    assert.equal((await (await write(base, "POST", {})).json()).name, "script");
    assert.equal((await (await write(base, "POST", {})).json()).name, "script_v2");
    assert.equal((await (await write(base, "POST", {})).json()).name, "script_v3");
    await write(base + "/script_v2", "PUT", { markdown: "# two\n", comments: [{ id: "a", quote: "two", note: "n", createdAt: 1, resolved: false }] });
    let r = await write(base + "/script_v2/rename", "POST", { to: "Short Cut" });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).name, "short-cut");
    assert.ok(fs.existsSync(path.join(dir, "short-cut.md")) && fs.existsSync(path.join(dir, "short-cut.comments.json")));
    assert.ok(!fs.existsSync(path.join(dir, "script_v2.md")) && !fs.existsSync(path.join(dir, "script_v2.comments.json")));
    assert.equal((await write(base + "/short-cut/rename", "POST", { to: "script" })).status, 409);
    assert.equal((await write(base + "/short-cut/rename", "POST", { to: "../x" })).status, 400);
    assert.equal((await write(base + "/short-cut/rename", "POST", { to: "y" }, { Origin: "https://evil.example" })).status, 403);
    // numbering continues after the highest script, and after any takes recorded for one
    assert.equal((await (await write(base, "POST", {})).json()).name, "script_v4");
    fs.mkdirSync(path.join(fx.dir, "demo/videos/beta/assets"), { recursive: true });
    fs.writeFileSync(path.join(fx.dir, "demo/videos/beta/assets/script_v7_take1.wav"), "x");
    assert.equal((await (await write(base, "POST", {})).json()).name, "script_v8");
    fs.rmSync(path.join(fx.dir, "demo/videos/beta/assets/script_v7_take1.wav"));
    fs.rmSync(dir, { recursive: true });
  });
});

describe("upload", () => {
  const up = (name, data, to = "assets", headers = {}) =>
    get(`/api/projects/demo/videos/beta/upload?to=${to}&name=${encodeURIComponent(name)}`, { method: "POST", headers: { ...W, ...headers }, body: data });

  test("sanitises and never overwrites", async () => {
    let r = await up("My Photo.PNG", "a");
    assert.equal(r.status, 200);
    assert.equal((await r.json()).name, "my-photo.png");
    r = await up("My Photo.PNG", "b");
    assert.equal((await r.json()).name, "my-photo-2.png");
    assert.equal(fs.readFileSync(path.join(fx.dir, "demo/videos/beta/assets/my-photo.png"), "utf8"), "a");
  });

  test("references destination", async () => {
    const r = await up("notes.md", "# n", "references");
    assert.equal(r.status, 200);
    assert.ok(fs.existsSync(path.join(fx.dir, "demo/videos/beta/references/notes.md")));
  });

  test("rejects bad type, bad dest, cross-site", async () => {
    assert.equal((await up("x.exe", "a")).status, 415);
    assert.equal((await up(".env", "a")).status, 415);
    assert.equal((await up("a.png", "a", "source")).status, 400);
    assert.equal((await up("a.png", "a", "assets", { Origin: "https://evil.example" })).status, 403);
  });
});

describe("rename", () => {
  test("renames in place, keeps extension, never overwrites, blocks cross-site", async () => {
    const d = path.join(fx.dir, "demo/videos/alpha/assets");
    fs.writeFileSync(path.join(d, "script_v1.wav"), "a");
    fs.writeFileSync(path.join(d, "script_v2.wav"), "b");
    let r = await write("/api/rename", "POST", { project: "demo", video: "alpha", dir: "assets", name: "script_v1.wav", to: "Intro Take" });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).name, "intro-take.wav");
    assert.ok(fs.existsSync(path.join(d, "intro-take.wav")) && !fs.existsSync(path.join(d, "script_v1.wav")));
    r = await write("/api/rename", "POST", { project: "demo", video: "alpha", dir: "assets", name: "intro-take.wav", to: "script_v2" });
    assert.equal(r.status, 409);
    assert.equal(fs.readFileSync(path.join(d, "script_v2.wav"), "utf8"), "b");
    assert.equal((await write("/api/rename", "POST", { project: "demo", video: "alpha", dir: "assets", name: "intro-take.wav", to: "../../x" })).status, 200);
    assert.ok(fs.existsSync(path.join(d, "x.wav")), "path parts stripped, stays in assets/");
    assert.equal((await write("/api/rename", "POST", { project: "demo", video: "alpha", dir: "source", name: "index.html", to: "y" })).status, 400);
    assert.equal((await write("/api/rename", "POST", { project: "demo", video: "alpha", dir: "assets", name: "x.wav", to: "z" }, { Origin: "https://evil.example" })).status, 403);
    fs.rmSync(path.join(d, "x.wav")); fs.rmSync(path.join(d, "script_v2.wav"));
  });
});

describe("delete + trash", () => {
  test("revision → trash → restore identical", async () => {
    const f = path.join(fx.dir, "demo/videos/alpha/revisions/v01-a.mp4");
    const before = sha(f);
    let r = await write("/api/delete", "POST", { project: "demo", video: "alpha", dir: "revisions", name: "v01-a.mp4" });
    assert.equal(r.status, 200);
    assert.ok(!fs.existsSync(f));
    const [p] = await json("/api/projects");
    assert.deepEqual(p.videos.find((v) => v.slug === "alpha").revisions.map((x) => x.name), ["v02-b.mp4"]);
    const trash = await json("/api/trash");
    const item = trash.find((t) => t.name === "v01-a.mp4");
    assert.ok(item);
    assert.equal(item.kind, "file");
    r = await write("/api/trash/restore", "POST", { id: item.id });
    assert.equal(r.status, 200);
    assert.equal(sha(f), before);
  });

  test("restore refuses when original exists", async () => {
    const f = path.join(fx.dir, "demo/videos/alpha/assets/unused.wav");
    await write("/api/delete", "POST", { project: "demo", video: "alpha", dir: "assets", name: "unused.wav" });
    fs.writeFileSync(f, "new");
    const item = (await json("/api/trash")).find((t) => t.name === "unused.wav");
    assert.equal((await write("/api/trash/restore", "POST", { id: item.id })).status, 409);
  });

  test("refuses folder containing .env", async () => {
    const d = path.join(fx.dir, "demo/videos/gamma");
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, ".env"), "SECRET=1");
    const r = await write("/api/delete", "POST", { project: "demo", video: "gamma" });
    assert.equal(r.status, 409);
    assert.ok(fs.existsSync(path.join(d, ".env")));
  });

  test("cross-site delete blocked", async () => {
    const r = await write("/api/delete", "POST", { project: "demo", video: "beta" }, { Origin: "https://evil.example" });
    assert.equal(r.status, 403);
  });

  test("video and project to trash, purge all", async () => {
    let r = await write("/api/delete", "POST", { project: "demo", video: "beta" });
    assert.equal(r.status, 200);
    assert.ok(fs.readdirSync(path.join(fx.dir, "demo/.trash")).some((n) => n.endsWith("__beta")));
    fs.rmSync(path.join(fx.dir, "demo/videos/gamma"), { recursive: true });
    r = await write("/api/delete", "POST", { project: "demo" });
    assert.equal(r.status, 200);
    assert.deepEqual((await json("/api/projects")).map((p) => p.slug), ["locks"]);
    assert.ok((await json("/api/trash")).some((t) => t.kind === "project" && t.name === "demo"));
    r = await write("/api/trash/purge", "POST", { all: true });
    assert.equal(r.status, 200);
    assert.deepEqual(await json("/api/trash"), []);
    assert.deepEqual(fs.readdirSync(fx.dir).filter((n) => n !== ".trash"), ["locks"]);
  });
});

describe("locks", () => {
  const base = "/api/projects/locks/videos/g";
  const g = (rel) => path.join(fx.dir, "locks/videos/g", rel);

  test("a render's script and take are locked; comments, new takes and new versions still work", async () => {
    const list = await json(`${base}/scripts`);
    assert.deepEqual(Object.fromEntries(list.map((s) => [s.name, s.lockedBy])), { script: ["v01-x.mp4"], other: [] });
    const s = await json(`${base}/scripts/script`);
    assert.deepEqual(s.lockedBy, ["v01-x.mp4"]);

    assert.equal((await write(`${base}/scripts/script`, "PUT", { markdown: "# Changed\n", comments: [] })).status, 409);
    const c = { id: "c1", quote: "Hello", note: "nice", createdAt: 1, resolved: false };
    assert.equal((await write(`${base}/scripts/script`, "PUT", { markdown: s.markdown, comments: [c] })).status, 200);
    assert.equal((await write(`${base}/scripts/script/rename`, "POST", { to: "x" })).status, 409);
    assert.equal((await write("/api/delete", "POST", { project: "locks", video: "g", dir: "scripts", name: "script.md" })).status, 409);
    assert.equal((await write("/api/delete", "POST", { project: "locks", video: "g", dir: "assets", name: "script_take1.wav" })).status, 409);
    assert.equal((await write("/api/rename", "POST", { project: "locks", video: "g", dir: "assets", name: "script_take1.wav", to: "y" })).status, 409);
    assert.equal((await write(`${base}/scripts/other`, "PUT", { markdown: "# Free edit\n", comments: [] })).status, 200);

    const take = await get(`${base}/upload?to=assets&name=script_take2.wav`, { method: "POST", headers: W, body: fs.readFileSync(g("assets/script_take1.wav")) });
    assert.equal(take.status, 200);

    const v2 = await (await write(`${base}/scripts`, "POST", { from: "script" })).json();
    assert.equal(v2.name, "script_v2");
    assert.equal(v2.markdown, s.markdown);
    assert.deepEqual(v2.comments, []);
  });

  test("deleting the render unlocks", async () => {
    assert.equal((await write("/api/delete", "POST", { project: "locks", video: "g", dir: "revisions", name: "v01-x.mp4" })).status, 200);
    const list = await json(`${base}/scripts`);
    assert.deepEqual(list.find((s) => s.name === "script").lockedBy, []);
    assert.equal((await write(`${base}/scripts/script/rename`, "POST", { to: "renamed" })).status, 200);
  });
});

describe("companions travel with their owner", () => {
  const g = (rel) => path.join(fx.dir, "locks/videos/g", rel);
  const parts = ["revisions/v02-y.mp4", "revisions/v02-y.json", "source/renders/v02-y.mp4", "source/versions/index.v02.html"];

  test("a draft goes to Trash as one item with its note, render copy and frozen source, and comes back whole", async () => {
    const r = await write("/api/delete", "POST", { project: "locks", video: "g", dir: "revisions", name: "v02-y.mp4" });
    assert.equal(r.status, 200);
    for (const p of parts) assert.equal(fs.existsSync(g(p)), false, p);
    const item = (await json("/api/trash")).find((t) => t.name === "v02-y.mp4");
    assert.deepEqual(item.with.map((w) => w.split("/").slice(3).join("/")).sort(), parts.slice(1).sort());
    assert.ok(item.size > fs.statSync(g("assets/script_take1.wav")).size / 1e6);

    assert.equal((await write("/api/trash/restore", "POST", { id: item.id })).status, 200);
    for (const p of parts) assert.equal(fs.existsSync(g(p)), true, p);
    assert.ok(!fs.readdirSync(g(".trash")).some((n) => n.includes("v02-y")));
  });

  test("restore is all or nothing", async () => {
    await write("/api/delete", "POST", { project: "locks", video: "g", dir: "revisions", name: "v02-y.mp4" });
    fs.writeFileSync(g("revisions/v02-y.json"), "{}"); // something new took a companion's place
    const item = (await json("/api/trash")).find((t) => t.name === "v02-y.mp4");
    assert.equal((await write("/api/trash/restore", "POST", { id: item.id })).status, 409);
    assert.equal(fs.existsSync(g("revisions/v02-y.mp4")), false);
    fs.rmSync(g("revisions/v02-y.json"));
    assert.equal((await write("/api/trash/purge", "POST", { id: item.id })).status, 200);
    assert.ok(!fs.readdirSync(g(".trash")).some((n) => n.includes("v02-y")), "purge removes the bundle too");
  });

  test("a script and its comments are one Trash item", async () => {
    fs.writeFileSync(g("scripts/other.comments.json"), "[]");
    const r = await write("/api/delete", "POST", { project: "locks", video: "g", dir: "scripts", name: "other.md" });
    assert.equal(r.status, 200);
    const items = (await json("/api/trash")).filter((t) => t.video === "g" && t.dir === "scripts");
    assert.deepEqual(items.map((t) => [t.name, t.with.length]), [["other.md", 1]]);
    assert.equal((await write("/api/trash/restore", "POST", { id: items[0].id })).status, 200);
    assert.ok(fs.existsSync(g("scripts/other.comments.json")));
  });
});
