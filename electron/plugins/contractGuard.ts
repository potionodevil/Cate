/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 *
 * Smart Contract Gas & Simulation Guard: statischer Scanner (Solidity, Rust/Anchor),
 * Gas-Hinweise und rein lesende Simulation (forge/anchor). Kein Deploy, kein Broadcast,
 * keine privaten Schlüssel.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export const manifest = {
  id: "contractGuard",
  name: "Smart Contract Gas & Simulation Guard",
  version: "1.0.0",
  description: "Statische Sicherheits- und Gas-Analyse für Solidity und Anchor/Solana, nur lesende Simulation.",
  category: "web3" as const,
  configFields: [
    { key: "timeoutMs", label: "Timeout (ms)", type: "number" as const, default: 120000 },
    { key: "maxFiles", label: "Max. Dateien", type: "number" as const, default: 200 },
  ],
};

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export interface Finding { id: string; severity: Severity; file: string; line: number; title: string; advice: string }
export type Result<T = {}> = ({ ok: true } & T) | { ok: false; message: string };

const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function stripComments(src: string): string {
  // Zeilenstruktur erhalten: Kommentare durch Leerzeichen ersetzen
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

function lineOf(src: string, idx: number): number {
  let n = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

/** Findet den Funktionsrumpf ab Index der öffnenden Klammer. */
function matchBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
  }
  return src.length - 1;
}

interface Fn { name: string; header: string; body: string; start: number; bodyStart: number }
function extractFunctions(src: string, kw: RegExp): Fn[] {
  const out: Fn[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(kw.source, "g");
  while ((m = re.exec(src))) {
    const brace = src.indexOf("{", m.index);
    const semi = src.indexOf(";", m.index);
    if (brace < 0 || (semi >= 0 && semi < brace)) continue;
    const end = matchBrace(src, brace);
    out.push({ name: m[1] ?? "", header: src.slice(m.index, brace), body: src.slice(brace, end + 1), start: m.index, bodyStart: brace });
  }
  return out;
}

export function scanSolidity(text: string, file = "inline.sol"): Finding[] {
  const src = stripComments(String(text ?? ""));
  const f: Finding[] = [];
  const add = (id: string, severity: Severity, idx: number, title: string, advice: string) =>
    f.push({ id, severity, file, line: lineOf(src, idx), title, advice });

  const pragma = /pragma\s+solidity\s+([^;]+);/.exec(src);
  if (pragma && /[\^~>]|>=|<=/.test(pragma[1])) {
    add("SOL-PRAGMA", "low", pragma.index, "Unfixierte Pragma-Version", "Eine exakte Compiler-Version festlegen (z. B. pragma solidity 0.8.24;).");
  }
  for (const m of src.matchAll(/tx\.origin/g)) {
    add("SOL-TXORIGIN", "high", m.index!, "Verwendung von tx.origin", "msg.sender zur Autorisierung nutzen; tx.origin ist anfällig für Phishing.");
  }
  for (const m of src.matchAll(/\bselfdestruct\s*\(|\bsuicide\s*\(/g)) {
    add("SOL-SELFDESTRUCT", "high", m.index!, "selfdestruct vorhanden", "selfdestruct entfernen oder strikt zugriffsbeschränken; Verhalten ist seit Cancun eingeschränkt.");
  }
  for (const m of src.matchAll(/\.(call|send)\s*(\{[^}]*\})?\s*\(([^;]*)\)\s*;/g)) {
    const before = src.slice(Math.max(0, m.index! - 30), m.index!);
    if (!/(\(\s*bool[^)]*\)|\bbool\s+\w+|\bbool\b|require\s*\(|if\s*\(|assert\s*\()[^;]*=?\s*[\w.\s]*$/.test(before) && !/=\s*[\w.\s]*$/.test(before) && !/(require|if|assert)\s*\(\s*[\w.\s]*$/.test(before)) {
      add("SOL-UNCHECKED-CALL", "medium", m.index!, `Rückgabewert von .${m[1]}() nicht geprüft`, "Den bool-Rückgabewert prüfen (require(ok)) oder sichere Transfer-Bibliotheken nutzen.");
    }
  }
  for (const m of src.matchAll(/(\w+)\.delegatecall\s*\(/g)) {
    const target = m[1];
    const userControlled = /msg\.sender|msg\.data|calldata/.test(target) ||
      new RegExp(`(address\\s+(?:payable\\s+)?${target}\\b|\\b${target}\\s*=\\s*(?:address\\()?\\s*_?\\w+)`).test(src.slice(Math.max(0, m.index! - 600), m.index!));
    add("SOL-DELEGATECALL", userControlled ? "critical" : "medium", m.index!, "delegatecall" + (userControlled ? " an potenziell nutzergesteuerte Adresse" : ""),
      "Delegatecall-Ziele auf eine Allowlist/Immutable beschränken; nie an Eingabeadressen delegieren.");
  }
  // Schleifen
  for (const m of src.matchAll(/for\s*\(([^;]*);([^;]*);([^)]*)\)/g)) {
    if (/\.length|\bn\b|\bcount\b|\bsize\b/.test(m[2]) && !/<\s*\d+\s*$/.test(m[2].trim())) {
      add("SOL-UNBOUNDED-LOOP", "medium", m.index!, "Potenziell unbegrenzte Schleife", "Schleifen über dynamische Arrays begrenzen oder Paginierung/Pull-Pattern nutzen (Gas-DoS).");
    }
  }
  for (const m of src.matchAll(/while\s*\(/g)) {
    add("SOL-UNBOUNDED-LOOP", "low", m.index!, "while-Schleife", "Abbruchbedingung und Gas-Obergrenze prüfen.");
  }
  // Reentrancy: externer Call vor State-Write
  const fns = extractFunctions(src, /function\s+(\w+)\s*\([^)]*\)/);
  for (const fn of fns) {
    if (/\b(view|pure)\b/.test(fn.header)) continue;
    const call = /\.(call|transfer|send)\s*(\{[^}]*\})?\s*\(/.exec(fn.body);
    if (!call) continue;
    const after = fn.body.slice(call.index + call[0].length);
    const write = /(\b\w+(?:\[[^\]]*\])*\s*(?:-=|\+=|=(?!=))\s*[^;]+;|\bdelete\s+\w+|\w+\.push\s*\()/.exec(after.slice(after.indexOf(";") + 1));
    const hasGuard = /nonReentrant|ReentrancyGuard|locked/.test(fn.header + fn.body);
    if (write && !hasGuard) {
      const idx = fn.bodyStart + call.index;
      add("SOL-REENTRANCY", "high", idx, `Reentrancy-Risiko in ${fn.name}()`, "Checks-Effects-Interactions einhalten (State vor externem Call ändern) und nonReentrant verwenden.");
    } else if (!hasGuard && /\bpayable\b|\.call/.test(fn.header + fn.body)) {
      add("SOL-NO-NONREENTRANT", "low", fn.start, `${fn.name}() ohne nonReentrant mit externem Call`, "nonReentrant-Modifier ergänzen.");
    }
  }
  return f.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.line - b.line);
}

export function scanRust(text: string, file = "inline.rs"): Finding[] {
  const src = stripComments(String(text ?? ""));
  const f: Finding[] = [];
  const add = (id: string, severity: Severity, idx: number, title: string, advice: string) =>
    f.push({ id, severity, file, line: lineOf(src, idx), title, advice });

  // Anchor-Accounts-Structs
  for (const s of src.matchAll(/#\[derive\(Accounts\)\][\s\S]*?pub\s+struct\s+(\w+)[^{]*\{([\s\S]*?)\n\}/g)) {
    const body = s[2];
    const base = s.index! + s[0].indexOf(body);
    for (const m of body.matchAll(/pub\s+(\w+)\s*:\s*([^,\n]+),?/g)) {
      const name = m[1];
      const ty = m[2].trim();
      const pre = body.slice(Math.max(0, body.lastIndexOf("pub", m.index! - 1) - 200), m.index!);
      const attrs = /#\[account\(([\s\S]*?)\)\]/.exec(body.slice(0, m.index!).split(/pub\s+\w+\s*:/).pop() ?? "")?.[1] ?? "";
      void pre;
      const idx = base + m.index!;
      if (/UncheckedAccount|AccountInfo/.test(ty) && !/CHECK/.test(body.slice(0, m.index!).split(/pub\s+\w+\s*:/).pop() ?? "")) {
        add("RS-UNCHECKED-ACCOUNT", "high", idx, `Ungeprüfter Account '${name}'`, "Typisierte Account<'info, T> verwenden oder mit /// CHECK: begründen und manuell validieren.");
      }
      if (/authority|owner|admin|payer|signer/i.test(name) && !/Signer\s*</.test(ty) && !/signer/.test(attrs) && !/Program\s*</.test(ty)) {
        add("RS-MISSING-SIGNER", "critical", idx, `Fehlende Signer-Prüfung für '${name}'`, "Typ Signer<'info> verwenden oder #[account(signer)] / has_one setzen.");
      }
      if (/Program\s*</.test(ty) === false && /(token_program|system_program|program)\b/.test(name) && /UncheckedAccount|AccountInfo/.test(ty)) {
        add("RS-CPI-UNVALIDATED", "high", idx, `Programm-Account '${name}' nicht validiert`, "Program<'info, Token> bzw. address-Constraint verwenden.");
      }
    }
  }
  for (const m of src.matchAll(/\bowner\b[^;\n]*==|\.owner\s*!=/g)) void m; // nur Marker, Owner-Check vorhanden
  if (/try_from_slice|try_deserialize_unchecked|from_account_info|bytemuck::from_bytes/.test(src) && !/\.owner\s*(==|!=)|check_id|require_keys_eq|owner\s*=\s*/.test(src)) {
    const m = /try_from_slice|try_deserialize_unchecked|from_account_info|bytemuck::from_bytes/.exec(src)!;
    add("RS-NO-OWNER-CHECK", "high", m.index, "Deserialisierung ohne Owner-Prüfung", "account.owner gegen die erwartete Program-ID prüfen, bevor Daten deserialisiert werden.");
  }
  for (const m of src.matchAll(/(try_from_slice|try_deserialize_unchecked|unpack_unchecked)\s*\(/g)) {
    add("RS-UNCHECKED-DESER", "medium", m.index!, `Ungeprüfte Deserialisierung (${m[1]})`, "Account<'info, T> mit Discriminator-Prüfung nutzen.");
  }
  for (const m of src.matchAll(/^[^\n]*?(\w[\w.\[\]()]*)\s*(\+|-|\*)=?\s*[\w.\[\]()]+\s*;?/gm)) {
    const ln = m[0];
    if (/checked_|saturating_|wrapping_|println|msg!|->|\/\/|"|'|\bfn\b|<|&|\*\s*\w+\s*:/.test(ln)) continue;
    if (!/\b(amount|balance|lamports|supply|total|price|fee|count|\w*_amount|\w*_balance)\b/i.test(ln)) continue;
    add("RS-OVERFLOW", "medium", m.index!, "Arithmetik ohne checked_*", "checked_add/checked_sub/checked_mul mit Fehlerbehandlung verwenden (oder overflow-checks = true).");
  }
  for (const m of src.matchAll(/invoke(?:_signed)?\s*\(([\s\S]*?)\)\s*[?;]/g)) {
    if (!/token::|spl_token::|system_instruction::|check_id|require_keys_eq|program_id\s*==/.test(src.slice(Math.max(0, m.index! - 400), m.index! + m[0].length))) {
      add("RS-CPI-UNVALIDATED", "high", m.index!, "CPI ohne Validierung der Ziel-Program-ID", "Program-ID gegen eine bekannte Konstante prüfen, bevor invoke/invoke_signed aufgerufen wird.");
    }
  }
  for (const m of src.matchAll(/CpiContext::new(?:_with_signer)?\s*\(\s*(\w+)(?:\.to_account_info\(\))?/g)) {
    if (/ctx\.accounts\.\w+_program|AccountInfo/.test(m[0]) === false && /UncheckedAccount|AccountInfo/.test(src)) {
      // nur Hinweis, wenn Programm als UncheckedAccount deklariert ist (siehe oben)
    }
  }
  return f.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.line - b.line);
}

export interface GasHint { id: string; file: string; line: number; title: string; advice: string }

export function gasHints(text: string, file = "inline.sol"): GasHint[] {
  const src = stripComments(String(text ?? ""));
  const out: GasHint[] = [];
  const add = (id: string, idx: number, title: string, advice: string) => out.push({ id, file, line: lineOf(src, idx), title, advice });

  // Storage in Schleife
  const stateVars = new Set<string>();
  for (const m of src.matchAll(/^\s*(?:uint\d*|int\d*|address|bool|bytes\d*|mapping\s*\([^)]*\)|[A-Z]\w*(?:\[\])?|\w+\[\])\s+(?:public\s+|private\s+|internal\s+)?(\w+)\s*(?:=[^;]*)?;/gm)) stateVars.add(m[1]);
  for (const m of src.matchAll(/for\s*\([^)]*\)\s*\{/g)) {
    const end = matchBrace(src, m.index! + m[0].length - 1);
    const body = src.slice(m.index!, end);
    for (const v of stateVars) {
      if (new RegExp(`\\b${v}\\b`).test(body) && /\.length|\+\+|\+=/.test(body)) {
        add("GAS-STORAGE-LOOP", m.index!, `Storage-Variable '${v}' in Schleife`, "In lokale Variable cachen und nach der Schleife zurückschreiben.");
        break;
      }
    }
    if (/<\s*\w+\.length/.test(m[0]) && stateVars.size > 0) {
      const arr = /<\s*(\w+)\.length/.exec(m[0])![1];
      if (stateVars.has(arr)) add("GAS-LENGTH-CACHE", m.index!, `${arr}.length wird je Iteration aus Storage gelesen`, "Länge in lokale Variable cachen.");
    }
  }
  // public -> external
  for (const m of src.matchAll(/function\s+(\w+)\s*\(([^)]*)\)\s*([^{;]*)/g)) {
    const mods = m[3];
    if (/\bpublic\b/.test(mods) && !new RegExp(`\\b${m[1]}\\s*\\(`).test(src.replace(m[0], ""))) {
      add("GAS-PUBLIC-EXTERNAL", m.index!, `${m[1]}() kann external sein`, "Wird intern nicht aufgerufen: external statt public spart Gas.");
    }
    if (/\b(external|public)\b/.test(mods) && /\b(string|bytes|\w+\[\])\s+memory\b/.test(m[2])) {
      add("GAS-CALLDATA", m.index!, `${m[1]}(): memory-Parameter`, "Bei reinen Lese-Parametern calldata statt memory verwenden.");
    }
  }
  // constant / immutable
  for (const m of src.matchAll(/^\s*(uint\d*|int\d*|address|bool|bytes\d+)\s+(public\s+|private\s+|internal\s+)?(\w+)\s*=\s*([^;]+);/gm)) {
    if (/constant|immutable/.test(m[0])) continue;
    const v = m[3];
    const writes = new RegExp(`\\b${v}\\s*(?:[-+*/]?=(?!=)|\\+\\+|--)`, "g");
    const count = (src.match(writes) ?? []).length;
    if (count <= 1) add("GAS-CONSTANT", m.index!, `'${v}' ist nie veränderlich`, "Als constant (Literal) oder immutable deklarieren.");
  }
  for (const m of src.matchAll(/^\s*(address|uint\d*|bool|bytes\d*)\s+(?:public\s+|private\s+|internal\s+)?(\w+)\s*;/gm)) {
    if (/\bimmutable|constant/.test(m[0])) continue;
    if (m[1] === "address" && /constructor[^{]*\{[^}]*\b${m[2]}\s*=/.test(src)) add("GAS-IMMUTABLE", m.index!, `'${m[2]}' nur im Konstruktor gesetzt`, "Als immutable deklarieren.");
    const w = (src.match(new RegExp(`\\b${m[2]}\\s*=(?!=)`, "g")) ?? []).length;
    if (w === 1 && /constructor[\s\S]*?\{[\s\S]*?\b/.test(src) && new RegExp(`constructor[^{]*\\{[^}]*\\b${m[2]}\\s*=`).test(src)) {
      add("GAS-IMMUTABLE", m.index!, `'${m[2]}' nur im Konstruktor gesetzt`, "Als immutable deklarieren.");
    }
  }
  // Packing: uint256 gefolgt von kleinen Typen mit Lücken
  const slots: Array<{ type: string; name: string; idx: number }> = [];
  for (const m of src.matchAll(/^\s*(uint(?:8|16|32|64|128|256)?|bool|address|bytes\d+)\s+(?:public\s+|private\s+|internal\s+)?(\w+)\s*(?:=[^;]*)?;/gm)) {
    if (/constant|immutable/.test(m[0])) continue;
    slots.push({ type: m[1], name: m[2], idx: m.index! });
  }
  const size = (t: string) => t === "bool" ? 1 : t === "address" ? 20 : t.startsWith("bytes") ? parseInt(t.slice(5), 10) : (parseInt(t.slice(4), 10) || 256) / 8;
  for (let i = 0; i + 2 < slots.length; i++) {
    const [a, b, c] = [slots[i], slots[i + 1], slots[i + 2]];
    if (size(a.type) < 32 && size(b.type) === 32 && size(c.type) < 32 && size(a.type) + size(c.type) <= 32) {
      add("GAS-PACKING", a.idx, `Storage-Packing: '${a.name}' und '${c.name}' getrennt durch '${b.name}'`, "Kleine Typen nebeneinander anordnen, damit sie sich einen Slot teilen.");
      break;
    }
  }
  return out;
}

export function parseForgeGasReport(output: string): Array<{ contract: string; function: string; min: number; avg: number; median: number; max: number; calls: number }> {
  const rows: Array<{ contract: string; function: string; min: number; avg: number; median: number; max: number; calls: number }> = [];
  let contract = "";
  for (const raw of String(output ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.includes("|")) continue;
    const cells = line.replace(/^[|╭╰├]|[|╮╯┤]$/g, "").split(/[|│]/).map((c) => c.trim()).filter((c, i, arr) => !(i === 0 && c === "" && arr.length > 1) || true);
    const cs = cells.filter((c) => c !== "");
    const head = /^(?:[^\s|]*[/\\])?([\w.]+:)?(\w+)\s+contract$/i.exec(cs[0] ?? "");
    if (head) { contract = head[2]; continue; }
    if (cs.length >= 6 && /^\d+$/.test(cs[1]) && /^[\w]+$/.test(cs[0]) && /^\d+$/.test(cs[5])) {
      rows.push({ contract, function: cs[0], min: +cs[1], avg: +cs[2], median: +cs[3], max: +cs[4], calls: +cs[5] });
    }
  }
  return rows;
}

const FORBIDDEN_ARG = /^(--broadcast|--private-key.*|--mnemonic.*|--keystore.*|--ledger|--trezor|--interactives?|-i|deploy|create|script|send|--unlocked|--legacy-deploy|--verify|--rpc-url.*|--private-keys)$/i;
export function checkArgs(args: unknown): string | null {
  if (args === undefined || args === null) return null;
  if (!Array.isArray(args)) return "Argumente müssen eine Liste sein.";
  for (const a of args) {
    const s = String(a);
    if (FORBIDDEN_ARG.test(s) || /broadcast|deploy|private[-_]?key|mnemonic/i.test(s)) {
      return `Verweigert: Argument '${s.split("=")[0]}' ist nicht erlaubt (Deploy/Broadcast/Schlüssel sind gesperrt, nur Simulation).`;
    }
  }
  return null;
}

type Runner = (cmd: string, args: string[], opts: { cwd?: string; timeout: number }) => Promise<{ code: number; stdout: string; stderr: string }>;
const defaultRunner: Runner = (cmd, args, opts) =>
  new Promise((resolve) => {
    execFile(cmd, args, { cwd: opts.cwd, timeout: opts.timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as any).code === "number" ? (err as any).code : -1) : 0;
      resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") + (err && code === -1 ? String((err as Error).message) : "") });
    });
  });

export async function detectTool(name: string, runner: Runner = defaultRunner): Promise<boolean> {
  const r = await runner(name, ["--version"], { timeout: 8000 });
  return r.code === 0;
}

function walk(dir: string, exts: string[], max: number, acc: string[] = []): string[] {
  if (acc.length >= max) return acc;
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (acc.length >= max) break;
    if (/^(node_modules|\.git|target|out|cache|lib|dist|build|artifacts)$/.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, max, acc);
    else if (exts.includes(path.extname(e.name))) acc.push(p);
  }
  return acc;
}

export async function scan(args: { projectRoot?: string; text?: string; language?: "solidity" | "rust"; file?: string; maxFiles?: number }): Promise<unknown> {
  try {
    const findings: Finding[] = [];
    let files = 0;
    if (typeof args?.text === "string") {
      const lang = args.language ?? (/pragma\s+solidity|contract\s+\w+/.test(args.text) ? "solidity" : "rust");
      findings.push(...(lang === "rust" ? scanRust(args.text, args.file ?? "inline.rs") : scanSolidity(args.text, args.file ?? "inline.sol")));
      files = 1;
    } else if (args?.projectRoot) {
      const root = path.resolve(args.projectRoot);
      if (!fs.existsSync(root)) return { ok: false, message: "Projektverzeichnis existiert nicht." };
      for (const p of walk(root, [".sol", ".rs"], args.maxFiles ?? 200)) {
        let t = "";
        try { if (fs.statSync(p).size > 2_000_000) continue; t = fs.readFileSync(p, "utf8"); } catch { continue; }
        const rel = path.relative(root, p).replace(/\\/g, "/");
        files++;
        findings.push(...(p.endsWith(".sol") ? scanSolidity(t, rel) : scanRust(t, rel)));
      }
    } else return { ok: false, message: "projectRoot oder text erforderlich." };
    const counts: Record<string, number> = {};
    for (const x of findings) counts[x.severity] = (counts[x.severity] ?? 0) + 1;
    return { ok: true, files, findings, counts };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function gasHintsOp(args: { projectRoot?: string; text?: string; file?: string }): Promise<unknown> {
  try {
    if (typeof args?.text === "string") return { ok: true, hints: gasHints(args.text, args.file) };
    if (!args?.projectRoot) return { ok: false, message: "projectRoot oder text erforderlich." };
    const root = path.resolve(args.projectRoot);
    const hints: GasHint[] = [];
    for (const p of walk(root, [".sol"], 200)) {
      try { hints.push(...gasHints(fs.readFileSync(p, "utf8"), path.relative(root, p).replace(/\\/g, "/"))); } catch { /* ignorieren */ }
    }
    return { ok: true, hints };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function simulate(args: { projectRoot?: string; tool?: "forge" | "anchor"; mode?: "gas" | "sizes" | "build"; extraArgs?: string[]; timeoutMs?: number }, runner: Runner = defaultRunner): Promise<unknown> {
  try {
    const refuse = checkArgs(args?.extraArgs);
    if (refuse) return { ok: false, message: refuse };
    if (args?.tool && !["forge", "anchor"].includes(args.tool)) return { ok: false, message: "Unbekanntes Tool." };
    const root = args?.projectRoot ? path.resolve(args.projectRoot) : undefined;
    if (!root || !fs.existsSync(root)) return { ok: false, message: "Gültiges projectRoot erforderlich." };
    const timeout = args.timeoutMs ?? 120000;
    const isAnchor = fs.existsSync(path.join(root, "Anchor.toml"));
    const tool = args.tool ?? (isAnchor ? "anchor" : "forge");
    if (!(await detectTool(tool, runner))) return { ok: true, skipped: true, message: `${tool} ist nicht installiert – Simulation übersprungen.` };
    const extra = (args.extraArgs ?? []).map(String);
    if (tool === "forge") {
      const mode = args.mode ?? "gas";
      const cmdArgs = mode === "sizes" ? ["build", "--sizes", ...extra] : ["test", "--gas-report", ...extra];
      const r = await runner("forge", cmdArgs, { cwd: root, timeout });
      return { ok: r.code === 0, tool, command: `forge ${cmdArgs.join(" ")}`, gasReport: parseForgeGasReport(r.stdout), output: (r.stdout + r.stderr).slice(-6000), ...(r.code === 0 ? {} : { message: "forge fehlgeschlagen." }) };
    }
    const cmdArgs = ["build", ...extra];
    const r = await runner("anchor", cmdArgs, { cwd: root, timeout });
    return { ok: r.code === 0, tool, command: `anchor ${cmdArgs.join(" ")}`, output: (r.stdout + r.stderr).slice(-6000), ...(r.code === 0 ? {} : { message: "anchor build fehlgeschlagen." }) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  scan: async (a) => scan(a),
  gasHints: async (a) => gasHintsOp(a),
  simulate: async (a) => simulate(a),
};
