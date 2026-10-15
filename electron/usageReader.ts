/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/** Lazily & safely load better-sqlite3. It's a native module; if it hasn't
 * been rebuilt against this exact Electron ABI yet (see
 * docs/windows-native-modules.md) requiring it throws NODE_MODULE_VERSION
 * mismatch. We degrade to "no usage data" instead of crashing the app. */
type DatabaseCtor = new (path: string, opts: { readonly: boolean; fileMustExist: boolean }) => any;
let DatabaseImpl: DatabaseCtor | null | undefined;
export let USAGE_BACKEND: "better-sqlite3" | "unavailable" = "unavailable";

function loadDatabase(): DatabaseCtor | null {
  if (DatabaseImpl !== undefined) return DatabaseImpl ?? null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    DatabaseImpl = require("better-sqlite3");
    USAGE_BACKEND = "better-sqlite3";
  } catch {
    DatabaseImpl = null;
    USAGE_BACKEND = "unavailable";
  }
  return DatabaseImpl ?? null;
}

export interface SessionUsageRow {
  id: string;
  title: string | null;
  model: string | null;
  profile_name: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
  started_at: number;
}

function hermesHome(profile?: string): string {
  // Windows-Installation liegt unter %LOCALAPPDATA%\hermes (wie in hermesCli/subagents), sonst ~/.hermes.
  const winBase = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "hermes") : "";
  const base = winBase && existsSync(winBase) ? winBase : join(homedir(), ".hermes");
  if (!profile || profile === "default") return base;
  return join(base, "profiles", profile);
}

/** Read-only access to Hermes' own state.db. We never write to it. */
export function readRecentUsage(profile: string | undefined, limit = 50): SessionUsageRow[] {
  const Database = loadDatabase();
  if (!Database) return [];
  const dbPath = join(hermesHome(profile), "state.db");
  if (!existsSync(dbPath)) return [];
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(
        `SELECT id, title, model, profile_name, input_tokens, output_tokens, estimated_cost_usd, started_at
         FROM sessions
         ORDER BY started_at DESC
         LIMIT ?`
      )
      .all(limit) as SessionUsageRow[];
    return rows;
  } finally {
    db.close();
  }
}

export function sumUsageSince(profile: string | undefined, sinceEpochSeconds: number): {
  totalTokens: number;
  totalCostUsd: number;
} {
  const Database = loadDatabase();
  if (!Database) return { totalTokens: 0, totalCostUsd: 0 };
  const dbPath = join(hermesHome(profile), "state.db");
  if (!existsSync(dbPath)) return { totalTokens: 0, totalCostUsd: 0 };
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db
      .prepare(
        `SELECT
           COALESCE(SUM(input_tokens + output_tokens), 0) AS totalTokens,
           COALESCE(SUM(estimated_cost_usd), 0) AS totalCostUsd
         FROM sessions
         WHERE started_at >= ?`
      )
      .get(sinceEpochSeconds) as { totalTokens: number; totalCostUsd: number };
    return row;
  } finally {
    db.close();
  }
}
