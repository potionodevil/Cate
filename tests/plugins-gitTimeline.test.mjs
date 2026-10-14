/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import m from "../dist-electron/plugins/gitTimeline.js";

test("gitTimeline: manifest + parseSubject", () => {
  assert.strictEqual(m.manifest.id, "gitTimeline");
  const a = m.parseSubject("feat(ui)!: add button");
  assert.deepStrictEqual([a.type, a.scope, a.breaking, a.conventional], ["feat", "ui", true, true]);
  assert.strictEqual(m.parseSubject("Fixed stuff").conventional, false);
});

test("gitTimeline: parseGitLog, heatMap, caseStyle, digest", () => {
  const raw = "\x1eaaa111\x1fAnn\x1f2026-01-02T00:00:00Z\x1ffeat(core): add x\n\nsrc/core/a-b.ts\nsrc/core/c.ts\n\x1ebbb222\x1fBob\x1f2026-01-01T00:00:00Z\x1ffix: bug\n\nsrc/ui/Button.tsx\nsrc/core/a-b.ts";
  const c = m.parseGitLog(raw);
  assert.strictEqual(c.length, 2);
  assert.deepStrictEqual(c[0].files, ["src/core/a-b.ts", "src/core/c.ts"]);
  const h = m.heatMap(c);
  assert.deepStrictEqual(h[0], { dir: "src/core", count: 2 });
  assert.strictEqual(m.caseStyle("Button.tsx"), "PascalCase");
  assert.strictEqual(m.caseStyle("a-b.ts"), "kebab-case");
  const d = m.buildDigest(c);
  assert.match(d, /Architektur- & Stil-Digest/);
  assert.match(d, /src\/core/);
});

test("gitTimeline: real repo via git log", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  try { git("init", "-q"); } catch { return; }
  git("config", "user.email", "t@t.t"); git("config", "user.name", "T"); git("config", "commit.gpgsign", "false");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "main.ts"), "1");
  git("add", "."); git("commit", "-q", "-m", "feat(core): initial");
  fs.writeFileSync(path.join(dir, "src", "main.ts"), "2");
  git("commit", "-q", "-am", "fix: tweak");
  const r = await m.operations.digest({ projectRoot: dir, limit: 10 });
  assert.strictEqual(r.ok, true);
  assert.match(r.markdown, /feat \(1\)/);
  const tl = await m.operations.timeline({ projectRoot: dir });
  assert.strictEqual(tl.commits.length, 2);
  assert.strictEqual(tl.heatMap[0].dir, "src");
  fs.rmSync(dir, { recursive: true, force: true });
  const notRepo = await m.operations.digest({ projectRoot: os.tmpdir() });
  assert.strictEqual(typeof notRepo.ok, "boolean");
});
