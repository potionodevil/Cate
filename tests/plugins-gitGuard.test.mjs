/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const built = new URL("../dist-electron/plugins/gitGuard.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

function entry(path, x, y) {
  return { path, oldPath: null, x, y };
}

test("manifest und Operationen", { skip }, () => {
  const m = load();
  assert.equal(m.manifest.id, "gitGuard");
  assert.ok(Array.isArray(m.manifest.configFields) && m.manifest.configFields.length > 0);
  for (const op of ["tick", "runNow", "status"]) assert.equal(typeof m.operations[op], "function", op);
});

test("isExcluded: Name und Ordner, Groß-/Kleinschreibung", { skip }, () => {
  const { isExcluded } = load();
  const cfg = { excludeProjects: ["Scratch", " old-repo "] };
  assert.equal(isExcluded({ name: "scratch", folder: "/x/y" }, cfg), true);
  assert.equal(isExcluded({ name: "Foo", folder: "/x/old-repo" }, cfg), true);
  assert.equal(isExcluded({ name: "Foo", folder: "/x/y" }, cfg), false);
  assert.equal(isExcluded({ name: "Foo", folder: "/x/y" }, {}), false);
});

test("isDue: Intervallberechnung", { skip }, () => {
  const { isDue } = load();
  const now = Date.now();
  assert.equal(isDue(undefined, 30, now), true);
  assert.equal(isDue(new Date(now - 29 * 60_000).toISOString(), 30, now), false);
  assert.equal(isDue(new Date(now - 31 * 60_000).toISOString(), 30, now), true);
  assert.equal(isDue("kein-datum", 30, now), true);
});

test("classifyType: docs/test/deps/feat/chore", { skip }, () => {
  const { classifyType } = load();
  assert.equal(classifyType([entry("README.md", "M", " ")]), "docs");
  assert.equal(classifyType([entry("docs/guide.txt", "M", " ")]), "docs");
  assert.equal(classifyType([entry("tests/x.test.ts", "M", " ")]), "test");
  assert.equal(classifyType([entry("package-lock.json", "M", " ")]), "chore(deps)");
  assert.equal(classifyType([entry("src/new.ts", "?", "?"), entry("src/new2.ts", "?", "?")]), "feat");
  assert.equal(classifyType([entry("src/old.ts", "D", " ")]), "chore");
  assert.equal(classifyType([entry("src/a.ts", "M", " ")]), "chore");
});

test("buildCommitMessage: conventional vs. simple, Kürzung", { skip }, () => {
  const { buildCommitMessage } = load();
  const now = new Date(2026, 0, 1, 12, 0, 0);
  const entries = [entry("src/a.ts", "?", "?"), entry("src/b.ts", "?", "?")];
  const conv = buildCommitMessage(entries, "conventional", now);
  assert.match(conv, /^feat: automatischer Commit \(2 Dateien\)/);
  assert.match(conv, /GitGuard am/);
  const simple = buildCommitMessage(entries, "simple", now);
  assert.match(simple, /^Auto-Commit: 2 Dateien aktualisiert/);
  const many = Array.from({ length: 20 }, (_, i) => entry(`f${i}.ts`, "M", " "));
  const msg = buildCommitMessage(many, "conventional", now);
  assert.match(msg, /und 8 weitere/);
});

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
}

function initRepo(repo) {
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "T");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "config", "core.autocrlf", "false");
  writeFileSync(join(repo, "a.txt"), "one\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "init");
}

test("echtes Repo: runNow committet lokal ohne Remote", { skip, timeout: 60000 }, async () => {
  const { operations } = load();
  const base = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "gitguard-"));
  const repo = join(base, "repo");
  const appData = join(base, "appdata");
  try {
    initRepo(repo);
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    writeFileSync(join(repo, "new.txt"), "fresh\n");

    const r = await operations.runNow({ projectRoot: repo, appDataDir: appData, projectName: "Demo" });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.action, "committed");
    assert.ok(r.sha);
    assert.equal(r.pushed, false); // kein Remote konfiguriert
    assert.equal(git(repo, "status", "--porcelain"), "");

    const st = await operations.status({ projectRoot: repo, appDataDir: appData });
    assert.equal(st.ok, true);
    assert.equal(st.project.lastCommitSha, r.sha);
    assert.equal(st.log.length, 1);
    assert.equal(st.log[0].action, "committed");

    // Keine weiteren Änderungen -> zweiter Lauf überspringt.
    const r2 = await operations.runNow({ projectRoot: repo, appDataDir: appData });
    assert.equal(r2.action, "skipped");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("echtes Repo: dryRun committet nicht, branchAllowlist/excludeProjects übersprungen", { skip, timeout: 60000 }, async () => {
  const { operations } = load();
  const base = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "gitguard-"));
  const repo = join(base, "repo");
  const appData = join(base, "appdata");
  try {
    initRepo(repo);
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");

    const dry = await operations.runNow({ projectRoot: repo, appDataDir: appData, dryRun: true });
    assert.equal(dry.action, "wouldCommit");
    assert.notEqual(git(repo, "status", "--porcelain"), "");

    const allow = await operations.runNow({ projectRoot: repo, appDataDir: appData, branchAllowlist: ["other-branch"] });
    assert.equal(allow.action, "skipped");
    assert.match(allow.message, /Allowlist/);

    const tick = await operations.tick({
      projects: [{ id: "p1", name: "Scratch", folder: repo }],
      appDataDir: appData,
      excludeProjects: ["Scratch"]
    });
    assert.equal(tick.ok, true);
    assert.equal(tick.ran, 0);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("tick: respektiert gespeichertes Intervall (kein doppelter Lauf)", { skip, timeout: 60000 }, async () => {
  const { operations } = load();
  const base = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "gitguard-"));
  const repo = join(base, "repo");
  const appData = join(base, "appdata");
  try {
    initRepo(repo);
    writeFileSync(join(repo, "a.txt"), "changed\n");

    const projects = [{ id: "p1", name: "Demo", folder: repo }];
    const first = await operations.tick({ projects, appDataDir: appData, intervalMinutes: 30 });
    assert.equal(first.ran, 1);
    assert.equal(first.results[0].action, "committed");

    writeFileSync(join(repo, "a.txt"), "changed again\n");
    const second = await operations.tick({ projects, appDataDir: appData, intervalMinutes: 30 });
    assert.equal(second.ran, 0, "zweiter Tick innerhalb des Intervalls darf nicht erneut laufen");
    assert.notEqual(git(repo, "status", "--porcelain"), "");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
