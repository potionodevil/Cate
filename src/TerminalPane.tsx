/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { CatSprite } from "./CatSprite";
import { registerSubagentLinks } from "./subagentLinks";
import { AttachButton, filesToResult, insertAttachment } from "./AttachButton";
import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { IconClose, IconExport, IconSplitHorizontal, IconSplitVertical } from "./icons";
import { MoreVertical } from "lucide-react";
import { buildTerminalTheme } from "./terminalTheme";
// @ts-expect-error - plain untyped .mjs helper (testbar ohne DOM)
import { classifyTerminalKey, shouldOpenImproveMenu } from "./terminalKeys.mjs";
// @ts-expect-error - plain untyped .mjs helper (testbar ohne DOM)
import { looksLikeWaitPrompt, tailOfChunk, WAIT_SILENCE_MS } from "./waitDetection.mjs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface TerminalPaneProps {
  paneId: string;
  /** Owning session id — used for live rename events and stop action. */
  sessionId: string;
  /** Display label for this pane. */
  label: string;
  /** Preset id this pane was spawned with (used for header badge and optional
   * model switcher). */
  presetId: string;
  /** Optional profile/model when reattaching or spawning a Hermes pane.
   * This pane component no longer spawns; the caller wires real paneId. */
  profile?: string;
  model?: string;
  /** Fired when the user requests to split this pane. */
  onSplit?: (direction: "horizontal" | "vertical") => void;
  /** Fired when the user closes this pane in the layout. The underlying PTY
   * keeps running; only the layout removes the pane. */
  onClose?: () => void;
  /** When true, the pane header shows a "Session beendet" placeholder instead
   * of the terminal — used when reattaching a finished session. */
  finished?: boolean;
}

/** One PTY-backed xterm instance, addressed by its real backend paneId.
 * Pane removal never kills the underlying session; the SessionManager owns
 * lifecycle. Split/close controls live in the pane header. */
export function TerminalPane({ paneId, sessionId, label, presetId, profile, model, onSplit, onClose, finished }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const [status, setStatus] = useState<"starting" | "running" | "exited" | "stopped">(finished ? "exited" : "starting");
  const [displayLabel, setDisplayLabel] = useState(label);
  // "arbeitet" = output is flowing; "bereit" = quiet again (agent waits for input).
  const [busy, setBusy] = useState(false);
  // "wartet auf dich" = Prompt-Muster im Output gesehen + danach Stille.
  const [waiting, setWaiting] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const lastInputRef = useRef(0);
  // Renderer-seitige Warte-Erkennung: Prompt gesehen? Letzter Daten-Zeitpunkt?
  const waitPromptSeenRef = useRef(false);
  const lastDataAtRef = useRef(0);
  // busy in einem Ref spiegeln, damit der quietTimer-Callback den aktuellen
  // Wert liest statt einer stale Closure.
  const busyRef = useRef(false);
  const [modelOverride, setModelOverride] = useState(model || "");
  // Linksklick-Auswahl im Terminal -> "Prompt verbessern" popover.
  const [improve, setImprove] = useState<{
    x: number;
    y: number;
    selection: string;
    phase: "menu" | "busy" | "done" | "error";
    result?: string;
  } | null>(null);

  // Linksklick-Ziehen (Auswahl) bzw. Doppelklick auf Text oeffnet das Menue.
  // Rechtsklick auf markierten Text oeffnet das Menue ebenfalls (wie urspruenglich);
  // ohne Auswahl fuegt Rechtsklick die Zwischenablage ein.
  const downRef = useRef<{ x: number; y: number } | null>(null);

  function onBodyMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[role="dialog"]')) return;
    downRef.current = { x: e.clientX, y: e.clientY };
    setImprove((cur) => (cur && cur.phase === "menu" ? null : cur));
    termRef.current?.focus();
  }

  function onBodyMouseUp(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[role="dialog"]')) return;
    const down = downRef.current;
    downRef.current = null;
    const moved = !!down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 3;
    const { button, detail, clientX, clientY } = e;
    const rect = e.currentTarget.getBoundingClientRect();
    // xterm finalisiert die Auswahl erst im document-mouseup: danach lesen.
    setTimeout(() => {
      const selection = termRef.current?.getSelection().trim() ?? "";
      if (!shouldOpenImproveMenu({ button, moved, detail, selection })) return;
      setImprove({ x: Math.max(4, Math.min(clientX - rect.left, rect.width - 280)), y: clientY - rect.top, selection, phase: "menu" });
    }, 0);
  }

  function onBodyContextMenu(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[role="dialog"]')) return;
    e.preventDefault();
    const selection = termRef.current?.getSelection().trim() ?? "";
    if (!selection) {
      void pasteFromClipboard();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setImprove({ x: Math.max(4, Math.min(e.clientX - rect.left, rect.width - 280)), y: e.clientY - rect.top, selection, phase: "menu" });
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) termRef.current?.paste(text);
    } catch (err) {
      console.error("Einfuegen fehlgeschlagen:", err);
    }
  }

  async function runImprove() {
    if (!improve) return;
    setImprove({ ...improve, phase: "busy" });
    const res = await window.harness.improvePrompt(improve.selection, presetId);
    setImprove((cur) =>
      cur ? (res.ok ? { ...cur, phase: "done", result: res.text } : { ...cur, phase: "error", result: res.message }) : cur
    );
  }

  /** Replaces the current input line with the improved prompt (Ctrl+U clears
   * the line, bracketed paste keeps multi-line text from submitting). */
  function insertImproved() {
    if (!improve?.result) return;
    window.harness.writeSessionPane(paneId, `[200~${improve.result}[201~`);
    setImprove(null);
    termRef.current?.focus();
  }

  useEffect(() => {
    setDisplayLabel(label);
  }, [label]);

  // busy-Ref synchron halten (für den quietTimer-Callback ohne stale Closure).
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  /** Warte-Zustand betreten/verlassen: UI-State + globales Event (Sidebar)
   * + Main-Prozess (Katze). Optional-chained, damit Tests/SSR nie crashen. */
  function setWaitingState(next: boolean) {
    setWaiting((cur) => {
      if (cur === next) return cur;
      window.dispatchEvent(new CustomEvent("hh:wait", { detail: { sessionId, waiting: next } }));
      window.harness?.setPaneWaitState?.(sessionId, next);
      return next;
    });
  }

  useEffect(() => {
    const dispose = window.harness.onSessionRenamed(({ id, label: newLabel }) => {
      if (sessionId === id) setDisplayLabel(newLabel);
    });
    return dispose;
  }, [sessionId]);

  useEffect(() => {
    if (finished) return;
    if (!containerRef.current) return;
    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      lineHeight: 1.2,
      fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
      fontWeightBold: "600",
      cursorBlink: true,
      cursorInactiveStyle: "outline",
      scrollback: 5000,
      minimumContrastRatio: 4.5,
      theme: buildTerminalTheme()
    });
    // Follow live theme switches without recreating the terminal.
    const themeObserver = new MutationObserver(() => requestAnimationFrame(() => (term.options.theme = buildTerminalTheme())));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    try {
      fit.fit();
    } catch {
      // xterm's internal Viewport can throw if the container has no
      // measurable size yet (e.g. mid flex-layout churn from a rapid
      // split/close) — safe to ignore, the ResizeObserver below re-fits
      // once the container settles.
    }
    termRef.current = term;
    const subagentLinks = registerSubagentLinks(term);

    // Ctrl+C kopiert bei Auswahl (sonst SIGINT), Ctrl+V / Ctrl+Shift+V / Shift+Insert fuegt ein.
    // preventDefault verhindert ein zweites, natives paste-Event (Doppeleinfuegen).
    term.attachCustomKeyEventHandler((ev) => {
      const action = classifyTerminalKey(ev, term.hasSelection());
      if (action === "paste") {
        ev.preventDefault();
        void pasteFromClipboard();
        return false;
      }
      if (action === "copy") {
        ev.preventDefault();
        void navigator.clipboard.writeText(term.getSelection()).catch(() => {});
        term.clearSelection();
        return false;
      }
      return true;
    });
    // Mittlere Maustaste fuegt ein (Linux/Windows-Terminal-Konvention).
    const onAuxClick = (ev: MouseEvent) => {
      if (ev.button !== 1) return;
      ev.preventDefault();
      void pasteFromClipboard();
      term.focus();
    };
    const hostEl = containerRef.current;
    hostEl.addEventListener("auxclick", onAuxClick);
    term.focus();

    let disposeData = () => {};
    let disposeExit = () => {};
    let cancelled = false;
    // Captured outside wire() (not a local const inside it) so cleanup can
    // disconnect it — previously this was scoped inside wire() and never
    // disconnected, so a stale observer kept firing fit() on an already
    // disposed terminal after unmount, crashing xterm's internal Viewport.
    let resizeObserver: ResizeObserver | null = null;

    function wire(id: string) {
      setStatus("running");
      let quietTimer: ReturnType<typeof setTimeout> | undefined;
      const stopBusyTimer = () => clearTimeout(quietTimer);
      disposeData = window.harness.onSessionPaneData(id, (data) => {
        term.write(data);
        if (Date.now() - lastInputRef.current < 300) return; // keystroke echo is not agent work
        // Warte-Erkennung: jede neue Agent-Ausgabe beendet den Warte-Zustand.
        lastDataAtRef.current = Date.now();
        setWaitingState(false);
        if (looksLikeWaitPrompt(tailOfChunk(data))) waitPromptSeenRef.current = true;
        setBusy(true);
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => {
          // Ruhig geworden: Prompt gesehen + Schwelle erreicht -> "wartet auf dich".
          const silence = Date.now() - lastDataAtRef.current;
          if (busyRef.current && waitPromptSeenRef.current && silence >= WAIT_SILENCE_MS) {
            setWaitingState(true);
          }
          setBusy(false);
        }, 2500);
      });
      const baseDispose = disposeData;
      disposeData = () => {
        stopBusyTimer();
        baseDispose();
      };
      disposeExit = window.harness.onSessionPaneExit(id, () => {
        setStatus("exited");
        setBusy(false);
        setWaitingState(false);
      });
      term.onData((data) => {
        lastInputRef.current = Date.now();
        // Nutzer antwortet -> Prompt ist beantwortet, Erkennung zurücksetzen.
        waitPromptSeenRef.current = false;
        setWaitingState(false);
        window.harness.writeSessionPane(id, data);
      });
      resizeObserver = new ResizeObserver(() => {
        if (cancelled) return;
        try {
          fit.fit();
          window.harness.resizeSessionPane(id, term.cols, term.rows);
        } catch {
          // See comment above: a disposed/about-to-unmount terminal can
          // still receive one queued resize callback.
        }
      });
      if (containerRef.current) resizeObserver.observe(containerRef.current);
    }

    window.harness.attachSessionPane(paneId).then((result) => {
      if (cancelled) return;
      if (!result) {
        setStatus("exited");
        return;
      }
      // Size the PTY to the real viewport BEFORE replaying the backlog: the TUI's
      // full-width rules and cursor moves were drawn for the PTY's columns, and
      // replaying them into a differently sized xterm garbles the layout.
      try {
        fit.fit();
        window.harness.resizeSessionPane(paneId, term.cols, term.rows);
      } catch {
        // container not measurable yet; the ResizeObserver re-fits
      }
      if (result.backlog) term.write(result.backlog);
      wire(paneId);
    });

    return () => {
      cancelled = true;
      themeObserver.disconnect();
      hostEl.removeEventListener("auxclick", onAuxClick);
      resizeObserver?.disconnect();
      disposeData();
      disposeExit();
      // Beim Unmount nie einen „wartet"-Zähler in Sidebar/Katze zurücklassen.
      setWaitingState(false);
      subagentLinks.dispose();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId, finished]);

  function sendModelSwitch() {
    if (!modelOverride) return;
    window.harness.writeSessionPane(paneId, `/model ${modelOverride}\n`);
  }

  /** Speichert den PTY-Backlog dieses Panes über den nativen Save-Dialog
   * als .txt-Datei (ANSI-Strip passiert im Main-Prozess). */
  const [exportBusy, setExportBusy] = useState(false);
  async function exportPane() {
    setExportBusy(true);
    try {
      const result = await window.harness.exportSessionPane(paneId);
      if (!result.ok && result.message && result.message !== "Abgebrochen.") {
        console.error("Export fehlgeschlagen:", result.message);
      }
    } finally {
      setExportBusy(false);
    }
  }

  async function stopSession() {
    await window.harness.stopSession(sessionId);
    setStatus("stopped");
    setBusy(false);
    setWaitingState(false);
  }

  // waiting liegt zwischen "arbeitet" und "bereit": Session läuft, braucht aber
  // Eingabe. waiting hat Vorrang vor busy, weil der quietTimer gleichzeitig
  // setWaiting(true) und setBusy(false) auslöst.
  const state = status === "running" ? (waiting ? "waiting" : busy ? "working" : "ready") : status;

  // Zustand an die Sidebar melden: dort entscheidet er über Zeichen und Text der Session („arbeitet“, „wartet“, „fertig“).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("hh:pane-state", { detail: { sessionId, state } }));
  }, [sessionId, state]);

  return (
    <div
      className="hh-pane"
      data-state={state}
      onDragOver={(e) => {
        if (status !== "running" || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropOver(true);
      }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOver(false); }}
      onDrop={(e) => {
        if (status !== "running" || e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        setDropOver(false);
        void filesToResult([...e.dataTransfer.files]).then((res) => insertAttachment(paneId, res));
      }}
    >
      <div className="hh-pane-head">
        <PaneState state={state} />
        <span className="hh-pane-title" title={displayLabel}>
          {displayLabel}
        </span>
        <span className="hh-pane-preset">{presetId}</span>

        <div className="hh-pane-actions">
          <AttachButton paneId={paneId} disabled={status !== "running"} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="Pane-Aktionen"
                aria-label="Pane-Aktionen"
              >
                <MoreVertical size={13} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={exportBusy} onSelect={() => void exportPane()}>
                <IconExport size={13} />
                Als .txt speichern
              </DropdownMenuItem>
              {presetId === "hermes" && (status === "running" || status === "starting") && (
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <input
                    className="hh-input"
                    placeholder="model alias"
                    value={modelOverride}
                    onChange={(e) => setModelOverride(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 100, padding: "2px 6px", fontSize: "var(--text-xs)" }}
                  />
                  <Button size="sm" variant="secondary" className="h-6 px-2 text-xs shrink-0" onClick={sendModelSwitch}>
                    /model
                  </Button>
                </div>
              )}
              {onSplit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onSplit("horizontal")}>
                    <IconSplitHorizontal size={13} />
                    Horizontal splitten
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onSplit("vertical")}>
                    <IconSplitVertical size={13} />
                    Vertikal splitten
                  </DropdownMenuItem>
                </>
              )}
              {(status === "running" || onClose) && <DropdownMenuSeparator />}
              {status === "running" && (
                <DropdownMenuItem onSelect={() => void stopSession()}>
                  <IconClose size={12} />
                  Session beenden
                </DropdownMenuItem>
              )}
              {onClose && (
                <DropdownMenuItem onSelect={onClose}>
                  <IconClose size={12} />
                  Pane aus Layout entfernen
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {finished ? (
        <div className="hh-pane-finished">
          <div className="hh-muted">Diese Session ist beendet. Verlauf in der Sessions-Ansicht einsehbar.</div>
        </div>
      ) : (
        <div
          className="hh-pane-body"
          onMouseDown={onBodyMouseDown}
          onMouseUp={onBodyMouseUp}
          onContextMenu={onBodyContextMenu}
          onPasteCapture={(e) => {
            // Strg+V mit Bild oder Datei in der Zwischenablage: als Anhang einfügen statt nichts zu tun (xterm kann nur Text).
            const files = [...e.clipboardData.files];
            if (files.length === 0 || status !== "running") return;
            e.preventDefault();
            e.stopPropagation();
            void filesToResult(files).then((res) => insertAttachment(paneId, res));
          }}
        >
          {dropOver && (
            <div className="hh-pane-drop" aria-hidden>
              <span>Loslassen, um es dem Agenten als Kontext zu geben</span>
            </div>
          )}
          <div ref={containerRef} className="hh-term" />
          {(state === "working" || state === "waiting") && (
            <div className="hh-working" role="status" aria-live="polite">
              <CatSprite scale={1.5} walk />
              <span>{state === "waiting" ? "Agent wartet auf dich" : "Agent arbeitet"}</span>
              <span className="hh-working-dots" aria-hidden><i /><i /><i /></span>
            </div>
          )}
          {improve && (
            <div
              role="dialog"
              aria-label="Prompt verbessern"
              style={{
                position: "absolute",
                left: Math.max(4, improve.x),
                top: improve.y,
                zIndex: 20,
                width: improve.phase === "menu" ? 200 : 360,
                maxHeight: "70%",
                overflow: "auto",
                padding: "var(--space-2)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-strong)",
                background: "var(--bg-elevated)",
                boxShadow: "var(--shadow-2)",
                fontSize: "var(--text-sm)"
              }}
            >
              {improve.phase === "menu" && (
                <button className="hh-menu-item" style={{ width: "100%", textAlign: "left", padding: "6px 8px" }} onClick={() => void runImprove()}>
                  Prompt verbessern
                </button>
              )}
              {improve.phase === "busy" && <div className="hh-muted">Verbessere Prompt (CO-STAR, Sub-Agents)…</div>}
              {improve.phase === "error" && <div style={{ color: "var(--danger)" }}>{improve.result}</div>}
              {improve.phase === "done" && (
                <>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", maxHeight: 260, overflow: "auto" }}>
                    {improve.result}
                  </pre>
                  <div style={{ display: "flex", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
                    <Button size="sm" onClick={insertImproved}>
                      Eingabe ersetzen
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard.writeText(improve.result ?? "")}>
                      Kopieren
                    </Button>
                  </div>
                </>
              )}
              <Button size="sm" variant="ghost" style={{ marginTop: 4 }} onClick={() => setImprove(null)}>
                Schließen
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type PaneStateName = "starting" | "working" | "waiting" | "ready" | "exited" | "stopped";

const STATE_LABEL: Record<PaneStateName, string> = {
  starting: "startet",
  working: "arbeitet",
  waiting: "wartet",
  ready: "bereit",
  exited: "beendet",
  stopped: "gestoppt"
};

/** 7x7 pixel glyphs: every state has its own shape, so nothing relies on color alone. */
const GLYPH: Record<PaneStateName, [number, number][]> = {
  starting: [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,6],[0,1],[0,2],[0,3],[0,4],[0,5],[6,1],[6,2],[6,3],[6,4],[6,5]],
  working: [[0,3],[1,3],[3,3],[4,3],[6,3]],
  // Fragezeichen: klar eigene Form, kein Farbhinweis nötig.
  waiting: [[1,0],[2,0],[3,0],[4,0],[0,1],[5,1],[5,2],[2,3],[3,3],[4,3],[3,4],[3,6]],
  ready: [[0,3],[1,4],[2,5],[3,4],[4,3],[5,2],[6,1]],
  exited: [[1,1],[2,2],[3,3],[4,4],[5,5],[5,1],[4,2],[2,4],[1,5]],
  stopped: [[1,1],[2,1],[3,1],[4,1],[5,1],[1,2],[2,2],[3,2],[4,2],[5,2],[1,3],[2,3],[3,3],[4,3],[5,3],[1,4],[2,4],[3,4],[4,4],[5,4],[1,5],[2,5],[3,5],[4,5],[5,5]]
};

function PaneState({ state }: { state: PaneStateName }) {
  const label = STATE_LABEL[state];
  return (
    <span className="hh-pane-state" data-state={state} title={label} role="status" aria-label={label}>
      <svg width={14} height={14} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden>
        {GLYPH[state].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
        ))}
      </svg>
      <span className="hh-pane-state-label">{label}</span>
    </span>
  );
}
