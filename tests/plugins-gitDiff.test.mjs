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

const built = new URL("../dist-electron/plugins/gitDiff.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const SAMPLE = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 111..222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,3 +1,4 @@ function x",
  " one",
  "-two",
  "+TWO",
  "+three",
  " four",
  "\\ No newline at end of file",
  "diff --git a/new.txt b/new.txt",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/new.txt",
  "@@ -0,0 +1,2 @@",
  "+x",
  "+y",
  "diff --git a/gone.txt b/gone.txt",
  "deleted file mode 100644",
  "--- a/gone.txt",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-bye",
  "diff --git a/old name.md b/new name.md",
  "similarity index 90%",
  "rename from old name.md",
  "rename to new name.md",
  "diff --git a/img.png b/img.png",
  "index 1..2 100644",
  "Binary files a/img.png and b/img.png differ",
  ""
].join("\n");

test("parseUnifiedDiff: Dateien, Status, Zaehler, Zeilennummern", { skip }, () => {
  const { parseUnifiedDiff } = load();
  const f = parseUnifiedDiff(SAMPLE);
  assert.equal(f.length, 5);
  assert.deepEqual(f.map((x) => x.status), ["modified", "added", "deleted", "renamed", "modified"]);
  assert.equal(f[0].path, "src/a.ts");
  assert.equal(f[0].additions, 2);
  assert.equal(f[0].deletions, 1);
  const lines = f[0].hunks[0].lines;
  assert.equal(f[0].hunks[0].oldStart, 1);
  assert.deepEqual(lines.map((l) => l.type), ["ctx", "del", "add", "add", "ctx"]);
  assert.deepEqual(lines.map((l) => [l.oldNo, l.newNo]), [[1, 1], [2, null], [null, 2], [null, 3], [3, 4]]);
  assert.equal(f[1].oldPath, null);
  assert.equal(f[1].additions, 2);
  assert.equal(f[2].path, "gone.txt");
  assert.equal(f[2].deletions, 1);
  assert.equal(f[3].oldPath, "old name.md");
  assert.equal(f[3].path, "new name.md");
  assert.equal(f[4].binary, true);
  assert.equal(f[4].hunks.length, 0);
});

test("parseUnifiedDiff: leere Eingabe und Inhalt mit diff-aehnlichen Zeilen", { skip }, () => {
  const { parseUnifiedDiff } = load();
  assert.deepEqual(parseUnifiedDiff(""), []);
  const f = parseUnifiedDiff("diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n--- old\n+++ new\n");
  assert.equal(f.length, 1);
  assert.equal(f[0].deletions, 1);
  assert.equal(f[0].additions, 1);
  assert.equal(f[0].hunks[0].lines[0].text, "-- old");
});

test("validateRelPath lehnt unsichere Pfade ab", { skip }, () => {
  const { validateRelPath } = load();
  const root = tmpdir();
  assert.equal(validateRelPath(root, "a/b.txt"), "a/b.txt");
  for (const bad of ["../x", "a/../../x", "/etc/passwd", "C:\\Windows", "", null, "a\0b"]) {
    assert.throws(() => validateRelPath(root, bad), undefined, String(bad));
  }
});

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
}

test("echtes Repo: working, branch, lastRound, stage, revert", { skip, timeout: 60000 }, async () => {
  const { operations } = load();
  const base = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "gitdiff-"));
  const repo = join(base, "repo");
  const appData = join(base, "appdata");
  mkdirSync(repo);
  try {
    git(repo, "init", "-q", "-b", "main");
    git(repo, "config", "user.email", "t@example.com");
    git(repo, "config", "user.name", "T");
    git(repo, "config", "commit.gpgsign", "false");
    git(repo, "config", "core.autocrlf", "false");
    writeFileSync(join(repo, "a.txt"), "one\ntwo\nthree\n");
    writeFileSync(join(repo, "b.txt"), "keep\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "init");

    const args = { projectRoot: repo, appDataDir: appData };
    let r = await operations.diff({ ...args, scope: "working" });
    assert.equal(r.ok, true);
    assert.equal(r.files.length, 0);

    const nr = await operations.diff({ projectRoot: base, scope: "working" });
    assert.equal(nr.ok, false);

    writeFileSync(join(repo, "a.txt"), "one\nTWO\nthree\n");
    writeFileSync(join(repo, "b.txt"), "keep\nmore\n");
    git(repo, "add", "b.txt");
    writeFileSync(join(repo, "c.txt"), "new1\nnew2\n");
    r = await operations.diff({ ...args, scope: "working" });
    const by = Object.fromEntries(r.files.map((f) => [f.path, f]));
    assert.deepEqual(Object.keys(by).sort(), ["a.txt", "b.txt", "c.txt"]);
    assert.equal(by["a.txt"].additions, 1);
    assert.equal(by["a.txt"].deletions, 1);
    assert.equal(by["a.txt"].unstaged, true);
    assert.equal(by["b.txt"].staged, true);
    assert.equal(by["c.txt"].status, "untracked");
    assert.equal(by["c.txt"].additions, 2);

    const st = await operations.status(args);
    assert.equal(st.ok, true);
    assert.equal(st.branch, "main");
    assert.equal(st.counts.untracked, 1);

    let lr = await operations.diff({ ...args, scope: "lastRound" });
    assert.equal(lr.hasMark, false);
    const mk = await operations.markRoundStart(args);
    assert.equal(mk.ok, true, mk.message);
    lr = await operations.diff({ ...args, scope: "lastRound" });
    assert.equal(lr.hasMark, true);
    assert.equal(lr.files.length, 0);
    writeFileSync(join(repo, "a.txt"), "one\nTWO\nthree\nfour\n");
    writeFileSync(join(repo, "d.txt"), "d\n");
    lr = await operations.diff({ ...args, scope: "lastRound" });
    assert.deepEqual(lr.files.map((f) => f.path).sort(), ["a.txt", "d.txt"]);
    assert.equal(lr.files.find((f) => f.path === "a.txt").additions, 1);
    assert.equal(git(repo, "stash", "list"), "");
    assert.equal(readFileSync(join(repo, "a.txt"), "utf8"), "one\nTWO\nthree\nfour\n");

    assert.equal((await operations.stageFile({ ...args, path: "a.txt" })).ok, true);
    assert.match(git(repo, "status", "--porcelain", "--", "a.txt"), /^M {2}a\.txt/);
    assert.equal((await operations.unstageFile({ ...args, path: "a.txt" })).ok, true);
    assert.match(git(repo, "status", "--porcelain", "--", "a.txt"), /^ ?M a\.txt/);
    assert.equal((await operations.stageAll(args)).ok, true);
    assert.equal(git(repo, "status", "--porcelain").split("\n").every((l) => !l.startsWith("?")), true);

    assert.equal((await operations.revertFile({ ...args, path: "a.txt" })).ok, true);
    assert.equal(readFileSync(join(repo, "a.txt"), "utf8"), "one\ntwo\nthree\n");
    assert.equal((await operations.revertFile({ ...args, path: "c.txt" })).ok, true);
    assert.equal(existsSync(join(repo, "c.txt")), false);
    for (const bad of ["../outside.txt", "/abs.txt"]) {
      const bad1 = await operations.revertFile({ ...args, path: bad });
      assert.equal(bad1.ok, false, bad);
    }

    git(repo, "reset", "-q", "--hard", "HEAD");
    git(repo, "clean", "-fdq");
    let br = await operations.diff({ ...args, scope: "branch" });
    assert.equal(br.ok, true);
    assert.equal(br.files.length, 0);
    git(repo, "checkout", "-q", "-b", "feature");
    writeFileSync(join(repo, "f.txt"), "feat\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "feat");
    writeFileSync(join(repo, "wt.txt"), "uncommitted\n");
    br = await operations.diff({ ...args, scope: "branch" });
    assert.equal(br.base, "main");
    assert.deepEqual(br.files.map((f) => f.path), ["f.txt"]);
    assert.equal(br.files[0].status, "added");

    writeFileSync(join(repo, "a.txt"), "changed\n");
    assert.equal((await operations.revertAll(args)).ok, true);
    assert.equal(git(repo, "status", "--porcelain"), "");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("manifest und Operationen", { skip }, () => {
  const m = load();
  assert.equal(m.manifest.id, "gitDiff");
  for (const op of ["status", "diff", "markRoundStart", "stageFile", "stageAll", "unstageFile", "revertFile", "revertAll", "refresh"]) {
    assert.equal(typeof m.operations[op], "function", op);
  }
});
