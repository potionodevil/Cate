/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const built = new URL("../dist-electron/plugins/voiceBridge.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

test("voiceBridge: Manifest und Operationen", { skip }, () => {
  const m = load();
  assert.equal(m.manifest.id, "voiceBridge");
  assert.equal(m.manifest.category, "ui");
  for (const k of ["detectTools", "transcribe", "interpret", "speak"]) assert.equal(typeof m.operations[k], "function");
});

test("voiceBridge: deutsche Intents", { skip }, () => {
  const m = load();
  const i = (t, o) => m.interpretUtterance(t, { lang: "de", ...o });
  assert.equal(i("Neue Sitzung")[0].intent, "newSession");
  assert.equal(i("stopp")[0].intent, "stopSession");
  assert.equal(i("Genehmigen")[0].intent, "approve");
  assert.equal(i("nein danke")[0].intent, "reject");
  assert.deepEqual(i("öffne Projekt HermesHarness")[0], { intent: "openProject", args: { name: "HermesHarness" }, confidence: 1 });
  const split = i("teile Fenster rechts")[0];
  assert.equal(split.intent, "splitPane");
  assert.equal(split.args.direction, "right");
  const focus = i("fokus auf Pane zwei")[0];
  assert.deepEqual([focus.intent, focus.args.index], ["focusPane", 2]);
  const p = i("schreibe Fixe den Login-Bug")[0];
  assert.equal(p.intent, "sendPrompt");
  assert.equal(p.args.text, "Fixe den Login-Bug");
});

test("voiceBridge: englische Intents", { skip }, () => {
  const m = load();
  const i = (t, o) => m.interpretUtterance(t, { lang: "en", ...o });
  assert.equal(i("new session")[0].intent, "newSession");
  assert.equal(i("approve")[0].intent, "approve");
  assert.equal(i("deny")[0].intent, "reject");
  assert.equal(i("open project demo")[0].args.name, "demo");
  assert.deepEqual(i("split pane down")[0].args, { direction: "down" });
  assert.equal(i("ask what changed today")[0].args.text, "what changed today");
});

test("voiceBridge: Fuzzy-Matching und Mehrfachbefehle", { skip }, () => {
  const m = load();
  assert.equal(m.interpretUtterance("neue sizung", { lang: "de" })[0].intent, "newSession");
  assert.equal(m.interpretUtterance("genehmige", { lang: "de" })[0].intent, "approve");
  assert.equal(m.interpretUtterance("aprove", { lang: "en" })[0].intent, "approve");
  const multi = m.interpretUtterance("neue Sitzung und dann stopp", { lang: "de" });
  assert.deepEqual(multi.map((x) => x.intent), ["newSession", "stopSession"]);
  assert.ok(m.levenshtein("kitten", "sitting") === 3);
});

test("voiceBridge: runCommand erfordert Freigabe und führt nichts aus", { skip }, () => {
  const m = load();
  const r = m.interpretUtterance("führe aus npm test", { lang: "de" })[0];
  assert.equal(r.intent, "runCommand");
  assert.equal(r.requiresApproval, true);
  assert.equal(r.args.command, "npm test");
  const e = m.interpretUtterance("run rm -rf build", { lang: "en" })[0];
  assert.equal(e.requiresApproval, true);
  for (const x of m.interpretUtterance("neue Sitzung", { lang: "de" })) assert.ok(!x.requiresApproval);
});

test("voiceBridge: Aktivierungswort und Fallback", { skip }, () => {
  const m = load();
  assert.deepEqual(m.interpretUtterance("neue Sitzung", { lang: "de", wakeWord: "hermes" }), []);
  assert.equal(m.interpretUtterance("Hermes, neue Sitzung", { lang: "de", wakeWord: "hermes" })[0].intent, "newSession");
  const fb = m.interpretUtterance("Wie spät ist es", { lang: "de" })[0];
  assert.equal(fb.intent, "sendPrompt");
  assert.equal(fb.fallback, true);
  assert.deepEqual(m.interpretUtterance("Wie spät ist es", { lang: "de", fallbackToPrompt: false }), []);
  assert.deepEqual(m.interpretUtterance("   "), []);
});

test("voiceBridge: detectTools mit Fake-Runner", { skip }, async () => {
  const m = load();
  const runner = async (cmd) => (cmd === "whisper-cli" || cmd === "piper" ? { code: 0, stdout: "usage", stderr: "" } : { code: -1, stdout: "", stderr: "" });
  const r = await m.detectTools({ whisperModelPath: "m.bin", piperModelPath: "p.onnx" }, runner);
  assert.equal(r.transcriber, "whisper-cli");
  assert.equal(r.tts, true);
  const none = await m.detectTools({}, async () => ({ code: -1, stdout: "", stderr: "" }));
  assert.equal(none.transcriber, null);
  assert.equal(none.tts, false);
});

test("voiceBridge: transcribe schreibt base64 ins Temp und räumt auf", { skip }, async () => {
  const m = load();
  const dir = mkdtempSync(join(tmpdir(), "voice-"));
  try {
    const calls = [];
    const runner = async (cmd, args) => {
      calls.push([cmd, ...args]);
      if (args[0] === "--help") return { code: 0, stdout: "help", stderr: "" };
      return { code: 0, stdout: "[00:00:00.000 --> 00:00:02.000]  Neue Sitzung\n", stderr: "" };
    };
    const wav = Buffer.from("RIFFxxxxWAVE").toString("base64");
    const r = await m.transcribe({ base64: wav, ext: "wav", tool: "whisper-cli", whisperModelPath: "model.bin", tempDir: dir, language: "de" }, runner);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.text, "Neue Sitzung");
    const run = calls.find((c) => c.includes("-m"));
    assert.ok(run.includes("model.bin") && run.includes("-l") && run.includes("de"));
    assert.ok(run[run.indexOf("-f") + 1].startsWith(dir.replace(/\\/g, "\\")) || run[run.indexOf("-f") + 1].includes("rec-"));
    assert.deepEqual(readdirSync(dir).filter((f) => f.startsWith("rec-")), []);
    // Pfad außerhalb des erlaubten Verzeichnisses
    const outside = join(tmpdir(), "voice-outside.wav");
    writeFileSync(outside, "x");
    const bad = await m.transcribe({ audioPath: outside, tempDir: dir }, runner);
    assert.equal(bad.ok, false);
    rmSync(outside, { force: true });
    // kein Tool
    const skipped = await m.transcribe({ base64: wav, tempDir: dir }, async () => ({ code: -1, stdout: "", stderr: "" }));
    assert.equal(skipped.skipped, true);
    assert.equal((await m.transcribe({}, runner)).ok, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("voiceBridge: speak ruft piper über Runner mit stdin", { skip }, async () => {
  const m = load();
  const dir = mkdtempSync(join(tmpdir(), "voice-"));
  try {
    const calls = [];
    const runner = async (cmd, args, o) => { calls.push({ cmd, args, input: o.input }); return { code: 0, stdout: "", stderr: "" }; };
    const r = await m.speak({ text: "Hallo Welt", piperModelPath: "de.onnx", tempDir: dir }, runner);
    assert.equal(r.ok, true);
    assert.ok(r.file.endsWith(".wav"));
    const run = calls.find((c) => c.args.includes("--model"));
    assert.equal(run.input, "Hallo Welt");
    assert.ok(run.args.includes("--output_file"));
    assert.equal((await m.speak({ text: "x", piperModelPath: "m", outputPath: join(tmpdir(), "x.wav"), tempDir: dir }, runner)).ok, false);
    assert.equal((await m.speak({ text: "x" }, runner)).ok, false);
    const none = await m.speak({ text: "x", piperModelPath: "m", tempDir: dir }, async () => ({ code: -1, stdout: "", stderr: "" }));
    assert.equal(none.skipped, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
