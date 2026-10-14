/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { app } from "electron";

/** Lazily & safely load better-sqlite3, exactly like usageReader.ts — it's a
 * native module that needs to match Electron's ABI (see
 * docs/windows-native-modules.md); if it hasn't been rebuilt yet, degrade to
 * "no session history" instead of crashing the whole app. */
type DatabaseCtor = new (path: string) => any;
let DatabaseImpl: DatabaseCtor | null | undefined;
export let SESSION_DB_BACKEND: "better-sqlite3" | "unavailable" = "unavailable";

function loadDatabase(): DatabaseCtor | null {
  if (DatabaseImpl !== undefined) return DatabaseImpl ?? null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    DatabaseImpl = require("better-sqlite3");
    SESSION_DB_BACKEND = "better-sqlite3";
  } catch {
    DatabaseImpl = null;
    SESSION_DB_BACKEND = "unavailable";
  }
  return DatabaseImpl ?? null;
}

export type SessionStatus = "running" | "exited" | "stopped";

/** Archivierte Sessions sind im Live-Tree/Standardliste unsichtbar, aber
 * nicht gelöscht: Kontextdatei bleibt, Status bleibt, nur archived_at ist
 * gesetzt. Sichtbar nur im expliziten „Archiv"-Filter der Sessions-Ansicht. */
export type SessionArchivedFlavor = "archived";

export interface SessionRecord {
  id: string;
  projectId: string;
  name: string;
  cwd: string;
  status: SessionStatus;
  createdAt: number;
  lastActiveAt: number;
  endedAt: number | null;
  paneIds: string[];
  /** Path to the compacted .air context file (disk persistence). */
  contextPath: string | null;
  expiresAt: number | null;
  /** Set when the user archived the session (lazily-added column, null = aktiv). */
  archivedAt?: number | null;
  /** CLI tool the session's first pane was spawned with (shell/hermes/claude-code/...).
   * Lazily-added column; older rows have it as null, so callers fall back to
   * the project default — reattaching then used to silently switch tools
   * instead of actually restoring "the same old session". */
  /** true = respawn automatically after app/PC restart (cleared by manual stop). */
  resume?: boolean;
  presetId?: string | null;
  profile?: string | null;
  model?: string | null;
}

interface SessionRow {
  id: string;
  project_id: string;
  name: string;
  cwd: string;
  status: SessionStatus;
  created_at: number;
  last_active_at: number;
  ended_at: number | null;
  pane_ids: string;
  context_path: string | null;
  expires_at: number | null;
  archived_at: number | null;
  resume: number | null;
  preset_id: string | null;
  profile: string | null;
  model: string | null;
}

function fromRow(r: SessionRow): SessionRecord {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    cwd: r.cwd,
    status: r.status,
    createdAt: r.created_at,
    lastActiveAt: r.last_active_at,
    endedAt: r.ended_at,
    paneIds: JSON.parse(r.pane_ids || "[]"),
    contextPath: r.context_path,
    expiresAt: r.expires_at,
    archivedAt: r.archived_at ?? null,
    resume: !!r.resume,
    presetId: r.preset_id ?? null,
    profile: r.profile ?? null,
    model: r.model ?? null
  };
}

let dbInstance: any = null;

function getDb(): any | null {
  if (dbInstance) return dbInstance;
  const Database = loadDatabase();
  if (!Database) return null;
  const dir = app.getPath("userData");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "harness-sessions.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      cwd TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      ended_at INTEGER,
      pane_ids TEXT NOT NULL DEFAULT '[]',
      context_path TEXT,
      expires_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
  `);
  // Migration für ältere DBs: archived_at fehlt dort noch. SQLite kennt kein
  // "ADD COLUMN IF NOT EXISTS" — darum via pragma-Tabelle prüfen.
  const cols = db.prepare(`PRAGMA table_info(sessions)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "archived_at")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN archived_at INTEGER`);
  }
  if (!cols.some((c) => c.name === "preset_id")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN preset_id TEXT`);
  }
  if (!cols.some((c) => c.name === "profile")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN profile TEXT`);
  }
  if (!cols.some((c) => c.name === "resume")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN resume INTEGER DEFAULT 0`);
  }
  if (!cols.some((c) => c.name === "model")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN model TEXT`);
  }
  dbInstance = db;
  return dbInstance;
}

export function createSession(rec: SessionRecord): void {
  const db = getDb();
  if (!db) return;
  db.prepare(
    `INSERT INTO sessions (id, project_id, name, cwd, status, created_at, last_active_at, ended_at, pane_ids, context_path, expires_at, preset_id, profile, model, resume)
     VALUES (@id, @projectId, @name, @cwd, @status, @createdAt, @lastActiveAt, @endedAt, @paneIds, @contextPath, @expiresAt, @presetId, @profile, @model, 1)`
  ).run({
    ...rec,
    paneIds: JSON.stringify(rec.paneIds),
    presetId: rec.presetId ?? null,
    profile: rec.profile ?? null,
    model: rec.model ?? null
  });
}

export function touchSession(id: string, lastActiveAt: number): void {
  const db = getDb();
  if (!db) return;
  db.prepare(`UPDATE sessions SET last_active_at = ? WHERE id = ?`).run(lastActiveAt, id);
}

/** Persists the current pane id list for a still-running session — called
 * after splitPane/closePane so the Sessions view's displayed pane count
 * (read from SQLite via listSessions) matches the live in-memory session
 * instead of staying frozen at whatever it was when the session was first
 * created. */
export function updateSessionPaneIds(id: string, paneIds: string[]): void {
  const db = getDb();
  if (!db) return;
  db.prepare(`UPDATE sessions SET pane_ids = ? WHERE id = ?`).run(JSON.stringify(paneIds), id);
}

/** Renames a session's display name — used by the "title from the first
 * message" auto-rename (see SessionManager.captureTitle) so panes stop
 * sitting there as four identical "Hermes" entries. */
export function renameSession(id: string, name: string): void {
  const db = getDb();
  if (!db) return;
  db.prepare(`UPDATE sessions SET name = ? WHERE id = ?`).run(name, id);
}

export function finalizeSession(
  id: string,
  status: SessionStatus,
  endedAt: number,
  paneIds: string[],
  contextPath: string | null,
  expiresAt: number | null
): void {
  const db = getDb();
  if (!db) return;
  db.prepare(
    `UPDATE sessions SET status = ?, ended_at = ?, pane_ids = ?, context_path = ?, expires_at = ?, last_active_at = ? WHERE id = ?`
  ).run(status, endedAt, JSON.stringify(paneIds), contextPath, expiresAt, endedAt, id);
}

/** Records the latest checkpointed .air path without touching status. */
export function setSessionContextPath(id: string, contextPath: string): void {
  const db = getDb();
  if (!db) return;
  db.prepare(`UPDATE sessions SET context_path = ? WHERE id = ?`).run(contextPath, id);
}

export function getSession(id: string): SessionRecord | null {
  const db = getDb();
  if (!db) return null;
  const row = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as SessionRow | undefined;
  return row ? fromRow(row) : null;
}

export function listSessions(projectId: string): SessionRecord[] {
  const db = getDb();
  if (!db) return [];
  const rows = db
    .prepare(`SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC`)
    .all(projectId) as SessionRow[];
  return rows.map(fromRow);
}

/** Archive/unarchive toggles only the archived_at stamp — context file and
 * status stay untouched, so "Verlauf" keeps working on archived rows. */
export function setSessionArchived(id: string, archived: boolean): boolean {
  const db = getDb();
  if (!db) return false;
  const res = db
    .prepare(`UPDATE sessions SET archived_at = ? WHERE id = ?`)
    .run(archived ? Date.now() : null, id);
  return res.changes > 0;
}

/** Deletes expired, already-finished sessions (and their .air files) —
 * invoked lazily the next time the Sessions view is opened for any project,
 * per the chosen "sweep on next open" retention policy (no background
 * timer/cron). Running sessions are never swept. */
export function sweepExpiredSessions(now = Date.now()): void {
  const db = getDb();
  if (!db) return;
  const expired = db
    .prepare(`SELECT * FROM sessions WHERE status != 'running' AND expires_at IS NOT NULL AND expires_at < ?`)
    .all(now) as SessionRow[];
  for (const row of expired) {
    if (row.context_path && existsSync(row.context_path)) {
      try {
        unlinkSync(row.context_path);
      } catch {
        /* best effort */
      }
    }
  }
  db.prepare(`DELETE FROM sessions WHERE status != 'running' AND expires_at IS NOT NULL AND expires_at < ?`).run(now);
}

/** Wipes every session (running or not) belonging to a deleted project,
 * per "...oder sobald das Projekt gelöscht wird". */
export function deleteProjectSessions(projectId: string): string[] {
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare(`SELECT context_path FROM sessions WHERE project_id = ?`).all(projectId) as {
    context_path: string | null;
  }[];
  db.prepare(`DELETE FROM sessions WHERE project_id = ?`).run(projectId);
  return rows.map((r) => r.context_path).filter((p): p is string => !!p);
}

export function deleteSession(id: string): string | null {
  const db = getDb();
  if (!db) return null;
  const row = db.prepare(`SELECT context_path FROM sessions WHERE id = ?`).get(id) as
    | { context_path: string | null }
    | undefined;
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  return row?.context_path ?? null;
}

/** Marks a persisted session as live again WITHOUT creating a new row —
 * reattach keeps the session's identity (same id, same created_at, same
 * context history) and only swaps the pane ids for the fresh pane. The
 * previous reattach inserted a brand-new row per click, so two existing
 * sessions turned into three on every "Öffnen". */
export function reviveSessionRow(id: string, paneIds: string[]): boolean {
  const db = getDb();
  if (!db) return false;
  const res = db
    .prepare(
      `UPDATE sessions SET status = 'running', pane_ids = ?, ended_at = NULL, expires_at = NULL, resume = 1, last_active_at = ? WHERE id = ?`
    )
    .run(JSON.stringify(paneIds), Date.now(), id);
  return res.changes > 0;
}

/** Sessions the DB believes are live, or null when the DB is unavailable. */
export function listRunningSessions(): SessionRecord[] | null {
  const db = getDb();
  if (!db) return null;
  return (db.prepare(`SELECT * FROM sessions WHERE status = 'running'`).all() as SessionRow[]).map(fromRow);
}

/** Called once at app startup, AFTER SessionManager.adoptLive(): any session
 * still marked "running" that was not adopted (`keep`) lost its pty — the PTY
 * daemon died, e.g. with a PC reboot. Rewrites them to "stopped" so the UI
 * stops probing a nonexistent live pane and instead takes the normal
 * respawn-with-restored-context reattach path. */
export function markOrphanedRunningSessions(now = Date.now(), keep: ReadonlySet<string> = new Set()): void {
  const db = getDb();
  if (!db) return;
  const orphans = (db
    .prepare(`SELECT id FROM sessions WHERE status = 'running'`)
    .all() as { id: string }[]).filter((o) => !keep.has(o.id));
  for (const { id } of orphans) {
    db.prepare(
      `UPDATE sessions SET status = 'stopped', ended_at = ?, last_active_at = ? WHERE id = ?`
    ).run(now, now, id);
    if (orphans.length > 0) console.log(`[harness] orphaned session ${id} re-stamped to "stopped"`);
  }
}

/** resume=1: the session was alive and not stopped by the user, so it is
 * respawned on the next app start (also after a PC reboot). */
export function setSessionResume(id: string, resume: boolean): void {
  const db = getDb();
  if (!db) return;
  db.prepare(`UPDATE sessions SET resume = ? WHERE id = ?`).run(resume ? 1 : 0, id);
}
