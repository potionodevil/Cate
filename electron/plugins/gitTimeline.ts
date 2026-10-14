/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { execFile } from "node:child_process";
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

export const manifest = { id: "gitTimeline", name: "Git-Timeline Memory", version: "1.0.0", description: "Liest die Git-Historie und erzeugt einen Architektur- und Stil-Digest." };

export interface Commit { hash: string; author: string; date: string; subject: string; type: string; scope: string; breaking: boolean; conventional: boolean; description: string; files: string[] }

const CC_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/;
export function parseSubject(subject: string): Pick<Commit, "type" | "scope" | "breaking" | "conventional" | "description"> {
  const m = CC_RE.exec(subject.trim());
  if (!m) return { type: "other", scope: "", breaking: false, conventional: false, description: subject.trim() };
  return { type: m[1].toLowerCase(), scope: m[2] ?? "", breaking: !!m[3], conventional: true, description: m[4] };
}

export function parseGitLog(raw: string): Commit[] {
  const res: Commit[] = [];
  for (const rec of raw.split("\x1e")) {
    const body = rec.replace(/^\s+/, "");
    if (!body) continue;
    const nl = body.indexOf("\n");
    const head = (nl < 0 ? body : body.slice(0, nl)).split("\x1f");
    if (head.length < 4) continue;
    const files = (nl < 0 ? "" : body.slice(nl + 1)).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    res.push({ hash: head[0], author: head[1], date: head[2], subject: head[3], ...parseSubject(head[3]), files });
  }
  return res;
}

export function heatMap(commits: Commit[], depth = 2): Array<{ dir: string; count: number }> {
  const m = new Map<string, number>();
  for (const c of commits) {
    const dirs = new Set(c.files.map((f) => { const p = f.split("/"); return p.length === 1 ? "." : p.slice(0, Math.min(depth, p.length - 1)).join("/"); }));
    for (const d of dirs) m.set(d, (m.get(d) ?? 0) + 1);
  }
  return [...m.entries()].map(([dir, count]) => ({ dir, count })).sort((a, b) => b.count - a.count || a.dir.localeCompare(b.dir));
}

export function caseStyle(base: string): string {
  const n = base.replace(/\.[^.]*$/, "");
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(n)) return "kebab-case";
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(n)) return "snake_case";
  if (/^[A-Z][A-Za-z0-9]*$/.test(n) && /[a-z]/.test(n)) return "PascalCase";
  if (/^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(n)) return "camelCase";
  if (/^[a-z0-9]+$/.test(n)) return "lowercase";
  return "sonstige";
}

export interface StyleStats {
  commits: number; conventionalShare: number; types: Record<string, number>; topScopes: Array<{ scope: string; count: number }>;
  avgSubjectLength: number; lowercaseStartShare: number; fileCase: Record<string, number>; extensions: Record<string, number>; authors: number;
}

export function styleStats(commits: Commit[]): StyleStats {
  const n = commits.length || 1;
  const types: Record<string, number> = {}, scopes = new Map<string, number>(), fileCase: Record<string, number> = {}, ext: Record<string, number> = {};
  const seen = new Set<string>();
  let len = 0, lower = 0;
  for (const c of commits) {
    types[c.type] = (types[c.type] ?? 0) + 1;
    if (c.scope) scopes.set(c.scope, (scopes.get(c.scope) ?? 0) + 1);
    len += c.subject.length;
    if (/^[a-z]/.test(c.description)) lower++;
    for (const f of c.files) {
      if (seen.has(f)) continue;
      seen.add(f);
      const b = f.split("/").pop() ?? f;
      const cs = caseStyle(b);
      fileCase[cs] = (fileCase[cs] ?? 0) + 1;
      const e = path.extname(b) || "(ohne)";
      ext[e] = (ext[e] ?? 0) + 1;
    }
  }
  return {
    commits: commits.length,
    conventionalShare: Number((commits.filter((c) => c.conventional).length / n).toFixed(2)),
    types,
    topScopes: [...scopes.entries()].map(([scope, count]) => ({ scope, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    avgSubjectLength: Math.round(len / n),
    lowercaseStartShare: Number((lower / n).toFixed(2)),
    fileCase, extensions: ext,
    authors: new Set(commits.map((c) => c.author)).size,
  };
}

const top = (o: Record<string, number>, k = 5) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k);

export function buildDigest(commits: Commit[]): string {
  if (commits.length === 0) return "# Architektur- & Stil-Digest\n\nKeine Commits gefunden.";
  const s = styleStats(commits);
  const heat = heatMap(commits).slice(0, 8);
  const pct = (x: number) => Math.round(x * 100) + " %";
  const lines = [
    "# Architektur- & Stil-Digest",
    "",
    `Basis: letzte ${s.commits} Commits (${commits[commits.length - 1].date.slice(0, 10)} – ${commits[0].date.slice(0, 10)}), ${s.authors} Autor(en).`,
    "",
    "## Commit-Stil",
    `- Conventional Commits: ${pct(s.conventionalShare)}; Betreff Ø ${s.avgSubjectLength} Zeichen; Kleinschreibung am Anfang: ${pct(s.lowercaseStartShare)}`,
    `- Typen: ${top(s.types).map(([k, v]) => `${k} (${v})`).join(", ")}`,
    ...(s.topScopes.length ? [`- Häufige Scopes: ${s.topScopes.map((x) => `${x.scope} (${x.count})`).join(", ")}`] : []),
    "",
    "## Aktive Bereiche (Heat Map)",
    ...heat.map((h) => `- \`${h.dir}\` – ${h.count} Commits`),
    "",
    "## Namens- und Dateikonventionen",
    `- Dateinamen: ${top(s.fileCase).map(([k, v]) => `${k} (${v})`).join(", ")}`,
    `- Dateitypen: ${top(s.extensions, 6).map(([k, v]) => `${k} (${v})`).join(", ")}`,
    "",
    "## Letzte Änderungen",
    ...commits.slice(0, 8).map((c) => `- ${c.hash.slice(0, 7)} ${c.subject}`),
    "",
    "Hinweis: Neue Änderungen an Commit-Stil, Dateibenennung und Verzeichnisstruktur anpassen.",
  ];
  return lines.join("\n");
}

export async function readCommits(projectRoot: string, limit = 50, timeoutMs = 30000): Promise<Commit[]> {
  const root = resolveInside(projectRoot, ".");
  const n = Math.max(1, Math.min(Math.floor(Number(limit) || 50), 1000));
  const r = await runCmd("git", ["log", `-n${n}`, "--name-only", "--no-color", "--pretty=format:%x1e%H%x1f%an%x1f%aI%x1f%s"], { cwd: root, timeoutMs });
  if (r.missing) throw new Error("git ist nicht installiert.");
  if (r.code !== 0) throw new Error(/not a git repository/i.test(r.stderr) ? "Kein Git-Repository." : "git log fehlgeschlagen: " + r.stderr.trim().slice(0, 200));
  return parseGitLog(r.stdout);
}

export const operations: Record<string, PluginOp> = {
  timeline: wrap(async (a) => { const commits = await readCommits(a.projectRoot, a.limit); return { ok: true, commits, heatMap: heatMap(commits, a.depth ?? 2), stats: styleStats(commits) }; }),
  digest: wrap(async (a) => { const commits = await readCommits(a.projectRoot, a.limit); return { ok: true, markdown: buildDigest(commits) }; }),
};
