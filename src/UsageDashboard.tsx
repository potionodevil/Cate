/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconRefresh } from "./icons";
import { BarChart, BlockMeter, HBars } from "./charts";

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

  const avgPerDay = data.ok && data.estimatedCostUsd != null && days > 0 ? data.estimatedCostUsd / days : null;
  const dayItems = codex.ok ? codex.byDay.map((d) => ({ label: d.day.slice(5), value: d.inputTokens + d.outputTokens })) : [];
  const stats = [
    { label: "Tokens", value: loading || !data.ok ? "—" : compactTokens(data.totalTokens), note: data.ok ? `${data.messages.toLocaleString("de-DE")} Nachrichten` : " " },
    { label: "Kosten", value: loading ? "—" : data.estimatedCostUsd != null ? `$${data.estimatedCostUsd.toFixed(2)}` : "unbekannt", note: avgPerDay != null && days > 1 ? `$${avgPerDay.toFixed(2)} pro Tag im Schnitt` : " " },
    { label: "Sessions", value: loading || !data.ok ? "—" : String(data.sessions), note: " " },
    { label: "Modelle", value: loading || !data.ok ? "—" : String(data.models.length), note: data.models[0]?.model ?? " " }
  ];
  const periods: [number, string][] = [[1, "Heute"], [7, "7 Tage"], [30, "30 Tage"]];
  const status = loading ? "Lädt…" : !data.ok ? `Konnte Usage nicht laden${data.error ? `: ${data.error}` : ""}.` : null;

  return (
    <div className="hh-usage" style={{ overflowY: "auto", height: "100%" }}>
      <div className="hh-usage-head">
        <h3 className="hh-usage-title">
          Nutzung{profile ? <span className="hh-faint"> / {profile}</span> : ""}
        </h3>
        <div className="hh-usage-tools">
          <div className="hh-seg" role="tablist" aria-label="Zeitraum">
            {periods.map(([n, label]) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={days === n}
                className={days === n ? "is-on" : undefined}
                onClick={() => { setDays(n); void fetchInsights(n); void fetchCodex(n); }}
              >
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="secondary" disabled={loading || loadingLimits || loadingCodex} onClick={() => { fetchInsights(days); fetchLimits(); fetchCodex(days); }}>
            <IconRefresh size={14} />
            Aktualisieren
          </Button>
        </div>
      </div>

      <div className="hh-usage-body">
        <div className="hh-stat-strip">
          {stats.map((st) => (
            <div key={st.label} className="hh-stat-cell">
              <span className="hh-stat-label">{st.label}</span>
              <span className="hh-stat-value">{st.value}</span>
              <span className="hh-stat-note">{st.note}</span>
            </div>
          ))}
        </div>
        {status && <div className="hh-usage-status" style={{ color: !data.ok && !loading ? "var(--danger)" : undefined }}>{status}</div>}

        <section className="hh-usage-section">
          <div className="hh-usage-section-head">
            <h2>Tokens pro Tag</h2>
            <span>Codex CLI · Input + Output</span>
          </div>
          {loadingCodex ? (
            <div className="hh-usage-empty">Lädt…</div>
          ) : dayItems.length > 1 ? (
            <BarChart items={dayItems} height={220} />
          ) : (
            <div className="hh-usage-empty">{codex.ok ? `Keine Codex-Sessions in den letzten ${days} Tag(en).` : `Konnte Codex-Usage nicht laden${codex.error ? `: ${codex.error}` : ""}.`}</div>
          )}
        </section>

        <div className="hh-usage-cols">
          <section className="hh-usage-section" style={{ flex: "2 1 420px" }}>
            <div className="hh-usage-section-head"><h2>Nach Modell</h2><span>Tokens</span></div>
            {data.ok && data.models.length > 0 ? (
              <HBars items={data.models.slice(0, 8).map((m) => ({ label: m.model, value: m.tokens }))} />
            ) : (
              <div className="hh-usage-empty">{loading ? "Lädt…" : "Keine Nutzung im gewählten Zeitraum."}</div>
            )}
          </section>
          <section className="hh-usage-section" style={{ flex: "1 1 260px" }}>
            <div className="hh-usage-section-head"><h2>Tagesbudget</h2></div>
            <div className="hh-budget-figure">
              <span>{days === 1 && !loading && data.ok ? `$${cost.toFixed(2)}` : "—"}</span>
              <label>
                von $
                <Input type="number" step="0.5" value={dailyBudgetUsd} onChange={(e) => setDailyBudgetUsd(Number(e.target.value))} className="h-7 w-16 px-2" aria-label="Tagesbudget in Dollar" />
              </label>
            </div>
            <div className="hh-budget-bar" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Tagesbudget">
              <span style={{ ["--p" as string]: budgetActive && !loading && data.ok ? pct / 100 : 0, background: color }} />
            </div>
            <p className="hh-budget-text">
              {days !== 1
                ? "Das Tagesbudget gilt nur für „Heute“."
                : budgetActive && data.ok
                  ? warnLevel === "crit"
                    ? "Budget erreicht oder überschritten."
                    : `Noch $${Math.max(0, dailyBudgetUsd - cost).toFixed(2)} übrig (${pct.toFixed(0)} % verbraucht).${data.unknownSessions > 0 ? ` ${data.unknownSessions} Session(s) ohne Preisdaten, Kosten eher höher.` : ""}`
                  : " "}
            </p>
          </section>
        </div>

        <section className="hh-usage-section">
          <div className="hh-usage-section-head">
            <h2>Konto-Limits{limits.provider ? ` · ${limits.provider}` : ""}</h2>
            <span>{limits.ok ? (limits.source === "oauth_usage_api" ? "OAuth-Nutzungs-API" : limits.source ?? "") : ""}</span>
          </div>
          {loadingLimits ? (
            <div className="hh-usage-empty">Lädt…</div>
          ) : !limits.ok ? (
            <div className="hh-usage-empty" style={{ color: "var(--danger)" }}>Konnte Limits nicht laden{limits.error ? `: ${limits.error}` : ""}.</div>
          ) : limits.windows.length === 0 ? (
            <div className="hh-usage-empty">Kein Limit-Fenster verfügbar{limits.plan ? ` (Plan: ${limits.plan})` : ""}.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {limits.windows.map((w) => {
                const lp = Math.min(100, Math.max(0, w.usedPercent));
                const lc = lp >= 100 ? "var(--danger)" : lp >= 90 ? "var(--status-high)" : lp >= 75 ? "var(--warning)" : "var(--success)";
                return (
                  <div key={w.label}>
                    <div className="hh-limit-row"><span>{w.label}</span><span>{w.usedPercent.toFixed(0)} % · Reset {formatReset(w.resetsAt)}</span></div>
                    <BlockMeter value={lp} color={lc} label={w.label} />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
