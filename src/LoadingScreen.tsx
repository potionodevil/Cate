/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React from "react";
import { LogoMark } from "./icons";

/** Startup loader: the pixel cat blinks while a terminal cursor waits after
 * the label. Motion is stepped (pixel-style) and only signals "still working";
 * with prefers-reduced-motion everything holds still. */
export function LoadingScreen({ label = "Cate startet" }: { label?: string }) {
  return (
    <div
      role="status"
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-6)",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-mono)"
      }}
    >
      <style>{`
        .hh-logo-eye { animation: hh-blink 4.2s steps(1) infinite; }
        @keyframes hh-blink { 0%, 92%, 100% { opacity: 1; } 94%, 98% { opacity: 0; } }
        .hh-cursor { display: inline-block; width: 0.6em; height: 1.1em; margin-left: 0.25em; vertical-align: text-bottom;
          background: var(--accent); animation: hh-cursor 1.1s steps(1) infinite; }
        @keyframes hh-cursor { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .hh-logo-eye, .hh-cursor { animation: none; } }
      `}</style>
      <LogoMark size={80} blink />
      <div className="hh-muted" style={{ fontSize: "var(--text-sm)" }}>
        {label}
        <span className="hh-cursor" aria-hidden />
      </div>
    </div>
  );
}
