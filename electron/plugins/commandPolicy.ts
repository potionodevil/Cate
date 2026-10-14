/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import * as path from "node:path";

export const manifest = {
  id: "commandPolicy",
  name: "Command Sandboxing & Policy Enforcer",
  version: "1.0.0",
  description: "Prüft Shell-Befehle (bash, PowerShell, cmd) gegen Blacklist-, Whitelist- und Freigabe-Regeln.",
  category: "security" as const,
  configFields: [
    { key: "defaultDecision", label: "Standardentscheidung", type: "select" as const, default: "allow", options: ["allow", "approve", "deny"], help: "Gilt, wenn keine Regel greift." },
    { key: "approvalTimeoutMs", label: "Freigabe-Timeout (ms)", type: "number" as const, default: 120000 },
    { key: "whitelist", label: "Whitelist (Regex je Zeile)", type: "list" as const, default: [], help: "Passende Segmente werden von 'approve' auf 'allow' herabgestuft, nie von 'deny'." },
    { key: "disabledDefaults", label: "Deaktivierte Standardregeln", type: "list" as const, default: [] },
  ],
};

export type Decision = "allow" | "deny" | "approve";
export interface Segment { raw: string; tokens: string[]; env: Record<string, string>; program: string; args: string[]; redirects: string[]; op: string; }
export interface UserRule { id: string; decision: Decision; description?: string; pattern: string; flags?: string; }
export interface Policy { defaultDecision: Decision; rules: UserRule[]; whitelist: string[]; disabledDefaults: string[]; }
export interface Verdict { decision: Decision; reasons: string[]; matchedRules: string[]; }
export interface EvalContext { cwd?: string; projectRoot?: string; policy?: Partial<Policy>; }
export type Result<T = {}> = ({ ok: true } & T) | { ok: false; message: string };

export function defaultPolicy(): Policy {
  return { defaultDecision: "allow", rules: [], whitelist: [], disabledDefaults: [] };
}

/* ---------------- Tokenizer ---------------- */

/** Zerlegt einen Befehl in Segmente (Pipes, &&, ||, ;, &, Zeilenumbrüche, Subshells, $( ), Backticks). */
export function parseCommand(command: string): Segment[] {
  const segs: Segment[] = [];
  let tokens: string[] = [];
  let cur = "";
  let has = false;
  let op = "";
  let quote: "" | "'" | '"' = "";
  const pushTok = () => { if (has) tokens.push(cur); cur = ""; has = false; };
  const pushSeg = (nextOp: string) => {
    pushTok();
    if (tokens.length) segs.push(buildSegment(tokens, op));
    tokens = [];
    op = nextOp;
  };
  const s = String(command ?? "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) { quote = ""; continue; }
      if (quote === '"' && c === "\\" && (s[i + 1] === '"' || s[i + 1] === "\\")) { cur += s[++i]; continue; }
      if (quote === '"' && c === "`" && s[i + 1] === '"') { cur += '"'; i++; continue; }
      cur += c; continue;
    }
    if (c === "'" || c === '"') { quote = c; has = true; continue; }
    if (c === "^" && s[i + 1] !== undefined && /["&|<>^]/.test(s[i + 1])) { cur += s[++i]; has = true; continue; } // cmd-Escape
    if (c === "$" && s[i + 1] === "(") { pushSeg("$("); i++; continue; }
    if (c === "(" || c === ")" || c === "`" || c === "{" && false) { pushSeg(c === ")" ? ")" : "("); continue; }
    if (c === "&" && s[i + 1] === "&") { pushSeg("&&"); i++; continue; }
    if (c === "|" && s[i + 1] === "|") { pushSeg("||"); i++; continue; }
    if (c === "|") { pushSeg("|"); continue; }
    if (c === ";" || c === "\n" || c === "\r") { pushSeg(";"); continue; }
    if (c === "&") { if (s[i - 1] === ">" || s[i + 1] === ">") { cur += c; has = true; continue; } pushSeg("&"); continue; }
    if (/\s/.test(c)) { pushTok(); continue; }
    cur += c; has = true;
  }
  pushSeg("");
  return segs;
}

function buildSegment(tokens: string[], op: string): Segment {
  const env: Record<string, string> = {};
  let i = 0;
  // bash: FOO=bar cmd ; PowerShell: $env:FOO="x"; cmd: set FOO=bar (als eigenes Segment)
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) {
    const eq = tokens[i].indexOf("=");
    env[tokens[i].slice(0, eq)] = tokens[i].slice(eq + 1);
    i++;
  }
  const rest = tokens.slice(i);
  const redirects: string[] = [];
  const args: string[] = [];
  const words = rest.slice(1);
  for (let k = 0; k < words.length; k++) {
    const t = words[k];
    const m = /^(?:\d?>>?|&>>?|\*>>?)(.*)$/.exec(t);
    if (m && !/^\d+$/.test(t)) {
      if (m[1]) redirects.push(m[1]);
      else if (words[k + 1] !== undefined) redirects.push(words[++k]);
      continue;
    }
    args.push(t);
  }
  const first = rest[0] ?? "";
  const mFirst = /^(?:\d?>>?|&>>?)(.*)$/.exec(first);
  if (mFirst) { if (mFirst[1]) redirects.push(mFirst[1]); }
  let program = first.replace(/^.*[\\/]/, "").toLowerCase().replace(/\.(exe|cmd|bat|ps1|com)$/, "");
  if (mFirst) program = "";
  return { raw: rest.join(" "), tokens: rest, env, program, args: mFirst ? words : args, redirects, op };
}

/* ---------------- Hilfen ---------------- */

const lc = (a: string[]) => a.map((x) => x.toLowerCase());
const hasFlag = (args: string[], ...names: string[]) => lc(args).some((a) => names.includes(a));
function shortFlags(args: string[]): string {
  return args.filter((a) => /^-[A-Za-z]+$/.test(a)).map((a) => a.slice(1)).join("");
}
const pathArgs = (args: string[]) => args.filter((a) => !/^-/.test(a) && !/^\/[a-z?]$/i.test(a));

function isDangerousTarget(p: string): boolean {
  const t = p.replace(/^["']|["']$/g, "");
  return /^(\/|\/\*|~\/?|~\/\*|\$HOME\/?|\*|\.\/?\*|[A-Za-z]:[\\/]?|[A-Za-z]:[\\/]\*|%userprofile%\\?|\\)$/i.test(t);
}

function isWin(p: string): boolean { return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\"); }

/** Liegt der Pfad außerhalb von projectRoot? Unbekannte Variablen/~ gelten als außerhalb. */
export function isOutsideProject(target: string, cwd: string | undefined, projectRoot: string | undefined): boolean {
  if (!projectRoot) return false;
  const t = target.replace(/^["']|["']$/g, "");
  if (!t) return false;
  if (/^(\/dev\/null|nul|\$null|\/dev\/stdout|\/dev\/stderr|&\d)$/i.test(t)) return false;
  if (/^[~$%]/.test(t) || t.includes("$env:")) return true;
  const win = isWin(projectRoot);
  const p = win ? path.win32 : path.posix;
  let root = p.resolve(projectRoot);
  const base = cwd ? p.resolve(projectRoot, cwd) : root;
  const abs = p.resolve(base, t);
  if (win) { root = root.toLowerCase(); return !(abs.toLowerCase() === root || abs.toLowerCase().startsWith(root.replace(/\\$/, "") + "\\")); }
  return !(abs === root || abs.startsWith(root.replace(/\/$/, "") + "/"));
}

const WRITE_PROGRAMS = new Set(["tee", "cp", "mv", "touch", "mkdir", "rm", "rmdir", "del", "erase", "rd", "copy", "move", "xcopy", "robocopy", "ren", "rename", "set-content", "add-content", "out-file", "new-item", "copy-item", "move-item", "remove-item", "clear-content", "ln", "install", "truncate", "dd", "sed", "chmod", "chown"]);

const SQL_CLIENTS = new Set(["psql", "sqlite3", "mysql", "mariadb", "mysqlsh", "sqlcmd", "mongosh"]);

export function sqlRisks(text: string): string[] {
  const out: string[] = [];
  const t = text.replace(/\s+/g, " ");
  if (/\bdrop\s+(table|database|schema|index|view|user|role)\b/i.test(t)) out.push("SQL DROP");
  if (/\balter\s+(table|database|schema|user|role)\b/i.test(t)) out.push("SQL ALTER");
  if (/\btruncate\b/i.test(t)) out.push("SQL TRUNCATE");
  const del = /\bdelete\s+from\s+[^;]*/gi;
  let m: RegExpExecArray | null;
  while ((m = del.exec(t))) { if (!/\bwhere\b/i.test(m[0])) { out.push("SQL DELETE ohne WHERE"); break; } }
  return out;
}

interface Hit { id: string; decision: Decision; reason: string; }
interface DefaultRule { id: string; decision: Decision; description: string; test: (seg: Segment, all: Segment[], ctx: EvalContext, full: string) => string | null; }

export const DEFAULT_RULES: DefaultRule[] = [
  { id: "rm-root", decision: "deny", description: "rm -rf auf Wurzel, Home oder Wildcard", test: (s) => {
    if (s.program !== "rm") return null;
    const f = shortFlags(s.args) + (hasFlag(s.args, "--recursive") ? "r" : "");
    if (/r/i.test(f) && pathArgs(s.args).some(isDangerousTarget)) return "Rekursives Löschen von Wurzel/Home/Wildcard ist verboten.";
    return null;
  } },
  { id: "format-drive", decision: "deny", description: "Laufwerk formatieren", test: (s) => {
    if (s.program === "format" && s.args.some((a) => /^[A-Za-z]:/.test(a))) return "Laufwerk-Formatierung ist verboten.";
    if (["format-volume", "clear-disk", "diskpart", "mkfs", "fdisk"].includes(s.program) || /^mkfs\./.test(s.program)) return "Datenträger-Formatierung ist verboten.";
    return null;
  } },
  { id: "dd-device", decision: "deny", description: "dd auf Blockgerät", test: (s) => (s.program === "dd" && s.args.some((a) => /^of=\/dev\/(sd|nvme|hd|disk)/.test(a)) ? "Schreiben auf Blockgerät ist verboten." : null) },
  { id: "pipe-to-shell", decision: "deny", description: "curl/wget | sh", test: (s, all) => {
    const i = all.indexOf(s);
    if (i <= 0 || s.op !== "|") return null;
    const prev = all[i - 1];
    const shells = ["sh", "bash", "zsh", "dash", "ksh", "iex", "invoke-expression", "powershell", "pwsh"];
    if (["curl", "wget", "invoke-webrequest", "iwr", "invoke-restmethod", "irm"].includes(prev.program) && shells.includes(s.program)) return "Herunterladen und direktes Ausführen (curl|sh) ist verboten.";
    return null;
  } },
  { id: "iex-download", decision: "deny", description: "PowerShell iex (iwr ...)", test: (s, _a, _c, full) => (/\b(iex|invoke-expression)\b[^|]*\b(iwr|irm|invoke-webrequest|invoke-restmethod|downloadstring)\b/i.test(full) ? "Download-und-Ausführen per PowerShell ist verboten." : null) },
  { id: "rm-recursive", decision: "approve", description: "rm -rf", test: (s) => {
    if (s.program !== "rm") return null;
    const f = shortFlags(s.args) + (hasFlag(s.args, "--recursive") ? "r" : "");
    return /r/i.test(f) && (/f/i.test(f) || hasFlag(s.args, "--force")) ? "Rekursives erzwungenes Löschen (rm -rf) braucht Freigabe." : null;
  } },
  { id: "del-recursive", decision: "approve", description: "del /s, rd /s", test: (s) => {
    if (["del", "erase"].includes(s.program) && hasFlag(s.args, "/s")) return "del /s braucht Freigabe.";
    if (["rd", "rmdir"].includes(s.program) && hasFlag(s.args, "/s")) return "rd /s braucht Freigabe.";
    return null;
  } },
  { id: "remove-item-force", decision: "approve", description: "Remove-Item -Recurse -Force", test: (s) => {
    if (!["remove-item", "ri"].includes(s.program)) return null;
    const a = lc(s.args);
    const rec = a.some((x) => x === "-recurse" || x === "-r");
    const frc = a.some((x) => x === "-force" || x === "-fo");
    return rec && frc ? "Remove-Item -Recurse -Force braucht Freigabe." : null;
  } },
  { id: "git-push-force", decision: "approve", description: "git push --force", test: (s) => {
    if (s.program !== "git" || !lc(s.args).includes("push")) return null;
    return s.args.some((a) => /^(--force(-with-lease)?(=.*)?|-f|\+.+)$/.test(a)) || /^-[a-z]*f[a-z]*$/.test(s.args.find((a) => /^-[a-z]+$/.test(a)) ?? "") ? "git push --force braucht Freigabe." : null;
  } },
  { id: "git-reset-hard", decision: "approve", description: "git reset --hard", test: (s) => (s.program === "git" && lc(s.args).includes("reset") && hasFlag(s.args, "--hard") ? "git reset --hard braucht Freigabe." : null) },
  { id: "git-clean", decision: "approve", description: "git clean -f", test: (s) => (s.program === "git" && lc(s.args).includes("clean") && /f/.test(shortFlags(s.args)) ? "git clean -f braucht Freigabe." : null) },
  { id: "publish", decision: "approve", description: "npm/cargo/pnpm/yarn publish", test: (s) => {
    if (["npm", "pnpm", "yarn", "cargo", "twine", "gem"].includes(s.program) && lc(s.args).some((a) => a === "publish" || a === "upload" || a === "push") && s.program !== "gem") return `${s.program} publish braucht Freigabe.`;
    return null;
  } },
  { id: "sql-destructive", decision: "approve", description: "DROP/ALTER/TRUNCATE/DELETE ohne WHERE via SQL-Client", test: (s, all, _c, full) => {
    if (!SQL_CLIENTS.has(s.program)) return null;
    const r = sqlRisks(full);
    return r.length ? `${r.join(", ")} braucht Freigabe.` : null;
  } },
  { id: "chmod-recursive", decision: "approve", description: "chmod -R", test: (s) => ((s.program === "chmod" || s.program === "chown") && (/R/.test(shortFlags(s.args)) || hasFlag(s.args, "--recursive")) ? `${s.program} -R braucht Freigabe.` : null) },
  { id: "registry-edit", decision: "approve", description: "Registry-Änderungen", test: (s) => {
    if (s.program === "reg" && lc(s.args).some((a) => ["add", "delete", "import", "load", "restore"].includes(a))) return "Registry-Änderung braucht Freigabe.";
    if (["set-itemproperty", "new-itemproperty", "remove-itemproperty", "remove-item", "new-item", "sp", "regedit"].includes(s.program) && (s.program === "regedit" || s.args.some((a) => /^(hk(lm|cu|cr|u|cc)|registry)[:\\]/i.test(a)))) return "Registry-Änderung braucht Freigabe.";
    return null;
  } },
  { id: "write-outside-project", decision: "approve", description: "Schreibzugriff außerhalb von projectRoot", test: (s, _a, ctx) => {
    if (!ctx.projectRoot) return null;
    const targets = [...s.redirects];
    if (WRITE_PROGRAMS.has(s.program)) targets.push(...pathArgs(s.args).filter((a) => !/^[a-z]+=/.test(a) && !/^-/.test(a)));
    const bad = targets.filter((t) => isOutsideProject(t, ctx.cwd, ctx.projectRoot));
    return bad.length ? "Schreibzugriff außerhalb des Projektordners braucht Freigabe." : null;
  } },
];

/** Rekursion für bash -c / sh -c / powershell -Command / cmd /c. */
function innerCommands(seg: Segment): string[] {
  const out: string[] = [];
  const a = seg.args;
  if (["bash", "sh", "zsh", "dash", "ksh"].includes(seg.program)) {
    const i = a.findIndex((x) => /^-[a-z]*c$/.test(x));
    if (i >= 0 && a[i + 1]) out.push(a[i + 1]);
  } else if (["powershell", "pwsh"].includes(seg.program)) {
    const i = a.findIndex((x) => ["-command", "-c", "-encodedcommand"].includes(x.toLowerCase()));
    if (i >= 0) {
      const v = a.slice(i + 1).join(" ");
      if (a[i].toLowerCase() === "-encodedcommand") { try { out.push(Buffer.from(v, "base64").toString("utf16le")); } catch { /* ignorieren */ } }
      else out.push(v);
    }
  } else if (seg.program === "cmd") {
    const i = a.findIndex((x) => ["/c", "/k"].includes(x.toLowerCase()));
    if (i >= 0) out.push(a.slice(i + 1).join(" "));
  } else if (["eval", "sudo", "env", "nohup", "time", "xargs", "start-process", "command", "exec"].includes(seg.program) && a.length) {
    out.push(a.filter((x) => !/^-/.test(x)).join(" "));
  }
  return out;
}

function mergePolicy(p?: Partial<Policy>): Policy {
  const d = defaultPolicy();
  return { defaultDecision: p?.defaultDecision ?? d.defaultDecision, rules: p?.rules ?? [], whitelist: p?.whitelist ?? [], disabledDefaults: p?.disabledDefaults ?? [] };
}

function safeRegex(src: string, flags?: string): RegExp | null {
  try { return new RegExp(src, flags ?? "i"); } catch { return null; }
}

function collect(command: string, ctx: EvalContext, policy: Policy, depth: number, hits: Hit[]): void {
  const segs = parseCommand(command);
  const disabled = new Set(policy.disabledDefaults);
  const white = policy.whitelist.map((w) => safeRegex(w)).filter((r): r is RegExp => !!r);
  for (const seg of segs) {
    const segHits: Hit[] = [];
    for (const r of DEFAULT_RULES) {
      if (disabled.has(r.id)) continue;
      const reason = r.test(seg, segs, ctx, command);
      if (reason) segHits.push({ id: r.id, decision: r.decision, reason });
    }
    for (const r of policy.rules) {
      const re = safeRegex(r.pattern, r.flags);
      if (re && re.test(seg.tokens.join(" "))) segHits.push({ id: r.id, decision: r.decision, reason: r.description || `Regel ${r.id} greift.` });
    }
    const whitelisted = white.some((w) => w.test(seg.tokens.join(" ")));
    for (const h of segHits) {
      if (h.decision === "approve" && whitelisted) continue;
      hits.push(h);
    }
    if (depth < 4) for (const inner of innerCommands(seg)) collect(inner, ctx, policy, depth + 1, hits);
  }
}

/** Bewertet einen Befehl. deny > approve > allow. */
export function evaluate(command: string, ctx: EvalContext = {}): Verdict {
  const policy = mergePolicy(ctx.policy);
  const hits: Hit[] = [];
  if (typeof command !== "string" || !command.trim()) return { decision: "allow", reasons: ["Leerer Befehl."], matchedRules: [] };
  collect(command, ctx, policy, 0, hits);
  const rank: Record<Decision, number> = { allow: 0, approve: 1, deny: 2 };
  let decision: Decision = hits.reduce<Decision>((d, h) => (rank[h.decision] > rank[d] ? h.decision : d), "allow");
  if (!hits.length) decision = policy.defaultDecision;
  const relevant = hits.filter((h) => h.decision === decision);
  const reasons = hits.length ? [...new Set((relevant.length ? relevant : hits).map((h) => h.reason))] : decision === "allow" ? ["Keine Regel greift."] : ["Standardentscheidung der Policy."];
  return { decision, reasons, matchedRules: [...new Set(hits.map((h) => h.id))] };
}

/* ---------------- Freigabe-Warteschlange ---------------- */

export interface ApprovalEntry { id: string; command: string; reasons: string[]; matchedRules: string[]; createdAt: number; expiresAt: number; status: "pending" | "approved" | "denied" | "expired"; resolvedAt?: number; }

export class ApprovalQueue {
  private items = new Map<string, ApprovalEntry>();
  private seq = 0;
  constructor(private opts: { now?: () => number; timeoutMs?: number; idGen?: () => string } = {}) {}
  private now() { return (this.opts.now ?? Date.now)(); }
  private sweep() {
    const t = this.now();
    for (const e of this.items.values()) if (e.status === "pending" && t >= e.expiresAt) { e.status = "expired"; e.resolvedAt = t; }
  }
  request(command: string, verdict: Pick<Verdict, "reasons" | "matchedRules">): ApprovalEntry {
    const t = this.now();
    const id = this.opts.idGen ? this.opts.idGen() : `apr-${t.toString(36)}-${++this.seq}`;
    const e: ApprovalEntry = { id, command, reasons: verdict.reasons, matchedRules: verdict.matchedRules, createdAt: t, expiresAt: t + (this.opts.timeoutMs ?? 120_000), status: "pending" };
    this.items.set(id, e);
    return e;
  }
  resolve(id: string, approved: boolean): Result<{ entry: ApprovalEntry }> {
    this.sweep();
    const e = this.items.get(id);
    if (!e) return { ok: false, message: "Freigabeanfrage nicht gefunden." };
    if (e.status === "expired") return { ok: false, message: "Freigabeanfrage ist abgelaufen." };
    if (e.status !== "pending") return { ok: false, message: "Freigabeanfrage wurde bereits entschieden." };
    e.status = approved ? "approved" : "denied";
    e.resolvedAt = this.now();
    return { ok: true, entry: { ...e } };
  }
  list(status: ApprovalEntry["status"] | "all" = "pending"): ApprovalEntry[] {
    this.sweep();
    return [...this.items.values()].filter((e) => status === "all" || e.status === status).map((e) => ({ ...e }));
  }
}

/* ---------------- Policy-Bearbeitung ---------------- */

export function setPolicyRule(policy: Partial<Policy> | undefined, rule: UserRule, remove = false): Result<{ policy: Policy }> {
  const p = mergePolicy(policy);
  if (!rule || typeof rule.id !== "string" || !rule.id.trim()) return { ok: false, message: "Regel benötigt eine ID." };
  if (!remove) {
    if (!["allow", "deny", "approve"].includes(rule.decision)) return { ok: false, message: "Ungültige Entscheidung (allow, deny, approve)." };
    if (typeof rule.pattern !== "string" || !rule.pattern || !safeRegex(rule.pattern, rule.flags)) return { ok: false, message: "Ungültiges Regex-Muster." };
  }
  const rules = p.rules.filter((r) => r.id !== rule.id);
  if (!remove) rules.push({ id: rule.id, decision: rule.decision, description: rule.description, pattern: rule.pattern, flags: rule.flags });
  return { ok: true, policy: { ...p, rules } };
}

const queue = new ApprovalQueue();

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  evaluate: async (a) => {
    try {
      if (!a || typeof a.command !== "string") return { ok: false, message: "Befehl fehlt." };
      const verdict = evaluate(a.command, { cwd: a.cwd, projectRoot: a.projectRoot, policy: a.policy });
      let approvalId: string | undefined;
      if (verdict.decision === "approve" && a.enqueue !== false) approvalId = queue.request(a.command, verdict).id;
      return { ok: true, ...verdict, approvalId };
    } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
  },
  getPolicy: async (a) => ({ ok: true, policy: mergePolicy(a?.policy), defaultRules: DEFAULT_RULES.map((r) => ({ id: r.id, decision: r.decision, description: r.description })) }),
  setPolicyRule: async (a) => {
    try { return setPolicyRule(a?.policy, a?.rule, !!a?.remove); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
  },
  approvalList: async (a) => ({ ok: true, items: queue.list(a?.status ?? "pending") }),
  approvalResolve: async (a) => {
    if (!a || typeof a.id !== "string") return { ok: false, message: "ID fehlt." };
    return queue.resolve(a.id, !!a.approved);
  },
};
