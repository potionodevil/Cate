/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React from "react";

/** Minimal line-icon set, single stroke style, 20x20 viewBox, currentColor.
 * No illustration, no emoji — these are functional UI icons only, used
 * inline inside buttons at a fixed small size. */

type IconProps = { size?: number };

const base = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
};

export function IconSettings({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.6v2M10 15.4v2M17.4 10h-2M4.6 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3L4.9 4.9" />
    </svg>
  );
}

export function IconUsage({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M3 17V9M9.5 17V3M16 17v-6" />
    </svg>
  );
}

export function IconFolder({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M2.5 5.5c0-.55.45-1 1-1h3.8l1.5 1.8h7.2c.55 0 1 .45 1 1v8.2c0 .55-.45 1-1 1h-13.5c-.55 0-1-.45-1-1z" />
    </svg>
  );
}

export function IconGit({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="6" cy="5" r="1.8" />
      <circle cx="6" cy="15" r="1.8" />
      <circle cx="14" cy="10" r="1.8" />
      <path d="M6 6.8V13.2M6 7c0 3 3 3 6.2 3" />
    </svg>
  );
}

export function IconPlus({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M10 3.5v13M3.5 10h13" />
    </svg>
  );
}

export function IconClose({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />
    </svg>
  );
}

export function IconSplitHorizontal({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="2.5" y="4" width="15" height="12" rx="1.5" />
      <path d="M10 4v12" />
    </svg>
  );
}

export function IconSplitVertical({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="2.5" y="4" width="15" height="12" rx="1.5" />
      <path d="M2.5 10h15" />
    </svg>
  );
}

export function IconChevronRight({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M7.5 4.5l5.5 5.5-5.5 5.5" />
    </svg>
  );
}

export function IconTrash({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4 6h12M8 6V4.3c0-.4.3-.8.8-.8h2.4c.4 0 .8.3.8.8V6M5.5 6v9.2c0 .5.4.9.9.9h7.2c.5 0 .9-.4.9-.9V6" />
    </svg>
  );
}

/** Archivieren: Box mit nach unten zeigendem Pfeil (rein ins Archiv). */
export function IconArchiveDown({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="3.5" width="15" height="4" rx="1" />
      <path d="M4 7.5v8c0 .55.45 1 1 1h10c.55 0 1-.45 1-1v-8" />
      <path d="M10 9.5v4.5M7.8 12l2.2 2.2L12.2 12" />
    </svg>
  );
}

/** Wiederherstellen: Box mit nach oben zeigendem Pfeil (raus aus dem Archiv). */
export function IconArchiveUp({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="3.5" width="15" height="4" rx="1" />
      <path d="M4 7.5v8c0 .55.45 1 1 1h10c.55 0 1-.45 1-1v-8" />
      <path d="M10 16V10.5M7.8 12.7L10 10.5l2.2 2.2" />
    </svg>
  );
}

/** Kleines Abwaerts-Chevron für Action-Trigger (Kontextmenü-Button). */
export function IconChevronDown({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4.5 7.5L10 13l5.5-5.5" />
    </svg>
  );
}

export function IconPencil({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12.7 3.3l3 3-8.4 8.4-3.6.6.6-3.6z" />
      <path d="M11.2 4.8l3 3" />
    </svg>
  );
}

export function IconPlay({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M5.5 3.8v12.4l10-6.2z" />
    </svg>
  );
}

export function IconExport({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2.5v10M6 8.5l4 4 4-4M4 14.5v1.5c0 .55.45 1 1 1h10c.55 0 1-.45 1-1v-1.5" />
    </svg>
  );
}

export function IconRefresh({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 10V4.5M16.5 10h-5.5" />
    </svg>
  );
}

export function IconCheck({ size = 11 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10.5l4.2 4.2L16 6" />
    </svg>
  );
}

// @ts-expect-error - plain untyped .mjs shared with scripts/make-icons.mjs
import { SPRITE } from "./logoSprite.mjs";

/** Fills for the pixel mark; theme variables keep it in tune with every theme. */
const MARK_FILL: Record<string, string> = {
  o: "#3a3a48",
  l: "#f1ede6",
  p: "#e58aa0",
  n: "#e8742a",
  e: "#1a1a22"
};
const MARK_RECTS = (SPRITE as string[]).flatMap((row, y) =>
  [...row].flatMap((ch, x) => (MARK_FILL[ch] ? [{ x, y, fill: MARK_FILL[ch], eye: ch === "e" }] : []))
);

/** Brand mark: the pixel cat head (same sprite as the app icon and the desktop cat). */
export function LogoMark({ size = 28, blink = false }: IconProps & { blink?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden>
      {MARK_RECTS.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={1} height={1} fill={r.fill} className={blink && r.eye ? "hh-logo-eye" : undefined} />
      ))}
    </svg>
  );
}

/** Monitor: für die Anzeige-Auswahl der Desktop-Katze. */
export function IconMonitor({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
      <path d="M7 17h6M10 13.5V17" />
    </svg>
  );
}

/** Zeilenumbruch umschalten (drei Zeilen, letzte gekürzt). */
export function IconWrapText({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M3 5h14M3 10h14M3 15h8" />
    </svg>
  );
}

/** Rückgängig / Verwerfen (Pfeil gegen den Uhrzeigersinn). */
export function IconUndo({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4.5 4.5v4h4" />
      <path d="M4.8 8.5A6 6 0 1 1 4.2 12" />
    </svg>
  );
}

/** Minus (Stage entfernen). */
export function IconMinus({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4 10h12" />
    </svg>
  );
}

/** Kleines gefülltes Quadrat als Leerzustands-Glyphe. */
export function IconSquareGlyph({ size = 10 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="8" height="8" rx="1" />
    </svg>
  );
}

/** Plugin-Manager: Zusatzsymbole (Stand: Plugin-Verwaltung). */
export function IconPlugin({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} aria-hidden>
      <path d="M7.5 2.8v3M12.5 2.8v3M5 5.8h10v3.4a5 5 0 0 1-10 0zM10 14.2v3" />
    </svg>
  );
}

/** Skills & Plugins je Provider: ein einziger Stecker (Plug), derselbe
 * Strichstil wie IconPlugin (Konturen, keine Füllungen). */
export function IconSkills({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} aria-hidden>
      <rect x="6.8" y="2.6" width="6.4" height="8.2" rx="1.6" />
      <path d="M8.6 2.6V1M11.4 2.6V1M6.8 6H4.4M15.6 6h-2.4" />
      <path d="M10 10.8V14a1.8 1.8 0 0 0 3.6 0" />
      <path d="M10 10.8V14a1.8 1.8 0 0 1-3.6 0" />
      <path d="M10 15.6v2.6" />
    </svg>
  );
}

export function IconSearch({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} aria-hidden>
      <circle cx="9" cy="9" r="5.2" />
      <path d="M13 13l4 4" />
    </svg>
  );
}

export function IconEye({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} aria-hidden>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" />
      <circle cx="10" cy="10" r="2.3" />
    </svg>
  );
}

export function IconEyeOff({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} aria-hidden>
      <path d="M3 3l14 14M8.2 5a8 8 0 0 1 1.8-.5c5 0 8 5.5 8 5.5a14 14 0 0 1-2.4 3M5.5 6.6A14 14 0 0 0 2 10s3 5.5 8 5.5a8 8 0 0 0 3-.6" />
    </svg>
  );
}

export function IconChevronLeft({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} aria-hidden>
      <path d="M12.5 4.5L7 10l5.5 5.5" />
    </svg>
  );
}

export function IconAlertCircle({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} aria-hidden>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 6.2v4.4M10 13.4v.1" />
    </svg>
  );
}

export function IconCheckCircle({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} aria-hidden>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M6.8 10.2l2.2 2.2 4.2-4.6" />
    </svg>
  );
}

const PLUGIN_GLYPH_PATHS: Record<string, string> = {
  code: "M7 6l-4 4 4 4M13 6l4 4-4 4M11.2 4.5L8.8 15.5",
  test: "M8 3h4M9 3v5l-4.2 7.2A1.4 1.4 0 0 0 6 17.2h8a1.4 1.4 0 0 0 1.2-2L11 8V3M7 12.5h6",
  shield: "M10 2.8l6 2.2v4.6c0 3.6-2.6 6.2-6 7.6-3.4-1.4-6-4-6-7.6V5z",
  search: "M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM13 13l4 4M7 9h4M9 7v4",
  diff: "M6 3v8M6 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 3a1.8 1.8 0 1 0 0 .01M14 17V9a3 3 0 0 0-3-3H9M11 3.5L8.8 6 11 8.5",
  timeline: "M4 4v12M4 6h4M4 10h8M4 14h6M10 4.5h5M13 8h3",
  bell: "M5 14V9a5 5 0 0 1 10 0v5l1.4 1.6H3.6zM8.4 17.2h3.2",
  sync: "M16 7A6.5 6.5 0 0 0 4.4 6M4 3v3.4h3.4M4 13a6.5 6.5 0 0 0 11.6 1M16 17v-3.4h-3.4",
  review: "M4 3.5h12v9H9.5L6 16v-3.5H4zM7 7h6M7 9.5h4",
  chip: "M6 6h8v8H6zM8.5 8.5h3v3h-3zM8 2.8V6M12 2.8V6M8 14v3.2M12 14v3.2M2.8 8H6M2.8 12H6M14 8h3.2M14 12h3.2",
  teleport: "M3 10h10M9.5 6L13.5 10l-4 4M16.5 4v12",
  policy: "M5 3h7l3 3v11H5zM12 3v3h3M7.5 10h5M7.5 13h3",
  key: "M7.5 8a3.5 3.5 0 1 0-.01 0zM10 10l7 7M14 14l2-2M12 12l1.6-1.6",
  route: "M5 4.2a1.8 1.8 0 1 0 .01 0zM15 15.8a1.8 1.8 0 1 0 .01 0zM6.8 5.5h4.7a2.5 2.5 0 0 1 0 5H8.5a2.5 2.5 0 0 0 0 5h4.7",
  users: "M7.5 9a2.6 2.6 0 1 0-.01 0zM2.8 16c.3-2.6 2.3-4 4.7-4s4.4 1.4 4.7 4M13.5 8.4a2.2 2.2 0 1 0 0-4.4M14 11.6c1.7.3 3 1.5 3.2 3.4",
  contract: "M4 3h9l3 3v11H4zM7 8h6M7 11h6M7 14h3M12 14l1.2 1.2L15.5 13",
  chart: "M3.5 16.5h13M5.5 13V9M9.5 13V5M13.5 13V7.5",
  visual: "M3 4h14v12H3zM3 12l4-3.5 3 2.5 3-3 4 4M7 7.2a.1.1 0 1 0 .01 0",
  mic: "M10 3a2.4 2.4 0 0 0-2.4 2.4v4.2a2.4 2.4 0 0 0 4.8 0V5.4A2.4 2.4 0 0 0 10 3zM5 9.4a5 5 0 0 0 10 0M10 14.4V17M7.5 17h5",
  puzzle: "M7.5 2.8v3M12.5 2.8v3M5 5.8h10v3.4a5 5 0 0 1-10 0zM10 14.2v3"
};

/** Plugin-Symbol anhand eines Katalog-Schluessels (siehe pluginCatalog.ts). */
export function PluginGlyph({ name, size = 16 }: { name?: string; size?: number }) {
  const d = (name && PLUGIN_GLYPH_PATHS[name]) || PLUGIN_GLYPH_PATHS.puzzle;
  return (
    <svg width={size} height={size} {...base} aria-hidden>
      <path d={d} />
    </svg>
  );
}
