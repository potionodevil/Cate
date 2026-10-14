/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import os from "os";

export interface CodexDayRow {
  day: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface CodexUsage {
  ok: boolean;
  days: number;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  byDay: CodexDayRow[];
  error?: string;
}

/** Walks ~/.codex/sessions for rollout-*.jsonl files (Codex CLI's native
 * session log — each line is NDJSON; token_count events carry cumulative
 * totals). Offline read of Codex's OWN files, no API call, no credential
 * access; the run happens only when the dashboard asks, never polled. */
function collectRolloutFiles(root: string): string[] {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".jsonl")) out.push(p);
    }
  };
  try {
    walk(root);
  } catch {
    /* unreadable subdir skipped */
  }
  return out;
}

function parseNumber(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

export async function getCodexUsage(days: number): Promise<CodexUsage> {
  const empty: CodexUsage = {
    ok: false,
    days,
    sessions: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    byDay: []
  };
  try {
    const root = join(os.homedir(), ".codex", "sessions");
    const files = collectRolloutFiles(root);
    const byDay = new Map<string, CodexDayRow>();
    const cutoffMs = Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000;
    let sessions = 0,
      inputTokens = 0,
      outputTokens = 0,
      cachedTokens = 0;

    for (const f of files) {
      let lines: string[];
      try {
        lines = readFileSync(f, "utf-8").split("\n");
      } catch {
        continue;
      }
      let meta: { ts: number; cwd?: string; model?: string } | null = null;
      let lastTotals: { input: number; output: number; cached: number } | null = null;
      for (const l of lines) {
        if (!l.trim()) continue;
        let rec: any;
        try {
          rec = JSON.parse(l);
        } catch {
          continue;
        }
        if (rec.type === "session_meta") {
          meta = {
            ts: Date.parse(rec.timestamp) || 0,
            cwd: rec.payload?.cwd,
            model: rec.payload?.turn_context?.model
          };
        } else if (rec.type === "event_msg" && rec.payload?.type === "token_count") {
          const t = rec.payload?.info?.total_token_usage;
          if (t) {
            lastTotals = {
              input: parseNumber(t.input_tokens),
              output: parseNumber(t.output_tokens),
              cached: parseNumber(t.cached_input_tokens)
            };
          }
        }
      }
      if (!meta || meta.ts < cutoffMs) continue;
      if (!lastTotals) continue; // session ohne nutzbare token_events
      sessions++;
      inputTokens += lastTotals.input;
      outputTokens += lastTotals.output;
      cachedTokens += lastTotals.cached;
      const day = new Date(meta.ts).toISOString().slice(0, 10);
      const prev = byDay.get(day) || { day, sessions: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
      prev.sessions++;
      prev.inputTokens += lastTotals.input;
      prev.outputTokens += lastTotals.output;
      prev.cachedTokens += lastTotals.cached;
      byDay.set(day, prev);
    }

    const rows = Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
    return {
      ok: true,
      days,
      sessions,
      inputTokens,
      outputTokens,
      cachedTokens,
      byDay: rows
    };
  } catch (err: unknown) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}
