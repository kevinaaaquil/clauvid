import test from "node:test";
import assert from "node:assert/strict";
import { parseScript, parseTranscript, build } from "./align.mjs";

const words = (s, t0 = 0) => s.split(" ").map((w, i) => ({ text: w, start: t0 + i * 0.5, end: t0 + i * 0.5 + 0.4 }));

test("scenes split on headings and page breaks; headings are not narration", () => {
  const sc = parseScript("# Title\n\nHello **big** world.\n\n---\n\n### Two\n\nSecond *part* here.\n");
  assert.deepEqual(sc.map((s) => s.name), ["Title", "Two"]);
  assert.deepEqual(sc[0].words.map((w) => [w.display, !!w.bold]), [["Hello", false], ["big", true], ["world.", false]]);
  assert.equal(sc[1].words[1].italic, true);
});

test("captions keep script spelling, follow the take, report differences", () => {
  const sc = parseScript("We talk about CDS today, friends.\n\n---\n\nFive cookies.");
  const tr = parseTranscript(words("we talk about cds now today 5 cookies"));
  const { captions, diffs } = build(sc, tr);
  assert.deepEqual(captions.map((c) => c.text), ["We", "talk", "about", "CDS", "now", "today,", "Five", "cookies."]);
  assert.deepEqual(diffs.map((d) => d.kind).sort(), ["added", "dropped"]);
  assert.equal(captions.at(-1).scene, 1);
});

test("whisper-cli json is read in seconds, punctuation tokens glue on", () => {
  const tr = parseTranscript({ transcription: [
    { text: " Hi", offsets: { from: 0, to: 400 } },
    { text: ",", offsets: { from: 400, to: 420 } },
    { text: " there", offsets: { from: 500, to: 900 } },
  ] });
  assert.deepEqual(tr.map((w) => [w.text, w.start, w.end]), [["Hi,", 0, 0.42], ["there", 0.5, 0.9]]);
});
