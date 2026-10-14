/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import type { IDisposable, Terminal } from "@xterm/xterm";
import { findSubagentForLine, openSubagent } from "./subagentStore";

/** Zeilen, mit denen Claude Code und Hermes einen Subagenten ankündigen: „● Task(…)“, „● Explore(…)“, „delegate_task …“. */
const SUBAGENT_LINE = /\b(Task|Agent|Explore|Plan|general-purpose|delegate_task|Subagent)\b\s*[(:]\s*([^)\n]{0,200})/;

let tip: HTMLDivElement | null = null;

/** Kleine Vorschau neben dem Mauszeiger: welcher Subagent das ist und ob er noch arbeitet. */
function showTip(x: number, y: number, hint: string) {
  const s = findSubagentForLine(hint);
  tip ??= document.body.appendChild(document.createElement("div"));
  tip.className = "hh-subagent-tip";
  tip.replaceChildren();
  const head = document.createElement("b");
  head.textContent = s ? (s.done ? "Subagent · fertig" : "Subagent · arbeitet") : "Subagent";
  const body = document.createElement("span");
  body.textContent = s ? `${s.title} — Klick öffnet das Terminal` : "Noch kein Protokoll gefunden. Klick versucht es erneut.";
  tip.append(head, body);
  tip.style.left = `${Math.min(x + 12, window.innerWidth - 340)}px`;
  tip.style.top = `${y + 14}px`;
  tip.hidden = false;
}

function hideTip() {
  if (tip) tip.hidden = true;
}

/** Macht Subagent-Zeilen im Terminal zu Links: Hover zeigt eine Vorschau, Klick öffnet das Subagent-Terminal daneben.
 * Gilt in beiden Modi; im Modus „direkt öffnen“ ist das Terminal meist schon da und bleibt einfach offen. */
export function registerSubagentLinks(term: Terminal): IDisposable {
  return term.registerLinkProvider({
    provideLinks(y, callback) {
      const line = term.buffer.active.getLine(y - 1)?.translateToString(true) ?? "";
      const m = SUBAGENT_LINE.exec(line);
      if (!m) return callback(undefined);
      const start = m.index + 1;
      const hint = m[2].trim();
      callback([
        {
          range: { start: { x: start, y }, end: { x: start + m[0].length - 1, y } },
          text: m[0],
          decorations: { underline: true, pointerCursor: true },
          hover: (e) => showTip(e.clientX, e.clientY, hint),
          leave: hideTip,
          activate: () => {
            hideTip();
            const s = findSubagentForLine(hint);
            if (s) openSubagent(s.id);
          }
        }
      ]);
    }
  });
}
