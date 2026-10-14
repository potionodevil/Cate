/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { randomUUID } from "crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { app, BrowserWindow, type WebContents } from "electron";
import { DEFAULT_SHELL, PtyManager, type PaneSpawnOptions } from "./ptyManager";
import { BUILTIN_AGENT_PRESETS, buildSpawnArgs } from "./agentPresets";
import {
  createSession,
  touchSession,
  finalizeSession,
  getSession,
  listSessions,
  setSessionArchived,
  setSessionContextPath,
  setSessionResume,
  deleteProjectSessions,
  deleteSession,
  renameSession,
  updateSessionPaneIds,
  reviveSessionRow,
  listRunningSessions,
  type SessionRecord,
  type SessionStatus
} from "./sessionStore";
import {
  compactTerminalLog,
  mergeRestoredContext,
  writeAirFile,
  readAirFile,
  deriveSessionTitle,
  deriveTitleFromPromptEcho
} from "./airFormat";
import {
  writeSessionSnapshot,
  deleteSessionSnapshot,
  loadSessionSnapshots,
  setSessionSnapshotArchived
} from "./sessionSnapshot";

const ACTIVITY_DIGEST_CHARS_PER_SESSION = 1500;
const ACTIVITY_DIGEST_TOTAL_CAP = 4000;
export const MAX_PANES_PER_SESSION = 8;

export type SplitPaneResult =
  | { ok: true; paneId: string }
  | { ok: false; error: { code: "SESSION_NOT_FOUND" | "PANE_LIMIT" | "PANE_NOT_FOUND" | "SESSION_NOT_RUNNING"; message: string } };

export interface CreateSessionOptions {
  projectId: string;
  name: string;
  presetId: string;
  profile?: string;
  model?: string;
  cwd: string;
  shellOverride?: string;
  args?: string[];
  env?: Record<string, string>;
  banner?: string;
}

export interface PaneState {
  id: string;
  sessionId: string;
  projectId: string;
  presetId: string;
  profile?: string;
  model?: string;
  label: string;
  status: "starting" | "running" | "exited" | "stopped";
}

interface SessionState {
  id: string;
  projectId: string;
  name: string;
  cwd: string;
  status: SessionStatus;
  paneIds: string[];
  createdAt: number;
  lastActiveAt: number;
  endedAt: number | null;
  /** true sobald der User die Session manuell umbenannt hat — der
   * Auto-Titel aus captureTitle überschreibt sie dann nicht mehr. */
  nameLocked?: boolean;
}

function contextDir(): string {
  return join(app.getPath("userData"), "session-context");
}

/** Plain-text twin of the gzip .air file, so agents (hh-peers, restored
 * sessions) can read a transcript with their normal file tools. */
export function contextTextPath(sessionId: string): string {
  return join(contextDir(), `${sessionId}.txt`);
}

/** History from BEFORE the current process (written at reattach). Persisted so
 * it also survives a second app restart that re-adopts the live process. */
function previousContextPath(sessionId: string): string {
  return join(contextDir(), `${sessionId}.prev.txt`);
}

function writeContextText(sessionId: string, text: string): void {
  try {
    writeFileSync(contextTextPath(sessionId), text, "utf-8");
  } catch {
    /* best effort */
  }
}

/**
 * Glues PtyManager (raw processes) to sessionStore (SQLite index),
 * sessionSnapshot (JSON persistence), and airFormat (compacted context
 * files). A "Session" is a named group of one or more panes sharing the
 * same projectId and cwd. When created, a session starts with exactly one
 * shell/agent pane. Panes can be split horizontally/vertically to add more
 * panes to the same session.
 */
export class SessionManager {
  private pty = new PtyManager();
  /** In-memory session grouping: sessionId -> SessionState. */
  private sessions = new Map<string, SessionState>();
  /** In-memory pane metadata: paneId -> PaneState. */
  private panes = new Map<string, PaneState>();
  /** ids the user explicitly asked to stop, so the shared onExit hook can
   * tell "stopped by user" apart from "process exited on its own". */
  private manualStops = new Set<string>();
  /** Per-pane buffer of raw keystrokes accumulated until the first Enter,
   * used to auto-title a session from its first real message. Cleared once
   * a title has been derived (or given up on) for that pane. */
  private titleBuffers = new Map<string, string>();
  private titled = new Set<string>();
  /** Backlogs captured synchronously before a pane is killed (stopSession,
   * deleteSession, finalizeAllOnQuit). PtyManager.kill() removes the pane
   * entry immediately, so finalizeSession would otherwise read a null
   * backlog and never write the .air context file. Consumed (and cleared)
   * by finalizeSession, keyed by pane id. */
  private exitBacklogs = new Map<string, string>();
  /** sessionId -> compacted history of earlier processes of a restored
   * session. Merged in front of the live backlog at every checkpoint/finalize,
   * otherwise the first checkpoint after a reattach overwrites the .air file
   * with only the fresh process output and the history is gone for good. */
  private restoredContext = new Map<string, string>();

  private getRestored(sessionId: string): string {
    const cached = this.restoredContext.get(sessionId);
    if (cached !== undefined) return cached;
    let text = "";
    try {
      const p = previousContextPath(sessionId);
      if (existsSync(p)) text = readFileSync(p, "utf-8");
    } catch {
      /* best effort */
    }
    this.restoredContext.set(sessionId, text);
    return text;
  }

  /** Compacted history = restored part + live backlog of the current panes. */
  private compactSession(sessionId: string, backlogs: string[]): string {
    return mergeRestoredContext(this.getRestored(sessionId), compactTerminalLog(backlogs.join("\n\n")));
  }

  /** Injected by main.ts: global local-model/MCP flags + splash for extra panes. */
  agentExtrasFor?: (presetId: string) => { args: string[]; env: Record<string, string> };
  bannerFor?: (agentLabel: string) => string;

  get backend() {
    return this.pty;
  }

  /** Creates a new session with exactly one pane. Returns the sessionId. */
  createSession(opts: CreateSessionOptions, sender: WebContents, retentionDays: number): string {
    const sessionId = randomUUID();
    const paneId = randomUUID();
    const now = Date.now();

    const session: SessionState = {
      id: sessionId,
      projectId: opts.projectId,
      name: opts.name,
      cwd: opts.cwd,
      status: "running",
      paneIds: [paneId],
      createdAt: now,
      lastActiveAt: now,
      endedAt: null
    };
    this.sessions.set(sessionId, session);

    const pane: PaneState = {
      id: paneId,
      sessionId,
      projectId: opts.projectId,
      presetId: opts.presetId,
      profile: opts.profile,
      model: opts.model,
      label: opts.name,
      status: "starting"
    };
    this.panes.set(paneId, pane);

    createSession({
      id: sessionId,
      projectId: opts.projectId,
      name: opts.name,
      cwd: opts.cwd,
      status: "running",
      createdAt: now,
      lastActiveAt: now,
      endedAt: null,
      paneIds: [paneId],
      contextPath: null,
      expiresAt: null,
      presetId: opts.presetId,
      profile: opts.profile ?? null,
      model: opts.model ?? null
    });

    // Claude Code uses the Harness session id as its own conversation id, so a
    // later reattach (also after a PC reboot) can `--resume <id>` exactly it.
    const claudeId = opts.presetId === "claude-code" && opts.shellOverride ? ["--session-id", sessionId] : [];
    const spawnOpts: PaneSpawnOptions = {
      cwd: opts.cwd,
      shellOverride: opts.shellOverride,
      args: [...(opts.args ?? []), ...claudeId],
      banner: opts.banner,
      env: {
        HH_PROJECT_ID: opts.projectId,
        HH_SESSION_ID: sessionId,
        HH_PANE_ID: paneId,
        ...opts.env
      }
    };

    this.pty.spawnWithId(paneId, spawnOpts, sender, {
      onData: () => {
        touchSession(sessionId, Date.now());
        session.lastActiveAt = Date.now();
        pane.status = "running";
      },
      onExit: (_id: string, code: number) => {
        this.handlePaneExit(paneId, sessionId, retentionDays, sender, code);
      }
    });

    return sessionId;
  }

  /** Splits a pane within a session, creating a new sibling pane sharing the
   * session's cwd. Returns the new paneId, or null if the session/pane is not
   * live. */
  splitPane(
    sessionId: string,
    paneId: string,
    _direction: "horizontal" | "vertical",
    presetId: string | undefined,
    sender: WebContents,
    retentionDays = 30
  ): SplitPaneResult {
    const session = this.sessions.get(sessionId);
    if (!session) return { ok: false, error: { code: "SESSION_NOT_FOUND", message: "Session not found." } };
    const sibling = this.panes.get(paneId);
    if (sibling && !presetId) presetId = sibling.presetId || "shell"; // never silently fall back to a plain shell
    if (!sibling || sibling.sessionId !== sessionId) {
      return { ok: false, error: { code: "PANE_NOT_FOUND", message: "Pane not found in session." } };
    }
    if (session.status !== "running") {
      return { ok: false, error: { code: "SESSION_NOT_RUNNING", message: "Session is not running." } };
    }
    if (session.paneIds.length >= MAX_PANES_PER_SESSION) {
      return { ok: false, error: { code: "PANE_LIMIT", message: `A session can have at most ${MAX_PANES_PER_SESSION} panes.` } };
    }

    const newPaneId = randomUUID();
    presetId = presetId || "shell";
    const preset = BUILTIN_AGENT_PRESETS.find((p) => p.id === presetId) || BUILTIN_AGENT_PRESETS[0];
    const pane: PaneState = {
      id: newPaneId,
      sessionId,
      projectId: session.projectId,
      presetId,
      profile: sibling.profile,
      model: sibling.model,
      label: presetId === "shell" ? "Shell" : preset.label,
      status: "starting"
    };
    this.panes.set(newPaneId, pane);
    session.paneIds.push(newPaneId);
    updateSessionPaneIds(sessionId, session.paneIds);

    // Resolve the preset's real spawn command/args (profile+model carried
    // over from the sibling pane it's being split from) — this used to
    // always hardcode a plain shell regardless of presetId, so every pane
    // after the first silently never started the configured agent CLI at
    // all ("Agentic CLI Harness kein Shell-Distributor").
    const { command, args } = buildSpawnArgs(preset, { profile: sibling.profile, model: sibling.model });
    const extras = this.agentExtrasFor?.(preset.id) ?? { args: [], env: {} };

    const spawnOpts: PaneSpawnOptions = {
      cwd: session.cwd,
      shellOverride: command || DEFAULT_SHELL,
      args: command ? [...args, ...extras.args] : [],
      banner: command && this.bannerFor ? this.bannerFor(preset.label) : undefined,
      env: {
        ...extras.env,
        HH_PROJECT_ID: session.projectId,
        HH_SESSION_ID: sessionId,
        HH_PANE_ID: newPaneId
      }
    };

    this.pty.spawnWithId(newPaneId, spawnOpts, sender, {
      onData: () => {
        touchSession(sessionId, Date.now());
        session.lastActiveAt = Date.now();
        pane.status = "running";
      },
      onExit: (_id: string, code: number) => {
        this.handlePaneExit(newPaneId, sessionId, retentionDays, sender, code);
      }
    });

    return { ok: true, paneId: newPaneId };
  }

  /** Reattaches a persisted session WITHOUT creating a new session row — the
   * session keeps its id, name, created_at and context history; only the
   * pane ids are swapped for the freshly spawned pane (reviveSessionRow).
   * The previous implementation inserted a brand-new row per click, so
   * reopening turned "2 laufende Sessions" into 3 (the reported
   * Session-Duplizierung). The restored .air context is seeded into the new
   * agent process by session:reattach in main.ts via `chat -q`. */
  reattachSession(
    record: SessionRecord,
    opts: CreateSessionOptions,
    sender: WebContents,
    retentionDays: number
  ): { ok: true; sessionId: string; paneId: string } {
    const paneId = randomUUID();
    const now = Date.now();

    // Reuse the record's id: reopening the same session must reopen THE
    // session, not fork a copy of it.
    const sessionId = record.id;

    // Idempotent: startup auto-restore, the renderer's "Öffnen" and a double
    // click can all ask for the same session. If it already has a live pane,
    // hand that pane back instead of spawning a second agent next to it.
    const existing = this.sessions.get(sessionId);
    const livePane = existing?.paneIds.find((id) => this.pty.has(id));
    if (existing && livePane) return { ok: true, sessionId, paneId: livePane };

    // Persist the history BEFORE the new process can checkpoint over the .air.
    let history = "";
    try {
      if (record.contextPath && existsSync(record.contextPath)) history = readAirFile(record.contextPath);
    } catch {
      /* unreadable context: restore without history */
    }
    if (history) {
      try {
        writeFileSync(previousContextPath(sessionId), history, "utf-8");
      } catch {
        /* the in-memory copy below still protects this run */
      }
    }
    this.restoredContext.set(sessionId, history || this.getRestored(sessionId));
    let session = existing;
    if (session) {
      // In memory but without a live pane (agent exited/stopped): the new
      // pane replaces the dead ones.
      session.paneIds = [paneId];
      session.status = "running";
      session.endedAt = null;
    } else {
      session = {
        id: sessionId,
        projectId: record.projectId,
        name: record.name,
        cwd: record.cwd,
        status: "running",
        paneIds: [paneId],
        createdAt: record.createdAt,
        lastActiveAt: now,
        endedAt: null
      };
      this.sessions.set(sessionId, session);
    }
    const pane: PaneState = {
      id: paneId,
      sessionId,
      projectId: record.projectId,
      presetId: opts.presetId,
      profile: opts.profile,
      model: opts.model,
      label: record.name,
      status: "starting"
    };
    this.panes.set(paneId, pane);
    // UPDATE (not INSERT): flips the existing row back to "running" with the
    // new pane id, clears ended_at/expires_at, keeps context history intact.
    reviveSessionRow(sessionId, session.paneIds);
    this.pty.spawnWithId(paneId, {
      cwd: opts.cwd,
      shellOverride: opts.shellOverride,
      args: opts.args,
      banner: opts.banner,
      env: { HH_PROJECT_ID: record.projectId, HH_SESSION_ID: sessionId, HH_PANE_ID: paneId, ...opts.env }
    }, sender, {
      onData: () => { touchSession(sessionId, Date.now()); session.lastActiveAt = Date.now(); pane.status = "running"; },
      onExit: (_id, code) => this.handlePaneExit(paneId, sessionId, retentionDays, sender, code)
    });
    return { ok: true, sessionId, paneId };
  }

  /** Rebuilds in-memory state for sessions whose panes survived an app
   * restart inside the PTY daemon, instead of respawning them. Returns the
   * adopted session ids (the rest of the DB's "running" rows are stale). */
  adoptLive(sender: WebContents, retentionDays: number): Set<string> {
    const adopted = new Set<string>();
    const live = new Set(this.pty.liveIds());
    const rows = listRunningSessions();
    if (!rows) return adopted; // DB unavailable: leave the live panes alone
    const adoptedPanes = new Set<string>();
    for (const rec of rows) {
      const paneIds = rec.paneIds.filter((id) => live.has(id));
      if (paneIds.length === 0) continue;
      const session: SessionState = {
        id: rec.id,
        projectId: rec.projectId,
        name: rec.name,
        cwd: rec.cwd,
        status: "running",
        paneIds,
        createdAt: rec.createdAt,
        lastActiveAt: rec.lastActiveAt,
        endedAt: null
      };
      this.sessions.set(rec.id, session);
      if (paneIds.length !== rec.paneIds.length) updateSessionPaneIds(rec.id, paneIds);
      for (const paneId of paneIds) {
        const pane: PaneState = {
          id: paneId,
          sessionId: rec.id,
          projectId: rec.projectId,
          presetId: rec.presetId || "shell",
          profile: rec.profile ?? undefined,
          model: rec.model ?? undefined,
          label: rec.name,
          status: "running"
        };
        this.panes.set(paneId, pane);
        this.titled.add(paneId); // already named before the restart
        adoptedPanes.add(paneId);
        this.pty.adopt(paneId, sender, {
          onData: () => {
            touchSession(rec.id, Date.now());
            session.lastActiveAt = Date.now();
            pane.status = "running";
          },
          onExit: (_id: string, code: number) => this.handlePaneExit(paneId, rec.id, retentionDays, sender, code)
        });
      }
      adopted.add(rec.id);
    }
    // Live panes no session row claims are unreachable from the UI: stop them.
    for (const id of live) if (!adoptedPanes.has(id)) this.pty.kill(id);
    return adopted;
  }

  /** The session a pane belongs to (for "fertig" notifications). */
  paneSession(paneId: string): { id: string; name: string; projectId: string } | undefined {
    const pane = this.panes.get(paneId);
    const session = pane && this.sessions.get(pane.sessionId);
    return session && { id: session.id, name: session.name, projectId: session.projectId };
  }

  /** Running sessions across all projects, newest activity first. */
  runningSessions(): { id: string; name: string; projectId: string; lastActiveAt: number }[] {
    return [...this.sessions.values()]
      .filter((s) => s.status === "running")
      .map(({ id, name, projectId, lastActiveAt }) => ({ id, name, projectId, lastActiveAt }))
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  attachPane(paneId: string): { backlog: string } | null {
    if (!this.pty.has(paneId)) return null;
    return { backlog: this.pty.getBacklog(paneId) ?? "" };
  }

  stopSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    setSessionResume(sessionId, false); // user stopped it: do not auto-respawn
    for (const paneId of session.paneIds) {
      if (this.pty.has(paneId)) {
        // Capture the backlog BEFORE kill(): PtyManager.kill() drops the
        // pane entry synchronously, so any getBacklog() afterwards reads
        // null — that made every finalize write an empty/absent .air file,
        // leaving context_path NULL and reopened sessions with no history
        // (root cause of "alte Sessions laden ihren Kontext nicht").
        const backlog = this.pty.getBacklog(paneId);
        if (backlog) this.exitBacklogs.set(paneId, backlog);
        this.manualStops.add(paneId);
        this.pty.kill(paneId);
      }
    }
    return true;
  }

  stopPane(paneId: string): boolean {
    if (!this.pty.has(paneId)) return false;
    this.manualStops.add(paneId);
    return this.pty.kill(paneId);
  }

  /** Writes to a pane's stdin. `opts.isUserInput` (default true) also feeds
   * the first-message auto-titling for the pane's owning session. */
  writePane(paneId: string, data: string, opts?: { isUserInput?: boolean; sender?: WebContents }): boolean {
    const pane = this.panes.get(paneId);
    if (opts?.isUserInput !== false && pane) this.captureTitle(pane.sessionId, paneId, data, opts?.sender);
    return this.pty.write(paneId, data);
  }

  /** Accumulates raw keystrokes per pane until the first Enter, derives a
   * short title from that line, and — once — both renames the whole session
   * and pushes a live rename event to the renderer. */
  private captureTitle(sessionId: string, paneId: string, data: string, sender?: WebContents): void {
    if (this.titled.has(paneId)) return;
    const session = this.sessions.get(sessionId);
    //manuelles Rename oder Auto-Titel sind schon vorhanden: keine Überschreibung
    if (session && session.nameLocked) return;
    const buffered = (this.titleBuffers.get(paneId) ?? "") + data;
    const newlineIdx = buffered.search(/[\r\n]/);
    if (newlineIdx === -1) {
      if (buffered.length > 400) {
        this.titled.add(paneId);
        this.titleBuffers.delete(paneId);
      } else {
        this.titleBuffers.set(paneId, buffered);
      }
      return;
    }
    const line = buffered.slice(0, newlineIdx);
    this.titleBuffers.delete(paneId);
    const title = deriveSessionTitle(line) || deriveTitleFromPromptEcho(buffered);
    if (!title) {
      const rest = buffered.slice(newlineIdx + 1);
      if (rest) this.titleBuffers.set(paneId, rest);
      return;
    }
    this.titled.add(paneId);
    // Name the session a few seconds after the first message, not on Enter:
    // a rename the user makes meanwhile locks the name and wins.
    setTimeout(() => {
      if (!this.sessions.get(sessionId)?.nameLocked) this.applySessionRename(sessionId, title, "auto");
    }, 4000);
  }

  /** Zentrale Rename-Logik: setzt in-memory session.name, synchronisiert
   * alle Pane-Labels der Session, persistiert nach SQLite und broadcastet
   * das Rename-Event an ALLE offenen Fenster (nicht nur den Sender), damit
   * Sidebar-/SessionsView-/Pane-Header-Anzeigen gleichlaufend bleiben. */
  private applySessionRename(sessionId: string, title: string, source: "auto" | "manual"): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.name = title;
    for (const paneId of session.paneIds) {
      const pane = this.panes.get(paneId);
      // Bei Split-Panes das generische Split-Label nur dann mit dem
      // Session-Titel ersetzen, wenn es noch generisch ist — eine
      // individuelle Pane-Etikett-Historie gibt es (noch) nicht.
      if (pane && (pane.label === "Shell" || pane.label === "Hermes" || pane.label === "Neue Session")) {
        pane.label = title;
      }
    }
    if (source === "manual") session.nameLocked = true;
    renameSession(sessionId, title);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.webContents.isDestroyed()) {
        win.webContents.send("sessions:renamed", { id: sessionId, sessionId, label: title, source });
      }
    }
  }

  /** Manuelles Umbenennen aus der UI (SessionsView/Sidebar/Pane-Header).
   * Sperrt danach den Auto-Titel fuer diese Session (nameLocked). */
  renameSessionManual(sessionId: string, name: string): boolean {
    if (!this.sessions.has(sessionId)) return false;
    this.applySessionRename(sessionId, name, "manual");
    return true;
  }

  resizePane(paneId: string, cols: number, rows: number): boolean {
    return this.pty.resize(paneId, cols, rows);
  }

  /** Snapshot payload incl. what a reattach needs when the SQLite row is
   * unavailable (preset/profile/model) and the resume flag, so a session
   * that was running at quit is still restorable from the .json sidecar. */
  private snapshotRecord(session: SessionState, contextPath: string, running: boolean): SessionRecord {
    const pane = session.paneIds.map((id) => this.panes.get(id)).find(Boolean);
    const row = getSession(session.id);
    return {
      ...session,
      contextPath,
      expiresAt: null,
      presetId: pane?.presetId ?? row?.presetId ?? null,
      profile: pane?.profile ?? row?.profile ?? null,
      model: pane?.model ?? row?.model ?? null,
      resume: running ? true : row?.resume ?? false
    };
  }

  /** Sessions that were running when the app/PC went down (resume flag still
   * set by finalize-on-quit / orphan marking) and have no live process now.
   * main.ts restores exactly these at startup. */
  listRestorable(projectIds: string[]): SessionRecord[] {
    const out: SessionRecord[] = [];
    for (const projectId of projectIds) {
      for (const s of this.listSessions(projectId)) {
        // Reparatur: eine vorhandene .air-Datei darf nie "verwaist" sein.
        const air = join(contextDir(), `${s.id}.air`);
        if (!s.contextPath && existsSync(air)) {
          try { setSessionContextPath(s.id, air); s.contextPath = air; } catch { /* ignore */ }
        }
        if (s.resume && s.status !== "running" && !s.archivedAt) out.push(s);
      }
    }
    return out.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  /** Lists live sessions from SQLite + finalized sessions from snapshot files. */
  listSessions(projectId: string): SessionRecord[] {
    // No auto-sweep: sessions are only removed by an explicit user delete.
    const live = listSessions(projectId);
    const snapshots = loadSessionSnapshots(projectId).filter((s) => !live.some((l) => l.id === s.id));
    const merged = [...live, ...snapshots];
    merged.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    return merged;
  }

  /** Archive/unarchive by display id — keeps the .air context, so an
   * archived session can still be opened/restored from the archive filter. */
  archiveSession(sessionId: string, archived: boolean): boolean {
    return setSessionArchived(sessionId, archived) || setSessionSnapshotArchived(sessionId, archived);
  }

  /** Current transcript for the Sessions view: live backlog (compacted) for
   * a still-running session, or the stored .air file for a finished one. */
  getSessionContext(sessionId: string): { ok: boolean; content: string } {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Aggregate backlogs from all live panes in the session.
      const parts: string[] = [];
      for (const paneId of session.paneIds) {
        const backlog = this.pty.getBacklog(paneId);
        if (backlog) parts.push(`--- Pane ${paneId} ---\n${compactTerminalLog(backlog)}`);
      }
      return { ok: true, content: mergeRestoredContext(this.getRestored(sessionId), parts.join("\n\n")) };
    }
    const record = getSession(sessionId) ?? loadSessionSnapshots().find((s) => s.id === sessionId) ?? null;
    if (record?.contextPath && existsSync(record.contextPath)) {
      try {
        return { ok: true, content: readAirFile(record.contextPath) };
      } catch (err) {
        return { ok: false, content: err instanceof Error ? err.message : String(err) };
      }
    }
    return { ok: false, content: "Kein Kontext verfuegbar." };
  }

  /** Cheap cross-session digest for "what are my siblings in this project
   * currently doing", scoped to other sessions (not panes). */
  getProjectActivityDigest(projectId: string, excludeSessionId?: string): string {
    const siblings = this.listSessions(projectId).filter(
      (s) => s.id !== excludeSessionId && s.status === "running"
    );
    if (siblings.length === 0) return "";
    const parts: string[] = [];
    let used = 0;
    for (const s of siblings) {
      if (used >= ACTIVITY_DIGEST_TOTAL_CAP) break;
      const session = this.sessions.get(s.id);
      if (!session) continue;
      const raw = session.paneIds.map((id) => this.pty.getBacklog(id) ?? "").join("\n");
      const tail = raw.slice(-ACTIVITY_DIGEST_CHARS_PER_SESSION);
      const compact = compactTerminalLog(tail, ACTIVITY_DIGEST_CHARS_PER_SESSION).slice(0, ACTIVITY_DIGEST_TOTAL_CAP - used);
      if (!compact.trim()) continue;
      parts.push(`--- Session "${s.name}" ---\n${compact}`);
      used += compact.length;
    }
    return parts.join("\n\n");
  }

  deleteProjectSessions(projectId: string): void {
    for (const [paneId, pane] of this.panes) {
      if (pane.projectId === projectId && this.pty.has(paneId)) {
        this.manualStops.add(paneId);
        this.pty.kill(paneId);
      }
    }
    const contextPaths = deleteProjectSessions(projectId);
    for (const p of contextPaths) {
      try {
        if (existsSync(p)) unlinkSync(p);
      } catch {
        /* best effort */
      }
    }
  }

  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      for (const paneId of session.paneIds) {
        if (this.pty.has(paneId)) {
          // Backlog BEFORE kill (see stopSession comment).
          const backlog = this.pty.getBacklog(paneId);
          if (backlog) this.exitBacklogs.set(paneId, backlog);
          this.manualStops.add(paneId);
          this.pty.kill(paneId);
        }
        this.panes.delete(paneId);
        this.titleBuffers.delete(paneId);
        this.titled.delete(paneId);
      }
      this.sessions.delete(sessionId);
    }
    // Remove the index first, but keep the persisted context path until both
    // SQLite-backed and snapshot-backed records have been resolved. A session
    // loaded only from a snapshot has no SQLite row to return a path from.
    const storedContextPath = deleteSession(sessionId);
    const snapshotContextPath = deleteSessionSnapshot(sessionId);
    const contextPath = storedContextPath ?? snapshotContextPath;
    if (contextPath && existsSync(contextPath)) {
      try {
        unlinkSync(contextPath);
      } catch {
        /* best effort */
      }
    }
    try {
      unlinkSync(contextTextPath(sessionId));
    } catch {
      /* may not exist */
    }
    try {
      unlinkSync(previousContextPath(sessionId));
    } catch {
      /* may not exist */
    }
    this.restoredContext.delete(sessionId);
    // deleteSessionSnapshot was already called above when the row was
    // snapshot-only; calling it again is harmless for SQLite-backed rows.
  }

  /** Types a message into the first live pane of a session (agent-to-agent
   * messaging). Returns false if the session has no live pane. */
  deliverToSession(sessionId: string, text: string): boolean {
    const session = this.sessions.get(sessionId);
    const paneId = session?.paneIds.find((id) => this.pty.has(id));
    if (!paneId) return false;
    this.pty.write(paneId, text.replace(/[\r\n]+/g, " ") + "\r");
    return true;
  }

  /** Periodic crash/shutdown safety net: persists the compacted backlog of
   * every running session to its .air file + snapshot WITHOUT stopping it, so
   * a hard kill or PC restart loses at most one interval of context. Skips
   * sessions with no new activity since their last checkpoint. */
  private checkpointed = new Map<string, number>();
  checkpointAll(): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.status !== "running") continue;
      if (this.checkpointed.get(sessionId) === session.lastActiveAt) continue;
      const backlogs: string[] = [];
      for (const paneId of session.paneIds) {
        const b = this.pty.getBacklog(paneId);
        if (b) backlogs.push(`--- Pane ${paneId} ---\n${b}`);
      }
      const compacted = this.compactSession(sessionId, backlogs);
      if (!compacted.trim()) continue;
      const contextPath = join(contextDir(), `${sessionId}.air`);
      const tmp = `${contextPath}.tmp`;
      try {
        writeAirFile(tmp, compacted);
        renameSync(tmp, contextPath); // atomic: never leaves a half-written file
        writeContextText(sessionId, compacted);
        setSessionContextPath(sessionId, contextPath);
        writeSessionSnapshot(this.snapshotRecord(session, contextPath, true), contextPath);
        this.checkpointed.set(sessionId, session.lastActiveAt);
      } catch {
        /* best effort */
      }
    }
  }

  /** Called on app quit: nothing may survive the Electron process itself,
   * so we finalize+persist every still-running session's buffered context
   * before killing it. Kills each live pane's OS process ourselves first
   * (marking it a manual stop) and only then finalizes with skipKill=true —
   * finalizeSession's own kill path is async-order-sensitive and previously
   * this called it with skipKill=true without killing anything first, which
   * left every PTY/shell child process orphaned and running after Electron
   * exited (they were never actually stopped). */
  finalizeAllOnQuit(retentionDays: number): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.status === "running") {
        for (const paneId of session.paneIds) {
          if (this.pty.has(paneId)) {
            // Backlog BEFORE kill (see stopSession comment) — this is the
            // last chance to persist a live session's history before the
            // app exits.
            const backlog = this.pty.getBacklog(paneId);
            if (backlog) this.exitBacklogs.set(paneId, backlog);
            this.manualStops.add(paneId);
            this.pty.kill(paneId);
          }
        }
        this.finalizeSession(sessionId, "stopped", retentionDays, true);
      }
    }
  }

  private handlePaneExit(
    paneId: string,
    sessionId: string,
    retentionDays: number,
    sender: WebContents | undefined,
    code: number
  ): void {
    const pane = this.panes.get(paneId);
    const session = this.sessions.get(sessionId);
    if (pane) {
      pane.status = this.manualStops.has(paneId) ? "stopped" : "exited";
    }
    this.manualStops.delete(paneId);
    this.titleBuffers.delete(paneId);
    this.titled.delete(paneId);

    if (session) {
      const anyLive = session.paneIds.some((id) => this.pty.has(id));
      if (!anyLive) {
        const status = session.paneIds.every((id) => {
          const p = this.panes.get(id);
          return p?.status === "stopped";
        })
          ? "stopped"
          : "exited";
        // Nur ein sauberes Beenden (Exit-Code 0, z. B. /exit) schaltet das Wiederherstellen ab;
        // ein getoeteter Prozess/Daemon-Verlust (Code != 0) soll beim Neustart wieder aufgenommen werden.
        if (status === "exited" && code === 0) setSessionResume(sessionId, false);
        this.finalizeSession(sessionId, status, retentionDays, false);
      }
    }
  }

  private finalizeSession(
    sessionId: string,
    status: "exited" | "stopped",
    retentionDays: number,
    skipKill = false
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const backlogs: string[] = [];
    for (const paneId of session.paneIds) {
      // Prefer a backlog captured before the pane was killed (stopSession/
      // finalizeAllOnQuit/deleteSession paths) — after kill() the live
      // backlog is gone, so this cached copy is the ONLY chance to persist
      // the session history into its .air file.
      const backlog = this.exitBacklogs.get(paneId) ?? this.pty.getBacklog(paneId);
      if (backlog) backlogs.push(`--- Pane ${paneId} ---\n${backlog}`);
      this.exitBacklogs.delete(paneId);
    }
    const compacted = this.compactSession(sessionId, backlogs);
    const now = Date.now();
    const contextPath0 = join(contextDir(), `${sessionId}.air`);
    let contextPath: string | null = null;
    if (compacted.trim()) {
      contextPath = contextPath0;
      try {
        writeAirFile(contextPath, compacted);
        writeContextText(sessionId, compacted);
      } catch {
        contextPath = null;
      }
    }
    // Nothing new to write (empty backlog) must not orphan an .air file that
    // an earlier checkpoint already produced: keep pointing at it.
    if (!contextPath && existsSync(contextPath0)) contextPath = contextPath0;

    session.status = status;
    session.endedAt = now;
    session.lastActiveAt = now;
    const expiresAt = null; // never auto-expire; manual delete only
    finalizeSession(sessionId, status, now, session.paneIds, contextPath, expiresAt);
    if (contextPath) {
      writeSessionSnapshot(this.snapshotRecord(session, contextPath, false), contextPath);
    }

    if (!skipKill) {
      for (const paneId of session.paneIds) {
        if (this.pty.has(paneId)) this.pty.kill(paneId);
      }
    }
  }
}
