/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const built = new URL("../dist-electron/plugins/visualDiff.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

test("visualDiff: Manifest und Operationen", { skip }, () => {
  const m = load();
  assert.equal(m.manifest.id, "visualDiff");
  assert.equal(m.manifest.category, "ui");
  assert.equal(typeof m.operations.render, "function");
  assert.equal(typeof m.operations.summarizeClasses, "function");
});

test("visualDiff: Klassen-Zusammenfassung", { skip }, async () => {
  const m = load();
  const r = await m.operations.summarizeClasses({ before: '<div class="p-2 text-red-500 flex">', after: '<div className="p-4 text-red-500 flex gap-2">' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.added.sort(), ["gap-2", "p-4"]);
  assert.deepEqual(r.removed, ["p-2"]);
  assert.ok(r.unchanged.includes("flex"));
  assert.match(r.summary, /p-2 → p-4/);
  assert.equal(m.classifyClassChange("a b", "a b").summary, "Keine Klassenänderungen.");
});

test("visualDiff: sanitizeHtml entfernt Skripte und Handler", { skip }, () => {
  const m = load();
  const dirty = '<div onclick="x()"><script>alert(1)</script><a href="javascript:evil()">a</a><iframe src="x"></iframe><b>ok</b></div>';
  const clean = m.sanitizeHtml(dirty);
  assert.ok(!/script|onclick|javascript:|iframe/i.test(clean), clean);
  assert.ok(clean.includes("<b>ok</b>"));
  assert.equal(m.sanitizeHtml(dirty, true), dirty);
});

test("visualDiff: render schreibt Dateien (statisch, ohne Netzwerk)", { skip }, async () => {
  const m = load();
  const dir = mkdtempSync(join(tmpdir(), "vdiff-"));
  try {
    const r = await m.operations.render({ before: '<p class="p-2">A</p><script>alert(1)</script>', after: '<p class="p-4">B</p>', kind: "html", outDir: dir });
    assert.equal(r.ok, true);
    const before = readFileSync(r.files.before, "utf8");
    assert.ok(!before.includes("alert(1)"));
    assert.ok(!before.includes("cdn.tailwindcss.com"));
    assert.match(before, /Content-Security-Policy/);
    const cmp = readFileSync(r.files.compare, "utf8");
    assert.match(cmp, /sandbox=""/);
    assert.match(cmp, /type="range"/);
    const widget = readFileSync(r.files.widget, "utf8");
    assert.match(widget, /var\(--foreground\)/);
    assert.match(widget, /var\(--border\)/);
    assert.match(widget, /var\(--card\)/);
    assert.ok(!/margin\s*:\s*[1-9]/.test(widget));
    assert.ok(!/<body|<html/i.test(widget));
    assert.match(r.directive, /^::preview\{file=".*-widget\.html"\}$/);
    assert.equal(r.classes.removed[0], "p-2");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("visualDiff: allowNetwork bindet Tailwind-CDN und React via esm.sh", { skip }, async () => {
  const m = load();
  const dir = mkdtempSync(join(tmpdir(), "vdiff-"));
  try {
    const jsx = 'export default function A(){ return <div className="p-2">Hi</div>; }';
    const r = await m.operations.render({ before: jsx, after: jsx.replace("p-2", "p-4"), kind: "tsx", outDir: dir, allowNetwork: true, tailwindScript: "https://tw.example/play.js", esmHost: "https://esm.example" });
    assert.equal(r.ok, true);
    assert.deepEqual(r.modes, { before: "react", after: "react" });
    const after = readFileSync(r.files.after, "utf8");
    assert.match(after, /importmap/);
    assert.match(after, /https:\/\/esm\.example\/react@18/);
    assert.match(after, /https:\/\/tw\.example\/play\.js/);
    assert.match(readFileSync(r.files.compare, "utf8"), /sandbox="allow-scripts"/);
    // ohne Netzwerk: statische Näherung
    const s = await m.operations.render({ before: jsx, after: jsx, kind: "tsx", outDir: dir, name: "static" });
    assert.equal(s.modes.after, "notice");
    assert.match(readFileSync(s.files.after, "utf8"), /class="p-2"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("visualDiff: Fehler statt Exception", { skip }, async () => {
  const m = load();
  assert.equal((await m.operations.render({ before: "a" })).ok, false);
  assert.equal((await m.operations.render({ before: "a", after: "b", outDir: "relativ/pfad" })).ok, false);
  assert.equal((await m.operations.render(undefined)).ok, false);
});
