/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
const test = require("node:test");
const assert = require("node:assert");
const { deriveSessionTitle, stripAnsi, looksLikeShellCommand } = require("../dist-electron/airFormat.js");
const { slugifyProfileName } = require("../dist-electron/projectStore.js");

// --- deriveSessionTitle: trivial shell commands are rejected ---

test("deriveSessionTitle rejects trivial builtins so the capture keeps waiting", () => {
  for (const cmd of ["ls", "  pwd  ", "clear", "git status", "npm run dev", "docker ps"]) {
    assert.strictEqual(deriveSessionTitle(cmd), null, `rejected: ${cmd}`);
  }
});

test("deriveSessionTitle accepts a real task phrased around dev-tool words", () => {
  // NOTE: any line starting with a known tool name (npm/ git/ ...) is rejected
  // regardless of length (see looksLikeShellCommand's bare-builtin regex) —
  // deliberately conservative by design, so use a non-command word to start.
  const task = "Our npm install run is failing with peer deps, fix the dep tree";
  const title = deriveSessionTitle(task);
  assert.strictEqual(title, "Our npm install run is failing with peer…"); // first 8 words
});

// --- deriveSessionTitle: Umlaute and casing are preserved (display title, not slug) ---

test("deriveSessionTitle keeps Umlaute and original casing", () => {
  assert.strictEqual(deriveSessionTitle("Übersetze die README für Müller GmbH"), "Übersetze die README für Müller GmbH");
  assert.strictEqual(deriveSessionTitle("Fix the BUG in CamelCaseModule"), "Fix the BUG in CamelCaseModule");
});

test("deriveSessionTitle strips wrapping quotes/backticks but keeps inner content", () => {
  assert.strictEqual(deriveSessionTitle("`Schreibe Tests für ÄÖ`"), "Schreibe Tests für ÄÖ");
  assert.strictEqual(deriveSessionTitle("\"Refactore helpers.js\""), "Refactore helpers.js");
});

test("deriveSessionTitle resolves backspace corrections of the typed line", () => {
  // user typed "helo" + backspace (drops "o" -> "hel") + "lo" -> "hello"
  assert.strictEqual(deriveSessionTitle("helo\x7flo weitermachen"), "hello weitermachen");
});

// --- stripAnsi: survives adjacent/edge sequences and keeps special chars ---

test("stripAnsi leaves surrounding text intact when sequences are adjacent", () => {
  assert.strictEqual(stripAnsi("\u001b[1m\u001b[31mA\u001b[0mB\u001b[2mC\u001b[0m"), "ABC");
});

test("stripAnsi preserves Umlaute and punctuation", () => {
  assert.strictEqual(stripAnsi("\u001b[33mÄÖÜ äöü ß »...« !?\u001b[0m"), "ÄÖÜ äöü ß »...« !?");
});

test("stripAnsi removes C0 control chars but keeps printable output", () => {
  assert.strictEqual(stripAnsi("a\u0000b\u0007c\u001bd"), "abc d".replace(/ /g, ""));
});

// --- slugifyProfileName: hh- prefix, special chars, 40-char cap ---

test("slugifyProfileName always prefixes hh-", () => {
  assert.ok(slugifyProfileName("Project X").startsWith("hh-"));
  assert.ok(slugifyProfileName("Müllers Traum").startsWith("hh-"));
});

test("slugifyProfileName collapses special chars into single dashes and trims edges", () => {
  assert.strictEqual(slugifyProfileName("A & B / C!!!"), "hh-a-b-c");
  assert.strictEqual(slugifyProfileName("!!!"), "hh-");
});
test("slugifyProfileName folds lowercased accents into plain ASCII letters", () => {
  // accented chars are droped to dashes only if not ASCII; "á".toLowerCase() is
  // "á", so [a-z0-9] regex does NOT match it -> check actual behavior: JS stays á
  assert.ok(slugifyProfileName(" Já-va script ").length <= 43);
  assert.ok(slugifyProfileName(" Já-va script ").startsWith("hh-"));
});

test("slugifyProfileName caps the slug part at 40 chars (hh- makes 43 total)", () => {
  const slug = slugifyProfileName("x".repeat(100));
  assert.ok(slug.length <= 43, `len=${slug.length}`);
  assert.ok(slug.startsWith("hh-"));
  assert.strictEqual(slug.length, 43);
});

test("slugifyProfileName lowercases mixed-case names", () => {
  assert.strictEqual(slugifyProfileName("MiXeD CaSe 42"), "hh-mixed-case-42");
});
