/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { CatSprite } from "./CatSprite";
import { PixelCity } from "./PixelScene";

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
      <PixelCity className="hh-city-greet" />
      <CatSprite scale={7} />
      <div
        style={{
          fontFamily: "var(--font-brand)",
          fontWeight: 700,
          textTransform: "uppercase",
          fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
          lineHeight: 0.9,
          letterSpacing: "0.3em",
          marginRight: "-0.3em",
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
        {new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })} · &gt;<span className="hh-caret">_</span>
      </div>
      <h1 className="hh-title hh-greeting-lines" style={{ margin: 0, fontSize: 32, lineHeight: 1.15, letterSpacing: "-0.01em", fontWeight: 600 }}>
        <span>{daypart},</span> <span>{firstName}.</span>
      </h1>
      <p className="hh-muted hh-greeting-lines" style={{ margin: 0, maxWidth: 420, fontSize: 15, lineHeight: 1.55 }}>
        <span>Wähle links ein Projekt —</span><br /><span>oder starte eine neue Mission.</span>
      </p>
      <Button size="lg" onClick={() => document.querySelector<HTMLButtonElement>("[data-new-project]")?.click()}>Neues Projekt anlegen</Button>
      <div className="hh-greet-hints">
        <span><b>Strg K</b> Befehle</span>
        <span><b>Strg \</b> Sidebar</span>
        <span><b>Strg Umschalt G</b> Git-Diff</span>
      </div>
    </div>
  );
}
