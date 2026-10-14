/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
// Single source of truth for the brand mark: the Cate pixel cat (identical to the cat of the UI design),
// a 16x16 sprite. Used by the in-app LogoMark and by scripts/make-icons.mjs (fixed colors -> SVG/PNG/ICO).
//   o outline   l fur   p pink (ears, cheeks)   n collar (orange)   e eye

export const SPRITE = [
  "................",
  "...oo......oo...",
  "...olo....olo...",
  "...olloooollo...",
  "...ollllllllo...",
  "...olellllelo...",
  "...olllpplllo...",
  "....ollllllo....",
  ".....onnnno.....",
  "....ollllllo....",
  "...ollllllllo...",
  "...olllllllloo..",
  "...olllllllllo..",
  "...oooooooooo...",
  "................",
  "................"
];

/** Fixed colors for the exported app/tray icons (the in-app mark uses the same hues). */
export const ICON_COLORS = {
  tile: "#0e0e11",
  tileBorder: "#2e2e35",
  o: "#3a3a48",
  l: "#f1ede6",
  p: "#e58aa0",
  n: "#e8742a",
  e: "#1a1a22"
};
