/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export const manifest = {
  id: "prReviewer",
  name: "Autonomer PR-Reviewer",
  version: "1.0.0",
  description: "Simuliert vor dem Push einen Pull Request und erzeugt Review-Befunde.",
};

export type Severity = "info" | "warn" | "high";
export interface Finding { rule: string; severity: Severity; file: string; line?: number; message: string; hotspot?: boolean }
export interface FileStat { file: string; added: number; deleted: number }

const MAX_PATCH = 200_000;
const HOOK_MARK = "# hermes-pr-reviewer";

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function git(root: string, args: string[], maxBuffer = 8 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: root, timeout: 20_000, windowsHide: true, maxBuffer }, (err, stdout) => (err ? reject(new Error("git fehlgeschlagen")) : resolve(String(stdout))));
  });
}

export function validRef(ref: string): boolean {
  return /^[A-Za-z0-9._\/-]+$/.test(ref) && !ref.startsWith("-");
}

export function parseNumstat(out: string): FileStat[] {
  return out.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [a, d, ...f] = l.split("\t");
    return { file: f.join("\t"), added: a === "-" ? 0 : Number(a) || 0, deleted: d === "-" ? 0 : Number(d) || 0 };
  });
}

export function truncatePatch(patch: string, max = MAX_PATCH): { patch: string; truncated: boolean } {
  return patch.length > max ? { patch: patch.slice(0, max), truncated: true } : { patch, truncated: false };
}

export interface AddedLine { file: string; line: number; text: string }
export function parseAddedLines(patch: string): AddedLine[] {
  const out: AddedLine[] = [];
  let file = "";
  let ln = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("+++ ")) { file = raw.slice(4).replace(/^b\//, "").trim(); continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
    if (h) { ln = Number(h[1]); continue; }
    if (raw.startsWith("+") && !raw.startsWith("+++")) { out.push({ file, line: ln, text: raw.slice(1) }); ln++; }
    else if (!raw.startsWith("-") && !raw.startsWith("\\")) ln++;
  }
  return out;
}

const SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:sk|ghp|gho|xox[bp])[-_][A-Za-z0-9-_]{20,}/,
  /(?:api[_-]?key|secret|token|passwort|password)\s*[:=]\s*["'][^"']{12,}["']/i,
];
const SRC_RE = /\.(?:ts|tsx|js|jsx|mjs|py)$/;
const TEST_RE = /(?:\.test\.|\.spec\.|(?:^|\/)tests?\/|__tests__)/;
const HOT_RE = /(?:^|\/)(?:main|ipc|handlers?|server|render|renderer|App)[^/]*\.(?:ts|tsx|js)$|electron\/|hot/i;

export function runHeuristics(patch: string, stats: FileStat[]): Finding[] {
  const findings: Finding[] = [];
  const added = parseAddedLines(patch);
  const loopOpen = /\b(?:for|while)\s*\(|\.forEach\(|\.map\(/;
  const dbCall = /\b(?:await\s+)?(?:\w+\.)*(?:query|findOne|findById|fetch|execute|get|select|invoke)\s*\(/;
  const byFile = new Map<string, AddedLine[]>();
  for (const a of added) (byFile.get(a.file) ?? byFile.set(a.file, []).get(a.file)!).push(a);

  for (const [file, lines] of byFile) {
    const hot = HOT_RE.test(file);
    let loopLine = -100;
    let fnStart: AddedLine | null = null;
    let fnLen = 0;
    let prev = -1;
    for (const l of lines) {
      const t = l.text;
      if (/\bTODO\b|\bFIXME\b/.test(t)) findings.push({ rule: "todo", severity: "info", file, line: l.line, message: "Neuer TODO/FIXME-Kommentar." });
      if (/\bconsole\.log\s*\(/.test(t) && !TEST_RE.test(file)) findings.push({ rule: "console-log", severity: "warn", file, line: l.line, message: "Neues console.log." });
      if (/^\s*debugger\s*;?\s*$/.test(t)) findings.push({ rule: "debugger", severity: "high", file, line: l.line, message: "debugger-Anweisung entfernt werden." });
      if (/\b(?:readFileSync|writeFileSync|readdirSync|statSync|existsSync|execSync|spawnSync)\s*\(/.test(t)) {
        findings.push({ rule: "sync-fs", severity: hot ? "high" : "warn", file, line: l.line, hotspot: hot, message: "Synchroner FS/Prozess-Aufruf" + (hot ? " in möglichem Hot-Path." : ".") });
      }
      if (loopOpen.test(t)) loopLine = l.line;
      if (l.line - loopLine <= 6 && l.line !== loopLine && dbCall.test(t) && /await|query|execute|select|invoke|fetch/i.test(t)) {
        findings.push({ rule: "n-plus-one", severity: "high", file, line: l.line, hotspot: true, message: "Möglicher N+1-Aufruf innerhalb einer Schleife." });
        loopLine = -100;
      }
      for (const p of SECRET_PATTERNS) if (p.test(t)) { findings.push({ rule: "secret", severity: "high", file, line: l.line, message: "Mögliches Geheimnis im Diff (Wert nicht angezeigt)." }); break; }
      const isFn = /(?:\bfunction\b|=>\s*\{|^\s*(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*[\w<>\[\]|]+\s*)?\{)/.test(t);
      if (isFn && (fnStart === null || l.line !== prev + 1)) { fnStart = l; fnLen = 0; }
      if (fnStart) {
        if (l.line === prev + 1 || l === fnStart) fnLen++;
        else { fnStart = null; fnLen = 0; }
        if (fnStart && fnLen === 80) findings.push({ rule: "large-function", severity: "warn", file, line: fnStart.line, message: "Große Funktion (>80 neue Zeilen am Stück).", hotspot: false });
      }
      prev = l.line;
    }
  }

  const changed = stats.map((s) => s.file);
  const hasTests = changed.some((f) => TEST_RE.test(f));
  for (const f of changed) {
    if (SRC_RE.test(f) && !TEST_RE.test(f) && !hasTests) {
      findings.push({ rule: "missing-tests", severity: "warn", file: f, message: "Quelldatei geändert, aber keine Testdatei im Diff." });
    }
  }
  return findings;
}

export function buildReviewPrompt(base: string, stats: FileStat[], findings: Finding[], patch: string, truncated: boolean): string {
  const files = stats.map((s) => `- ${s.file} (+${s.added}/-${s.deleted})`).join("\n") || "- (keine)";
  const fl = findings.map((f) => `- [${f.severity}${f.hotspot ? ", Performance-Hotspot" : ""}] ${f.file}${f.line ? ":" + f.line : ""} ${f.rule}: ${f.message}`).join("\n") || "- (keine)";
  return [
    "Du bist ein erfahrener Senior-Architekt und reviewst diesen Pull Request kritisch.",
    "Prüfe Architektur, Korrektheit, Sicherheit, Performance (Hotspots, N+1, blockierende Aufrufe), Testabdeckung und Wartbarkeit.",
    "Antworte mit priorisierten Befunden (blocker/major/minor) und konkreten Verbesserungsvorschlägen.",
    `\nBasis: ${base}...HEAD\n\nGeänderte Dateien:\n${files}\n\nHeuristische Vorbefunde:\n${fl}`,
    `\nPatch${truncated ? " (gekürzt)" : ""}:\n\`\`\`diff\n${patch}\n\`\`\``,
  ].join("\n");
}

export async function simulatePr(projectRoot: string, base = "origin/main", maxPatch = MAX_PATCH) {
  try {
    if (!projectRoot || !fs.existsSync(projectRoot)) return { ok: false as const, message: "Projektordner nicht gefunden." };
    if (!validRef(base)) return { ok: false as const, message: "Ungültige Basis-Referenz." };
    const range = `${base}...HEAD`;
    const [numstat, rawPatch] = await Promise.all([git(projectRoot, ["diff", "--numstat", range]), git(projectRoot, ["diff", "--unified=3", range])]);
    const stats = parseNumstat(numstat);
    const { patch, truncated } = truncatePatch(rawPatch, maxPatch);
    const findings = runHeuristics(rawPatch, stats);
    return {
      ok: true as const,
      base,
      stats,
      totals: { files: stats.length, added: stats.reduce((a, s) => a + s.added, 0), deleted: stats.reduce((a, s) => a + s.deleted, 0) },
      findings,
      hotspots: findings.filter((f) => f.hotspot),
      truncated,
      prompt: buildReviewPrompt(base, stats, findings, patch, truncated),
    };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

export function buildHookScript(outFile: string): string {
  const q = outFile.replace(/'/g, "'\\''");
  return `#!/bin/sh\n${HOOK_MARK}\nout='${q}'\nmkdir -p "$(dirname "$out")"\n{ echo "Review angefordert: $(date -u +%FT%TZ)"; echo "Remote: $1"; git diff --stat "@{upstream}...HEAD" 2>/dev/null || git diff --stat HEAD~1...HEAD; } > "$out"\nexit 0\n`;
}

export function installPrePushHook(projectRoot: string, outFile = ".hermes/review-request.txt") {
  try {
    const hooksDir = path.join(projectRoot, ".git", "hooks");
    if (!fs.existsSync(hooksDir)) return { ok: false as const, message: "Kein .git/hooks-Ordner gefunden." };
    const out = path.resolve(projectRoot, outFile);
    if (!isInside(projectRoot, out)) return { ok: false as const, message: "Ausgabepfad liegt außerhalb des Projekts." };
    const hook = path.join(hooksDir, "pre-push");
    if (fs.existsSync(hook) && !fs.readFileSync(hook, "utf8").includes(HOOK_MARK)) return { ok: false as const, message: "Ein fremder pre-push-Hook existiert bereits." };
    fs.writeFileSync(hook, buildHookScript(out), { mode: 0o755 });
    return { ok: true as const, hook };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

export function uninstallPrePushHook(projectRoot: string) {
  try {
    const hook = path.join(projectRoot, ".git", "hooks", "pre-push");
    if (!fs.existsSync(hook)) return { ok: true as const, removed: false };
    if (!fs.readFileSync(hook, "utf8").includes(HOOK_MARK)) return { ok: false as const, message: "Hook stammt nicht von Hermes." };
    fs.unlinkSync(hook);
    return { ok: true as const, removed: true };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  simulate: async (a) => simulatePr(a?.projectRoot, a?.base, a?.maxPatch),
  installHook: async (a) => installPrePushHook(a?.projectRoot, a?.outFile),
  uninstallHook: async (a) => uninstallPrePushHook(a?.projectRoot),
};
