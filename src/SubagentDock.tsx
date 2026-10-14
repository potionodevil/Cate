/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { StatusGlyph } from "./StatusGlyph";
import { closeSubagent, useSubagents } from "./subagentStore";
import type { SubagentInfo, SubagentLine } from "./types";

/** Mitlese-Terminal eines Subagenten: zeigt Aufgabe, Werkzeugaufrufe und Antworten live, solange er arbeitet, und scrollt
 * mit. Eingeben kann man hier nichts — der Subagent antwortet nur seinem Haupt-Agenten. */
function SubagentViewer({ info }: { info: SubagentInfo }) {
  const [lines, setLines] = useState<SubagentLine[]>([]);
  const body = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const next = await window.harness.readSubagent(info.id).catch(() => null);
      if (alive && next) setLines(next);
    };
    void load();
    if (info.done) return () => { alive = false; };
    const t = window.setInterval(() => void load(), 1500);
    return () => { alive = false; window.clearInterval(t); };
  }, [info.id, info.done]);

  useEffect(() => {
    if (stick.current && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [lines]);

  return (
    <section className="hh-subagent" aria-label={`Subagent ${info.title}`}>
      <header className="hh-subagent-head">
        <StatusGlyph state={info.done ? "done" : "work"} />
        <span className="hh-subagent-title" title={info.title}>{info.title}</span>
        <span className="hh-subagent-meta">{info.agentType ?? (info.source === "hermes" ? "Hermes" : "Claude")}</span>
        <button type="button" className="hh-subagent-close" onClick={() => closeSubagent(info.id)} aria-label="Subagent-Terminal schließen" title="Schließen">
          <X size={13} aria-hidden />
        </button>
      </header>
      <div
        ref={body}
        className="hh-subagent-body"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {lines.length === 0 && <div className="hh-subagent-line" data-kind="result">Warte auf die ersten Schritte …</div>}
        {lines.map((l, i) => (
          <div key={i} className="hh-subagent-line" data-kind={l.kind}>
            {l.kind === "task" ? "▸ " : l.kind === "tool" ? "● " : l.kind === "result" ? "  ⎿ " : ""}
            {l.text}
          </div>
        ))}
        {!info.done && <div className="hh-subagent-line" data-kind="tool"><span className="hh-caret">█</span></div>}
      </div>
    </section>
  );
}

/** Spalte rechts im Arbeitsbereich mit allen offenen Subagent-Terminals des aktiven Projekts, untereinander gestapelt. */
export function SubagentDock({ projectId }: { projectId: string | null }) {
  const { list, open } = useSubagents();
  const shown = open.map((id) => list.find((s) => s.id === id)).filter((s): s is SubagentInfo => !!s && s.projectId === projectId);
  if (shown.length === 0) return null;
  return (
    <aside className="hh-subagent-dock" aria-label="Subagenten">
      {shown.map((s) => <SubagentViewer key={s.id} info={s} />)}
    </aside>
  );
}
