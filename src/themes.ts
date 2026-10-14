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
  { id: "nous", label: "Nous", swatch: "linear-gradient(135deg, #0d1117 55%, #4a84fe 55%)" },
  { id: "obsidian", label: "Obsidian", swatch: "linear-gradient(135deg, #15151a 55%, #e0a458 55%)" },
  { id: "slate", label: "Slate", swatch: "linear-gradient(135deg, #13161c 55%, #49b8ae 55%)" },
  { id: "daylight", label: "Daylight", swatch: "linear-gradient(135deg, #f6f4ef 55%, #b5651d 55%)" },
  { id: "aurora", label: "Aurora", swatch: "linear-gradient(135deg, #101b24 55%, #57c7b5 55%)" },
  { id: "copper", label: "Copper", swatch: "linear-gradient(135deg, #211a19 55%, #d98262 55%)" }
];
