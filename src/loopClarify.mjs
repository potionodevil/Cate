/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/**
 * Rückfragen vor einem Agent-Loop: reine Logik ohne React, damit sie testbar
 * bleibt (siehe tests/loopClarify.test.mjs). Fragt nur, wenn das Ziel zu vage
 * ist, kein Erfolgskriterium existiert oder die Durchlaufzahl auffällig hoch ist.
 */
export const CHECK_PRESETS = [
  { label: "Tests", value: "npm run test" },
  { label: "Typecheck", value: "npm run typecheck" },
  { label: "Build", value: "npm run build" }
];

export const NO_CHECK = "__none__";
export const HIGH_MAX = 20;

/**
 * @param {{ goal: string, check: string, max: number }} input
 * @param {{ goal?: string, check?: string, max?: number }} answers bisherige Antworten
 * @returns {Array<{ id: "goal"|"check"|"max", text: string, hint: string, kind: "text"|"choice", options?: Array<{ value: string, label: string }>, custom?: boolean }>}
 */
export function clarifyLoop(input, answers = {}) {
  const goal = String(input.goal || "").trim();
  const out = [];
  if (answers.goal === undefined && (goal.length < 15 || goal.split(/\s+/).filter(Boolean).length < 3)) {
    out.push({
      id: "goal",
      text: "Was genau soll am Ende erreicht sein?",
      hint: "Das Ziel ist sehr kurz. Beschreibe, woran man erkennt, dass der Agent fertig ist.",
      kind: "text"
    });
  }
  if (answers.check === undefined && !String(input.check || "").trim()) {
    out.push({
      id: "check",
      text: "Woran erkennt Cate, dass das Ziel erreicht ist?",
      hint: "Ein Prüfbefehl läuft nach jedem Durchlauf; Exit 0 beendet den Loop. Ohne Prüfbefehl zählt Cate nur Durchläufe.",
      kind: "choice",
      custom: true,
      options: [
        ...CHECK_PRESETS.map((p) => ({ value: p.value, label: `${p.label}: ${p.value}` })),
        { value: NO_CHECK, label: "Kein Prüfbefehl, nur Durchläufe zählen" }
      ]
    });
  }
  if (answers.max === undefined && Number(input.max) > HIGH_MAX) {
    out.push({
      id: "max",
      text: `${Math.floor(Number(input.max))} Durchläufe sind viel. Wirklich so viele?`,
      hint: "Jeder Durchlauf verbraucht Tokens. Ein Prüfbefehl beendet den Loop früher.",
      kind: "choice",
      options: [
        { value: String(Math.floor(Number(input.max))), label: `Ja, ${Math.floor(Number(input.max))}` },
        { value: "10", label: "Lieber 10" },
        { value: "5", label: "Lieber 5" }
      ]
    });
  }
  return out;
}

/** Wendet die Antworten auf die Eingaben an und liefert die endgültigen Loop-Parameter. */
export function applyAnswers(input, answers = {}) {
  let goal = String(input.goal || "").trim();
  if (answers.goal && answers.goal.trim()) goal = `${goal}. Fertig, wenn: ${answers.goal.trim()}`;
  let check = String(input.check || "").trim();
  if (answers.check !== undefined) check = answers.check === NO_CHECK ? "" : answers.check.trim();
  let max = Number(input.max) || 1;
  if (answers.max !== undefined) max = Number(answers.max) || max;
  return { goal, check, max: Math.min(100, Math.max(1, Math.floor(max))) };
}
