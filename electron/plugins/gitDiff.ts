/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export const manifest = {
  id: "gitDiff",
  name: "Git Diff",
  version: "1.0.0",
  description: "Zeigt Git-Änderungen (nicht committet, Branch, letzte Runde) und erlaubt Stage/Revert pro Datei.",
};

/* ---------- Typen ---------- */

export type DiffScope = "working" | "branch" | "lastRound";
export type FileStatus = "modified" | "added" | "deleted" | "renamed" | "untracked";

export interface DiffLine {
  type: "add" | "del" | "ctx";
  oldNo: number | null;
  newNo: number | null;
  text: string;
}
export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}
export interface DiffFile {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  hunks: DiffHunk[];
  /** Nur Scope "working": Datei hat gestagte bzw. ungestagte Anteile. */
  staged?: boolean;
  unstaged?: boolean;
  /** Inhalt dieser Datei wurde gekürzt. */
  truncated?: boolean;
}

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const MAX_DIFF_BYTES = 4 * 1024 * 1024;
const MAX_UNTRACKED_FILES = 200;
const MAX_UNTRACKED_BYTES = 200 * 1024;
const GIT_TIMEOUT = 20_000;

/* ---------- Parser (rein) ---------- */

function unquote(p: string): string {
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) {
    return p
      .slice(1, -1)
      .replace(/\\(["\\])/g, "$1")
      .replace(/\\t/g, "\t")
      .replace(/\\n/g, "\n");
  }
  return p;
}

function splitDiffGitHeader(rest: string): { a: string; b: string } {
  // "a/X b/X": bei gleichem Pfad exakt halbierbar (auch mit Leerzeichen im Namen)
  if (rest.startsWith("a/") && !rest.startsWith('"')) {
    const n = (rest.length - 4) / 2;
    if (Number.isInteger(n) && n > 0) {
      const a = rest.slice(2, 2 + n);
      const sep = rest.slice(2 + n, 2 + n + 3);
      const b = rest.slice(2 + n + 3);
      if (sep === " b/" && a === b) return { a, b };
    }
  }
  const m = /^(?:"a\/(.+?)"|a\/(.+?)) (?:"b\/(.+)"|b\/(.+))$/.exec(rest);
  if (m) return { a: unquote(m[1] ?? m[2] ?? ""), b: unquote(m[3] ?? m[4] ?? "") };
  return { a: rest, b: rest };
}

export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  if (!text) return files;
  const lines = text.split("\n");
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  let sawRename = false;

  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i];
    if (raw.endsWith("\r")) raw = raw.slice(0, -1);

    if (raw.startsWith("diff --git ")) {
      const { a, b } = splitDiffGitHeader(raw.slice("diff --git ".length));
      file = { path: b, oldPath: a === b ? null : a, status: "modified", additions: 0, deletions: 0, binary: false, hunks: [] };
      files.push(file);
      hunk = null;
      sawRename = false;
      continue;
    }
    if (!file) continue;

    if (!hunk) {
      if (raw.startsWith("new file mode")) file.status = "added";
      else if (raw.startsWith("deleted file mode")) file.status = "deleted";
      else if (raw.startsWith("rename from ")) { file.oldPath = unquote(raw.slice(12)); file.status = "renamed"; sawRename = true; }
      else if (raw.startsWith("rename to ")) { file.path = unquote(raw.slice(10)); file.status = "renamed"; sawRename = true; }
      else if (raw.startsWith("Binary files ") || raw.startsWith("GIT binary patch")) file.binary = true;
      else if (raw.startsWith("--- ")) {
        const p = unquote(raw.slice(4).trim());
        if (p !== "/dev/null" && !sawRename) file.oldPath = file.status === "added" ? null : p.replace(/^a\//, "");
      } else if (raw.startsWith("+++ ")) {
        const p = unquote(raw.slice(4).trim());
        if (p !== "/dev/null") file.path = p.replace(/^b\//, "");
        else if (file.oldPath) file.path = file.oldPath;
      }
    }

    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (h && raw.startsWith("@@ ")) {
      oldNo = Number(h[1]);
      newNo = Number(h[2]);
      hunk = { header: raw, oldStart: oldNo, newStart: newNo, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;

    const c = raw[0];
    if (c === "+") {
      hunk.lines.push({ type: "add", oldNo: null, newNo: newNo++, text: raw.slice(1) });
      file.additions++;
    } else if (c === "-") {
      hunk.lines.push({ type: "del", oldNo: oldNo++, newNo: null, text: raw.slice(1) });
      file.deletions++;
    } else if (c === " ") {
      hunk.lines.push({ type: "ctx", oldNo: oldNo++, newNo: newNo++, text: raw.slice(1) });
    } else if (c === "\\") {
      continue; // "\ No newline at end of file"
    } else if (raw === "" && i < lines.length - 1) {
      hunk.lines.push({ type: "ctx", oldNo: oldNo++, newNo: newNo++, text: "" });
    }
  }
  // oldPath nur behalten, wenn es sich wirklich unterscheidet
  for (const f of files) if (f.oldPath === f.path) f.oldPath = null;
  return files;
}

/* ---------- Git-Helfer ---------- */

interface RunResult { code: number; stdout: string; stderr: string; truncated: boolean }

function run(cwd: string, args: string[], opts: { maxBuffer?: number; okCodes?: number[]; timeout?: number } = {}): Promise<RunResult> {
  const maxBuffer = opts.maxBuffer ?? 8 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-c", "core.quotepath=false", "--literal-pathspecs", ...args],
      { cwd, timeout: opts.timeout ?? GIT_TIMEOUT, windowsHide: true, maxBuffer, encoding: "utf8" },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
        if (!e) return resolve({ code: 0, stdout: String(stdout), stderr: String(stderr), truncated: false });
        if (e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
          return resolve({ code: 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), truncated: true });
        }
        if (typeof e.code === "number" && (opts.okCodes ?? []).includes(e.code)) {
          return resolve({ code: e.code, stdout: String(stdout), stderr: String(stderr), truncated: false });
        }
        const detail = String(stderr || "").trim() || (e.killed ? "Zeitüberschreitung" : e.message);
        reject(new Error(detail));
      }
    );
  });
}

class GitDiffError extends Error {}

function fail(message: string): never {
  throw new GitDiffError(message);
}

function samePath(a: string, b: string): boolean {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === "win32" ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Validiert einen vom Renderer gelieferten Pfad: relativ, ohne "..", innerhalb von root. Liefert Pfad mit "/". */
export function validateRelPath(root: string, p: unknown): string {
  if (typeof p !== "string" || !p.trim()) fail("Ungültiger Dateipfad.");
  if (p.includes("\0")) fail("Ungültiger Dateipfad.");
  if (path.isAbsolute(p) || /^[A-Za-z]:/.test(p) || p.startsWith("/") || p.startsWith("\\")) fail("Absolute Pfade sind nicht erlaubt.");
  const norm = p.replace(/\\/g, "/");
  if (norm.split("/").some((seg) => seg === "..")) fail("Pfad liegt außerhalb des Projekts.");
  if (!isInside(root, path.resolve(root, norm))) fail("Pfad liegt außerhalb des Projekts.");
  return norm.replace(/^\.\//, "");
}

async function resolveRepo(args: any, mutating: boolean): Promise<string> {
  const root = typeof args?.projectRoot === "string" ? args.projectRoot.trim() : "";
  if (!root) fail("Kein Projektordner angegeben.");
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail("Projektordner existiert nicht.");
  let top: string;
  try {
    top = (await run(root, ["rev-parse", "--show-toplevel"])).stdout.trim();
  } catch {
    fail("Kein Git-Repository.");
  }
  if (!top) fail("Kein Git-Repository.");
  if (mutating && !samePath(top, root)) fail("Der Projektordner ist nicht das Wurzelverzeichnis des Repositories.");
  return mutating ? root : top;
}

async function hasHead(root: string): Promise<boolean> {
  try {
    await run(root, ["rev-parse", "--verify", "-q", "HEAD^{commit}"]);
    return true;
  } catch {
    return false;
  }
}

async function revParse(root: string, ref: string): Promise<string | null> {
  try {
    const out = (await run(root, ["rev-parse", "--verify", "-q", `${ref}^{commit}`])).stdout.trim();
    return out || null;
  } catch {
    return null;
  }
}

export async function detectDefaultBranch(root: string): Promise<string | null> {
  try {
    const out = (await run(root, ["symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD"])).stdout.trim();
    if (out && (await revParse(root, out))) return out;
  } catch { /* weiter */ }
  for (const c of ["origin/main", "origin/master", "main", "master", "develop", "trunk"]) {
    if (await revParse(root, c)) return c;
  }
  return null;
}

interface StatusEntry { path: string; oldPath: string | null; x: string; y: string }

export function parsePorcelainZ(out: string): StatusEntry[] {
  const parts = out.split("\0");
  const entries: StatusEntry[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.length < 4) continue;
    const x = p[0];
    const y = p[1];
    const file = p.slice(3);
    let oldPath: string | null = null;
    if (x === "R" || x === "C" || y === "R" || y === "C") oldPath = parts[++i] ?? null;
    entries.push({ path: file, oldPath, x, y });
  }
  return entries;
}

async function statusEntries(root: string): Promise<StatusEntry[]> {
  const r = await run(root, ["status", "--porcelain=v1", "-z", "-uall"], { maxBuffer: 16 * 1024 * 1024 });
  return parsePorcelainZ(r.stdout);
}

function syntheticNewFileDiff(rel: string, content: string): string {
  const body = content.split("\n");
  if (body.length && body[body.length - 1] === "") body.pop();
  const head = `diff --git a/${rel} b/${rel}\nnew file mode 100644\n--- /dev/null\n+++ b/${rel}\n`;
  if (!body.length) return head;
  return `${head}@@ -0,0 +1,${body.length} @@\n${body.map((l) => `+${l}`).join("\n")}\n`;
}

function untrackedFileToDiff(root: string, rel: string): DiffFile | null {
  try {
    const abs = path.resolve(root, rel);
    if (!isInside(root, abs)) return null;
    const st = fs.statSync(abs);
    if (!st.isFile()) return null;
    const fd = fs.openSync(abs, "r");
    let buf: Buffer;
    try {
      buf = Buffer.alloc(Math.min(st.size, MAX_UNTRACKED_BYTES));
      fs.readSync(fd, buf, 0, buf.length, 0);
    } finally {
      fs.closeSync(fd);
    }
    const binary = buf.subarray(0, 8000).includes(0);
    if (binary) {
      return { path: rel, oldPath: null, status: "untracked", additions: 0, deletions: 0, binary: true, hunks: [] };
    }
    const f = parseUnifiedDiff(syntheticNewFileDiff(rel, buf.toString("utf8")))[0];
    if (!f) return null;
    f.status = "untracked";
    f.path = rel;
    if (st.size > MAX_UNTRACKED_BYTES) f.truncated = true;
    return f;
  } catch {
    return null;
  }
}

async function listUntracked(root: string): Promise<string[]> {
  const r = await run(root, ["ls-files", "--others", "--exclude-standard", "-z"], { maxBuffer: 16 * 1024 * 1024 });
  return r.stdout.split("\0").filter((p) => p && !p.endsWith("/"));
}

function cutAtLine(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf("\n", max);
  return text.slice(0, cut > 0 ? cut : max);
}

async function trackedDiff(root: string, diffArgs: string[]): Promise<{ files: DiffFile[]; truncated: boolean }> {
  const r = await run(root, ["diff", "--no-color", "--no-ext-diff", "-M", "--no-textconv", ...diffArgs], { maxBuffer: MAX_DIFF_BYTES });
  const truncated = r.truncated || r.stdout.length > MAX_DIFF_BYTES;
  const text = truncated ? cutAtLine(r.stdout, MAX_DIFF_BYTES) : r.stdout;
  return { files: parseUnifiedDiff(text), truncated };
}

function totals(files: DiffFile[]) {
  return {
    files: files.length,
    additions: files.reduce((n, f) => n + f.additions, 0),
    deletions: files.reduce((n, f) => n + f.deletions, 0),
  };
}

/* ---------- Runden-Marke ---------- */

interface RoundMark { head: string | null; snapshot: string; untracked: string[]; at: string }

function roundsFile(appDataDir: unknown): string {
  if (typeof appDataDir !== "string" || !appDataDir.trim()) fail("appDataDir fehlt.");
  return path.join(appDataDir, "git-diff-rounds.json");
}
function roundKey(root: string): string {
  const k = path.resolve(root);
  return process.platform === "win32" ? k.toLowerCase() : k;
}
function readRounds(file: string): Record<string, RoundMark> {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

/**
 * Merkt den Zustand zu Rundenbeginn: HEAD plus Snapshot des Arbeitsbaums
 * (`git stash create`, ohne Stash-Eintrag, ohne Arbeitsbaum zu verändern)
 * und die Liste bereits unversionierter Dateien.
 */
export async function markRoundStart(projectRoot: string, appDataDir: string): Promise<{ ok: boolean; message: string; head?: string | null; snapshot?: string }> {
  try {
    const root = await resolveRepo({ projectRoot }, false);
    const file = roundsFile(appDataDir);
    const head = (await hasHead(root)) ? (await run(root, ["rev-parse", "HEAD"])).stdout.trim() : null;
    let snapshot = head ?? EMPTY_TREE;
    if (head) {
      const snap = (await run(root, ["stash", "create"])).stdout.trim();
      if (snap) snapshot = snap;
    }
    const untracked = await listUntracked(root);
    const rounds = readRounds(file);
    rounds[roundKey(projectRoot)] = { head, snapshot, untracked, at: new Date().toISOString() };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(rounds, null, 2), "utf8");
    return { ok: true, message: "Rundenstart markiert.", head, snapshot };
  } catch (e) {
    return errResult(e);
  }
}

/* ---------- Operationen ---------- */

function errResult(e: unknown): { ok: false; message: string } {
  if (e instanceof GitDiffError) return { ok: false, message: e.message };
  const msg = e instanceof Error ? e.message : String(e);
  return { ok: false, message: msg || "Git-Operation fehlgeschlagen." };
}

async function workingFiles(root: string): Promise<{ files: DiffFile[]; truncated: boolean; hasHead: boolean }> {
  const head = await hasHead(root);
  const base = head ? "HEAD" : EMPTY_TREE;
  const tracked = await trackedDiff(root, [base]);
  const entries = await statusEntries(root);
  const byPath = new Map(entries.map((e) => [e.path, e]));
  let truncated = tracked.truncated;
  const files = tracked.files;
  for (const f of files) {
    const e = byPath.get(f.path);
    if (e) {
      f.staged = e.x !== " " && e.x !== "?" && e.x !== "!";
      f.unstaged = e.y !== " " && e.y !== "?" && e.y !== "!";
    }
  }
  const untracked = entries.filter((e) => e.x === "?" && e.y === "?").map((e) => e.path);
  if (untracked.length > MAX_UNTRACKED_FILES) truncated = true;
  for (const rel of untracked.slice(0, MAX_UNTRACKED_FILES)) {
    const f = untrackedFileToDiff(root, rel);
    if (f) { f.staged = false; f.unstaged = true; files.push(f); }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, truncated, hasHead: head };
}

async function opDiff(args: any) {
  const scope: DiffScope = args?.scope === "branch" || args?.scope === "lastRound" ? args.scope : "working";
  const root = await resolveRepo(args, false);

  if (scope === "working") {
    const r = await workingFiles(root);
    return { ok: true, scope, files: r.files, truncated: r.truncated, totals: totals(r.files), base: r.hasHead ? "HEAD" : null };
  }

  if (scope === "branch") {
    if (!(await hasHead(root))) return { ok: true, scope, files: [], truncated: false, totals: totals([]), base: null, message: "Noch kein Commit vorhanden." };
    const def = await detectDefaultBranch(root);
    if (!def) return { ok: true, scope, files: [], truncated: false, totals: totals([]), base: null, message: "Kein Standard-Branch gefunden." };
    let mergeBase: string;
    try {
      mergeBase = (await run(root, ["merge-base", def, "HEAD"])).stdout.trim();
    } catch {
      return { ok: true, scope, files: [], truncated: false, totals: totals([]), base: def, message: "Keine gemeinsame Basis mit dem Standard-Branch." };
    }
    const t = await trackedDiff(root, [`${mergeBase}..HEAD`]);
    return { ok: true, scope, files: t.files, truncated: t.truncated, totals: totals(t.files), base: def, mergeBase };
  }

  // lastRound
  const file = roundsFile(args?.appDataDir);
  const mark = readRounds(file)[roundKey(typeof args?.projectRoot === "string" ? args.projectRoot : root)];
  if (!mark) {
    return { ok: true, scope, files: [], truncated: false, totals: totals([]), base: null, hasMark: false, message: "Noch keine Runde gestartet." };
  }
  if (mark.snapshot !== EMPTY_TREE && !(await revParse(root, mark.snapshot))) {
    return { ok: true, scope, files: [], truncated: false, totals: totals([]), base: null, hasMark: false, message: "Rundenmarke nicht mehr auflösbar." };
  }
  const t = await trackedDiff(root, [mark.snapshot]);
  const known = new Set(mark.untracked ?? []);
  const entries = await statusEntries(root);
  const fresh = entries.filter((e) => e.x === "?" && e.y === "?" && !known.has(e.path)).map((e) => e.path);
  let truncated = t.truncated;
  if (fresh.length > MAX_UNTRACKED_FILES) truncated = true;
  for (const rel of fresh.slice(0, MAX_UNTRACKED_FILES)) {
    const f = untrackedFileToDiff(root, rel);
    if (f) t.files.push(f);
  }
  t.files.sort((a, b) => a.path.localeCompare(b.path));
  return { ok: true, scope, files: t.files, truncated, totals: totals(t.files), base: mark.snapshot.slice(0, 8), hasMark: true, markedAt: mark.at };
}

async function opStatus(args: any) {
  const root = await resolveRepo(args, false);
  const entries = await statusEntries(root);
  let branch = "";
  try { branch = (await run(root, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim(); } catch { /* ohne Commit */ }
  if (!branch) {
    try { branch = (await run(root, ["symbolic-ref", "--short", "HEAD"])).stdout.trim(); } catch { /* detached */ }
  }
  const files = entries.map((e) => ({
    path: e.path,
    oldPath: e.oldPath,
    untracked: e.x === "?",
    staged: e.x !== " " && e.x !== "?" && e.x !== "!",
    unstaged: e.y !== " " && e.y !== "?" && e.y !== "!",
    code: `${e.x}${e.y}`,
  }));
  return {
    ok: true,
    isRepo: true,
    branch,
    files,
    counts: {
      total: files.length,
      staged: files.filter((f) => f.staged).length,
      unstaged: files.filter((f) => f.unstaged && !f.untracked).length,
      untracked: files.filter((f) => f.untracked).length,
    },
  };
}

function pathsFromArgs(root: string, args: any): string[] {
  const out = [validateRelPath(root, args?.path)];
  if (args?.oldPath != null && args.oldPath !== "") out.push(validateRelPath(root, args.oldPath));
  return out;
}

async function opStageFile(args: any) {
  const root = await resolveRepo(args, true);
  const paths = pathsFromArgs(root, args);
  await run(root, ["add", "-A", "--", ...paths]);
  return { ok: true, message: "Datei gestaged." };
}
async function opStageAll(args: any) {
  const root = await resolveRepo(args, true);
  await run(root, ["add", "-A"]);
  return { ok: true, message: "Alle Änderungen gestaged." };
}
async function opUnstageFile(args: any) {
  const root = await resolveRepo(args, true);
  const paths = pathsFromArgs(root, args);
  if (await hasHead(root)) await run(root, ["restore", "--staged", "--", ...paths]);
  else await run(root, ["rm", "--cached", "-r", "-f", "-q", "--ignore-unmatch", "--", ...paths]);
  return { ok: true, message: "Datei aus dem Stage entfernt." };
}

async function inHead(root: string, rel: string): Promise<boolean> {
  try {
    await run(root, ["cat-file", "-e", `HEAD:${rel}`]);
    return true;
  } catch {
    return false;
  }
}

async function revertPath(root: string, rel: string, head: boolean): Promise<void> {
  const entries = (await run(root, ["status", "--porcelain=v1", "-z", "-uall", "--", rel])).stdout;
  const parsed = parsePorcelainZ(entries);
  if (parsed.length === 0) return; // nichts zu tun
  const untracked = parsed.every((e) => e.x === "?");
  if (untracked) {
    await run(root, ["clean", "-f", "-q", "--", rel]);
    return;
  }
  if (head && (await inHead(root, rel))) {
    await run(root, ["restore", "--source=HEAD", "--staged", "--worktree", "--", rel]);
    return;
  }
  // Im Index neu hinzugefügt, aber nicht in HEAD: Index-Eintrag und Datei entfernen.
  await run(root, ["rm", "-f", "-q", "--ignore-unmatch", "--", rel]);
  if (fs.existsSync(path.resolve(root, rel))) await run(root, ["clean", "-f", "-q", "--", rel]);
}

async function opRevertFile(args: any) {
  const root = await resolveRepo(args, true);
  const paths = pathsFromArgs(root, args);
  const head = await hasHead(root);
  for (const rel of paths) await revertPath(root, rel, head);
  return { ok: true, message: "Änderungen an der Datei verworfen." };
}
async function opRevertAll(args: any) {
  const root = await resolveRepo(args, true);
  if (!(await hasHead(root))) fail("Ohne Commit kann nicht alles zurückgesetzt werden.");
  await run(root, ["reset", "--hard", "-q", "HEAD"]);
  await run(root, ["clean", "-f", "-d", "-q"]);
  return { ok: true, message: "Alle Änderungen verworfen." };
}

async function opRefresh(args: any) {
  const scope = args?.scope;
  const [status, diff] = await Promise.all([opStatus(args), opDiff({ ...args, scope })]);
  return { ok: true, status, diff };
}

async function opMarkRoundStart(args: any) {
  return markRoundStart(args?.projectRoot, args?.appDataDir);
}

function wrap(fn: (args: any) => Promise<unknown>): (args: any) => Promise<unknown> {
  return async (args: any) => {
    try {
      return await fn(args ?? {});
    } catch (e) {
      return errResult(e);
    }
  };
}

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  status: wrap(opStatus),
  diff: wrap(opDiff),
  markRoundStart: wrap(opMarkRoundStart),
  stageFile: wrap(opStageFile),
  stageAll: wrap(opStageAll),
  unstageFile: wrap(opUnstageFile),
  revertFile: wrap(opRevertFile),
  revertAll: wrap(opRevertAll),
  refresh: wrap(opRefresh),
};
