/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { CatSprite } from "./CatSprite";

/** Unboxed terminal-brand greeting, mirroring the real Hermes intro recipe
 * (bootstrap-installer/routes/welcome.tsx + desktop chat/intro.tsx):
 * HARNESS wordmark in the mono/display role, tracked, accent-glowing.
 * Greeting personalized below it. Gated by the hh-motion kill switch.
 *
 * The real app bundles its brand face "Collapse" Bold; that asset lives only
 * in the upstream install, so this recreates the treatment with the mono
 * stack (JetBrains Mono/Cascadia Mono/Consolas) + accent glow via
 * color-mix text-shadow instead of mix-blend-plus-lighter. */
export function Greeting({ name }: { name: string | null }) {
  const hour = new Date().getHours();
  const daypart = hour < 5 ? "Gute Nacht" : hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
  const firstName = (name ?? "").trim().split(/\s+/)[0] || "Wanderer";
  return (
    <div
      className="hh-slide-in"
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        textAlign: "center",
        gap: "var(--space-4)"
      }}
    >
      {/* scanline/grid background detail, decorative only */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 2px, color-mix(in srgb, var(--accent) 3%, transparent) 2px 3px), repeating-linear-gradient(90deg, transparent 0 2px, color-mix(in srgb, var(--border) 35%, transparent) 2px 3px)",
          maskImage: "radial-gradient(ellipse 60% 55% at 50% 45%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 45%, black 0%, transparent 75%)",
          opacity: 0.7
        }}
      />
      <CatSprite scale={6} />
      <div
        style={{
          fontFamily: "var(--font-brand)",
          fontWeight: 700,
          textTransform: "uppercase",
          fontSize: "clamp(2.25rem, 6vw, 5.5rem)",
          lineHeight: 0.9,
          letterSpacing: "0.2em",
          marginRight: "-0.2em",
          color: "var(--text-primary)",
          textShadow: "0 0 24px color-mix(in srgb, var(--accent) 45%, transparent)"
        }}
      >
        CATE
      </div>
      <div
        className="hh-faint"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.2em"
        }}
      >
        cate // {new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
      </div>
      <h1 className="hh-title hh-greeting-lines" style={{ margin: 0, fontSize: "var(--text-xl)", letterSpacing: "-0.01em", fontWeight: 600 }}>
        <span>{daypart},</span> <span>{firstName}.</span>
      </h1>
      <p className="hh-muted hh-greeting-lines" style={{ margin: 0, maxWidth: 420, fontSize: "var(--text-sm)", lineHeight: 1.5 }}>
        <span>Wähle links ein Projekt —</span><br /><span>oder starte eine neue Mission.</span>
      </p>
      <Button onClick={() => document.querySelector<HTMLButtonElement>("[data-new-project]")?.click()}>Neues Projekt anlegen</Button>
    </div>
  );
}
