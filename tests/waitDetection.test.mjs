/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert";
import {
  WAIT_PROMPT_PATTERNS,
  WAIT_SILENCE_MS,
  stripAnsi,
  tailOfChunk,
  looksLikeWaitPrompt,
  evalWaitState
} from "../src/waitDetection.mjs";

test("stripAnsi entfernt Farb- und Steuersequenzen", () => {
  assert.strictEqual(stripAnsi("\x1b[1;31mrot\x1b[0m normal"), "rot normal");
  assert.strictEqual(stripAnsi("\x1b[2K\x1b[1G> prompt"), "> prompt");
  // OSC-Sequenz (z. B. Fenstertitel) bis BEL bzw. ESC \\
  assert.strictEqual(stripAnsi("\x1b]0;titel\x07text"), "text");
  assert.strictEqual(stripAnsi("\x1b]8;;https://x\x1b\\link\x1b]8;;\x1b\\"), "link");
  assert.strictEqual(stripAnsi("ohne codes"), "ohne codes");
});

test("tailOfChunk nimmt die letzte nicht-leere Zeile", () => {
  assert.strictEqual(tailOfChunk("erste\nzweite\n"), "zweite");
  assert.strictEqual(tailOfChunk("arbeitet…\r\n\r\n> [Y/n] Continue?\r\n"), "> [Y/n] Continue?");
  assert.strictEqual(tailOfChunk("\x1b[32mok\x1b[0m\n\n"), "ok");
});

test("tailOfChunk überlebt leere und CRLF-Chunks", () => {
  assert.strictEqual(tailOfChunk(""), "");
  assert.strictEqual(tailOfChunk("\r\n\r\n"), "");
  assert.strictEqual(tailOfChunk(null), "");
  assert.strictEqual(tailOfChunk(undefined), "");
});

test("tailOfChunk kürzt auf 120 Zeichen", () => {
  const long = "x".repeat(300);
  assert.strictEqual(tailOfChunk(long).length, 120);
});

test("looksLikeWaitPrompt erkennt typische Prompts", () => {
  assert.strictEqual(looksLikeWaitPrompt("> [Y/n] Continue?"), true);
  assert.strictEqual(looksLikeWaitPrompt("Apply changes? [y/N]"), true);
  assert.strictEqual(looksLikeWaitPrompt("forbid proceed (y/n)"), true);
  assert.strictEqual(looksLikeWaitPrompt("Überschreiben? [J/n]"), true);
  assert.strictEqual(looksLikeWaitPrompt("Do you want to allow this?"), true);
  assert.strictEqual(looksLikeWaitPrompt("Are you sure you want to quit?"), true);
  assert.strictEqual(looksLikeWaitPrompt("press enter to continue"), true);
  assert.strictEqual(looksLikeWaitPrompt("Weiter mit Enter …"), true);
  assert.strictEqual(looksLikeWaitPrompt("Drücke Enter zum Fortfahren"), true);
  assert.strictEqual(looksLikeWaitPrompt("Bitte Bestätigen Sie die Auswahl"), true);
});

test("looksLikeWaitPrompt ignoriert normale Ausgabe", () => {
  assert.strictEqual(looksLikeWaitPrompt("npm run build"), false);
  assert.strictEqual(looksLikeWaitPrompt(">"), false);
  assert.strictEqual(looksLikeWaitPrompt("$ git status"), false);
  assert.strictEqual(looksLikeWaitPrompt(""), false);
});

test("evalWaitState: working, solange kein Prompt gesehen wurde", () => {
  assert.strictEqual(evalWaitState({ busy: true, waitPromptSeen: false, silenceMs: 99999 }), "working");
  assert.strictEqual(evalWaitState({ busy: true, waitPromptSeen: false, silenceMs: 0 }), "working");
});

test("evalWaitState: waiting erst ab der Stille-Schwelle", () => {
  assert.strictEqual(evalWaitState({ busy: true, waitPromptSeen: true, silenceMs: WAIT_SILENCE_MS - 1 }), "working");
  assert.strictEqual(evalWaitState({ busy: true, waitPromptSeen: true, silenceMs: WAIT_SILENCE_MS }), "waiting");
  assert.strictEqual(evalWaitState({ busy: true, waitPromptSeen: true, silenceMs: WAIT_SILENCE_MS + 5000 }), "waiting");
});

test("evalWaitState: ready, wenn nicht busy", () => {
  assert.strictEqual(evalWaitState({ busy: false, waitPromptSeen: true, silenceMs: 99999 }), "ready");
  assert.strictEqual(evalWaitState({ busy: false, waitPromptSeen: false, silenceMs: 0 }), "ready");
});

test("evalWaitState: neue Daten nach dem Warten machen es wieder zu working", () => {
  // Neue Ausgabe angekommen -> silence 0 und Prompt-Merker zurückgesetzt
  assert.strictEqual(evalWaitState({ busy: true, waitPromptSeen: false, silenceMs: 0 }), "working");
  // Prompt noch gemerkt, aber eben frische Daten (Stille < Schwelle) -> working
  assert.strictEqual(evalWaitState({ busy: true, waitPromptSeen: true, silenceMs: 100 }), "working");
});

test("Pattern-Liste bleibt case-insensitiv abgedeckt", () => {
  assert.ok(WAIT_PROMPT_PATTERNS.length >= 13);
  assert.strictEqual(looksLikeWaitPrompt("CONTINUE?"), true);
  assert.strictEqual(looksLikeWaitPrompt("[y/n]"), true);
});
