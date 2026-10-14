/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
const test = require("node:test");
const assert = require("node:assert");
const { compactTerminalLog, stripAnsi, applyBackspaces, deriveSessionTitle } = require("../dist-electron/airFormat.js");

test("airFormat: stripAnsi removes escape sequences and control chars", () => {
  const raw = "\u001b[31mred text\u001b[0m\u0007 plain";
  assert.strictEqual(stripAnsi(raw), "red text plain");
});

test("airFormat: compactTerminalLog collapses blank line runs", () => {
  const raw = "line1\n\n\n\nline2";
  assert.strictEqual(compactTerminalLog(raw), "line1\n\nline2");
});

test("airFormat: compactTerminalLog dedupes consecutive repeated lines", () => {
  const raw = Array(5).fill("Downloading... 10%").join("\n");
  const result = compactTerminalLog(raw);
  assert.strictEqual(result, "Downloading... 10%  [x5]");
});

test("airFormat: compactTerminalLog truncates to the tail when too long", () => {
  const raw = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
  const result = compactTerminalLog(raw, 50);
  assert.ok(result.startsWith("[... gek\u00fcrzt"));
  assert.ok(result.endsWith("line 99"));
});

test("airFormat: compactTerminalLog strips ANSI before compacting", () => {
  const raw = "\u001b[32mok\u001b[0m\n\u001b[32mok\u001b[0m";
  assert.strictEqual(compactTerminalLog(raw), "ok  [x2]");
});

test("airFormat: applyBackspaces resolves raw terminal-editor corrections", () => {
  // typed "helo", backspaced once (dropping the "o" -> "hel"), then typed "llo" -> "helllo"
  assert.strictEqual(applyBackspaces("helo\x7fllo"), "helllo");
  assert.strictEqual(applyBackspaces("abc"), "abc");
  assert.strictEqual(applyBackspaces("abc\x7f\x7f\x7f"), "");
});

test("airFormat: deriveSessionTitle turns a first-message line into a short title", () => {
  assert.strictEqual(deriveSessionTitle("fix the login bug please\r"), "fix the login bug please");
  assert.strictEqual(deriveSessionTitle("   "), null);
  assert.strictEqual(deriveSessionTitle(""), null);
  assert.strictEqual(deriveSessionTitle("\u001b[32mgreen text\u001b[0m"), "green text");
  const long = "x".repeat(100);
  const title = deriveSessionTitle(long, 60);
  assert.strictEqual(title.length, 60); // slice(0, maxChars-1) + ellipsis => 60 total
  assert.ok(title.endsWith("\u2026"));
});
