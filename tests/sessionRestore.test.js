/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Regression tests for "Kontext wird nach Neustart nicht geladen".
 */
const test = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { compactTerminalLog, mergeRestoredContext, buildRestoreContext } = require("../dist-electron/airFormat.js");

const RULE = "─".repeat(180) + " …";
const PAD = " ".repeat(200) + "…";

test("compact: TUI chrome (rules, padding-only lines) never eats the history cap", () => {
  let raw = "● Frage: baue Feature X\n";
  for (let i = 0; i < 400; i++) raw += RULE + "\n" + PAD + "\nhh-p ❯ Type / to browse commands, or Ctrl+P for the palette\n";
  raw += "● Antwort: Feature X ist fertig\n";
  const out = compactTerminalLog(raw);
  assert.ok(out.includes("Frage: baue Feature X"), "early user turn must survive");
  assert.ok(out.includes("Antwort: Feature X ist fertig"));
  assert.ok(!out.includes("────────"), "decorative rules are dropped");
  assert.ok(out.length < 1500, `expected small output, got ${out.length}`);
});

test("compact: padded lines are trimmed and whitespace runs collapsed", () => {
  const out = compactTerminalLog("hallo" + " ".repeat(120) + "welt   \n");
  assert.strictEqual(out, "hallo welt");
});

test("compact: non-adjacent repeats of the same long TUI status line are folded", () => {
  const status = "hh-p ❯ Type / to browse commands, or Ctrl+P for the palette";
  const raw = [status, "real output A", status, "real output B", status].join("\n");
  const out = compactTerminalLog(raw);
  assert.strictEqual(out.split(status).length - 1, 1);
  assert.ok(out.includes("real output A") && out.includes("real output B"));
});

test("compact: short repeated lines (e.g. closing braces) are kept", () => {
  const out = compactTerminalLog("}\nfoo();\n}\nbar();\n}");
  assert.strictEqual(out.split("}").length - 1, 3);
});

test("mergeRestoredContext keeps old history in front of the new process output", () => {
  const merged = mergeRestoredContext("ALT: erste Runde", "NEU: zweite Runde");
  assert.ok(merged.indexOf("ALT: erste Runde") < merged.indexOf("NEU: zweite Runde"));
  assert.strictEqual(mergeRestoredContext("", "nur neu"), "nur neu");
  assert.strictEqual(mergeRestoredContext("nur alt", ""), "nur alt");
});

test("mergeRestoredContext keeps the tail when over the cap and never grows past it", () => {
  const merged = mergeRestoredContext("a".repeat(5000), "NEU-ENDE", 1000);
  assert.ok(merged.length <= 1100);
  assert.ok(merged.endsWith("NEU-ENDE"));
});

test("buildRestoreContext caps size for the command line and cuts on a line boundary", () => {
  const lines = Array.from({ length: 2000 }, (_, i) => `zeile ${i} ${"x".repeat(30)}`);
  const out = buildRestoreContext(lines.join("\n"), 8000);
  assert.ok(out.length <= 8200, `got ${out.length}`);
  assert.ok(out.endsWith("zeile 1999 " + "x".repeat(30)));
  assert.ok(!/^zeile \d+ x{0,29}$/m.test(out.split("\n").slice(1).join("\n")), "no half-cut line");
});

test("buildRestoreContext drops pane markers and the old truncation notice", () => {
  const out = buildRestoreContext("[... gekürzt, zeige letzte 20000 von 95863 Zeichen ...]\n--- Pane abc ---\nhallo");
  assert.ok(!out.includes("Pane abc"));
  assert.ok(!out.includes("gekürzt, zeige letzte 20000"));
  assert.ok(out.includes("hallo"));
});

test("SessionManager carries restored history into later checkpoints/finalize", () => {
  const manager = readFileSync(require("node:path").join(__dirname, "../electron/sessionManager.ts"), "utf8");
  assert.match(manager, /mergeRestoredContext\(/);
  assert.match(manager, /restoredContext\s*=\s*new Map/);
  // reattach must load the previous .air before the new process can overwrite it
  assert.match(manager, /reattachSession[\s\S]*?restoredContext\.set\(/);
});

test("reattach is idempotent: live session returns its pane, revive updates the row", () => {
  const manager = readFileSync(require("node:path").join(__dirname, "../electron/sessionManager.ts"), "utf8");
  assert.match(manager, /if \(existing && livePane\) return \{ ok: true, sessionId, paneId: livePane \}/);
  assert.match(manager, /reviveSessionRow\(sessionId, session\.paneIds\)/);
  assert.ok(!/reattachSession[\s\S]{0,3000}createSession\(\{/.test(manager.slice(manager.indexOf("reattachSession(\n"), manager.indexOf("adoptLive("))), "reattach must not INSERT a row");
});

test("snapshots persist preset/profile/model/resume so a restore works without SQLite", () => {
  const snap = readFileSync(require("node:path").join(__dirname, "../electron/sessionSnapshot.ts"), "utf8");
  assert.match(snap, /resume: !!record\.resume/);
  assert.match(snap, /resume: !!snap\.resume/);
  assert.match(snap, /presetId: snap\.presetId \?\? null/);
});

test("finalize keeps pointing at an existing .air when the new backlog is empty", () => {
  const manager = readFileSync(require("node:path").join(__dirname, "../electron/sessionManager.ts"), "utf8");
  assert.match(manager, /!contextPath && existsSync\(contextPath0\)/);
});
