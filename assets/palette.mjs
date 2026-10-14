/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
// Einzige Quelle für alle Tierpaletten (Audit P1): Katze (Renderer + Desktop-Fenster)
// und Begleittiere teilen Outline/Akzent, Begleittiere behalten ihre eigenen Farbfäden.
// catFrames.js ist GENERIERT (scripts/make-cat.py) und wird hier nie angerührt.

/** Mockup-Akzent: Cate-Orange (#e08a4c) — die eine Orange-Sorte für Halsband c, Akzentstreifen c2 und Herz-Glyph. */
export const ACCENT = "#e08a4c";

const HEX6 = /^#[0-9a-f]{6}$/i;

/** Hex in Numerik: "#f4f1ec" -> [r, g, b] nach Shift-Reihenfolge, indizierbar über [16, 8, 0].
 * Liefert Grau (#888) bei ungültigem Eingabeformat. */
function hexToRgb(hex) {
  if (typeof hex !== "string" || !HEX6.test(hex)) return { 16: 136, 8: 136, 0: 136 };
  const v = parseInt(hex.slice(1), 16);
  const c = (s) => (v >> s) & 255;
  return { 16: c(16), 8: c(8), 0: c(0) };
}

/** Mischt zwei Hex-Farben; t=0 -> from, t=1 -> to. Port von mix() (PetSettings.tsx / pet.html). */
export function MIX_HEX(from, to, t) {
  const a = hexToRgb(from), b = hexToRgb(to);
  const c = (sh) => Math.round(a[sh] * (1 - t) + b[sh] * t);
  return "#" + [16, 8, 0].map((sh) => c(sh).toString(16).padStart(2, "0")).join("");
}

/** Katzen-Palette aus PetSettings (fur/outline/eyes); g = Fell-Schatten (mix 16 % Richtung Schwarz). */
export function buildPalette(fur, outline, eyes) {
  return {
    o: outline,
    w: fur,
    g: MIX_HEX(fur, "#000000", 0.16),
    e: eyes,
    h: "#ffffff",
    p: "#e58aa0",
    n: "#e8758c",
    c: ACCENT,
    y: "#ffd24a",
    t: "#ff6f8a",
    k: "#e08a4c",
    z: "#8fb8ff", i: "#f2b24c", m: "#cfd2de"
  };
}

/* ---------- Begleittiere ---------- */

/** Begleiter-Palette: eigener Stil, aber Outline + Akzent kommen von der Katze (P1.3). */
export function buildCompanionPalette(fur, outline, eyes) {
  const katze = buildPalette(fur, outline, eyes);
  return { ...katze, c: ACCENT, c2: ACCENT, u: "#8a5a2b", r: "#c68a4a" };
}

/** Mockup-Katze (warmes Creme + dunkles Outline) als neuer Farb-Preset "Cate". */
export const MOCKUP_PRESET = { name: "Cate", fur: "#f1ede6", outline: "#3a3a48", eyes: "#1a1a22" };
