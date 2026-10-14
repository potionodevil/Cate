/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Reine Helfer fuer Tastatur-/Maus-Entscheidungen im Terminal (testbar ohne DOM).
 */

/** Entscheidet, was ein keydown im Terminal bewirkt.
 * Rueckgabe: "copy" | "paste" | "pass" (an xterm/PTY durchreichen, z.B. Ctrl+C = SIGINT). */
export function classifyTerminalKey(e, hasSelection) {
  if (e.type !== "keydown") return "pass";
  const key = String(e.key || "").toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey && key === "v") return "paste";
  if (e.shiftKey && !mod && !e.altKey && key === "insert") return "paste";
  if (mod && !e.altKey && key === "c") {
    if (hasSelection) return "copy";
    return "pass";
  }
  if (mod && e.shiftKey && !e.altKey && key === "c") return hasSelection ? "copy" : "pass";
  if (mod && !e.shiftKey && !e.altKey && key === "insert") return hasSelection ? "copy" : "pass";
  return "pass";
}

/** Oeffnet nach einem Mausdruck-Loslassen das Prompt-Menue? Nur linke Taste,
 * nach Ziehen (Auswahl) oder Doppel-/Dreifachklick, und nur mit Auswahltext. */
export function shouldOpenImproveMenu({ button, moved, detail, selection }) {
  if (button !== 0) return false;
  if (!selection || !String(selection).trim()) return false;
  return Boolean(moved) || detail >= 2;
}
