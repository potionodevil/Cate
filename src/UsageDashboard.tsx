/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IconRefresh } from "./icons";
import { NodePipeline, StatusBar } from "./panels/PipelineVisual";

type Insights = Awaited<ReturnType<typeof window.harness.usageInsights>>;
type Limits = Awaited<ReturnType<typeof window.harness.usageLimits>>;
type Codex = Awaited<ReturnType<typeof window.harness.codexUsage>>;

const EMPTY: Insights = {
  ok: false,
  days: 1,
  sessions: 0,
  messages: 0,
  totalTokens: 0,
  estimatedCostUsd: null,
  unknownSessions: 0,
  models: []
};

const EMPTY_LIMITS: Limits = {
  ok: false,
  provider: null,
  source: null,
  plan: null,
  fetchedAt: null,
  windows: []
};

const EMPTY_CODEX: Codex = {
  ok: false,
  days: 1,
  sessions: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  byDay: []
};

/** Formats an ISO reset timestamp as relative German time ("in 25 min"). */
function formatReset(iso: string | null): string {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "-";
  const mins = Math.round((t - Date.now()) / 60000);
  if (mins <= 0) return "jetzt";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `in ${h} h`;
  return `in ${Math.round(h / 24)} d`;
}

/** Compact token formatter: 1234 -> 1.2k, 2345678 -> 2.3M. */
function compactTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Usage & Budget pane. Two on-demand sources, both real CLIs (never
 * Hermes' internal state.db, never background-polled):
 *  - `hermes insights --days N`: account-wide usage (sessions/messages/
 *    tokens/cost + per-model breakdown) — covers ALL agents that run through
 *    Hermes (Hermes selbst sowie Claude Code/Codex via Hermes-Runtime).
 *  - `hermes usage --json`: account limits — the 5h session window and the
 *    weekly window with reset times, exactly what /usage prints. */
export function UsageDashboard({ profile }: { profile?: string }) {
  const [days, setDays] = useState(1);
  const [data, setData] = useState<Insights>(EMPTY);
  const [limits, setLimits] = useState<Limits>(EMPTY_LIMITS);
  const [codex, setCodex] = useState<Codex>(EMPTY_CODEX);
  const [loading, setLoading] = useState(true);
  const [loadingLimits, setLoadingLimits] = useState(true);
  const [loadingCodex, setLoadingCodex] = useState(true);
  const [dailyBudgetUsd, setDailyBudgetUsd] = useState<number>(() => {
    const stored = localStorage.getItem("hh.dailyBudgetUsd");
    return stored ? Number(stored) : 5;
  });

  async function fetchInsights(forDays: number) {
    setLoading(true);
    try {
      const result = await window.harness.usageInsights(forDays);
      setData(result);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLimits() {
    setLoadingLimits(true);
    try {
      setLimits(await window.harness.usageLimits());
    } finally {
      setLoadingLimits(false);
    }
  }

  async function fetchCodex(forDays: number) {
    setLoadingCodex(true);
    try {
      setCodex(await window.harness.codexUsage(forDays));
    } finally {
      setLoadingCodex(false);
    }
  }

  useEffect(() => {
    fetchInsights(days);
    fetchLimits();
    fetchCodex(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem("hh.dailyBudgetUsd", String(dailyBudgetUsd));
  }, [dailyBudgetUsd]);

  const cost = data.estimatedCostUsd ?? 0;
  const pct = dailyBudgetUsd > 0 && days === 1 ? Math.min(100, (cost / dailyBudgetUsd) * 100) : 0;
  const budgetActive = days === 1 && dailyBudgetUsd > 0;
  const warnLevel = pct >= 100 ? "crit" : pct >= 90 ? "high" : pct >= 75 ? "mid" : "ok";
  // Loading / error / ok / threshold states are purely a color choice here —
  // no extra state machinery, the numbers themselves stay the same shape.
  const stateColor: Record<string, string> = {
    loading: "var(--text-muted)",
    ok: "var(--success)",
    mid: "var(--warning)",
    high: "var(--status-high)",
    crit: "var(--danger)",
    error: "var(--danger)"
  };
  const color = !data.ok && !loading ? stateColor.error : stateColor[warnLevel] || stateColor.ok;

  return (
    <div style={{ padding: "var(--space-4)", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
        <h3 className="hh-title" style={{ fontSize: "var(--text-lg)" }}>
          Usage &amp; Budget{profile ? <span className="hh-muted"> — {profile}</span> : ""}
        </h3>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <Select
            value={String(days)}
            onValueChange={(v) => {
              const n = Number(v);
              setDays(n);
              fetchInsights(n);
            }}
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Heute</SelectItem>
              <SelectItem value="7">Letzte 7 Tage</SelectItem>
              <SelectItem value="30">Letzte 30 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="secondary" disabled={loading || loadingLimits || loadingCodex} onClick={() => { fetchInsights(days); fetchLimits(); fetchCodex(days); }}>
            <IconRefresh size={14} />
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Headline figures first (tinted slab), supporting budget + strategy
       * below it. `tabular-nums` keeps the numbers from reflowing while they
       * count up; `variant-numeric` inherits into all children. */}
      <div className="hh-budget-hero" style={{ fontVariantNumeric: "tabular-nums" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <div>
            <span className="hh-stat-label">Sessions</span>
            <div className="hh-stat-value">{loading ? "—" : data.ok ? data.sessions : "—"}</div>
          </div>
          <div>
            <span className="hh-stat-label">Tokens</span>
            <div className="hh-stat-value">
              {loading ? "—" : data.ok ? data.totalTokens.toLocaleString() : "—"}
            </div>
          </div>
          <div>
            <span className="hh-stat-label">Kosten</span>
            <div className="hh-stat-value" style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              {loading ? "—" : data.estimatedCostUsd != null ? (
                <>
                  ${data.estimatedCostUsd.toFixed(2)}
                </>
              ) : (
                <span className="hh-stat-unit" style={{ fontSize: "var(--text-sm)" }}>unbekannt</span>
              )}
            </div>
          </div>
        </div>

        {days === 1 && (
          <div style={{ fontSize: "var(--text-sm)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
              <span className="hh-muted" style={{ flex: "0 0 auto" }}>Tagesbudget ($)</span>
              <Input
                type="number"
                step="0.5"
                value={dailyBudgetUsd}
                onChange={(e) => setDailyBudgetUsd(Number(e.target.value))}
                className="w-20 h-8 px-2"
              />
              <span className="hh-faint" style={{ fontSize: "var(--text-xs)", fontVariantNumeric: "tabular-nums", marginLeft: "auto" }}>
                {loading ? "" : `${pct.toFixed(0)} % vom Budget`}
              </span>
            </label>
            <Progress
              value={budgetActive && !loading && data.ok ? pct : 0}
              className="h-1.5"
              style={{ ["--hh-progress-color" as string]: color }}
              indicatorClassName="bg-[var(--hh-progress-color)]"
            />
          </div>
        )}

        <div
          className="hh-budget-warn"
          style={(!data.ok && !loading) || (budgetActive && warnLevel !== "ok") ? { color } : { color: "var(--text-muted)", fontWeight: 400 }}
        >
          {loading ? (
            <>
              <span className="hh-budget-warn-dot" style={{ background: "var(--text-muted)" }} />
              <span>Lädt…</span>
            </>
          ) : !data.ok ? (
            <>
              <span className="hh-budget-warn-dot" style={{ background: "var(--danger)" }} />
              <span>
                Konnte Usage nicht laden{data.error ? `: ${data.error}` : ""}.
              </span>
            </>
          ) : budgetActive && warnLevel !== "ok" ? (
            <>
              <span className="hh-budget-warn-dot" style={{ background: color }} />
              <span>{warnLevel === "crit" ? "Budget erreicht/überschritten." : "Budget-Schwelle nähert sich — kein Zwang, nur Hinweis."}</span>
            </>
          ) : data.ok ? (
            <>
              <span className="hh-budget-warn-dot" style={{ background: "var(--success)" }} />
              <span>
                {data.unknownSessions > 0
                  ? `${data.unknownSessions} Session(s) ohne Preisdaten — Kosten eher höher als geschätzt.`
                  : "Alle Kosten erfasst."}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* Micro-Pipeline Decor: monospace Pipeline + Statuszeile aus dem
       * Panel-Visual-System, Werte rein aus bestehendem Dashboard-State. */}
      <div style={{ marginTop: "var(--space-2)", marginBottom: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <NodePipeline nodes={["Hermes", "Shell", "Git"]} accentIdx={0} />
        <StatusBar
          items={[
            { label: "ctx", value: loading || !data.ok ? "—" : compactTokens(data.totalTokens) },
            { label: "model", value: data.models[0]?.model ?? "-" },
            { label: "budget", value: loading ? "—" : `${pct.toFixed(0)}%`, color: budgetActive && warnLevel !== "ok" ? color : undefined }
          ]}
        />
      </div>

      {/* Konto-Limits: das 5h-Fenster + Wochenfenster, direkt vom Provider
       * (Anthropic OAuth) — genau die /usage-Anzeige, als Balken je Window. */}
      <div className="hh-budget-hero" style={{ marginTop: "var(--space-3)", fontVariantNumeric: "tabular-nums" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
          <span className="hh-stat-label" style={{ fontSize: "var(--text-sm)" }}>Konto-Limits{limits.provider ? ` — ${limits.provider}` : ""}</span>
          <span className="hh-faint" style={{ fontSize: "var(--text-xs)" }}>
            {limits.ok ? `${limits.source === "oauth_usage_api" ? "OAuth-Nutzungs-API" : limits.source ?? ""}` : ""}
          </span>
        </div>
        {loadingLimits ? (
          <div className="hh-muted" style={{ fontSize: "var(--text-sm)" }}>Lädt…</div>
        ) : !limits.ok ? (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--danger)", whiteSpace: "pre-wrap" }}>
            Konnte Limits nicht laden{limits.error ? `: ${limits.error}` : ""}.
          </div>
        ) : limits.windows.length === 0 ? (
          <div className="hh-muted" style={{ fontSize: "var(--text-sm)" }}>
            Kein Limit-Fenster verfügbar{limits.plan ? ` (Plan: ${limits.plan})` : ""}.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {limits.windows.map((w) => {
              const lp = Math.min(100, Math.max(0, w.usedPercent));
              const lc = lp >= 100 ? "var(--danger)" : lp >= 90 ? "var(--status-high)" : lp >= 75 ? "var(--warning)" : "var(--success)";
              return (
                <div key={w.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", marginBottom: 4 }}>
                    <span style={{ color: "var(--text-primary)" }}>{w.label}</span>
                    <span className="hh-muted">
                      {w.usedPercent.toFixed(0)} % · Reset {formatReset(w.resetsAt)}
                    </span>
                  </div>
                  <Progress
                    value={lp}
                    className="h-1.5"
                    style={{ ["--hh-progress-color" as string]: lc }}
                    indicatorClassName="bg-[var(--hh-progress-color)]"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent-Quellen: Codex CLI eigenes rollout-Log (offline, ohne API);
       * OpenCode hat bewusst keine Karte — es stellt keine nutzbaren
       * Usage-Daten via CLI bereit (kein Kommando, keine Logdatei). */}
      <div className="hh-budget-hero" style={{ marginTop: "var(--space-3)", fontVariantNumeric: "tabular-nums" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
          <span className="hh-stat-label" style={{ fontSize: "var(--text-sm)" }}>Codex CLI (OpenAI)</span>
          <span className="hh-faint" style={{ fontSize: "var(--text-xs)" }}>~/.codex/sessions</span>
        </div>
        {loadingCodex ? (
          <div className="hh-muted" style={{ fontSize: "var(--text-sm)" }}>Lädt…</div>
        ) : !codex.ok ? (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--danger)", whiteSpace: "pre-wrap" }}>
            Konnte Codex-Usage nicht laden{codex.error ? `: ${codex.error}` : ""}.
          </div>
        ) : codex.sessions === 0 ? (
          <div className="hh-muted" style={{ fontSize: "var(--text-sm)" }}>
            Keine Codex-Sessions in den letzten {days} Tag(en).
          </div>
        ) : (
          <>
            <div style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{codex.sessions}</strong> Sessions ·{" "}
              <span className="hh-muted">Input:</span>{" "}
              <strong style={{ color: "var(--text-primary)" }}>{codex.inputTokens.toLocaleString()}</strong>{" "}
              <span className="hh-muted">(davon gecached: {codex.cachedTokens.toLocaleString()})</span>{" "}
              · <span className="hh-muted">Output:</span>{" "}
              <strong style={{ color: "var(--text-primary)" }}>{codex.outputTokens.toLocaleString()}</strong>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {codex.byDay.map((d) => (
                <div key={d.day} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)" }}>
                  <span className="hh-muted" style={{ fontVariantNumeric: "tabular-nums" }}>{d.day}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {d.sessions} Sess · {(d.inputTokens + d.outputTokens).toLocaleString()} Tokens
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="hh-faint" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border)" }}>
          OpenCode: keine Usage-Daten verfügbar (kein CLI-Befehl, keine Logdatei).
        </div>
      </div>

      <table className="hh-usage-table">
        <thead>
          <tr>
            <th className="hh-section-header" colSpan={2}>
              Modell
            </th>
            <th className="hh-section-header hh-num">Sessions</th>
            <th className="hh-section-header hh-num">Tokens</th>
          </tr>
        </thead>
        <tbody>
          {loading && data.models.length === 0 && (
            <tr>
              <td colSpan={4} className="hh-usage-empty">
                Lädt…
              </td>
            </tr>
          )}
          {!loading && !data.ok && data.models.length === 0 && (
            <tr>
              <td colSpan={4} className="hh-usage-empty" style={{ color: "var(--danger)", fontStyle: "normal" }}>
                Konnte Usage nicht laden.
              </td>
            </tr>
          )}
          {data.models.map((r) => (
            <tr
              key={r.model}
              // Hard-coded zebra striping would look wrong on any of the 4
              // themes; instead the table gets its color purely from the row
              // hover rule in theme.css.
            >
              <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.model}</td>
              <td />
              <td className="hh-num hh-muted">{r.sessions}</td>
              <td className="hh-num">{r.tokens.toLocaleString()}</td>
            </tr>
          ))}
          {!loading && data.ok && data.models.length === 0 && (
            <tr>
              <td colSpan={4} className="hh-usage-empty">
                Keine Nutzung im gewählten Zeitraum.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

