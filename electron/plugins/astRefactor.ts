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

export const manifest = { id: "astRefactor", name: "AST-Lint & Refactor", version: "1.0.0", description: "Knotenbasierte Refactorings für TypeScript mit Syntaxprüfung; Python/Rust-Fallback." };

type TsModule = typeof import("typescript");
let tsCache: TsModule | null | undefined;
function getTs(): TsModule {
  if (tsCache === undefined) {
    try { tsCache = require("typescript") as TsModule; } catch { tsCache = null; }
  }
  if (!tsCache) throw new Error("TypeScript-Compiler ist nicht installiert.");
  return tsCache;
}

export interface NodeInfo { kind: string; name: string; start: number; end: number; line: number; endLine: number }
export interface SyntaxResult { ok: boolean; errors: string[]; skipped?: boolean }

function scriptKind(ts: TsModule, file: string) {
  const ext = path.extname(file).toLowerCase();
  return ext === ".tsx" ? ts.ScriptKind.TSX : ext === ".jsx" ? ts.ScriptKind.JSX : ext === ".js" || ext === ".mjs" || ext === ".cjs" ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

function parse(source: string, file = "file.ts") {
  const ts = getTs();
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(ts, file));
}

export function checkTsSyntax(source: string, file = "file.ts"): SyntaxResult {
  const ts = getTs();
  const out = ts.transpileModule(source, {
    reportDiagnostics: true,
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, allowJs: true },
  });
  const errors = (out.diagnostics ?? [])
    .filter((d) => d.category === ts.DiagnosticCategory.Error)
    .map((d) => {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
      if (d.file && d.start !== undefined) {
        const lc = d.file.getLineAndCharacterOfPosition(d.start);
        return `Zeile ${lc.line + 1}:${lc.character + 1} ${msg}`;
      }
      return msg;
    });
  return { ok: errors.length === 0, errors };
}

function nodeName(ts: TsModule, n: import("typescript").Node): string | undefined {
  if (ts.isVariableStatement(n)) {
    const d = n.declarationList.declarations[0];
    return d && ts.isIdentifier(d.name) ? d.name.text : undefined;
  }
  const nm = (n as any).name;
  if (nm && (ts.isIdentifier(nm) || ts.isStringLiteral(nm) || ts.isPrivateIdentifier(nm))) return nm.text;
  return undefined;
}

export function listNodes(source: string, file = "file.ts"): NodeInfo[] {
  const ts = getTs();
  const sf = parse(source, file);
  const res: NodeInfo[] = [];
  const visit = (n: import("typescript").Node) => {
    const name = nodeName(ts, n);
    if (name !== undefined) {
      const start = n.getStart(sf);
      res.push({
        kind: ts.SyntaxKind[n.kind], name, start, end: n.end,
        line: sf.getLineAndCharacterOfPosition(start).line + 1,
        endLine: sf.getLineAndCharacterOfPosition(n.end).line + 1,
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return res;
}

function findNode(source: string, file: string, kind: string, name: string): NodeInfo {
  const hits = listNodes(source, file).filter((n) => n.kind === kind && n.name === name);
  if (hits.length === 0) throw new Error(`Knoten ${kind} "${name}" nicht gefunden.`);
  if (hits.length > 1) throw new Error(`Knoten ${kind} "${name}" ist mehrdeutig (${hits.length} Treffer).`);
  return hits[0];
}

export function renameSymbolInSource(source: string, oldName: string, newName: string, file = "file.ts"): { text: string; count: number } {
  const ts = getTs();
  if (!/^[A-Za-z_$][\w$]*$/.test(newName)) throw new Error("Ungültiger neuer Name.");
  const sf = parse(source, file);
  const spans: Array<[number, number]> = [];
  const visit = (n: import("typescript").Node) => {
    if (ts.isIdentifier(n) && n.text === oldName) {
      const p = n.parent;
      const isMember = p && ((ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isQualifiedName(p) && p.right === n));
      if (!isMember) spans.push([n.getStart(sf), n.end]);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  let text = source;
  for (const [s, e] of spans.sort((a, b) => b[0] - a[0])) text = text.slice(0, s) + newName + text.slice(e);
  return { text, count: spans.length };
}

export function replaceNodeInSource(source: string, file: string, kind: string, name: string, replacement: string): string {
  const n = findNode(source, file, kind, name);
  return source.slice(0, n.start) + replacement + source.slice(n.end);
}

export function insertAfterNodeInSource(source: string, file: string, kind: string, name: string, text: string): string {
  const n = findNode(source, file, kind, name);
  return source.slice(0, n.end) + "\n\n" + text + source.slice(n.end);
}

export function removeNodeInSource(source: string, file: string, kind: string, name: string): { text: string; removed: string } {
  const n = findNode(source, file, kind, name);
  let end = n.end;
  while (end < source.length && (source[end] === "\n" || source[end] === "\r")) end++;
  return { text: source.slice(0, n.start) + source.slice(end), removed: source.slice(n.start, n.end) };
}

/* ---------- Fallback Python / Rust ---------- */

export async function checkExternalSyntax(projectRoot: string, file: string, source: string): Promise<SyntaxResult> {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".py") {
    for (const py of process.platform === "win32" ? ["python", "py"] : ["python3", "python"]) {
      const r = await runCmd(py, ["-c", "import ast,sys\nast.parse(sys.stdin.read())"], { cwd: projectRoot, input: source, timeoutMs: 20000 });
      if (r.missing) continue;
      return r.code === 0 ? { ok: true, errors: [] } : { ok: false, errors: [r.stderr.trim().split(/\r?\n/).slice(-3).join(" | ") || "Python-Syntaxfehler"] };
    }
    return { ok: true, errors: ["Python nicht gefunden – Syntaxprüfung übersprungen."], skipped: true };
  }
  if (ext === ".rs") {
    // cargo prüft nur das Projekt auf der Platte; Aufruf erfolgt nach dem Schreiben (siehe writeChecked)
    return { ok: true, errors: [], skipped: true };
  }
  return { ok: true, errors: ["Keine Syntaxprüfung für diesen Dateityp verfügbar."], skipped: true };
}

async function cargoCheck(projectRoot: string): Promise<SyntaxResult> {
  const r = await runCmd("cargo", ["check", "--message-format=short", "--quiet"], { cwd: projectRoot, timeoutMs: 180000 });
  if (r.missing) return { ok: true, errors: ["cargo nicht gefunden – Prüfung übersprungen."], skipped: true };
  if (r.code === 0) return { ok: true, errors: [] };
  const errs = r.stderr.split(/\r?\n/).filter((l) => /error/i.test(l)).slice(0, 10);
  return { ok: false, errors: errs.length ? errs : ["cargo check fehlgeschlagen"] };
}

export async function checkSyntax(projectRoot: string, file: string, source: string): Promise<SyntaxResult> {
  if (/\.(tsx?|jsx?|mjs|cjs|mts|cts)$/i.test(file)) return checkTsSyntax(source, file);
  return checkExternalSyntax(projectRoot, file, source);
}

/** Schreibt nur, wenn die Syntaxprüfung besteht; bei Rust wird nach dem Schreiben geprüft und ggf. zurückgerollt. */
export async function writeChecked(projectRoot: string, file: string, content: string, dryRun = false): Promise<{ ok: boolean; message?: string; errors?: string[]; written?: boolean }> {
  const full = resolveInside(projectRoot, file);
  const chk = await checkSyntax(projectRoot, full, content);
  if (!chk.ok) return { ok: false, message: "Syntaxfehler – Datei wurde nicht geschrieben.", errors: chk.errors, written: false };
  if (dryRun) return { ok: true, written: false };
  const old = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  if (path.extname(full).toLowerCase() === ".rs") {
    const c = await cargoCheck(projectRoot);
    if (!c.ok) {
      if (old === null) fs.unlinkSync(full); else fs.writeFileSync(full, old, "utf8");
      return { ok: false, message: "cargo check fehlgeschlagen – Änderung zurückgerollt.", errors: c.errors, written: false };
    }
  }
  return { ok: true, written: true };
}

/* ---------- Operationen ---------- */

function read(projectRoot: string, file: string) {
  const full = resolveInside(projectRoot, file);
  return { full, source: fs.readFileSync(full, "utf8") };
}

export const operations: Record<string, PluginOp> = {
  listNodes: wrap(async (a) => {
    const { full, source } = read(a.projectRoot, a.file);
    return { ok: true, nodes: listNodes(source, full) };
  }),
  checkSyntax: wrap(async (a) => {
    const { full, source } = read(a.projectRoot, a.file);
    return { ...(await checkSyntax(a.projectRoot, full, source)) };
  }),
  renameSymbol: wrap(async (a) => {
    const { full, source } = read(a.projectRoot, a.file);
    const r = renameSymbolInSource(source, String(a.oldName), String(a.newName), full);
    if (r.count === 0) return { ok: false, message: `Symbol "${a.oldName}" nicht gefunden.` };
    const w = await writeChecked(a.projectRoot, a.file, r.text, !!a.dryRun);
    return { ...w, replacements: r.count };
  }),
  replaceNode: wrap(async (a) => {
    const { full, source } = read(a.projectRoot, a.file);
    return writeChecked(a.projectRoot, a.file, replaceNodeInSource(source, full, a.kind, a.name, String(a.text)), !!a.dryRun);
  }),
  insertNode: wrap(async (a) => {
    const { full, source } = read(a.projectRoot, a.file);
    return writeChecked(a.projectRoot, a.file, insertAfterNodeInSource(source, full, a.kind, a.name, String(a.text)), !!a.dryRun);
  }),
  extractNode: wrap(async (a) => {
    const { full, source } = read(a.projectRoot, a.file);
    const { text, removed } = removeNodeInSource(source, full, a.kind, a.name);
    if (!a.targetFile) return { ok: true, extracted: removed };
    const target = resolveInside(a.projectRoot, a.targetFile);
    const tgtOld = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
    const tgtNew = (tgtOld ? tgtOld.replace(/\s*$/, "\n\n") : "") + removed + "\n";
    const c1 = await checkSyntax(a.projectRoot, target, tgtNew);
    const c2 = await checkSyntax(a.projectRoot, full, text);
    if (!c1.ok || !c2.ok) return { ok: false, message: "Syntaxfehler – nichts geschrieben.", errors: [...c1.errors, ...c2.errors] };
    if (a.dryRun) return { ok: true, extracted: removed, written: false };
    const w1 = await writeChecked(a.projectRoot, a.targetFile, tgtNew);
    if (!w1.ok) return w1;
    const w2 = await writeChecked(a.projectRoot, a.file, text);
    return { ...w2, extracted: removed };
  }),
};
