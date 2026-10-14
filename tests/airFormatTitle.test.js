/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
const test = require("node:test");
const assert = require("node:assert");
const { deriveSessionTitle, stripAnsi } = require("../dist-electron/airFormat.js");
const { slugifyProfileName } = require("../dist-electron/projectStore.js");
const { hasAnsiExport } = { hasAnsiExport: typeof stripAnsi === "function" };

// --- deriveSessionTitle: trivial shell commands are rejected -----------------

test("deriveSessionTitle rejects trivial shell commands", () => {
  assert.strictEqual(deriveSessionTitle("ls"), null);
  assert.strictEqual(deriveSessionTitle("cd .."), null);
  assert.strictEqual(deriveSessionTitle("git status"), null);
  assert.strictEqual(deriveSessionTitle("npm run dev"), null);
  assert.strictEqual(deriveSessionTitle(" pwd "), null);
});

test("deriveSessionTitle accepts a real task line, not a shell builtin", () => {
  assert.strictEqual(deriveSessionTitle("refactor the login flow"), "refactor the login flow");
});

// --- deriveSessionTitle: Umlaute / casing preserved (display title, not slug) -

test("deriveSessionTitle keeps Umlaute and casing unchanged", () => {
  assert.strictEqual(deriveSessionTitle("Fixe die ÜBERGROßE Lücke in Köln"), "Fixe die ÜBERGROßE Lücke in Köln");
  assert.strictEqual(deriveSessionTitle("Übersetzung der App-Fehlermeldung"), "Übersetzung der App-Fehlermeldung");
});

test("deriveSessionTitle strips one wrapping quote pair but keeps inner text casing", () => {
  assert.strictEqual(deriveSessionTitle('"Behebe den XY-Bug"'), "Behebe den XY-Bug");
  assert.strictEqual(deriveSessionTitle("`Erste Zeile der Sitzung`"), "Erste Zeile der Sitzung");
});

test("deriveSessionTitle returns null for empty/whitespace only lines", () => {
  assert.strictEqual(deriveSessionTitle(""), null);
  assert.strictEqual(deriveSessionTitle("   \r\n"), null);
  assert.strictEqual(deriveSessionTitle("\u001b[200~\u001b[201~"), null);
});

test("deriveSessionTitle resolves backspaces before titling", () => {
  // "helo" + backspace + "lo" => "hello" (not a builtin -> real task)
  assert.strictEqual(deriveSessionTitle("helo\x7flo world"), "hello world");
});

// --- slugifyProfileName: hh- prefix -----------------------------------------

test("slugifyProfileName prefixes every slug with hh-", () => {
  assert.strictEqual(slugifyProfileName("My Project").startsWith("hh-"), true);
  assert.ok(slugifyProfileName("").startsWith("hh-"));
});

test("slugifyProfileName lowercases and collapses special characters to dashes", () => {
  assert.strictEqual(slugifyProfileName("My Project!"), "hh-my-project");
  assert.strictEqual(slugifyProfileName("a  b/c\\d"), "hh-a-b-c-d");
  assert.strictEqual(slugifyProfileName("ÜBER Car"), "hh-uber-car");
});

test("slugifyProfileName normalizes accents so base letters survive", () => {
  assert.strictEqual(slugifyProfileName("Já-va"), "hh-ja-va");
});

test("slugifyProfileName caps the slug part at 40 chars (before the hh- prefix)", () => {
  const long = "a".repeat(80);
  const out = slugifyProfileName(long);
  assert.ok(out.startsWith("hh-"));
  assert.strictEqual(out.length, "hh-".length + 40); // hh- prefix + 40 slug chars
});

test("slugifyProfileName strips leading/trailing dashes before slicing", () => {
  assert.strictEqual(slugifyProfileName("  --x--  "), "hh-x");
  assert.strictEqual(
    slugifyProfileName("b".repeat(45) + "-" + "c".repeat(45)).endsWith("-"),
    false
  );
});

test("deriveSessionTitle ignores slash commands and caps the title at 8 words", () => {
  assert.strictEqual(deriveSessionTitle("/model gpt"), null);
  assert.strictEqual(deriveSessionTitle("Bitte fixe den Login Bug in der App heute noch dringend"), "fixe den Login Bug in der App heute…");
});
