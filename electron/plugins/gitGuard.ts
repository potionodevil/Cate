/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
// GitGuard: beobachtet Projektordner und committet/pusht Änderungen automatisch
// in konfigurierbaren Abständen. main.ts ruft op "tick" periodisch fuer alle
// bekannten Projekte auf; der Plugin-Host filtert bereits auf "enabled" (Opt-in,
// da ein Push ein eingreifender Vorgang ist). Reine Logik + execFile("git"),
// kein Electron-Import, damit Tests ohne Electron laufen.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { parsePorcelainZ } from "./gitDiff";

export const manifest = {
  id: "gitGuard",
  name: "GitGuard — Auto-Commit & Push",
  version: "1.0.0",
  description: "Beobachtet Projekte und committet/pusht Änderungen automatisch in festen Abständen.",
  configFields: [
    {
      key: "intervalMinutes",
      label: "Intervall (Minuten)",
      type: "number",
      default: 30,
      min: 1,
      max: 1440,
      description: "Wie oft jedes Projekt auf neue Änderungen geprüft wird."
    },
    {
      key: "autoPush",
      label: "Automatisch pushen",
      type: "boolean",
      default: true,
      description: "Nach jedem Commit sofort „git push“ auf den aktuellen Branch ausführen."
    },
    {
      key: "commitMessageStyle",
      label: "Commit-Nachrichten-Stil",
      type: "select",
      default: "conventional",
      options: [
        { value: "conventional", label: "Conventional Commits" },
        { value: "simple", label: "Einfach" }
      ]
    },
    {
      key: "includeUntracked",
      label: "Unversionierte Dateien einschließen",
      type: "boolean",
      default: true
    },
    {
      key: "branchAllowlist",
      label: "Nur auf diesen Branches (eine pro Zeile, leer = alle)",
      type: "list",
      default: []
    },
    {
      key: "excludeProjects",
      label: "Projekte ausschließen (Name oder Ordner, eine pro Zeile)",
      type: "list",
      default: []
    },
    {
      key: "dryRun",
      label: "Testlauf (nichts committen/pushen)",
      type: "boolean",
      default: false,
      description: "Erzeugt nur die Commit-Nachricht und protokolliert sie, ohne den Git-Status zu ändern."
    }
  ]
};

/* ---------- Typen ---------- */

export interface ProjectRef {
  id?: string;
  name?: string;
  folder: string;
}

export interface GitGuardConfig {
  intervalMinutes?: number;
  autoPush?: boolean;
  commitMessageStyle?: "conventional" | "simple";
  includeUntracked?: boolean;
  branchAllowlist?: string[];
  excludeProjects?: string[];
  dryRun?: boolean;
}

export type GuardAction = "committed" | "skipped" | "error" | "wouldCommit";

export interface LogEntry {
  at: string;
  project: string;
  folder: string;
  action: GuardAction;
  message: string;
  sha?: string;
  pushed?: boolean;
}

interface ProjectPersisted {
  lastRunAt?: string;
  lastCommitSha?: string;
  lastPushedAt?: string;
  lastError?: string;
}

interface GuardState {
  perProject: Record<string, ProjectPersisted>;
  log: LogEntry[];
}

const GIT_TIMEOUT = 20_000;
const MAX_LOG = 300;
const MAX_LISTED_FILES = 12;

/* ---------- Git-Helfer ---------- */

interface RunResult { code: number; stdout: string; stderr: string }

function run(cwd: string, args: string[], timeout = GIT_TIMEOUT): Promise<RunResult> {
  return new Promise((resolve_, reject) => {
    execFile("git", args, { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" }, (err, stdout, stderr) => {
      if (!err) return resolve_({ code: 0, stdout: String(stdout), stderr: String(stderr) });
      const e = err as NodeJS.ErrnoException & { killed?: boolean };
      reject(new Error(String(stderr || "").trim() || (e.killed ? "Zeitüberschreitung" : e.message)));
    });
  });
}

function samePath(a: string, b: string): boolean {
  const na = resolve(a);
  const nb = resolve(b);
  return process.platform === "win32" ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

function normKey(folder: string): string {
  const k = resolve(folder);
  return process.platform === "win32" ? k.toLowerCase() : k;
}

async function isRepoRoot(folder: string): Promise<boolean> {
  try {
    const top = (await run(folder, ["rev-parse", "--show-toplevel"])).stdout.trim();
    return !!top && samePath(top, folder);
  } catch {
    return false;
  }
}

async function currentBranch(root: string): Promise<string> {
  try {
    const b = (await run(root, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
    if (b && b !== "HEAD") return b;
  } catch { /* kein Commit oder detached */ }
  try {
    return (await run(root, ["symbolic-ref", "--short", "-q", "HEAD"])).stdout.trim();
  } catch {
    return "";
  }
}

async function hasRemote(root: string): Promise<boolean> {
  try {
    const out = (await run(root, ["remote"])).stdout.trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

interface StatusEntry { path: string; oldPath: string | null; x: string; y: string }

async function statusEntries(root: string): Promise<StatusEntry[]> {
  const r = await run(root, ["status", "--porcelain=v1", "-z", "-uall"]);
  return parsePorcelainZ(r.stdout);
}

/* ---------- Persistenz ---------- */

function statePath(appDataDir: string): string {
  return join(appDataDir, "gitguard-state.json");
}

function readState(file: string): GuardState {
  try {
    const j = JSON.parse(readFileSync(file, "utf8"));
    return {
      perProject: j && typeof j.perProject === "object" ? j.perProject : {},
      log: Array.isArray(j?.log) ? j.log : []
    };
  } catch {
    return { perProject: {}, log: [] };
  }
}

function writeState(file: string, state: GuardState): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (state.log.length > MAX_LOG) state.log = state.log.slice(state.log.length - MAX_LOG);
  writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

function appendLog(state: GuardState, entry: LogEntry): void {
  state.log.push(entry);
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}

/* ---------- Auswahl & Fälligkeit ---------- */

export function isExcluded(project: ProjectRef, cfg: GitGuardConfig): boolean {
  const list = (cfg.excludeProjects ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) return false;
  const candidates = [project.name, basename(project.folder), project.folder].filter((s): s is string => !!s).map((s) => s.trim().toLowerCase());
  return candidates.some((c) => list.includes(c));
}

export function isDue(lastRunAt: string | undefined, intervalMinutes: number, now: number): boolean {
  if (!lastRunAt) return true;
  const last = Date.parse(lastRunAt);
  if (!Number.isFinite(last)) return true;
  return now - last >= Math.max(1, intervalMinutes) * 60_000;
}

/* ---------- Commit-Nachricht ---------- */

function statusLabel(e: StatusEntry): string {
  if (e.x === "?" && e.y === "?") return "neu";
  if (e.x === "A") return "neu";
  if (e.x === "D" || e.y === "D") return "gelöscht";
  if (e.x === "R" || e.y === "R") return "umbenannt";
  return "geändert";
}

const DOC_RE = /\.(md|mdx)$/i;
const DOCS_DIR_RE = /(^|[/\\])docs[/\\]/i;
const TEST_RE = /\.(test|spec)\.[jt]sx?$|(^|[/\\])(tests?|__tests__)[/\\]/i;
const LOCK_RE = /(^|[/\\])(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|package\.json)$/i;

export function classifyType(entries: StatusEntry[]): string {
  const paths = entries.map((e) => e.path);
  if (paths.length > 0 && paths.every((p) => DOC_RE.test(p) || DOCS_DIR_RE.test(p))) return "docs";
  if (paths.length > 0 && paths.every((p) => TEST_RE.test(p))) return "test";
  if (paths.length > 0 && paths.every((p) => LOCK_RE.test(p))) return "chore(deps)";
  const added = entries.filter((e) => e.x === "A" || (e.x === "?" && e.y === "?")).length;
  const deleted = entries.filter((e) => e.x === "D" || e.y === "D").length;
  if (deleted > 0 && added === 0 && deleted >= entries.length * 0.6) return "chore";
  if (added >= Math.max(1, entries.length) * 0.6) return "feat";
  return "chore";
}

export function buildCommitMessage(entries: StatusEntry[], style: "conventional" | "simple" | undefined, now: Date): string {
  const count = entries.length;
  const subject =
    style === "simple"
      ? `Auto-Commit: ${count} Datei${count === 1 ? "" : "en"} aktualisiert`
      : `${classifyType(entries)}: automatischer Commit (${count} Datei${count === 1 ? "" : "en"})`;
  const shown = entries.slice(0, MAX_LISTED_FILES).map((e) => `- ${statusLabel(e)}: ${e.path}`);
  const rest = count - shown.length;
  const body = [...shown, ...(rest > 0 ? [`- … und ${rest} weitere`] : [])].join("\n");
  const footer = `Automatisch erstellt von GitGuard am ${now.toLocaleString("de-DE")}.`;
  return [subject, body, footer].filter(Boolean).join("\n\n");
}

/* ---------- Kern ---------- */

interface GuardResult {
  action: GuardAction;
  message: string;
  sha?: string;
  pushed?: boolean;
}

async function guardProject(project: ProjectRef, cfg: GitGuardConfig, now: Date): Promise<GuardResult> {
  const root = project.folder;
  if (!existsSync(root)) return { action: "skipped", message: "Projektordner existiert nicht." };
  if (!(await isRepoRoot(root))) return { action: "skipped", message: "Kein Git-Repository (oder Ordner ist nicht das Wurzelverzeichnis)." };

  const branch = await currentBranch(root);
  const allow = (cfg.branchAllowlist ?? []).map((s) => s.trim()).filter(Boolean);
  if (allow.length > 0 && !allow.includes(branch)) {
    return { action: "skipped", message: `Branch „${branch}“ ist nicht in der Allowlist.` };
  }

  const entries = await statusEntries(root);
  if (entries.some((e) => e.x === "U" || e.y === "U")) {
    return { action: "error", message: "Ungelöste Merge-Konflikte, Projekt übersprungen." };
  }

  const includeUntracked = cfg.includeUntracked !== false;
  const relevant = includeUntracked ? entries : entries.filter((e) => !(e.x === "?" && e.y === "?"));
  if (relevant.length === 0) return { action: "skipped", message: "Keine Änderungen." };

  if (cfg.dryRun) {
    return { action: "wouldCommit", message: buildCommitMessage(relevant, cfg.commitMessageStyle, now) };
  }

  await run(root, includeUntracked ? ["add", "-A"] : ["add", "-u"]);
  const staged = (await run(root, ["diff", "--cached", "--name-only"])).stdout.trim();
  if (!staged) return { action: "skipped", message: "Keine zu übernehmenden Änderungen." };

  const message = buildCommitMessage(relevant, cfg.commitMessageStyle, now);
  await run(root, ["commit", "-m", message]);
  const sha = (await run(root, ["rev-parse", "HEAD"])).stdout.trim();

  let pushed = false;
  let pushNote = "";
  if (cfg.autoPush !== false) {
    if (!(await hasRemote(root))) {
      pushNote = " Kein Remote konfiguriert, nicht gepusht.";
    } else {
      try {
        await run(root, ["push"]);
        pushed = true;
      } catch (e) {
        pushNote = ` Push fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }

  return { action: "committed", message: `Commit ${sha.slice(0, 8)} erstellt.${pushNote}`, sha, pushed };
}

/* ---------- Operationen ---------- */

function configFrom(args: any): GitGuardConfig {
  return {
    intervalMinutes: Number(args?.intervalMinutes) || 30,
    autoPush: args?.autoPush !== false,
    commitMessageStyle: args?.commitMessageStyle === "simple" ? "simple" : "conventional",
    includeUntracked: args?.includeUntracked !== false,
    branchAllowlist: Array.isArray(args?.branchAllowlist) ? args.branchAllowlist : [],
    excludeProjects: Array.isArray(args?.excludeProjects) ? args.excludeProjects : [],
    dryRun: !!args?.dryRun
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const inFlight = new Set<string>();

async function opTick(args: any) {
  const appDataDir = typeof args?.appDataDir === "string" ? args.appDataDir : "";
  if (!appDataDir) return { ok: false, message: "appDataDir fehlt." };
  const projects: ProjectRef[] = Array.isArray(args?.projects) ? args.projects.filter((p: any) => p && typeof p.folder === "string" && p.folder.trim()) : [];
  const cfg = configFrom(args);
  const file = statePath(appDataDir);
  const state = readState(file);
  const now = Date.now();
  const results: Array<{ project: string; folder: string } & GuardResult> = [];

  for (const project of projects) {
    if (isExcluded(project, cfg)) continue;
    const k = normKey(project.folder);
    if (inFlight.has(k)) continue;
    const persisted = state.perProject[k];
    if (!isDue(persisted?.lastRunAt, cfg.intervalMinutes ?? 30, now)) continue;

    inFlight.add(k);
    try {
      const r = await guardProject(project, cfg, new Date(now));
      const label = project.name ?? basename(project.folder);
      results.push({ project: label, folder: project.folder, ...r });
      if (!cfg.dryRun) {
        state.perProject[k] = {
          lastRunAt: new Date(now).toISOString(),
          lastCommitSha: r.sha ?? persisted?.lastCommitSha,
          lastPushedAt: r.pushed ? new Date(now).toISOString() : persisted?.lastPushedAt,
          lastError: r.action === "error" ? r.message : undefined
        };
        appendLog(state, { at: new Date(now).toISOString(), project: label, folder: project.folder, action: r.action, message: r.message, sha: r.sha, pushed: r.pushed });
      }
    } catch (e) {
      const label = project.name ?? basename(project.folder);
      const message = errMsg(e);
      results.push({ project: label, folder: project.folder, action: "error", message });
      state.perProject[k] = { ...persisted, lastRunAt: new Date(now).toISOString(), lastError: message };
      appendLog(state, { at: new Date(now).toISOString(), project: label, folder: project.folder, action: "error", message });
    } finally {
      inFlight.delete(k);
    }
  }

  if (results.length > 0) writeState(file, state);
  return { ok: true, checked: projects.length, ran: results.length, results };
}

async function opRunNow(args: any) {
  const projectRoot = typeof args?.projectRoot === "string" ? args.projectRoot.trim() : "";
  if (!projectRoot) return { ok: false, message: "Kein Projektordner angegeben." };
  const appDataDir = typeof args?.appDataDir === "string" ? args.appDataDir : "";
  const cfg = configFrom(args);
  const project: ProjectRef = { id: args?.projectId, name: args?.projectName, folder: projectRoot };
  const now = new Date();
  try {
    const r = await guardProject(project, cfg, now);
    if (appDataDir && !cfg.dryRun) {
      const file = statePath(appDataDir);
      const state = readState(file);
      const k = normKey(projectRoot);
      state.perProject[k] = {
        lastRunAt: now.toISOString(),
        lastCommitSha: r.sha ?? state.perProject[k]?.lastCommitSha,
        lastPushedAt: r.pushed ? now.toISOString() : state.perProject[k]?.lastPushedAt,
        lastError: r.action === "error" ? r.message : undefined
      };
      appendLog(state, { at: now.toISOString(), project: project.name ?? basename(projectRoot), folder: projectRoot, action: r.action, message: r.message, sha: r.sha, pushed: r.pushed });
      writeState(file, state);
    }
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

async function opStatus(args: any) {
  const appDataDir = typeof args?.appDataDir === "string" ? args.appDataDir : "";
  if (!appDataDir) return { ok: false, message: "appDataDir fehlt." };
  const state = readState(statePath(appDataDir));
  const projectRoot = typeof args?.projectRoot === "string" ? args.projectRoot.trim() : "";
  if (projectRoot) {
    const k = normKey(projectRoot);
    return {
      ok: true,
      project: state.perProject[k] ?? null,
      log: state.log.filter((l) => normKey(l.folder) === k).slice(-20).reverse()
    };
  }
  return { ok: true, perProject: state.perProject, log: state.log.slice(-50).reverse() };
}

function wrap(fn: (args: any) => Promise<unknown>): (args: any) => Promise<unknown> {
  return async (args: any) => {
    try {
      return await fn(args ?? {});
    } catch (e) {
      return { ok: false, message: errMsg(e) };
    }
  };
}

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  tick: wrap(opTick),
  runNow: wrap(opRunNow),
  status: wrap(opStatus)
};
