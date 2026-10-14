/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export type PluginOp = (args: any) => Promise<unknown>;
export interface PluginFail { ok: false; message: string }

interface RunResult { code: number | null; stdout: string; stderr: string; missing: boolean; timedOut: boolean }

function runCmd(file: string, args: string[], opts: { cwd?: string; timeoutMs?: number; input?: string } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const useShell = process.platform === "win32" && /^(npm|npx|pip|pip-audit|snyk|ruff)$/i.test(file);
    const child = execFile(
      file,
      args,
      { cwd: opts.cwd, timeout: opts.timeoutMs ?? 120000, windowsHide: true, maxBuffer: 32 * 1024 * 1024, shell: useShell, encoding: "utf8" },
      (err: any, stdout: string, stderr: string) => {
        const missing = !!err && (err.code === "ENOENT" || /not recognized|nicht erkannt|command not found/i.test(String(stderr)));
        const code = err ? (typeof err.code === "number" ? err.code : null) : 0;
        resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), missing, timedOut: !!err && !!err.killed });
      },
    );
    if (opts.input !== undefined && child.stdin) { child.stdin.on("error", () => {}); child.stdin.end(opts.input); }
  });
}

function resolveInside(root: string, p: string): string {
  if (!root || typeof root !== "string") throw new Error("projectRoot fehlt.");
  const base = path.resolve(root);
  const full = path.resolve(base, String(p ?? ""));
  const rel = path.relative(base, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Pfad liegt außerhalb des Projektordners.");
  return full;
}

function wrap(fn: (args: any) => Promise<unknown>): PluginOp {
  return async (args: any) => {
    try { return await fn(args ?? {}); }
    catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) } as PluginFail; }
  };
}

export const manifest = { id: "vulnScanner", name: "Dependency & Vuln Scanner", version: "1.0.0", description: "Erkennt npm/cargo/pip, führt Audits aus und meldet high/critical Funde." };

export type Severity = "critical" | "high" | "moderate" | "low" | "info" | "unknown";
export type Ecosystem = "npm" | "cargo" | "pip";
export interface Finding { ecosystem: Ecosystem | "snyk"; severity: Severity; package: string; cve: string; fixAvailable: boolean; title?: string }
export interface ToolReport { tool: string; available: boolean; findings: Finding[]; message?: string }

const SEV: Severity[] = ["critical", "high", "moderate", "low", "info", "unknown"];
function normSev(s: unknown): Severity {
  const v = String(s ?? "").toLowerCase();
  if (v === "medium") return "moderate";
  return (SEV as string[]).includes(v) ? (v as Severity) : "unknown";
}
const CVE_RE = /CVE-\d{4}-\d{4,}/i;
const GHSA_RE = /GHSA(?:-[a-z0-9]{4}){3}/i;
function idFrom(...vals: unknown[]): string {
  const s = vals.flat().map((v) => String(v ?? "")).join(" ");
  return CVE_RE.exec(s)?.[0].toUpperCase() ?? GHSA_RE.exec(s)?.[0] ?? "";
}

export function detectEcosystems(projectRoot: string): Ecosystem[] {
  const root = resolveInside(projectRoot, ".");
  const has = (f: string) => fs.existsSync(path.join(root, f));
  const res: Ecosystem[] = [];
  if (has("package.json") || has("package-lock.json")) res.push("npm");
  if (has("Cargo.toml") || has("Cargo.lock")) res.push("cargo");
  if (has("requirements.txt") || has("pyproject.toml") || has("Pipfile") || has("setup.py")) res.push("pip");
  return res;
}

export function parseNpmAudit(json: any): Finding[] {
  const res: Finding[] = [];
  if (json?.vulnerabilities && typeof json.vulnerabilities === "object") {
    for (const [name, v] of Object.entries<any>(json.vulnerabilities)) {
      const via = Array.isArray(v.via) ? v.via : [];
      const objs = via.filter((x: any) => x && typeof x === "object");
      const cve = idFrom(objs.map((x: any) => [x.cve, x.cves, x.url, x.source]), v.cves);
      res.push({ ecosystem: "npm", severity: normSev(v.severity), package: name, cve, fixAvailable: !!v.fixAvailable, title: objs[0]?.title });
    }
  } else if (json?.advisories && typeof json.advisories === "object") {
    for (const a of Object.values<any>(json.advisories)) {
      res.push({ ecosystem: "npm", severity: normSev(a.severity), package: a.module_name, cve: idFrom(a.cves, a.url), fixAvailable: !!a.patched_versions && a.patched_versions !== "<0.0.0", title: a.title });
    }
  }
  return res;
}

export function parseCargoAudit(json: any): Finding[] {
  const list: any[] = json?.vulnerabilities?.list ?? [];
  return list.map((v) => ({
    ecosystem: "cargo" as const,
    severity: normSev(v.advisory?.severity),
    package: v.package?.name ?? v.advisory?.package ?? "?",
    cve: idFrom(v.advisory?.aliases, v.advisory?.id) || String(v.advisory?.id ?? ""),
    fixAvailable: Array.isArray(v.versions?.patched) && v.versions.patched.length > 0,
    title: v.advisory?.title,
  }));
}

export function parsePipAudit(json: any): Finding[] {
  const deps: any[] = Array.isArray(json) ? json : json?.dependencies ?? [];
  const res: Finding[] = [];
  for (const d of deps) {
    for (const v of d.vulns ?? []) {
      res.push({
        ecosystem: "pip", severity: normSev(v.severity), package: d.name,
        cve: idFrom(v.aliases, v.id) || String(v.id ?? ""),
        fixAvailable: Array.isArray(v.fix_versions) && v.fix_versions.length > 0,
        title: v.description,
      });
    }
  }
  return res;
}

export function parseSnyk(json: any): Finding[] {
  const arr = Array.isArray(json) ? json : [json];
  return arr.flatMap((p: any) => (p?.vulnerabilities ?? []).map((v: any) => ({
    ecosystem: "snyk" as const, severity: normSev(v.severity), package: v.packageName ?? v.name ?? "?",
    cve: idFrom(v.identifiers?.CVE, v.id),
    fixAvailable: !!v.isUpgradable || !!v.isPatchable || (Array.isArray(v.fixedIn) && v.fixedIn.length > 0),
    title: v.title,
  })));
}

export function toAlerts(findings: Finding[], includeUnknown = false): Finding[] {
  return findings.filter((f) => f.severity === "critical" || f.severity === "high" || (includeUnknown && f.severity === "unknown"));
}

function tryJson(s: string): any {
  try { return JSON.parse(s); } catch {
    const i = s.indexOf("{"), j = s.lastIndexOf("}");
    if (i >= 0 && j > i) { try { return JSON.parse(s.slice(i, j + 1)); } catch { /* ignorieren */ } }
    return undefined;
  }
}

async function runAudit(tool: string, file: string, args: string[], cwd: string, parser: (j: any) => Finding[], timeoutMs: number): Promise<ToolReport> {
  const r = await runCmd(file, args, { cwd, timeoutMs });
  if (r.missing) return { tool, available: false, findings: [], message: `${tool} ist nicht installiert – übersprungen.` };
  const j = tryJson(r.stdout);
  if (j === undefined) return { tool, available: true, findings: [], message: `${tool}: keine auswertbare Ausgabe${r.timedOut ? " (Timeout)" : ""}. ${r.stderr.trim().slice(0, 200)}` };
  return { tool, available: true, findings: parser(j) };
}

export interface ScanResult { ok: true; ecosystems: Ecosystem[]; reports: ToolReport[]; findings: Finding[]; alerts: Finding[] }

export async function scanProject(projectRoot: string, opts: { timeoutMs?: number; snyk?: boolean; includeUnknown?: boolean } = {}): Promise<ScanResult> {
  const root = resolveInside(projectRoot, ".");
  const t = opts.timeoutMs ?? 120000;
  const ecos = detectEcosystems(root);
  const jobs: Promise<ToolReport>[] = [];
  if (ecos.includes("npm")) jobs.push(runAudit("npm audit", "npm", ["audit", "--json"], root, parseNpmAudit, t));
  if (ecos.includes("cargo")) jobs.push(runAudit("cargo audit", "cargo", ["audit", "--json"], root, parseCargoAudit, t));
  if (ecos.includes("pip")) jobs.push(runAudit("pip-audit", "pip-audit", ["-f", "json"], root, parsePipAudit, t));
  if (opts.snyk) jobs.push(runAudit("snyk", "snyk", ["test", "--json"], root, parseSnyk, t));
  const reports = await Promise.all(jobs);
  const findings = reports.flatMap((r) => r.findings);
  return { ok: true, ecosystems: ecos, reports, findings, alerts: toAlerts(findings, opts.includeUnknown) };
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): ((...a: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const d = ((...a: A) => { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = undefined; fn(...a); }, ms); }) as ((...a: A) => void) & { cancel: () => void };
  d.cancel = () => { if (timer) clearTimeout(timer); timer = undefined; };
  return d;
}

export const WATCHED_FILES = ["package.json", "package-lock.json", "Cargo.toml", "Cargo.lock", "requirements.txt", "pyproject.toml", "Pipfile.lock"];

/** Beobachtet Manifest-Dateien und löst nach Ruhephase einen Scan aus. Liefert eine Stop-Funktion. */
export function watchProject(projectRoot: string, onAlerts: (r: ScanResult) => void, debounceMs = 3000, scan: (root: string) => Promise<ScanResult> = scanProject): () => void {
  const root = resolveInside(projectRoot, ".");
  const trigger = debounce(() => { scan(root).then(onAlerts).catch(() => {}); }, debounceMs);
  const watchers: fs.FSWatcher[] = [];
  try {
    watchers.push(fs.watch(root, (_ev, name) => { if (name && WATCHED_FILES.includes(String(name))) trigger(); }));
  } catch { /* Ordner nicht beobachtbar */ }
  return () => { trigger.cancel(); watchers.forEach((w) => w.close()); };
}

const stops = new Map<string, () => void>();

export const operations: Record<string, PluginOp> = {
  detect: wrap(async (a) => ({ ok: true, ecosystems: detectEcosystems(a.projectRoot) })),
  scan: wrap(async (a) => scanProject(a.projectRoot, { timeoutMs: a.timeoutMs, snyk: !!a.snyk, includeUnknown: !!a.includeUnknown })),
  startWatch: wrap(async (a) => {
    const key = resolveInside(a.projectRoot, ".");
    stops.get(key)?.();
    if (typeof a.onAlerts !== "function") return { ok: false, message: "onAlerts-Callback fehlt (nur im Hauptprozess nutzbar)." };
    stops.set(key, watchProject(key, a.onAlerts, a.debounceMs));
    return { ok: true };
  }),
  stopWatch: wrap(async (a) => {
    const key = resolveInside(a.projectRoot, ".");
    stops.get(key)?.(); stops.delete(key);
    return { ok: true };
  }),
};
