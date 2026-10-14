/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

export const manifest = {
  id: "secretGuard",
  name: "Secret Leak Guard",
  version: "1.0.0",
  description: "Erkennt Tokens, Schlüssel und Seed-Phrasen in Text und Staged-Diffs; schwärzt Funde und installiert einen Pre-Commit-Hook.",
  category: "security" as const,
  configFields: [
    { key: "entropyThreshold", label: "Entropie-Schwelle", type: "number" as const, default: 3.0, help: "Shannon-Entropie für generische Zuweisungen (password=, api_key=)." },
    { key: "allowlist", label: "Allowlist (Hashes)", type: "list" as const, default: [], help: "Kurz-Hashes bekannter Fehlalarme." },
    { key: "blockCommit", label: "Commit bei Fund blockieren", type: "boolean" as const, default: true },
  ],
};

export type Result<T = {}> = ({ ok: true } & T) | { ok: false; message: string };
export interface Finding { kind: string; line: number; col: number; preview: string; hash: string; file?: string; }
interface RawFinding extends Finding { start: number; end: number; }
export interface ScanOptions { allowlist?: string[]; entropyThreshold?: number; }

export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const f = new Map<string, number>();
  for (const c of s) f.set(c, (f.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of f.values()) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

/** Kurz-Hash (16 Hex) für Allowlist, nie das Geheimnis selbst. */
export function secretHash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 16);
}

/** Maskierte Vorschau: höchstens 4 Zeichen sichtbar. */
export function maskPreview(secret: string): string {
  if (secret.length <= 8) return "****";
  return `${secret.slice(0, 4)}****(${secret.length})`;
}

interface Detector { kind: string; re: RegExp; group?: number; }
const DETECTORS: Detector[] = [
  { kind: "pem-private-key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g },
  { kind: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: "openai-key", re: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g },
  { kind: "aws-access-key", re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[A-Z0-9]{16}\b/g },
  { kind: "gcp-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "github-token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/g },
  { kind: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { kind: "stripe-key", re: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{20,}/g },
  { kind: "telegram-bot-token", re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { kind: "eth-private-key", re: /\b0x[0-9a-fA-F]{64}\b/g },
  { kind: "solana-private-key", re: /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{87,88}(?![1-9A-HJ-NP-Za-km-z])/g },
];

const GENERIC_RE = /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|token)\b["']?\s*[:=]\s*["']?([^\s"',;]{8,})/gi;
const PLACEHOLDER_RE = /(example|changeme|placeholder|your[_-]|xxxx|\*{3,}|<[^>]*>|\$\{|\{\{|process\.env|getenv|dummy|sample|redacted|geschwärzt)/i;
const SEED_LENGTHS = new Set([12, 15, 18, 21, 24]);

function lineOffsets(text: string): number[] {
  const o = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") o.push(i + 1);
  return o;
}
function locate(offsets: number[], pos: number): { line: number; col: number } {
  let lo = 0, hi = offsets.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (offsets[mid] <= pos) lo = mid; else hi = mid - 1; }
  return { line: lo + 1, col: pos - offsets[lo] + 1 };
}

function scanRaw(text: string, opts: ScanOptions = {}): RawFinding[] {
  const src = String(text ?? "");
  const offsets = lineOffsets(src);
  const threshold = opts.entropyThreshold ?? 3.0;
  const allow = new Set(opts.allowlist ?? []);
  const found: RawFinding[] = [];
  const add = (kind: string, start: number, end: number, secret: string, previewOverride?: string) => {
    const hash = secretHash(secret);
    if (allow.has(hash)) return;
    const { line, col } = locate(offsets, start);
    found.push({ kind, line, col, preview: previewOverride ?? maskPreview(secret), hash, start, end });
  };

  for (const d of DETECTORS) {
    d.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = d.re.exec(src))) {
      if (d.kind === "pem-private-key") {
        const endRe = /-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----/g;
        endRe.lastIndex = m.index;
        const e = endRe.exec(src);
        const end = e ? e.index + e[0].length : m.index + m[0].length;
        add(d.kind, m.index, end, src.slice(m.index, end), "-----BEGIN ****");
        d.re.lastIndex = Math.max(end, d.re.lastIndex);
        continue;
      }
      if (d.kind === "solana-private-key" && !/\d/.test(m[0])) continue;
      add(d.kind, m.index, m.index + m[0].length, m[0]);
    }
  }

  // 64 Hex neben Schlüsselwörtern (ohne 0x-Präfix)
  const hexRe = /(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])/g;
  let hm: RegExpExecArray | null;
  while ((hm = hexRe.exec(src))) {
    const ls = offsets[locate(offsets, hm.index).line - 1];
    const le = src.indexOf("\n", hm.index);
    const lineTxt = src.slice(ls, le < 0 ? src.length : le);
    if (/priv|secret|seed|wallet|mnemonic|signer/i.test(lineTxt) && src[hm.index - 1] !== "x") add("hex-private-key", hm.index, hm.index + 64, hm[0]);
  }

  // Seed-Phrase-Heuristik
  const lines = src.split("\n");
  lines.forEach((ln, idx) => {
    const trimmed = ln.replace(/^\s*(?:[\w.-]+\s*[:=]\s*)?["'`]?/, "").replace(/["'`,;\s]+$/, "");
    const words = trimmed.split(/\s+/);
    if (!SEED_LENGTHS.has(words.length)) return;
    if (!words.every((w) => /^[a-z]{3,8}$/.test(w))) return;
    if (new Set(words).size < words.length - 1) return;
    const start = offsets[idx] + ln.indexOf(words[0]);
    add("possible-seed-phrase", start, start + trimmed.length, trimmed, `${words[0].slice(0, 2)}**** (${words.length} Wörter)`);
  });

  // Generische Zuweisungen
  GENERIC_RE.lastIndex = 0;
  let gm: RegExpExecArray | null;
  while ((gm = GENERIC_RE.exec(src))) {
    const val = gm[2];
    if (PLACEHOLDER_RE.test(val) || /^[A-Za-z_.]+\(/.test(val)) continue;
    if (shannonEntropy(val) < threshold) continue;
    const start = gm.index + gm[0].length - val.length;
    add("high-entropy-assignment", start, start + val.length, val, `${gm[1].toLowerCase()}=****`);
  }

  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: RawFinding[] = [];
  let lastEnd = -1;
  for (const f of found) { if (f.start >= lastEnd) { out.push(f); lastEnd = f.end; } }
  return out;
}

export function scanText(text: string, opts: ScanOptions = {}): Finding[] {
  return scanRaw(text, opts).map(({ start: _s, end: _e, ...f }) => f);
}

export function redact(text: string, opts: ScanOptions = {}): string {
  const src = String(text ?? "");
  const fs_ = scanRaw(src, opts);
  let out = "";
  let pos = 0;
  for (const f of fs_) { out += src.slice(pos, f.start) + `[GESCHWÄRZT:${f.kind}]`; pos = f.end; }
  return out + src.slice(pos);
}

/* ---------------- Staged Diff ---------------- */

export type ExecFileLike = (file: string, args: string[], opts: any, cb: (err: Error | null, stdout: string, stderr: string) => void) => unknown;

export function parseAddedLines(diff: string): Array<{ file: string; line: number; text: string }> {
  const res: Array<{ file: string; line: number; text: string }> = [];
  let file = "";
  let ln = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) { file = raw.slice(4).replace(/^b\//, ""); continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (h) { ln = parseInt(h[1], 10); continue; }
    if (raw.startsWith("+") && !raw.startsWith("+++")) { res.push({ file, line: ln, text: raw.slice(1) }); ln++; }
    else if (!raw.startsWith("-") && !raw.startsWith("\\")) ln++;
  }
  return res;
}

export function scanDiffText(diff: string, opts: ScanOptions = {}): Finding[] {
  const out: Finding[] = [];
  for (const l of parseAddedLines(diff)) {
    for (const f of scanText(l.text, opts)) out.push({ ...f, file: l.file, line: l.line });
  }
  return out;
}

export async function scanStagedDiff(projectRoot: string, opts: ScanOptions = {}, exec: ExecFileLike = execFile as any): Promise<Result<{ findings: Finding[]; clean: boolean }>> {
  try {
    if (!projectRoot) return { ok: false, message: "projectRoot fehlt." };
    const diff: string = await new Promise((resolve, reject) => {
      exec("git", ["-C", projectRoot, "diff", "--cached", "--no-color", "-U0"], { maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
    });
    const findings = scanDiffText(diff, opts);
    return { ok: true, findings, clean: findings.length === 0 };
  } catch (e) {
    return { ok: false, message: `Git-Diff konnte nicht gelesen werden: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` };
  }
}

/* ---------------- Pre-Commit-Hook ---------------- */

export const HOOK_MARKER = "# hermes-secretguard-hook";

export function hookScript(): string {
  const pattern = "(AKIA|ASIA)[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36,}|xox[abprs]-[A-Za-z0-9-]{10,}|[sr]k_(live|test)_[0-9a-zA-Z]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{8,}\\.eyJ[A-Za-z0-9_-]{8,}\\.";
  return `#!/bin/sh\n${HOOK_MARKER}\n# Verwaltet von Hermes Harness (Secret Leak Guard). Entfernen über die App.\nif git diff --cached -U0 --no-color | grep -E '^\\+' | grep -Eq '${pattern}'; then\n  echo "Secret Leak Guard: möglicher Schlüssel im Commit gefunden. Commit abgebrochen." >&2\n  exit 1\nfi\nexit 0\n`;
}

function hookPath(projectRoot: string): string | null {
  const g = path.join(projectRoot, ".git");
  try { if (fs.statSync(g).isDirectory()) return path.join(g, "hooks", "pre-commit"); } catch { /* kein Repo */ }
  return null;
}

export function installPreCommitHook(projectRoot: string): Result<{ path: string; replaced: boolean }> {
  try {
    const p = projectRoot ? hookPath(projectRoot) : null;
    if (!p) return { ok: false, message: "Kein Git-Repository gefunden." };
    let replaced = false;
    if (fs.existsSync(p)) {
      const cur = fs.readFileSync(p, "utf8");
      if (!cur.includes(HOOK_MARKER)) return { ok: false, message: "Ein fremder Pre-Commit-Hook existiert bereits und wird nicht überschrieben." };
      replaced = true;
    }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, hookScript(), { mode: 0o755 });
    return { ok: true, path: p, replaced };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
}

export function uninstallPreCommitHook(projectRoot: string): Result<{ removed: boolean }> {
  try {
    const p = projectRoot ? hookPath(projectRoot) : null;
    if (!p) return { ok: false, message: "Kein Git-Repository gefunden." };
    if (!fs.existsSync(p)) return { ok: true, removed: false };
    if (!fs.readFileSync(p, "utf8").includes(HOOK_MARKER)) return { ok: false, message: "Der Hook gehört nicht zu Hermes und wird nicht entfernt." };
    fs.unlinkSync(p);
    return { ok: true, removed: true };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
}

const wrap = <T>(f: () => T | Promise<T>) => async () => { try { return await f(); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; } };

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  scanText: async (a) => wrap(() => ({ ok: true, findings: scanText(String(a?.text ?? ""), { allowlist: a?.allowlist, entropyThreshold: a?.entropyThreshold }) }))(),
  redact: async (a) => wrap(() => ({ ok: true, text: redact(String(a?.text ?? ""), { allowlist: a?.allowlist, entropyThreshold: a?.entropyThreshold }) }))(),
  scanStagedDiff: async (a) => scanStagedDiff(a?.projectRoot, { allowlist: a?.allowlist, entropyThreshold: a?.entropyThreshold }),
  installHook: async (a) => wrap(() => installPreCommitHook(a?.projectRoot))(),
  uninstallHook: async (a) => wrap(() => uninstallPreCommitHook(a?.projectRoot))(),
  hashSecret: async (a) => (typeof a?.secret === "string" && a.secret ? { ok: true, hash: secretHash(a.secret) } : { ok: false, message: "Wert fehlt." }),
};
