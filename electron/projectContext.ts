/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { app } from "electron";
import { existsSync, mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { join, basename, extname } from "path";
import { compactProjectContext, writeAirFile, readAirFile, ensureDir } from "./airFormat";

/**
 * Persistent per-project context ("project memory") — the project-level
 * analogue of the existing per-session .air compaction in
 * sessionManager.ts/airFormat.ts. Re-uses the same gzip read/write helpers
 * instead of duplicating them. Unlike terminal-log compaction (ANSI-stripped,
 * tail-biased), project context is prose/instructions, so it is compacted
 * head-biased (see compactProjectContext).
 */

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".json", ".yml", ".yaml", ".csv", ".log"]);

interface ProjectContextMeta {
  sourceLabel: string;
  updatedAt: number;
  /** true when the attachment is a non-text file that was copied verbatim
   * instead of compacted (image/binary/etc.) — no OCR/vision processing. */
  isBinaryAttachment?: boolean;
  binaryFileName?: string;
}

export function contextDir(projectId: string): string {
  return join(app.getPath("userData"), "project-context", projectId);
}

function metaPath(projectId: string): string {
  return join(contextDir(projectId), "meta.json");
}

function airPath(projectId: string): string {
  return join(contextDir(projectId), "context.air");
}

function writeMeta(projectId: string, meta: ProjectContextMeta): void {
  const dir = contextDir(projectId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(metaPath(projectId), JSON.stringify(meta, null, 2), "utf-8");
}

function readMeta(projectId: string): ProjectContextMeta | null {
  try {
    const p = metaPath(projectId);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export function setProjectContextText(projectId: string, rawText: string, sourceLabel: string): void {
  const compacted = compactProjectContext(rawText);
  writeAirFile(airPath(projectId), compacted);
  writeMeta(projectId, { sourceLabel, updatedAt: Date.now() });
}

export function setProjectContextFile(projectId: string, filePath: string): void {
  const ext = extname(filePath).toLowerCase();
  const name = basename(filePath);
  if (TEXT_EXTENSIONS.has(ext)) {
    const raw = readFileSync(filePath, "utf-8");
    setProjectContextText(projectId, raw, name);
    return;
  }
  const dir = contextDir(projectId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const dest = join(dir, `source${ext || ""}`);
  copyFileSync(filePath, dest);
  writeMeta(projectId, {
    sourceLabel: name,
    updatedAt: Date.now(),
    isBinaryAttachment: true,
    binaryFileName: basename(dest)
  });
}

export function getProjectContext(projectId: string): {
  hasContext: boolean;
  sourceLabel: string | null;
  updatedAt: number | null;
  preview: string | null;
} {
  const meta = readMeta(projectId);
  if (!meta) return { hasContext: false, sourceLabel: null, updatedAt: null, preview: null };
  if (meta.isBinaryAttachment) {
    return { hasContext: true, sourceLabel: meta.sourceLabel, updatedAt: meta.updatedAt, preview: null };
  }
  try {
    const full = readAirFile(airPath(projectId));
    const preview = full.length > 2000 ? full.slice(0, 2000) + "\n[...]" : full;
    return { hasContext: true, sourceLabel: meta.sourceLabel, updatedAt: meta.updatedAt, preview };
  } catch {
    return { hasContext: true, sourceLabel: meta.sourceLabel, updatedAt: meta.updatedAt, preview: null };
  }
}

/** Never throws — used directly in the pane-boot injection path, where a
 * failure here must not block spawning the pane itself. */
export function getProjectContextForInjection(projectId: string): string {
  try {
    const meta = readMeta(projectId);
    if (!meta) return "";
    if (meta.isBinaryAttachment) {
      return `Angehängt: ${meta.sourceLabel} (Bild/Binärdatei, wird nicht komprimiert und ist hier nicht im Volltext verfügbar).`;
    }
    const path = airPath(projectId);
    if (!existsSync(path)) return "";
    return readAirFile(path);
  } catch {
    return "";
  }
}

export function clearProjectContext(projectId: string): void {
  const dir = contextDir(projectId);
  if (existsSync(dir)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

// Re-exported for symmetry with sessionManager's usage pattern, in case a
// caller wants to pre-create the dir without writing content yet.
export { ensureDir };
