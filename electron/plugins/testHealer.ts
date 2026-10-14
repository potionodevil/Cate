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

export const manifest = { id: "testHealer", name: "Automated Test-Healer", version: "1.0.0", description: "Führt Tests aus, parst Fehler (node:test, jest/vitest, pytest, cargo) und steuert eine Heilungsschleife." };

export type Framework = "node" | "jest" | "pytest" | "cargo" | "unknown";
export interface TestFailure { framework: Framework; name: string; file?: string; line?: number; column?: number; message: string; stack: string }

export function stripAnsi(s: string): string {
  return s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

export function detectFramework(output: string, command = ""): Framework {
  const c = command.toLowerCase();
  if (/pytest/.test(c) || /=+ (FAILURES|short test summary)/.test(output) || /^_{3,} .+ _{3,}$/m.test(output)) return "pytest";
  if (/cargo\s+test/.test(c) || /^---- .+ stdout ----$/m.test(output) || /panicked at/.test(output)) return "cargo";
  if (/jest|vitest/.test(c) || /^\s*● .+ › /m.test(output) || /^\s*FAIL\s/m.test(output) || /⎯⎯ Failed Tests/.test(output)) return "jest";
  if (/node\s+(.*--test|--test)/.test(c) || /^\s*not ok \d+/m.test(output) || /^\s*✖ /m.test(output) || /^# fail \d+/m.test(output)) return "node";
  return "unknown";
}

function locFrom(text: string): { file?: string; line?: number; column?: number } {
  const re = /((?:[A-Za-z]:)?[^\s()'"<>]+?\.(?:[mc]?[jt]sx?|py|rs)):(\d+)(?::(\d+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const f = m[1].replace(/^file:\/\/\/?/, "");
    if (/node_modules|node:internal/.test(f)) continue;
    return { file: f, line: Number(m[2]), column: m[3] ? Number(m[3]) : undefined };
  }
  return {};
}

function parseNode(out: string): TestFailure[] {
  const res: TestFailure[] = [];
  const lines = out.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)not ok \d+ - (.+)$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const block: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (/^\s*(not )?ok \d+/.test(l) && l.search(/\S/) <= indent) break;
      block.push(l);
    }
    const text = block.join("\n");
    if (/^\s*#?\s*Subtest/.test(block[0] ?? "") && !/error:/.test(text)) { /* Container-Test */ }
    const msg = /error: ['"]?(.+?)['"]?\s*$/m.exec(text)?.[1] ?? text.split("\n").find((l) => l.trim() && !/^\s*(---|\.\.\.|duration_ms|type:)/.test(l))?.trim() ?? "Test fehlgeschlagen";
    let loc = locFrom((/location: ['"](.+?)['"]/.exec(text)?.[1]) ?? "");
    if (!loc.file) loc = locFrom(text);
    if (!/error:|stack:/.test(text) && block.some((l) => /^\s*ok \d+|^\s*not ok \d+/.test(l))) continue;
    res.push({ framework: "node", name: m[2].trim(), ...loc, message: msg, stack: text.trim().slice(0, 2000) });
  }
  if (res.length === 0) {
    // spec reporter
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*✖ (.+?)(?: \([\d.]+ms\))?$/.exec(lines[i]);
      if (!m) continue;
      const text = lines.slice(i + 1, i + 25).join("\n");
      res.push({ framework: "node", name: m[1], ...locFrom(text), message: text.split("\n").find((l) => l.trim())?.trim() ?? "Test fehlgeschlagen", stack: text.trim().slice(0, 2000) });
    }
  }
  return res;
}

function parseJest(out: string): TestFailure[] {
  const res: TestFailure[] = [];
  const parts = out.split(/^\s*● /m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf("\n");
    const name = (nl < 0 ? p : p.slice(0, nl)).trim();
    if (!/ › /.test(name) && !/^\S/.test(name)) continue;
    if (/Console|Test suite failed to run/.test(name) && !/ › /.test(name)) continue;
    const body = nl < 0 ? "" : p.slice(nl + 1);
    const msg = body.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3).join(" ");
    res.push({ framework: "jest", name, ...locFrom(body.split(/\n\s*at /).slice(1).map((s) => "at " + s).join("\n") || body), message: msg || "Test fehlgeschlagen", stack: body.trim().slice(0, 2000) });
  }
  if (res.length === 0) {
    // vitest: " FAIL  file > suite > test"
    const re = /^\s*FAIL\s+(\S+?)\s*(?:>\s*(.+))?$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(out))) {
      const rest = out.slice(m.index, m.index + 1500);
      res.push({ framework: "jest", name: m[2]?.trim() ?? m[1], ...locFrom(rest), message: (/(?:Assertion|Type)?Error:.*$/m.exec(rest)?.[0] ?? "Test fehlgeschlagen").trim(), stack: rest.trim() });
    }
  }
  return res;
}

function parsePytest(out: string): TestFailure[] {
  const res: TestFailure[] = [];
  const re = /^_{3,} (.+?) _{3,}$/gm;
  const heads: Array<{ name: string; idx: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(out))) heads.push({ name: m[1], idx: m.index, end: re.lastIndex });
  heads.forEach((h, i) => {
    const body = out.slice(h.end, i + 1 < heads.length ? heads[i + 1].idx : out.length).split(/^={3,}/m)[0];
    const eLines = body.split("\n").filter((l) => /^E\s/.test(l)).map((l) => l.replace(/^E\s+/, "").trim());
    const locs = [...body.matchAll(/^([^\s:]+\.py):(\d+): ?(\w*)/gm)];
    const last = locs[locs.length - 1];
    res.push({ framework: "pytest", name: h.name, file: last?.[1], line: last ? Number(last[2]) : undefined, message: eLines.slice(0, 3).join(" ") || "Test fehlgeschlagen", stack: body.trim().slice(0, 2000) });
  });
  if (res.length === 0) {
    for (const s of out.matchAll(/^FAILED ([^\s:]+\.py)::(\S+)(?: - (.*))?$/gm)) {
      res.push({ framework: "pytest", name: s[2], file: s[1], message: s[3] ?? "Test fehlgeschlagen", stack: s[0] });
    }
  }
  return res;
}

function parseCargo(out: string): TestFailure[] {
  const res: TestFailure[] = [];
  const re = /^---- (.+?) stdout ----$/gm;
  const heads: Array<{ name: string; idx: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(out))) heads.push({ name: m[1], idx: m.index, end: re.lastIndex });
  heads.forEach((h, i) => {
    const body = out.slice(h.end, i + 1 < heads.length ? heads[i + 1].idx : out.length).split(/^failures:$/m)[0];
    let file: string | undefined, line: number | undefined, column: number | undefined, msg = "";
    const n = /panicked at ([^\s:]+\.rs):(\d+):(\d+):?\s*\n?([^\n]*)/.exec(body);
    if (n) { file = n[1]; line = Number(n[2]); column = Number(n[3]); msg = n[4]; }
    else {
      const o = /panicked at '([\s\S]*?)', ([^\s:]+\.rs):(\d+):(\d+)/.exec(body);
      if (o) { msg = o[1]; file = o[2]; line = Number(o[3]); column = Number(o[4]); }
    }
    res.push({ framework: "cargo", name: h.name, file, line, column, message: msg.trim() || "Test fehlgeschlagen", stack: body.trim().slice(0, 2000) });
  });
  return res;
}

export function parseFailures(output: string, framework: Framework | "auto" = "auto", command = ""): TestFailure[] {
  const out = stripAnsi(output);
  const fw = framework === "auto" ? detectFramework(out, command) : framework;
  switch (fw) {
    case "node": return parseNode(out);
    case "jest": return parseJest(out);
    case "pytest": return parsePytest(out);
    case "cargo": return parseCargo(out);
    default: return [parseNode, parseJest, parsePytest, parseCargo].flatMap((f) => f(out)).slice(0, 50);
  }
}

export function buildPrompt(failures: TestFailure[], command: string, iteration = 1): string {
  if (failures.length === 0) return "Alle Tests sind grün.";
  const items = failures.slice(0, 10).map((f, i) =>
    `${i + 1}. ${f.name}${f.file ? ` (${f.file}${f.line ? ":" + f.line : ""})` : ""}\n   Meldung: ${f.message}\n   Stack:\n${f.stack.split("\n").slice(0, 12).map((l) => "   " + l).join("\n")}`);
  return `Testlauf ${iteration} ("${command}") hat ${failures.length} Fehler. Bitte behebe die Ursache im Code (Tests nicht abschwächen) und ändere nur das Nötige.\n\n${items.join("\n\n")}`;
}

export function splitCommand(cmd: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cmd))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

export interface TestRun { ok: boolean; exitCode: number | null; output: string; failures: TestFailure[]; prompt: string; timedOut?: boolean; message?: string }

export async function runTests(projectRoot: string, command: string, timeoutMs = 300000, iteration = 1): Promise<TestRun> {
  const root = resolveInside(projectRoot, ".");
  const parts = splitCommand(command || "");
  if (parts.length === 0) return { ok: false, exitCode: null, output: "", failures: [], prompt: "", message: "Kein Testbefehl konfiguriert." };
  const r = await runCmd(parts[0], parts.slice(1), { cwd: root, timeoutMs });
  if (r.missing) return { ok: false, exitCode: null, output: r.stderr, failures: [], prompt: "", message: `Befehl "${parts[0]}" nicht gefunden.` };
  const output = r.stdout + (r.stderr ? "\n" + r.stderr : "");
  const failures = r.code === 0 ? [] : parseFailures(output, "auto", command);
  return { ok: r.code === 0, exitCode: r.code, output: output.slice(-60000), failures, prompt: r.code === 0 ? "Alle Tests sind grün." : buildPrompt(failures, command, iteration), timedOut: r.timedOut };
}

export interface HealOptions {
  projectRoot: string;
  command: string;
  maxIterations?: number;
  timeoutMs?: number;
  fix: (payload: { prompt: string; failures: TestFailure[]; iteration: number; output: string }) => Promise<unknown>;
  runner?: (iteration: number) => Promise<TestRun>;
  onIteration?: (run: TestRun, iteration: number) => void;
  shouldStop?: () => boolean;
}
export interface HealResult { ok: boolean; green: boolean; iterations: number; lastRun?: TestRun; message: string }

export async function healLoop(opts: HealOptions): Promise<HealResult> {
  const max = Math.max(1, Math.min(opts.maxIterations ?? 5, 20));
  let last: TestRun | undefined;
  for (let i = 1; i <= max; i++) {
    if (opts.shouldStop?.()) return { ok: true, green: false, iterations: i - 1, lastRun: last, message: "Abgebrochen." };
    try {
      last = opts.runner ? await opts.runner(i) : await runTests(opts.projectRoot, opts.command, opts.timeoutMs, i);
    } catch (e) {
      return { ok: false, green: false, iterations: i, lastRun: last, message: e instanceof Error ? e.message : String(e) };
    }
    opts.onIteration?.(last, i);
    if (last.ok) return { ok: true, green: true, iterations: i, lastRun: last, message: `Tests grün nach ${i} Durchlauf/Durchläufen.` };
    if (last.message && last.exitCode === null) return { ok: false, green: false, iterations: i, lastRun: last, message: last.message };
    if (i === max) break;
    try {
      await opts.fix({ prompt: last.prompt, failures: last.failures, iteration: i, output: last.output });
    } catch (e) {
      return { ok: false, green: false, iterations: i, lastRun: last, message: "Fix-Schritt fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)) };
    }
  }
  return { ok: true, green: false, iterations: max, lastRun: last, message: `Nach ${max} Iterationen noch nicht grün.` };
}

export const operations: Record<string, PluginOp> = {
  runTests: wrap(async (a) => ({ ...(await runTests(a.projectRoot, String(a.command ?? ""), a.timeoutMs)) })),
  parseOutput: wrap(async (a) => {
    const failures = parseFailures(String(a.output ?? ""), a.framework ?? "auto", String(a.command ?? ""));
    return { ok: true, failures, prompt: buildPrompt(failures, String(a.command ?? "")) };
  }),
  buildPrompt: wrap(async (a) => ({ ok: true, prompt: buildPrompt(a.failures ?? [], String(a.command ?? ""), a.iteration ?? 1) })),
};
