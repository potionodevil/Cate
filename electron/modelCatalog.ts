/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import os from "os";

/**
 * Best-effort reader for Hermes's own model-picker cache
 * (`%LOCALAPPDATA%/hermes/provider_models_cache.json`). This is a hint list
 * for autocomplete only, never a hard source of truth — the file may be
 * missing (Hermes never ran / cache cleared), stale, or shaped differently
 * in a future Hermes version, so every failure mode here degrades to an
 * empty list rather than throwing.
 */

interface RawCacheEntry {
  fp?: unknown;
  at?: unknown;
  models?: unknown;
}

function cachePath(): string {
  const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local");
  return join(localAppData, "hermes", "provider_models_cache.json");
}

export function listCachedModels(): { provider: string; models: string[] }[] {
  try {
    const path = cachePath();
    if (!existsSync(path)) return [];
    const raw = readFileSync(path, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const out: { provider: string; models: string[] }[] = [];
    for (const [provider, entry] of Object.entries(parsed as Record<string, RawCacheEntry>)) {
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.models)) continue;
      const models = entry.models.filter((m): m is string => typeof m === "string");
      if (models.length > 0) out.push({ provider, models });
    }
    return out;
  } catch {
    return [];
  }
}
