/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React from "react";

export interface ChartItem {
  label: string;
  value: number;
  /** Zusatzzeile unter dem Namen, z. B. "3 Sessions". */
  note?: string;
}

/** Kompakte Zahl für Achsen und Werte: 1234 → 1,2k, 2 300 000 → 2,3M. */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")}k`;
  return String(Math.round(n));
}

/** Pixel-Anzeige aus Blöcken (wie ein Lade-Balken aus alten Spielen): zeigt auf einen Blick, wie voll etwas ist, und füllt sich beim Erscheinen Block für Block. Der Wert steht immer auch als Text daneben, die Farbe allein sagt nichts. */
export function BlockMeter({ value, color = "var(--accent)", blocks = 24, label }: { value: number; color?: string; blocks?: number; label?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  const lit = Math.round((pct / 100) * blocks);
  return (
    <div role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label} style={{ display: "flex", gap: 2, height: 10 }}>
      {Array.from({ length: blocks }, (_, i) => (
        <span
          key={i}
          className={i < lit ? "hh-chart-fade" : undefined}
          style={{
            ["--i" as string]: i * 0.35,
            flex: 1,
            background: i < lit ? color : "var(--bg-active)",
            opacity: i < lit ? 1 : 0.7
          }}
        />
      ))}
    </div>
  );
}

/** Senkrechtes Balkendiagramm mit Werten über den Balken; der letzte Balken (heute) trägt die Akzentfarbe, die übrigen eine gedämpfte Variante. Balken wachsen gestaffelt von unten. */
export function BarChart({ items, height = 150, highlightLast = true }: { items: ChartItem[]; height?: number; highlightLast?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height, borderBottom: "1px solid var(--border-strong)" }}>
        {items.map((it, i) => {
          const last = highlightLast && i === items.length - 1;
          return (
            <div key={it.label + i} style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 4 }} title={`${it.label}: ${it.value.toLocaleString("de-DE")}`}>
              <span className="hh-chart-fade" style={{ ["--i" as string]: i, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10.5, color: last ? "var(--text-primary)" : "var(--text-secondary)" }}>
                {compact(it.value)}
              </span>
              <div
                className="hh-chart-bar"
                style={{
                  ["--i" as string]: i,
                  height: `${Math.max(2, (it.value / max) * (height - 22))}px`,
                  backgroundColor: last ? "var(--accent)" : "color-mix(in srgb, var(--accent) 38%, var(--bg-active))",
                  borderRadius: "2px 2px 0 0"
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {items.map((it, i) => (
          <span key={it.label + i} style={{ flex: 1, minWidth: 0, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {it.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Waagerechte Balkenliste (Rangliste): Name links, Balken in der Mitte, Wert rechts. Gut für „welches Modell frisst die meisten Tokens". */
export function HBars({ items, unit = "" }: { items: ChartItem[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((it, i) => (
        <div key={it.label} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 160px) 1fr auto", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i ? "1px solid var(--border)" : undefined }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.label}>
            {it.label}
          </span>
          <span style={{ height: 8, background: "var(--bg-active)", display: "block" }}>
            <span className="hh-chart-hbar" style={{ ["--i" as string]: i, display: "block", height: "100%", width: `${(it.value / max) * 100}%`, background: "var(--accent)" }} />
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", textAlign: "right", minWidth: 56 }}>
            {compact(it.value)}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Kleine Verlaufslinie (Sparkline) mit Fläche darunter; zeichnet sich beim Erscheinen von links nach rechts. Gibt es weniger als zwei Punkte, bleibt sie leer, statt eine erfundene Linie zu zeigen. */
export function Sparkline({ values, width = 160, height = 36 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values), pad = 2;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (width - pad * 2), height - pad - (v / max) * (height - pad * 2)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const len = Math.ceil(pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : a), 0)) + 4;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Verlauf" style={{ display: "block", overflow: "visible" }}>
      <path d={`${line} L${pts[pts.length - 1][0]} ${height} L${pts[0][0]} ${height}Z`} fill="var(--accent)" opacity={0.14} />
      <path className="hh-chart-line" style={{ ["--len" as string]: len }} d={line} fill="none" stroke="var(--accent)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
