/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/** Display selection for the desktop cat. Pure helpers, no electron imports, so they can be unit-tested. */
import type { Rect } from "./petSettings";

/** The subset of Electron's `Display` that is needed here. */
export interface DisplayLike {
  id: number;
  label?: string;
  bounds: Rect;
  workArea: Rect;
  scaleFactor: number;
}

export interface DisplayInfo {
  id: number;
  /** 1-based position in left-to-right order. */
  index: number;
  name: string;
  /** Physical resolution in pixels. */
  width: number;
  height: number;
  scaleFactor: number;
  primary: boolean;
  bounds: Rect;
  workArea: Rect;
}

export interface DisplayList {
  displays: DisplayInfo[];
  /** What the user picked (null = automatic / main display). */
  selectedId: number | null;
  /** Display the cat window is on right now. */
  activeId: number;
  /** The picked display is not connected, the cat sits on the main display instead. */
  fallback: boolean;
}

/** Left-to-right (then top-to-bottom) description of all displays, with a readable name and the physical resolution. */
export function describeDisplays(displays: DisplayLike[], primaryId: number): DisplayInfo[] {
  return [...displays]
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d, i) => ({
      id: d.id,
      index: i + 1,
      name: d.label?.trim() ? d.label.trim() : `Anzeige ${i + 1}`,
      width: Math.round(d.bounds.width * (d.scaleFactor || 1)),
      height: Math.round(d.bounds.height * (d.scaleFactor || 1)),
      scaleFactor: d.scaleFactor || 1,
      primary: d.id === primaryId,
      bounds: { ...d.bounds },
      workArea: { ...d.workArea }
    }));
}

/**
 * Picks the display for the cat: the wanted one if it is connected, otherwise the main display
 * (and as a last resort the first one). `fallback` is true when a specific display was wanted but is gone.
 */
export function resolveDisplay<T extends { id: number }>(displays: T[], wantedId: number | null | undefined, primaryId: number): { display: T | null; fallback: boolean } {
  if (wantedId !== null && wantedId !== undefined) {
    const hit = displays.find((d) => d.id === wantedId);
    if (hit) return { display: hit, fallback: false };
  }
  const display = displays.find((d) => d.id === primaryId) ?? displays[0] ?? null;
  return { display, fallback: wantedId !== null && wantedId !== undefined };
}

export const rectsEqual = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** Does the window (in DIP) sit completely inside the work area of the display it should be on? */
export const rectInside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
