/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import type { ITheme } from "@xterm/xterm";

/** ANSI palettes tuned for their background (GitHub-style dark, and a darkened set for "daylight"). */
const DARK_ANSI = {
  black: "#5b6270", red: "#ff7b72", green: "#7ee787", yellow: "#e3b341", blue: "#79c0ff", magenta: "#d2a8ff", cyan: "#56d4dd", white: "#c9d1d9",
  brightBlack: "#7d8590", brightRed: "#ffa198", brightGreen: "#56d364", brightYellow: "#f2cc60", brightBlue: "#a5d6ff", brightMagenta: "#e2c5ff", brightCyan: "#8be9fd", brightWhite: "#f0f6fc"
};
const LIGHT_ANSI = {
  black: "#211f1b", red: "#b03a30", green: "#2f7d43", yellow: "#85580a", blue: "#1f5fbf", magenta: "#7a46d0", cyan: "#0e6e86", white: "#5c574d",
  brightBlack: "#6b665a", brightRed: "#c2453b", brightGreen: "#3f8f52", brightYellow: "#9a6a16", brightBlue: "#2f74da", brightMagenta: "#8f5ce0", brightCyan: "#1b8aa6", brightWhite: "#211f1b"
};

function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Terminal colors from the active app theme (read live from the CSS variables). */
export function buildTerminalTheme(): ITheme {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const light = root.dataset.theme === "daylight";
  const accent = v("--accent", "#4a84fe");
  const bg = v("--bg-primary", "#0d1117");
  return {
    ...(light ? LIGHT_ANSI : DARK_ANSI),
    background: bg,
    foreground: v("--text-primary", "#e6edf3"),
    cursor: accent,
    cursorAccent: bg,
    selectionBackground: withAlpha(accent, 0.38),
    selectionInactiveBackground: withAlpha(accent, 0.2)
  };
}
