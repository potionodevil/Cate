/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useState, useSyncExternalStore } from "react";
import type { LoopInfo } from "./types";
import { IconLoop, IconSquareGlyph } from "./icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
// @ts-expect-error - plain untyped .mjs helper (pure logic, tested in tests/loopClarify.test.mjs)
import { clarifyLoop, applyAnswers, CHECK_PRESETS } from "./loopClarify.mjs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Kleiner Modul-Store: ein Abo auf loop:update für alle Session-Zeilen.
let loops = new Map<string, LoopInfo>();
const subs = new Set<() => void>();
let wired = false;
function wire() {
  if (wired || !window.harness?.onLoopUpdate) return;
  wired = true;
  const set = (i: LoopInfo) => { loops = new Map(loops).set(i.sessionId, i); subs.forEach((f) => f()); };
  window.harness.onLoopUpdate(set);
  void window.harness.loopList().then((l) => l.forEach(set));
}
function useLoop(sessionId: string): LoopInfo | undefined {
  useEffect(wire, []);
  const snap = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => loops);
  return snap.get(sessionId);
}

type Question = {
  id: "goal" | "check" | "max";
  text: string;
  hint: string;
  kind: "text" | "choice";
  custom?: boolean;
  options?: { value: string; label: string }[];
};
type Answers = { goal?: string; check?: string; max?: string };

/** Linksklick-Eintritt in den Agent-Loop: Button in der Session-Zeile + zweistufiger Dialog
 * (Formular, dann Rückfragen, falls Ziel, Erfolgskriterium oder Durchlaufzahl unklar sind). */
export function AgentLoopButton({ sessionId, name, live, presetId }: { sessionId: string; name: string; live: boolean; presetId?: string }) {
  const loop = useLoop(sessionId);
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [check, setCheck] = useState("");
  const [max, setMax] = useState("5");
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const running = loop?.state === "running";
  const isShell = presetId === "shell";

  // Öffnet den Dialog auch von außen (Kontextmenü-Aktion "Agent-Loop starten").
  useEffect(() => {
    const onOpen = (e: Event) => { if ((e as CustomEvent<string>).detail === sessionId && live && !isShell) setOpen(true); };
    window.addEventListener("cate:loop-open", onOpen);
    return () => window.removeEventListener("cate:loop-open", onOpen);
  }, [sessionId, live, isShell]);

  function reset() { setQuestions(null); setAnswers({}); setError(""); }
  function close() { setOpen(false); reset(); }

  async function launch(withAnswers: Answers) {
    const p = applyAnswers({ goal, check, max: Number(max) || 1 }, withAnswers) as { goal: string; check: string; max: number };
    const res = await window.harness.loopStart(sessionId, p.goal, p.max, p.check || undefined);
    if (res.ok) { close(); setGoal(""); setCheck(""); } else setError(res.message);
  }

  function next() {
    const qs = clarifyLoop({ goal, check, max: Number(max) || 1 }) as Question[];
    if (qs.length === 0) void launch({});
    else { setQuestions(qs); setAnswers({}); setError(""); }
  }

  const allAnswered = !!questions && questions.every((q) => (answers[q.id] ?? "").trim() !== "");
  const badge = loop ? `↻ ${loop.iteration}/${loop.maxIterations}${loop.phase === "checking" ? " · prüft" : ""}` : "";

  return (
    <>
      {running ? (
        <span className="flex shrink-0 items-center gap-1" data-power-menu-ignore>
          <span
            className="rounded-sm bg-[var(--accent)]/20 px-1 font-mono text-[10px] text-[var(--text-primary)]"
            title={`Agent-Loop: Durchlauf ${loop!.iteration} von ${loop!.maxIterations}${loop!.check ? ` · Prüfung: ${loop!.check}` : ""}`}
          >
            {badge}
          </span>
          <Button type="button" size="icon" variant="ghost" className="h-4 w-4 text-[var(--text-muted)] hover:text-[var(--danger)]" title="Loop stoppen" aria-label="Loop stoppen" onClick={(e) => { e.stopPropagation(); void window.harness.loopStop(sessionId); }}>
            <IconSquareGlyph size={9} />
          </Button>
        </span>
      ) : (
        <Button
          type="button" size="icon" variant="ghost" disabled={!live || isShell}
          className="h-4 w-4 shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          title={isShell ? "Agent-Loop braucht einen Agent (keine Shell)" : live ? `Agent-Loop starten${loop?.message ? ` · Zuletzt: ${loop.message}` : ""}` : "Agent-Loop (Session läuft nicht)"} aria-label={`Agent-Loop für ${name} starten`}
          data-power-menu-ignore
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        >
          <IconLoop size={11} />
        </Button>
      )}
      {open && (
        <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
          <DialogContent onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>{questions ? "Kurze Rückfragen" : "Agent-Loop"}</DialogTitle>
              <DialogDescription>
                {questions
                  ? "Damit der Loop sauber endet, brauche ich noch ein paar Angaben."
                  : `Das Ziel wird an „${name}“ gesendet; nach jeder Ruhephase folgt „Weiter“.`}
              </DialogDescription>
            </DialogHeader>
            {!questions ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`loop-goal-${sessionId}`}>Ziel</Label>
                <Textarea id={`loop-goal-${sessionId}`} value={goal} onChange={(e) => setGoal(e.target.value)} rows={4} autoFocus placeholder="Was soll der Agent erreichen?" />
                <Label htmlFor={`loop-check-${sessionId}`}>Prüfbefehl (optional)</Label>
                <Input id={`loop-check-${sessionId}`} value={check} onChange={(e) => setCheck(e.target.value)} placeholder="z. B. npm run test, Exit 0 beendet den Loop" />
                <div className="hh-loop-chips">
                  {CHECK_PRESETS.map((p: { label: string; value: string }) => (
                    <button key={p.value} type="button" className={"hh-loop-chip" + (check === p.value ? " is-on" : "")} onClick={() => setCheck(check === p.value ? "" : p.value)}>{p.label}</button>
                  ))}
                </div>
                <Label htmlFor={`loop-max-${sessionId}`}>Max. Durchläufe</Label>
                <Input id={`loop-max-${sessionId}`} type="number" min={1} max={100} value={max} onChange={(e) => setMax(e.target.value)} />
                {error && <div className="text-[12px] text-[var(--danger)]">{error}</div>}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {questions.map((q, i) => (
                  <div key={q.id} className="hh-loop-q">
                    <div className="hh-loop-q-head"><span className="hh-loop-q-n">{i + 1}</span>{q.text}</div>
                    <div className="hh-loop-q-hint">{q.hint}</div>
                    {q.kind === "choice" && (
                      <div className="hh-loop-chips">
                        {q.options!.map((o) => (
                          <button key={o.value} type="button" className={"hh-loop-chip" + (answers[q.id] === o.value ? " is-on" : "")} onClick={() => setAnswers({ ...answers, [q.id]: o.value })}>{o.label}</button>
                        ))}
                      </div>
                    )}
                    {(q.kind === "text" || q.custom) && (
                      <Input
                        aria-label={q.text}
                        value={q.kind === "text" || !q.options!.some((o) => o.value === answers[q.id]) ? (answers[q.id] ?? "") : ""}
                        onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        placeholder={q.kind === "text" ? "Fertig, wenn …" : "Oder eigener Befehl"}
                        autoFocus={i === 0}
                      />
                    )}
                  </div>
                ))}
                {error && <div className="text-[12px] text-[var(--danger)]">{error}</div>}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => (questions ? reset() : close())}>{questions ? "Zurück" : "Abbrechen"}</Button>
              {questions ? (
                <>
                  <Button type="button" variant="ghost" onClick={() => void launch({})}>Trotzdem starten</Button>
                  <Button type="button" disabled={!allAnswered} onClick={() => void launch(answers)}>Loop starten</Button>
                </>
              ) : (
                <Button type="button" disabled={!goal.trim()} onClick={next}>Weiter</Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
