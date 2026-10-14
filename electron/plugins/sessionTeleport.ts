/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export const manifest = {
  id: "sessionTeleport",
  name: "Session Teleport",
  version: "1.0.0",
  description: "Exportiert und importiert Sitzungszustände als versioniertes Bundle.",
};

export const BUNDLE_VERSION = 1;
export interface SessionState {
  cwd: string;
  openFiles: string[];
  tasks: Array<{ title: string; done?: boolean }>;
  envNames: string[];
  agentPreset?: string;
  context?: string;
}
export interface Bundle { version: number; createdAt: string; state: SessionState; checksum: string }

const MAX_CONTEXT = 200_000;
const SECRET_LIKE = /(?:sk|ghp|gho)[-_][A-Za-z0-9-_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:token|secret|password|api[_-]?key)\s*[:=]\s*\S{8,}/gi;

export function redactContext(text: string): string {
  return text.replace(SECRET_LIKE, "[geschwärzt]").slice(0, MAX_CONTEXT);
}

export function sanitizeState(input: any): SessionState {
  const envNames = (Array.isArray(input?.envNames) ? input.envNames : Object.keys(input?.env ?? {}))
    .map(String).filter((n: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n));
  return {
    cwd: String(input?.cwd ?? ""),
    openFiles: (Array.isArray(input?.openFiles) ? input.openFiles : []).map(String),
    tasks: (Array.isArray(input?.tasks) ? input.tasks : []).map((t: any) => ({ title: String(t?.title ?? t ?? ""), done: !!t?.done })),
    envNames: Array.from(new Set<string>(envNames)).sort(),
    agentPreset: input?.agentPreset ? String(input.agentPreset) : undefined,
    context: input?.context ? redactContext(String(input.context)) : undefined,
  };
}

function stable(v: any): string {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v);
}

export function checksumOf(state: SessionState): string {
  return createHash("sha256").update(stable(state)).digest("hex");
}

export function createBundle(input: any, now = new Date()): Bundle {
  const state = sanitizeState(input);
  return { version: BUNDLE_VERSION, createdAt: now.toISOString(), state, checksum: checksumOf(state) };
}

export function validateBundle(raw: any): { ok: true; bundle: Bundle } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") return { ok: false, message: "Bundle ist kein Objekt." };
  if (raw.version !== BUNDLE_VERSION) return { ok: false, message: `Nicht unterstützte Bundle-Version: ${String(raw.version)}.` };
  if (!raw.state || typeof raw.state.cwd !== "string" || !Array.isArray(raw.state.openFiles) || !Array.isArray(raw.state.tasks) || !Array.isArray(raw.state.envNames)) {
    return { ok: false, message: "Bundle-Zustand ist unvollständig." };
  }
  if (raw.state.envNames.some((n: unknown) => typeof n !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(n))) return { ok: false, message: "Ungültige Umgebungsvariablen-Namen." };
  if (checksumOf(raw.state) !== raw.checksum) return { ok: false, message: "Prüfsumme stimmt nicht überein." };
  return { ok: true, bundle: raw as Bundle };
}

function resolveInside(root: string, file: string): string | null {
  const abs = path.resolve(root, file);
  const rel = path.relative(path.resolve(root), abs);
  return rel.startsWith("..") || path.isAbsolute(rel) ? null : abs;
}

export function writeBundle(projectRoot: string, file: string, input: any) {
  try {
    const abs = resolveInside(projectRoot, file);
    if (!abs) return { ok: false as const, message: "Pfad liegt außerhalb des Projekts." };
    const bundle = createBundle(input);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(bundle, null, 2), "utf8");
    return { ok: true as const, path: abs, checksum: bundle.checksum };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

export function readBundle(projectRoot: string, file: string) {
  try {
    const abs = resolveInside(projectRoot, file);
    if (!abs) return { ok: false as const, message: "Pfad liegt außerhalb des Projekts." };
    return validateBundle(JSON.parse(fs.readFileSync(abs, "utf8")));
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? `Bundle nicht lesbar: ${e.message}` : "Bundle nicht lesbar." };
  }
}

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function buildRestoreScript(bundle: Bundle, opts: { bundlePath?: string; variant?: "shell" | "tmux"; sessionName?: string; agentCommand?: string } = {}): string {
  const s = bundle.state;
  const variant = opts.variant ?? "shell";
  const name = (opts.sessionName ?? "hermes").replace(/[^A-Za-z0-9_-]/g, "_");
  const lines = ["#!/bin/sh", `# Hermes Session Teleport (Bundle v${bundle.version}, ${bundle.checksum.slice(0, 12)})`];
  if (opts.bundlePath) lines.push(`# Bundle: ${opts.bundlePath}`);
  if (s.envNames.length) {
    lines.push("# Benötigte Umgebungsvariablen (Werte bitte selbst setzen):");
    for (const n of s.envNames) lines.push(`: "\${${n}:?${n} fehlt}"`);
  }
  if (s.openFiles.length) lines.push("# Offene Dateien:", ...s.openFiles.map((f) => `#   ${f.replace(/[\r\n]/g, " ")}`));
  if (s.agentPreset) lines.push(`# Agent-Preset: ${s.agentPreset.replace(/[\r\n]/g, " ")}`);
  const agent = opts.agentCommand ?? "";
  if (variant === "tmux") {
    lines.push(`tmux new-session -d -s ${sq(name)} -c ${sq(s.cwd)}${agent ? " " + sq(agent) : ""}`, `tmux attach -t ${sq(name)}`);
  } else {
    lines.push(`cd ${sq(s.cwd)} || exit 1`);
    if (agent) lines.push(agent);
    else lines.push('exec "${SHELL:-/bin/sh}"');
  }
  return lines.join("\n") + "\n";
}

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  export: async (a) => writeBundle(a?.projectRoot, a?.file ?? ".hermes/session-bundle.json", a?.state),
  import: async (a) => readBundle(a?.projectRoot, a?.file ?? ".hermes/session-bundle.json"),
  restoreScript: async (a) => {
    const r = a?.bundle ? validateBundle(a.bundle) : readBundle(a?.projectRoot, a?.file ?? ".hermes/session-bundle.json");
    if (!r.ok) return r;
    return { ok: true, script: buildRestoreScript(r.bundle, a) };
  },
};
