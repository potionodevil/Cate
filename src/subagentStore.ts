/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { useSyncExternalStore } from "react";
import type { SubagentInfo } from "./types";

export type SubagentMode = "auto" | "hover";

interface State {
  list: SubagentInfo[];
  open: string[];
  mode: SubagentMode;
}

const MODE_KEY = "cate.subagentMode";
const POLL_MS = 2500;

/** Gespeicherte Wahl, wie Subagent-Terminals aufgehen; Standard ist „direkt öffnen“. */
function readMode(): SubagentMode {
  try {
    return localStorage.getItem(MODE_KEY) === "hover" ? "hover" : "auto";
  } catch {
    return "auto";
  }
}

let state: State = { list: [], open: [], mode: readMode() };
const listeners = new Set<() => void>();
const seen = new Set<string>();
let firstPoll = true;
let timer: number | undefined;

function emit(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Fragt die Subagenten ab; im Modus „direkt öffnen“ geht jeder neu gestartete Subagent sofort als Terminal auf.
 * Beim allerersten Abruf werden schon vorhandene nur gemerkt, damit nach dem App-Start nicht ein Dutzend alter Fenster aufspringt. */
async function poll() {
  let list: SubagentInfo[] = [];
  try {
    list = (await window.harness.listSubagents?.()) ?? [];
  } catch {
    return;
  }
  const fresh = list.filter((s) => !seen.has(s.id));
  fresh.forEach((s) => seen.add(s.id));
  const autoOpen = !firstPoll && state.mode === "auto" ? fresh.filter((s) => !s.done).map((s) => s.id) : [];
  firstPoll = false;
  emit({ list, open: autoOpen.length ? [...state.open, ...autoOpen.filter((id) => !state.open.includes(id))] : state.open });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === undefined) {
    void poll();
    timer = window.setInterval(() => void poll(), POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

/** React-Zugriff auf Subagenten-Liste, offene Subagent-Terminals und den Öffnen-Modus. */
export function useSubagents(): State {
  return useSyncExternalStore(subscribe, () => state);
}

/** Öffnet das Subagent-Terminal (oder lässt es offen, falls es schon da ist). */
export function openSubagent(id: string) {
  if (!state.open.includes(id)) emit({ open: [...state.open, id] });
}

/** Schließt das Subagent-Terminal; der Subagent selbst läuft davon unberührt weiter. */
export function closeSubagent(id: string) {
  emit({ open: state.open.filter((x) => x !== id) });
}

/** Stellt ein, ob Subagent-Terminals direkt aufgehen oder erst bei Hover/Klick im Terminal. */
export function setSubagentMode(mode: SubagentMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* privater Modus: gilt dann nur bis zum Neustart */
  }
  emit({ mode });
}

/** Sucht den Subagenten, der zu einer Terminalzeile passt: zuerst über den Text in der Klammer (Beschreibung), sonst der
 * jüngste noch laufende. Gibt null zurück, wenn es (noch) keinen gibt — etwa wenn das Protokoll erst gleich geschrieben wird. */
export function findSubagentForLine(hint: string): SubagentInfo | null {
  const needle = hint.toLowerCase().replace(/[…"']/g, "").trim();
  const byTitle = needle.length > 3 ? state.list.find((s) => s.title.toLowerCase().includes(needle) || needle.includes(s.title.toLowerCase())) : undefined;
  return byTitle ?? state.list.find((s) => !s.done) ?? state.list[0] ?? null;
}
