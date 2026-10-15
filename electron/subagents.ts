/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import os from "os";

export interface SubagentInfo {
  id: string;
  source: "claude" | "hermes";
  projectId: string;
  title: string;
  agentType: string | null;
  startedAt: number;
  updatedAt: number;
  done: boolean;
  /** Claude: Pfad zur .jsonl; Hermes: \"<profil>|<sessionId>\". */
  ref: string;
}

export interface SubagentLine {
  kind: "task" | "text" | "tool" | "result";
  text: string;
}

interface ProjectLike { id: string; folder: string; hermesProfile: string }

type DatabaseCtor = new (path: string, opts: { readonly: boolean; fileMustExist: boolean }) => any;
let DatabaseImpl: DatabaseCtor | null | undefined;
/** better-sqlite3 nur bei Bedarf laden (wie in usageReader.ts); fehlt es, bleibt Hermes einfach außen vor. */
function loadDatabase(): DatabaseCtor | null {
  if (DatabaseImpl !== undefined) return DatabaseImpl ?? null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    DatabaseImpl = require("better-sqlite3");
  } catch {
    DatabaseImpl = null;
  }
  return DatabaseImpl ?? null;
}

/** Claude Code legt Projekte unter einem Ordnernamen ab, in dem jedes Sonderzeichen des Pfads zu „-“ wird (E:\HermesHarness → E--HermesHarness). */
function claudeProjectDir(folder: string): string {
  return join(os.homedir(), ".claude", "projects", folder.replace(/[^a-zA-Z0-9]/g, "-"));
}

/** Pfad der state.db eines Hermes-Profils: leer/„default“ → Basis-state.db, sonst profiles/<profil>/state.db. */
export function hermesDbPath(profile?: string | null, localAppData?: string): string {
  const base = join(localAppData ?? process.env.LOCALAPPDATA ?? join(os.homedir(), "AppData", "Local"), "hermes");
  const p = (profile ?? "").trim();
  return !p || p === "default" ? join(base, "state.db") : join(base, "profiles", p, "state.db");
}

/** ref für Hermes-Subagenten: "<profil>|<sessionId>". */
export function encodeHermesRef(profile: string, sessionId: string): string {
  return `${profile || "default"}|${sessionId}`;
}
export function decodeHermesRef(ref: string): { profile: string; sessionId: string } {
  const i = ref.indexOf("|");
  return i < 0 ? { profile: "default", sessionId: ref } : { profile: ref.slice(0, i), sessionId: ref.slice(i + 1) };
}

/** Gruppiert Projekte nach Hermes-Profil (leer → "default"); erstes Projekt je Profil gewinnt. */
export function projectsByHermesProfile(projects: ProjectLike[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of projects) {
    const key = (p.hermesProfile ?? "").trim() || "default";
    if (!m.has(key)) m.set(key, p.id);
  }
  return m;
}

const warned = new Set<string>();
function warnOnce(key: string, err: unknown): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[subagents] ${key}:`, err);
}

/** Ein Subagent gilt als fertig, wenn er seit 25 s nichts mehr geschrieben hat — die Protokolle haben kein verlässliches „Ende“-Signal. */
const IDLE_DONE_MS = 25_000;

/** Findet die Subagenten von Claude Code eines Projekts, die seit `since` gestartet wurden (über ihre meta.json neben dem Protokoll). */
function scanClaude(project: ProjectLike, since: number, now: number): SubagentInfo[] {
  const base = claudeProjectDir(project.folder);
  if (!existsSync(base)) return [];
  const out: SubagentInfo[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(base, entry.name, "subagents");
    let stat;
    try { stat = statSync(dir); } catch { continue; }
    if (stat.mtimeMs < since) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".jsonl")) continue;
      const path = join(dir, file);
      const s = statSync(path);
      if (s.birthtimeMs < since && s.mtimeMs < since) continue;
      let meta: { agentType?: string; description?: string } = {};
      try { meta = JSON.parse(readFileSync(path.replace(/\.jsonl$/, ".meta.json"), "utf-8")); } catch { /* ohne meta.json bleibt der Dateiname */ }
      out.push({
        id: `claude:${file.replace(/\.jsonl$/, "")}`,
        source: "claude",
        projectId: project.id,
        title: meta.description || file.replace(/\.jsonl$/, ""),
        agentType: meta.agentType ?? null,
        startedAt: Math.min(s.birthtimeMs || s.mtimeMs, s.mtimeMs),
        updatedAt: s.mtimeMs,
        done: now - s.mtimeMs > IDLE_DONE_MS,
        ref: path
      });
    }
  }
  return out;
}

/** Findet Hermes-Unter-Sessions (parent_session_id gesetzt) je Profil-DB der Projekte, seit `since` gestartet. */
function scanHermes(projects: ProjectLike[], since: number): SubagentInfo[] {
  const Db = loadDatabase();
  if (!Db) return [];
  const out: SubagentInfo[] = [];
  for (const [profile, projectId] of projectsByHermesProfile(projects)) {
    const path = hermesDbPath(profile);
    if (!existsSync(path)) continue;
    let db: any;
    try {
      db = new Db(path, { readonly: true, fileMustExist: true });
      const rows = db
        .prepare("SELECT id, title, started_at, ended_at, last_activity_at FROM sessions WHERE parent_session_id IS NOT NULL AND started_at >= ?")
        .all(since / 1000) as { id: string; title: string | null; started_at: number; ended_at: number | null; last_activity_at: number | null }[];
      for (const r of rows) {
        out.push({
          id: `hermes:${profile}:${r.id}`,
          source: "hermes",
          projectId,
          title: (r.title ?? "Subagent").replace(/^Subagent:\s*/, ""),
          agentType: null,
          startedAt: r.started_at * 1000,
          updatedAt: (r.last_activity_at ?? r.ended_at ?? r.started_at) * 1000,
          done: r.ended_at != null,
          ref: encodeHermesRef(profile, r.id)
        });
      }
    } catch (err) {
      warnOnce(`Hermes-DB ${path}`, err);
    } finally {
      try { db?.close(); } catch { /* egal */ }
    }
  }
  return out;
}

/** Alle Subagenten der Projekte, die seit `since` (ms) gestartet sind, neueste zuerst. */
export function listSubagents(projects: ProjectLike[], since: number): SubagentInfo[] {
  const now = Date.now();
  const all = [...projects.flatMap((p) => { try { return scanClaude(p, since, now); } catch { return []; } }), ...scanHermes(projects, since)];
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

/** Kürzt auf eine Zeile mit höchstens `max` Zeichen, für Werkzeug-Argumente und Ergebnisse. */
function oneLine(value: unknown, max = 110): string {
  const s = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const line = s.replace(/\s+/g, " ").trim();
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

/** Erstes sprechendes Argument eines Werkzeugaufrufs (Pfad, Befehl, Muster …), damit die Zeile wie im Terminal aussieht: ● Read(src/app.ts). */
function toolArg(input: unknown): string {
  if (input && typeof input === "object") {
    for (const key of ["file_path", "path", "command", "pattern", "url", "query", "description", "prompt"]) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === "string" && v) return oneLine(v, 80);
    }
  }
  return oneLine(input, 80);
}

/** Liest das Protokoll eines Subagenten und macht daraus terminalartige Zeilen: Aufgabe, Text, Werkzeugaufrufe, Ergebnisse. */
export function readSubagent(info: Pick<SubagentInfo, "source" | "ref">): SubagentLine[] {
  const out: SubagentLine[] = [];
  if (info.source === "claude") {
    let raw = "";
    try { raw = readFileSync(info.ref, "utf-8"); } catch { return out; }
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let o: any;
      try { o = JSON.parse(line); } catch { continue; }
      const content = o?.message?.content;
      if (o.type === "user" && typeof content === "string") out.push({ kind: "task", text: content.trim() });
      else if (Array.isArray(content)) {
        for (const c of content) {
          if (c.type === "text" && c.text?.trim()) out.push({ kind: "text", text: c.text.trim() });
          else if (c.type === "tool_use") out.push({ kind: "tool", text: `${c.name}(${toolArg(c.input)})` });
          else if (c.type === "tool_result") {
            const body = Array.isArray(c.content) ? c.content.map((x: any) => x.text ?? "").join(" ") : c.content;
            out.push({ kind: "result", text: oneLine(body) || "(leer)" });
          }
        }
      }
    }
  } else {
    const Db = loadDatabase();
    const { profile, sessionId } = decodeHermesRef(info.ref);
    const path = hermesDbPath(profile);
    if (!Db || !existsSync(path)) return out;
    let db: any;
    try {
      db = new Db(path, { readonly: true, fileMustExist: true });
      const rows = db.prepare("SELECT role, content, tool_calls FROM messages WHERE session_id = ? ORDER BY timestamp").all(sessionId) as { role: string; content: string | null; tool_calls: string | null }[];
      for (const r of rows) {
        if (r.role === "user" && r.content) out.push({ kind: out.length ? "text" : "task", text: r.content.trim() });
        else if (r.role === "assistant") {
          if (r.content?.trim()) out.push({ kind: "text", text: r.content.trim() });
          try {
            for (const call of JSON.parse(r.tool_calls || "[]")) {
              let args: unknown = call?.function?.arguments;
              try { args = JSON.parse(String(args)); } catch { /* bleibt Text */ }
              out.push({ kind: "tool", text: `${call?.function?.name ?? "tool"}(${toolArg(args)})` });
            }
          } catch { /* keine Werkzeugaufrufe */ }
        } else if (r.role === "tool") out.push({ kind: "result", text: oneLine(r.content) || "(leer)" });
      }
    } catch (err) { warnOnce(`Hermes-DB ${path}`, err); } finally {
      try { db?.close(); } catch { /* egal */ }
    }
  }
  return out.slice(-500);
}
