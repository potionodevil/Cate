/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React from "react";

export type GlyphState = "wait" | "work" | "run" | "done" | "exit";

const SHAPES: Record<GlyphState, { d: string; color: string; label: string; evenodd?: boolean }> = {
  wait: { d: "M0 0h5v5H0zM1 1h3v3H1zM2 2h1v1H2z", color: "var(--warning)", label: "wartet", evenodd: true },
  work: { d: "M0 3h1v2H0zM2 1h1v4H2zM4 2h1v3H4z", color: "var(--accent)", label: "arbeitet" },
  run: { d: "M0 0h1v5H0zM1 1h1v3H1zM2 2h1v1H2z", color: "var(--status-run, #6aa7e0)", label: "läuft" },
  done: { d: "M0 3h1v1H0zM1 4h1v1H1zM2 3h1v1H2zM3 2h1v1H3zM4 1h1v1H4z", color: "var(--success)", label: "fertig" },
  exit: { d: "M0 0h1v1H0zM4 0h1v1H4zM1 1h1v1H1zM3 1h1v1H3zM2 2h1v1H2zM1 3h1v1H1zM3 3h1v1H3zM0 4h1v1H0zM4 4h1v1H4z", color: "var(--text-muted)", label: "beendet" }
};

/** Statuszeichen im Pixelraster: jeder Zustand hat eine eigene Form UND Farbe, damit man ihn auch ohne Farbsehen erkennt (wartet = hohles Quadrat, arbeitet = drei Balken, läuft = Dreieck, fertig = Haken, beendet = Kreuz). Das Zeichen für „arbeitet“ und „läuft“ pulsiert stufenweise, solange Animationen an sind. */
export function StatusGlyph({ state, size = 11, title }: { state: GlyphState; size?: number; title?: string }) {
  const s = SHAPES[state];
  return (
    <svg
      className={state === "work" || state === "run" ? "hh-px-pulse" : undefined}
      width={size}
      height={size}
      viewBox="0 0 5 5"
      shapeRendering="crispEdges"
      fill={s.color}
      role="img"
      aria-label={title ?? s.label}
      style={{ flex: "none" }}
    >
      <title>{title ?? s.label}</title>
      <path d={s.d} fillRule={s.evenodd ? "evenodd" : undefined} />
    </svg>
  );
}
