/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { runHermes } from "./hermesCli";

export interface ModelUsageRow {
  model: string;
  sessions: number;
  tokens: number;
}

export interface UsageLimitWindow {
  label: string;
  usedPercent: number;
  resetsAt: string | null;
}

export interface AccountLimits {
  ok: boolean;
  provider: string | null;
  source: string | null;
  plan: string | null;
  fetchedAt: string | null;
  windows: UsageLimitWindow[];
  error?: string;
}

export interface UsageInsights {
  ok: boolean;
  days: number;
  sessions: number;
  messages: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  unknownSessions: number;
  models: ModelUsageRow[];
  activeTime?: string | null;
  error?: string;
}

function parseNumber(raw: string): number {
  return Number(raw.replace(/,/g, "")) || 0;
}

/** Fetches aggregate usage/cost for the last `days` days via the real
 * `hermes insights` CLI command (text/table output, not JSON — the CLI
 * doesn't offer a --json flag for this one) instead of reading Hermes'
 * internal state.db directly. This mirrors the model picker's approach
 * (hermes-produced data, not a parallel DB read) and is scoped to the
 * whole Hermes account — `hermes insights` has no per-profile/workspace
 * filter, so this intentionally shows overall usage, not per-project.
 * Only ever called on demand (dashboard open / manual refresh), never
 * polled in the background. */
export async function getUsageInsights(days: number): Promise<UsageInsights> {
  const empty: UsageInsights = {
    ok: false,
    days,
    sessions: 0,
    messages: 0,
    totalTokens: 0,
    estimatedCostUsd: null,
    unknownSessions: 0,
    models: []
  };
  try {
    const { stdout } = await runHermes(["insights", "--days", String(days)], 30_000);
    const text = stdout.replace(/\r\n/g, "\n");

    const overview = text.match(/Sessions:\s*([\d,]+)\s+Messages:\s*([\d,]+)/);
    const totalTokens = text.match(/Total tokens:\s*([\d,]+)/);
    const estimated = text.match(/Estimated:\s*~?\$([\d.,]+)/);
    const unknown = text.match(/Unknown:\s*([\d,]+)\s+session/);
    const activeTime = text.match(/Active time:\s*~?([^\r\n]+?)(?:\s{2,}Avg|\s*$)/);

    //Models-Tabelle robust parsen: die Section-Headerzeile variiert (Unicode-Trenner,
    // Einrückung, Emoji der CLI). Stattdessen: alle Zeilen nach der letzten
    // 'Model...Sessions...Tokens'-Headerzeile, bis zur ersten Leerzeile, die auf
    // 'zwei Spalten + große Zahl' passen.
    const models: ModelUsageRow[] = [];
    let inModels = false;
    for (const rawLine of text.split("\n")) {
      const line = rawLine.replace(/\r/g, "");
      const header = line.match(/Model\s{2,}Sessions\s{2,}Tokens/);
      if (header) {
        inModels = true;
        continue;
      }
      if (!inModels) continue;
      if (!line.trim()) break; // Section zu Ende
      const row = line.trim().match(/^(.+?)\s{2,}(\d+)\s+([\d,]+)$/);
      if (row) {
        models.push({ model: row[1].trim(), sessions: Number(row[2]), tokens: parseNumber(row[3]) });
      }
    }

    return {
      ok: true,
      days,
      sessions: overview ? parseNumber(overview[1]) : 0,
      messages: overview ? parseNumber(overview[2]) : 0,
      totalTokens: totalTokens ? parseNumber(totalTokens[1]) : 0,
      estimatedCostUsd: estimated ? Number(estimated[1].replace(/,/g, "")) : null,
      unknownSessions: unknown ? parseNumber(unknown[1]) : 0,
      models,
      activeTime: activeTime ? activeTime[1].trim() : null
    };
  } catch (err: unknown) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Fetches account-level provider limits (5h/session window, weekly window,
 * plan info) via the real `hermes usage --json` CLI — the same block the
 * /usage slash command prints. JSON-shape tolerant: missing fields degrade
 * to null/empty, never throw. Only called on demand (dashboard open /
 * refresh), never polled. */
export async function getAccountLimits(): Promise<AccountLimits> {
  try {
    const { stdout } = await runHermes(["usage", "--json"], 30_000);
    const doc = JSON.parse(stdout) as {
      provider?: string;
      source?: string;
      title?: string;
      plan?: string | null;
      fetched_at?: string;
      windows?: { label?: string; used_percent?: number; resets_at?: string; detail?: string | null }[];
      unavailable_reason?: string | null;
    };
    const windows: UsageLimitWindow[] = (doc.windows ?? [])
      .filter((w) => !!w.label)
      .map((w) => ({
        label: String(w.label),
        usedPercent: typeof w.used_percent === "number" ? w.used_percent : 0,
        resetsAt: w.resets_at ?? null
      }));
    return {
      ok: true,
      provider: doc.provider ?? null,
      source: doc.source ?? null,
      plan: doc.plan ?? null,
      fetchedAt: doc.fetched_at ?? null,
      windows
    };
  } catch (err: unknown) {
    const e = err as { message?: string; stdout?: string | Buffer };
    return {
      ok: false,
      provider: null,
      source: null,
      plan: null,
      fetchedAt: null,
      windows: [],
      error: [e?.message ?? String(err), e?.stdout?.toString().trim()].filter(Boolean).join("\n")
    };
  }
}
