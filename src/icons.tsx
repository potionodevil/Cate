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
  o: "var(--border-strong)",
  b: "var(--text-secondary)",
  l: "var(--text-primary)",
  s: "var(--text-muted)",
  e: "var(--accent)",
  n: "var(--accent)",
  p: "#ff9fb2",
  w: "#ffffff"
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
