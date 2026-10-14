/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const built = new URL("../dist-electron/plugins/peerReview.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

test("peerReview: Manifest und Operationen", { skip }, () => {
  const m = load();
  assert.equal(m.manifest.id, "peerReview");
  assert.equal(m.manifest.category, "multiagent");
  for (const k of ["buildPrompt", "parseVerdict", "summarize"]) assert.equal(typeof m.operations[k], "function");
});
test("peerReview: Prompt", { skip }, () => {
  const p = load().buildPrompt({ diff: "+const a = 1;", language: "ts", focus: ["Sicherheit"] });
  assert.ok(p.includes("+const a = 1;") && p.includes("Sicherheit") && p.includes('"approved"'));
  assert.ok(load().buildPrompt({ code: "x".repeat(100), maxChars: 10 }).includes("gekürzt"));
});
test("peerReview: Verdict-Parser JSON, Fence, Text", { skip }, () => {
  const m = load();
  const j = m.parseVerdict('Hier:\n```json\n{"approved":true,"severity":"none","issues":[]}\n```');
  assert.deepEqual([j.approved, j.severity, j.issues.length], [true, "none", 0]);
  const hi = m.parseVerdict('{"approved":true,"issues":[{"severity":"high","message":"SQL-Injection","file":"a.ts","line":3}]}');
  assert.equal(hi.approved, false);
  assert.equal(hi.severity, "high");
  assert.equal(hi.issues[0].line, 3);
  assert.equal(m.parseVerdict('{"approved":true,"issues":[{"severity":"low","message":"nit"}]}').approved, true);
  const txt = m.parseVerdict("Changes requested:\n- [high] Null-Zugriff in foo\n- medium: fehlende Prüfung");
  assert.equal(txt.approved, false);
  assert.equal(txt.issues.length, 2);
  assert.equal(m.parseVerdict("LGTM").approved, true);
  const junk = m.parseVerdict("keine Ahnung");
  assert.deepEqual([junk.approved, junk.parseError], [false, true]);
});
test("peerReview: Summary", { skip }, async () => {
  const m = load();
  const v = m.parseVerdict('{"approved":false,"issues":[{"severity":"high","message":"a"},{"severity":"low","message":"b"}]}');
  assert.match(m.summarize(v), /Nicht freigegeben.*1× high/);
  assert.equal((await m.operations.summarize({})).ok, false);
});
test("peerReview: Loop wird nach Revision freigegeben", { skip }, async () => {
  const m = load();
  const loop = new m.PeerReviewLoop({
    maxRounds: 3,
    review: async (p) => (p.includes("FIXED") ? '{"approved":true,"issues":[]}' : '{"approved":false,"issues":[{"severity":"high","message":"kaputt"}]}'),
    revise: async (issues, cur) => { assert.equal(issues[0].message, "kaputt"); return cur + " FIXED"; },
  });
  const r = await loop.run("code");
  assert.equal(r.status, "approved");
  assert.equal(r.rounds.length, 2);
  assert.equal(r.output, "code FIXED");
  assert.equal(r.unresolved, false);
});
test("peerReview: Loop erschöpft Runden und Fehler werden gefangen", { skip }, async () => {
  const m = load();
  let revisions = 0;
  const r = await new m.PeerReviewLoop({ maxRounds: 2, review: async () => '{"approved":false,"issues":[{"severity":"critical","message":"x"}]}', revise: async (i, c) => { revisions++; return c; } }).run("c");
  assert.equal(r.status, "exhausted");
  assert.equal(r.unresolved, true);
  assert.equal(r.rounds.length, 2);
  assert.equal(revisions, 1);
  const e = await new m.PeerReviewLoop({ review: async () => { throw new Error("offline"); }, revise: async () => "" }).run("c");
  assert.equal(e.ok, false);
  assert.match(e.message, /offline/);
});
