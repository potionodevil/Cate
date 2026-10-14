/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const built = new URL("../dist-electron/plugins/prReviewer.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const patch = [
  "diff --git a/electron/main.ts b/electron/main.ts",
  "--- a/electron/main.ts",
  "+++ b/electron/main.ts",
  "@@ -1,2 +1,8 @@",
  " keep",
  "+// TODO: fix",
  "+console.log('x');",
  "+debugger;",
  "+const d = fs.readFileSync('a');",
  "+for (const i of ids) {",
  "+  const r = await db.query(i);",
  "+}",
  "+const k = 'AKIAABCDEFGHIJKLMNOP';",
].join("\n");

test("prReviewer: Heuristiken", { skip }, () => {
  const m = load();
  const f = m.runHeuristics(patch, [{ file: "electron/main.ts", added: 8, deleted: 0 }]);
  const rules = f.map((x) => x.rule);
  for (const r of ["todo", "console-log", "debugger", "sync-fs", "n-plus-one", "secret", "missing-tests"]) assert.ok(rules.includes(r), r);
  assert.ok(f.some((x) => x.hotspot));
  assert.ok(!JSON.stringify(f).includes("AKIAABCDEFGHIJKLMNOP"));
});
test("prReviewer: numstat, Prompt, Kürzung", { skip }, () => {
  const m = load();
  const s = m.parseNumstat("3\t1\ta.ts\n-\t-\timg.png\n");
  assert.deepEqual(s[0], { file: "a.ts", added: 3, deleted: 1 });
  assert.equal(m.truncatePatch("x".repeat(50), 10).truncated, true);
  assert.ok(m.buildReviewPrompt("main", s, [], "p", false).includes("Senior-Architekt"));
  assert.equal(m.validRef("--evil"), false);
});
test("prReviewer: Hook installieren/entfernen", { skip }, async () => {
  const m = load();
  const root = mkdtempSync(join(tmpdir(), "prr-"));
  mkdirSync(join(root, ".git", "hooks"), { recursive: true });
  const r = m.installPrePushHook(root);
  assert.equal(r.ok, true);
  assert.ok(readFileSync(r.hook, "utf8").includes("hermes-pr-reviewer"));
  assert.equal(m.installPrePushHook(root, "../outside.txt").ok, false);
  assert.equal(m.uninstallPrePushHook(root).removed, true);
  writeFileSync(join(root, ".git", "hooks", "pre-push"), "#!/bin/sh\n");
  assert.equal(m.uninstallPrePushHook(root).ok, false);
  assert.equal((await m.simulatePr(root, "--bad")).ok, false);
});
