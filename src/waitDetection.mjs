/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */

// Warte-Erkennung (reines Logik-Modul, DOM-frei und per node:test testbar):
// Ein Agent gilt als „wartet auf dich", wenn die letzte nicht-leere
// Ausgabezeile einem Eingabe-/Bestätigungs-Prompt entspricht UND danach
// mindestens WAIT_SILENCE_MS lang keine neue Ausgabe kam.

/** Muster für Prompts/Bestätigungen, auf die ein Agent typischerweise wartet. */
export const WAIT_PROMPT_PATTERNS = [
  /\[Y\/n\]/i,
  /\[y\/N\]/,
  /\(y\/n\)/i,
  /\[J\/n\]/i,
  /Continue\?/i,
  /Fortfahren\?/i,
  /Fortsetzen\?/i,
  /Do you want to/i,
  /Are you sure/i,
  /press enter/i,
  /Weiter mit Enter/i,
  /Drücke Enter/i,
  /Bestätigen/i
];

/** Entfernt ANSI-Steuersequenzen: CSI (…m, …H usw.) und OSC (ESC ] … BEL/ESC \). */
const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /\[[0-9;?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\\)|[@-Z\\-_]/g;

export function stripAnsi(s) {
  return String(s ?? "").replace(ANSI_RE, "");
}

/** Liefert die letzte nicht-leere, von Steuersequenzen bereinigte Zeile eines
 * Ausgabe-Chunks (max. 120 Zeichen), sonst "". Überlebt leere Chunks, reines
 * CRLF und trailing Newlines. */
export function tailOfChunk(chunk) {
  const clean = stripAnsi(chunk);
  const lines = clean.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].replace(/\r/g, "").trim();
    if (line) return line.slice(-120);
  }
  return "";
}

/** true, wenn das Ausgabe-Ende wie ein Eingabe-/Bestätigungs-Prompt aussieht. */
export function looksLikeWaitPrompt(tail) {
  if (!tail) return false;
  return WAIT_PROMPT_PATTERNS.some((re) => re.test(tail));
}

/** Stille-Dauer in ms, ab der ein gesehener Prompt als „wartet" gilt. */
export const WAIT_SILENCE_MS = 2500;

/** Leitet den Pane-Zustand ab:
 *  - !busy                                    -> "ready"
 *  - busy + Prompt gesehen + Stille >= Limit  -> "waiting"
 *  - sonst                                    -> "working"
 * `now`/`lastDataAt` werden explizit übergeben, damit Tests deterministisch sind. */
export function evalWaitState({ busy, waitPromptSeen, silenceMs }) {
  if (!busy) return "ready";
  if (waitPromptSeen && (silenceMs ?? 0) >= WAIT_SILENCE_MS) return "waiting";
  return "working";
}
