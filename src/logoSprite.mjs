/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
// Single source of truth for the brand mark: the Hermes Harness cat head as a
// 16x16 pixel sprite. Used by the in-app LogoMark (themed via CSS variables)
// and by scripts/make-icons.mjs (fixed colors -> SVG/PNG/ICO).
//   o outline   b fur   l light fur   s stripe   e eye   w eye shine   p pink (ears, cheeks)   n nose (the "cursor")

const HALF = [
  "..oo....",
  "..opoo..",
  "..oppboo",
  "..obbbbb",
  "..obbbbs",
  "..obbbbb",
  "..obwebb",
  "..obeebb",
  "..oppbbn",
  "..obbllo",
  "..oobbbb",
  "..obbbbb",
  "..obbllb",
  "..obllll",
  "..oobblb",
  "...ooooo"
];

/** 16 rows of 16 chars, mirrored so the face is always symmetric. */
export const SPRITE = HALF.map((row) => row + [...row].reverse().join(""));

/** Fixed colors for the exported app/tray icons (the in-app mark uses theme variables instead). */
export const ICON_COLORS = {
  tile: "#0d1117",
  tileBorder: "#3d4451",
  o: "#2c3242",
  b: "#8d96aa",
  l: "#dde2ee",
  s: "#6f788d",
  e: "#ffb454",
  n: "#ffb454",
  p: "#ff9fb2",
  w: "#ffffff"
};
