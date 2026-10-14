/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { app } from "electron";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import type { SessionRecord } from "./sessionStore";

export interface SessionSnapshot {
  id: string;
  projectId: string;
  name: string;
  cwd: string;
  status: "exited" | "stopped";
  createdAt: number;
  lastActiveAt: number;
  endedAt: number;
  paneIds: string[];
  contextPath: string;
  archivedAt: number | null;
  /** Optional (older snapshots lack them): what reattach needs without SQLite. */
  presetId?: string | null;
  profile?: string | null;
  model?: string | null;
  resume?: boolean;
}

function snapshotDir(): string {
  const dir = join(app.getPath("userData"), "session-snapshots");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function snapshotDirPath(): string {
  return snapshotDir();
}

export function writeSessionSnapshot(record: SessionRecord, contextPath: string): void {
  const dir = snapshotDir();
  const snap: SessionSnapshot = {
    id: record.id,
    projectId: record.projectId,
    name: record.name,
    cwd: record.cwd,
    status: record.status === "running" ? "stopped" : record.status,
    createdAt: record.createdAt,
    lastActiveAt: record.lastActiveAt,
    endedAt: record.endedAt ?? Date.now(),
    paneIds: record.paneIds,
    contextPath,
    archivedAt: record.archivedAt ?? null,
    presetId: record.presetId ?? null,
    profile: record.profile ?? null,
    model: record.model ?? null,
    resume: !!record.resume
  };
  const path = join(dir, `${record.id}.json`);
  writeFileSync(path, JSON.stringify(snap, null, 2), "utf-8");
}

export function deleteSessionSnapshot(id: string): string | null {
  try {
    const path = join(snapshotDir(), `${id}.json`);
    if (!existsSync(path)) return null;
    const snap = JSON.parse(readFileSync(path, "utf-8")) as Partial<SessionSnapshot>;
    unlinkSync(path);
    return typeof snap.contextPath === "string" ? snap.contextPath : null;
  } catch {
    /* best effort */
    return null;
  }
}

/** Snapshot-backed sessions must retain archive state across restarts. */
export function setSessionSnapshotArchived(id: string, archived: boolean): boolean {
  try {
    const path = join(snapshotDir(), `${id}.json`);
    if (!existsSync(path)) return false;
    const snap = JSON.parse(readFileSync(path, "utf-8")) as SessionSnapshot;
    snap.archivedAt = archived ? Date.now() : null;
    writeFileSync(path, JSON.stringify(snap, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function loadSessionSnapshots(projectId?: string): SessionRecord[] {
  const dir = snapshotDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const out: SessionRecord[] = [];
  for (const f of files) {
    try {
      const raw = readFileSync(join(dir, f), "utf-8");
      const snap: SessionSnapshot = JSON.parse(raw);
      if (projectId && snap.projectId !== projectId) continue;
      out.push({
        id: snap.id,
        projectId: snap.projectId,
        name: snap.name,
        cwd: snap.cwd,
        status: snap.status,
        createdAt: snap.createdAt,
        lastActiveAt: snap.lastActiveAt,
        endedAt: snap.endedAt,
        paneIds: snap.paneIds,
        contextPath: snap.contextPath,
        expiresAt: null,
        archivedAt: snap.archivedAt ?? null,
        presetId: snap.presetId ?? null,
        profile: snap.profile ?? null,
        model: snap.model ?? null,
        resume: !!snap.resume
      });
    } catch {
      /* skip malformed snapshots */
    }
  }
  return out.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}
