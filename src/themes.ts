/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/** Shared theme catalog — single source of truth so the header
 * ThemesPopover and any other theme-aware surface agree on the same
 * id/label/swatch set. Previously duplicated between Settings.tsx and
 * App.tsx; Settings no longer owns theme config at all (moved to the
 * header popover), so this is now the only definition. */
export type ThemeName = "nous" | "obsidian" | "slate" | "daylight" | "aurora" | "copper";

export interface ThemeOption {
  id: ThemeName;
  label: string;
  swatch: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "nous", label: "Anthrazit", swatch: "linear-gradient(135deg, #0b0b0f 55%, #f2985c 55%)" },
  { id: "obsidian", label: "Mitternacht", swatch: "linear-gradient(135deg, #090d19 55%, #72a8ff 55%)" },
  { id: "slate", label: "Moos", swatch: "linear-gradient(135deg, #0a1210 55%, #4fd6b0 55%)" },
  { id: "daylight", label: "Daylight", swatch: "linear-gradient(135deg, #f5f0e6 55%, #c2571a 55%)" },
  { id: "aurora", label: "Neon", swatch: "linear-gradient(135deg, #0f0b1a 55%, #ff6fb1 55%)" },
  { id: "copper", label: "Kupfer", swatch: "linear-gradient(135deg, #170f0d 55%, #ee8a5e 55%)" }
];
