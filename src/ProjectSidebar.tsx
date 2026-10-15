/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useState } from "react";
import type { Project, SessionRecord } from "./types";
import { NewProjectModal } from "./NewProjectModal";
import { IconPlus, IconSettings, IconUsage, IconPlay, IconPencil, IconTrash, IconChevronRight, IconSplitHorizontal, IconArchiveUp, IconExport, IconSkills } from "./icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { LogoMark } from "./icons";
import { openSubagent, useSubagents } from "./subagentStore";
import { StatusGlyph, type GlyphState } from "./StatusGlyph";
import { PowerContextMenu } from "./PowerContextMenu";
import { AgentLoopButton } from "./AgentLoopButton";

const STATUS_COLOR: Record<SessionRecord["status"], string> = {
  running: "var(--session-live)",
  exited: "var(--session-live)",
  stopped: "var(--session-live)"
};

type SessionFilter = "aktuell" | "zuletzt" | "gestoppt" | "alle";
const FILTERS: { id: SessionFilter; label: string }[] = [
  { id: "aktuell", label: "Aktuell" },
  { id: "zuletzt", label: "Zuletzt" },
  { id: "gestoppt", label: "Gestoppt" },
  { id: "alle", label: "Alle" }
];
const RECENT_MS = 3 * 24 * 60 * 60 * 1000;

/** Eine Session gilt als „aktuell“, solange sie läuft oder nach einem Neustart wieder aufgenommen werden soll — erst ein bewusstes Beenden nimmt sie aus der Liste. */
const isCurrent = (s: SessionRecord) => s.status === "running" || !!s.resume;

function applyFilter(sessions: SessionRecord[], filter: SessionFilter): SessionRecord[] {
  const active = sessions.filter((s) => !s.archivedAt);
  const byRecent = (a: SessionRecord, b: SessionRecord) => b.lastActiveAt - a.lastActiveAt;
  switch (filter) {
    case "aktuell":
      return active.filter(isCurrent).sort(byRecent);
    case "zuletzt":
      return active.filter((s) => Date.now() - s.lastActiveAt < RECENT_MS).sort(byRecent);
    case "gestoppt":
      return active.filter((s) => !isCurrent(s)).sort(byRecent);
    default:
      return active.sort((a, b) => Number(isCurrent(b)) - Number(isCurrent(a)) || byRecent(a, b));
  }
}

export function ProjectSidebar({
  activeProjectId,
  onSelect,
  onOpenWorkspace,
  onCreated,
  position,
  showDashboard,
  onToggleDashboard,
  showProviderSkills,
  onToggleProviderSkills,
  onOpenSettings,
  onOpenSession,
  onSessionDeleted,
  onOpenSessionsView,
  onOpenPalette
}: {
  activeProjectId: string | null;
  onSelect: (p: Project) => void;
  onOpenWorkspace: (p: Project) => void;
  onCreated: (p: Project) => void;
  position: "left" | "right";
  showDashboard: boolean;
  onToggleDashboard: () => void;
  /** 5. Dock-Button: „Skills & Plugins“ je Provider (is-active-Toggle wie das Usage-Dashboard). */
  showProviderSkills: boolean;
  onToggleProviderSkills: () => void;
  onOpenSettings: () => void;
  onOpenSession: (session: SessionRecord) => void;
  /** Called after a session is deleted from this sidebar's quick tree, so
   * the host (App.tsx) can also close its workspace tab if it has one. */
  onSessionDeleted?: (sessionId: string) => void;
  onOpenSessionsView: () => void;
  /** Öffnet die Befehlspalette (Strg+K) — der Suchknopf oben in der Sidebar. */
  onOpenPalette?: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sessionsByProject, setSessionsByProject] = useState<Record<string, SessionRecord[]>>({});
  const [filter, setFilter] = useState<SessionFilter>(() => {
    try {
      const saved = localStorage.getItem("hh.sessionFilter") as SessionFilter | null;
      return saved && FILTERS.some((f) => f.id === saved) ? saved : "aktuell";
    } catch {
      return "aktuell";
    }
  });
  function changeFilter(next: SessionFilter) {
    setFilter(next);
    try {
      localStorage.setItem("hh.sessionFilter", next);
    } catch {
      /* per-viewer convenience only */
    }
  }
  const [agentDefaults, setAgentDefaults] = useState<{ defaultModel: string | null }>({ defaultModel: null });
  // Renderer-seitiges Warte-Signal (nicht in der DB): welche Sessions warten
  // gerade auf eine Eingabe? Gepflegt über das globale "hh:wait"-Event der Panes.
  const [waitingBySession, setWaitingBySession] = useState<Map<string, boolean>>(new Map());

  const runningSessions = Object.values(sessionsByProject).flat().filter((session) => session.status === "running");
  const activeSession = runningSessions[0];
  const activeProject = projects.find((project) => project.id === activeSession?.projectId);
  const statusModel = activeSession?.model || activeProject?.defaultModel || agentDefaults.defaultModel || "Standardmodell";
  const statusProvider = activeSession?.profile || activeSession?.presetId || activeProject?.hermesProfile || "Hermes";

  async function refresh() {
    setProjects(await window.harness.listProjects());
  }

  useEffect(() => {
    void refresh();
    void window.harness.getAgentDefaults().then(({ defaultModel }) => setAgentDefaults({ defaultModel }));
  }, []);

  // Keep the compact tree and footer status current without requiring a
  // project to be expanded first.
  useEffect(() => {
    if (projects.length === 0) return;
    let cancelled = false;
    async function poll() {
      const entries = await Promise.all(
        projects.map(async (project) => [project.id, await window.harness.listSessions(project.id)] as const)
      );
      if (cancelled) return;
      setSessionsByProject(Object.fromEntries(entries));
      // Warte-Einträge verstorbener Sessions aufräumen (Map bleibt klein).
      const liveIds = new Set(
        (entries as unknown as [string, SessionRecord[]][]).flatMap(([, sessions]) =>
          sessions.filter((s) => s.status === "running").map((s) => s.id)
        )
      );
      setWaitingBySession((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const id of next.keys()) {
          if (!liveIds.has(id)) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
    void poll();
    const interval = setInterval(() => void poll(), 6000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projects]);

  // Pane-Warte-Events einsammeln: eine Session gilt als wartend, solange
  // mindestens eines ihrer Panes „wartet" gemeldet hat.
  useEffect(() => {
    const onWait = (ev: Event) => {
      const { sessionId, waiting } = (ev as CustomEvent<{ sessionId: string; waiting: boolean }>).detail ?? {};
      if (!sessionId) return;
      setWaitingBySession((prev) => {
        if ((prev.get(sessionId) ?? false) === waiting) return prev;
        const next = new Map(prev);
        if (waiting) next.set(sessionId, true);
        else next.delete(sessionId);
        return next;
      });
    };
    window.addEventListener("hh:wait", onWait);
    return () => window.removeEventListener("hh:wait", onWait);
  }, []);

  // Letzter gemeldeter Pane-Zustand je Session; „fertig“ heißt: zuletzt gearbeitet, jetzt wieder bereit.
  const subagents = useSubagents();
  const [paneStates, setPaneStates] = useState<Map<string, { state: string; done: boolean }>>(new Map());
  useEffect(() => {
    const onState = (ev: Event) => {
      const { sessionId, state } = (ev as CustomEvent<{ sessionId: string; state: string }>).detail ?? {};
      if (!sessionId) return;
      setPaneStates((prev) => {
        const old = prev.get(sessionId);
        if (old?.state === state) return prev;
        const next = new Map(prev);
        next.set(sessionId, { state, done: state === "ready" ? old?.state === "working" || old?.done === true : false });
        return next;
      });
    };
    window.addEventListener("hh:pane-state", onState);
    return () => window.removeEventListener("hh:pane-state", onState);
  }, []);

  const waitingCount = [...waitingBySession.values()].filter(Boolean).length;
  const workingCount = runningSessions.filter((r) => !waitingBySession.get(r.id) && paneStates.get(r.id)?.state === "working").length;
  const doneCount = runningSessions.filter((r) => !waitingBySession.get(r.id) && paneStates.get(r.id)?.done && paneStates.get(r.id)?.state === "ready").length;

  function toggleExpanded(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleImport() {
    const result = await window.harness.importProject();
    if (result.ok && result.project) { await refresh(); onCreated(result.project); }
    else if (!result.canceled && result.message) window.alert(result.message);
  }

  async function handleExport() {
    const project = projects.find((p) => p.id === activeProjectId);
    if (!project) return window.alert("Bitte zuerst ein Projekt auswählen.");
    const result = await window.harness.exportProject(project.id);
    if (!result.ok && result.message) window.alert(result.message);
  }

  async function handleCreated(project: Project) {
    await refresh();
    setShowCreateModal(false);
    onCreated(project);
  }

  async function handleUpdated() {
    await refresh();
    setEditingProject(null);
  }

  async function deleteProject(p: Project) {
    if (!window.confirm(`Projekt "${p.name}" wirklich löschen? Das zugehörige Hermes-Profil und alle Sessions werden entfernt.`)) {
      return;
    }
    await window.harness.deleteProject(p.id);
    await refresh();
  }

  async function handleDelete(e: React.MouseEvent, p: Project) {
    e.stopPropagation();
    await deleteProject(p);
  }

  async function deleteSessionRow(s: SessionRecord) {
    if (!window.confirm(`Session "${s.name}" endgültig löschen? Der gespeicherte Verlauf geht verloren.`)) {
      return;
    }
    await window.harness.deleteSession(s.id);
    onSessionDeleted?.(s.id);
    // Re-poll immediately instead of waiting for the 6s interval so the
    // deleted row disappears from the quick tree right away.
    const entries = await Promise.all(
      projects.map(async (project) => [project.id, await window.harness.listSessions(project.id)] as const)
    );
    setSessionsByProject(Object.fromEntries(entries));
  }

  return (
    <div className={`hh-sidebar pos-${position}`}>
      <div className="hh-sidebar-head">
        <LogoMark size={30} />
        <span className="hh-sidebar-wordmark">Cate</span>
        {onOpenPalette && (
          <button type="button" className="hh-sidebar-kbd" onClick={onOpenPalette} aria-label="Befehle öffnen (Strg K)">
            Strg K
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pt-3">
        {/* Aktive Sessions: schneller Zugriff auf alles, was gerade läuft. */}
        <section aria-label="Aktive Sessions" className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-1.5">
            <h3 className="hh-section-header">Sessions</h3>
            <span className="hh-count-chip" aria-live="polite">{runningSessions.length}</span>
          </div>
          {runningSessions.length > 0 && (
            <div className="hh-status-chips">
              {waitingCount > 0 && <span className="hh-status-chip is-wait">{waitingCount} wartet</span>}
              {workingCount > 0 && <span className="hh-status-chip">{workingCount} arbeitet</span>}
              {doneCount > 0 && <span className="hh-status-chip">{doneCount} fertig</span>}
            </div>
          )}
          <div className="flex max-h-[240px] flex-col gap-px overflow-y-auto">
            {runningSessions.length === 0 && (
              <div className="px-1.5 py-1 text-[11px] text-[var(--text-muted)]">Keine laufende Session</div>
            )}
            {runningSessions.map((s) => {
              const waiting = waitingBySession.get(s.id) === true;
              const ps = paneStates.get(s.id);
              const glyph: GlyphState = waiting ? "wait" : ps?.state === "working" ? "work" : ps?.done ? "done" : "run";
              const word = { wait: "wartet auf dich", work: "arbeitet", done: "fertig", run: "läuft" }[glyph];
              return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                data-active={s.projectId === activeProjectId && s.id === activeSession?.id}
                data-waiting={waiting || undefined}
                data-working={glyph === "work" || undefined}
                onClick={() => onOpenSession(s)}
                onKeyDown={(e) => e.key === "Enter" && onOpenSession(s)}
                className="hh-row hh-session-row flex cursor-pointer select-none items-start gap-2.5 rounded-md px-2 py-1.5"
                title={`${s.name} öffnen`}
              >
                <span className="mt-[3px]"><StatusGlyph state={glyph} /></span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-mono text-[12px] text-[var(--text-primary)]">{s.name}</span>
                  <span className="truncate text-[11px] text-[var(--text-muted)]">
                    {projects.find((p) => p.id === s.projectId)?.name} · {word}
                  </span>
                </span>
              </div>
              );
            })}
          </div>
        </section>

        <Separator className="bg-[var(--border)]" />

        <div className="flex items-center justify-between px-1.5">
          <h3 className="hh-section-header">Projekte</h3>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-[24px] w-[24px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            onClick={() => setShowCreateModal(true)}
            title="Neues Projekt"
            aria-label="Neues Projekt anlegen"
          >
            <IconPlus size={12} />
          </Button>
        </div>
        <Tabs value={filter} onValueChange={(v) => changeFilter(v as SessionFilter)} aria-label="Sessions filtern">
          <TabsList className="grid h-[30px] w-full grid-cols-4 gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-0.5">
            {FILTERS.map((f) => (
              <TabsTrigger
                key={f.id}
                value={f.id}
                className="h-full min-w-0 truncate rounded-md px-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors duration-fast hover:text-[var(--text-primary)] data-[state=active]:bg-[var(--bg-active)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none"
              >
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {/* Rechtsklick auf freie Fläche der Liste: neues Projekt anlegen; Import/Export sind hier ausgegraut, weil sie ein gewähltes Projekt brauchen. */}
        <PowerContextMenu
          kind="background"
          className="contents"
          actions={[
            { id: "bg.new", label: "Neues Projekt", icon: IconPlus, run: () => setShowCreateModal(true), contextKinds: ["background"] },
            { id: "bg.import", label: "Importieren", icon: IconArchiveUp, run: () => undefined, contextKinds: ["background"], disabled: true },
            { id: "bg.export", label: "Exportieren", icon: IconExport, run: () => undefined, contextKinds: ["background"], disabled: true },
          ]}
        >
        <div className="flex flex-1 flex-col gap-px overflow-y-auto pb-2">
          {projects.map((p, idx) => {
            const isExpanded = expanded.has(p.id);
            const sessions = sessionsByProject[p.id] ?? [];
            const runningCount = sessions.filter((s) => s.status === "running").length;
            const isActive = p.id === activeProjectId;
            const projectWorking = sessions.some((x) => paneStates.get(x.id)?.state === "working");
            return (
              <Collapsible key={p.id} open={isExpanded}>
                <PowerContextMenu
                  kind="project"
                  label={p.name}
                  targetId={p.id}
                  onOpenInSession={() => onOpenWorkspace(p)}
                  onDelete={() => void deleteProject(p)}
                  actions={[
                    { id: "project.import", label: "Importieren", icon: IconArchiveUp, run: () => void handleImport(), contextKinds: ["project"] },
                    { id: "project.export", label: "Exportieren", icon: IconExport, run: () => void handleExport(), contextKinds: ["project"] },
                  ]}
                >
                  <div
                    onClick={() => onSelect(p)}
                    tabIndex={0}
                    role="button"
                    data-active={isActive}
                    data-working={projectWorking || undefined}
                    onKeyDown={(e) => e.key === "Enter" && onSelect(p)}
                    className="hh-row hh-slide-in group flex cursor-pointer select-none items-center gap-1 rounded-md px-1.5 py-[3px]"
                    style={{ "--hh-slide-delay": `${idx * 35}ms` } as React.CSSProperties}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        onClick={(e) => toggleExpanded(e, p.id)}
                        className="-ml-1 flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                        title={isExpanded ? "Einklappen" : "Sessions anzeigen"}
                        aria-label="Sessions anzeigen"
                      >
                        <span className={cn("inline-flex transition-transform duration-fast", isExpanded && "rotate-90")}>
                          <IconChevronRight size={10} />
                        </span>
                      </button>
                    </CollapsibleTrigger>

                    {p.icon ? (
                      <span className="shrink-0 text-[12px] leading-none" aria-hidden>
                        {p.icon}
                      </span>
                    ) : (
                      <svg className="shrink-0 text-[var(--text-muted)]" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                        <path d="M1.5 3.5h4l1.5 1.5h5.5v6.5h-11z" />
                      </svg>
                    )}

                    <span className={cn("min-w-0 flex-1 truncate text-[12px] font-medium transition-colors", isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]")}>
                      {p.name}
                    </span>

                    <span className="hh-project-count group-hover:hidden" title={`${runningCount} Session(en) laufen`}>{runningCount > 0 ? runningCount : "–"}</span>

                    <div className="hidden shrink-0 items-center gap-px group-hover:flex group-focus-within:flex">
                      <Button type="button" size="icon" variant="ghost" className="h-[24px] w-[24px] text-[var(--text-muted)] hover:text-[var(--text-primary)]" title="Workspace öffnen" aria-label="Workspace öffnen" onClick={(e) => { e.stopPropagation(); onOpenWorkspace(p); }}>
                        <IconPlay size={11} />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-[24px] w-[24px] text-[var(--text-muted)] hover:text-[var(--text-primary)]" title="Projekt bearbeiten" aria-label="Projekt bearbeiten" onClick={(e) => { e.stopPropagation(); setEditingProject(p); }}>
                        <IconPencil size={11} />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-[24px] w-[24px] text-[var(--text-muted)] hover:text-[var(--danger)]" title="Projekt löschen" aria-label="Projekt löschen" onClick={(e) => handleDelete(e, p)}>
                        <IconTrash size={11} />
                      </Button>
                    </div>
                  </div>
                </PowerContextMenu>

                {subagents.list.filter((a) => a.projectId === p.id && (!a.done || subagents.open.includes(a.id))).slice(0, 6).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="hh-row hh-subagent-row"
                    data-working={!a.done || undefined}
                    onClick={() => { onSelect(p); openSubagent(a.id); }}
                    title={`Subagent: ${a.title}`}
                  >
                    <StatusGlyph state={a.done ? "done" : "work"} size={9} />
                    <span className="truncate">{a.title}</span>
                  </button>
                ))}

                <CollapsibleContent className="overflow-hidden data-[state=open]:animate-[hh-collapsible-down_var(--duration-normal)_var(--ease-standard)] data-[state=closed]:animate-[hh-collapsible-up_var(--duration-normal)_var(--ease-standard)]">
                  <div className="hh-session-expand ml-[14px] flex flex-col gap-px border-l border-[var(--border)] py-0.5 pl-1.5" style={{ transformOrigin: "top" }}>
                    {(() => {
                      // Stopped sessions stay listed (dimmed) until the user
                      // deletes them; only archived ones move to the full view.
                      const live = applyFilter(sessions, filter);
                      if (live.length === 0)
                        return <div className="px-1.5 py-1 text-[11px] text-[var(--text-muted)]">{sessions.length ? "Keine Treffer für diesen Filter" : "Noch keine Sessions"}</div>;
                      return live.map((s, i) => (
                        <PowerContextMenu
                          key={s.id}
                          kind="session"
                          label={s.name}
                          targetId={s.id}
                          onOpenInSession={() => onOpenSession(s)}
                          onDelete={() => void deleteSessionRow(s)}
                          className="hh-session-leaf-wrap group"
                        >
                          <div
                            onClick={() => onOpenSession(s)}
                            tabIndex={0}
                            role="button"
                            onKeyDown={(e) => e.key === "Enter" && onOpenSession(s)}
                            className="hh-session-leaf hh-slide-in flex w-full items-center gap-1.5 text-left"
                            style={{ "--hh-slide-delay": `${i * 30}ms` } as React.CSSProperties}
                          >
                            <span
                              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.status === "running" ? "hh-status-dot-live" : "border")}
                              style={s.status === "running" ? { background: STATUS_COLOR.running } : { borderColor: STATUS_COLOR.stopped, opacity: 0.6 }}
                              role="img"
                              aria-label={s.status === "running" ? "Läuft" : "Gestoppt"}
                              title={s.status === "running" ? "Läuft" : "Gestoppt – Klick öffnet und stellt den Kontext wieder her"}
                            />
                            <span className={cn("min-w-0 flex-1 truncate text-[11px]", s.status === "running" ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]")}>{s.name}</span>
                            <AgentLoopButton sessionId={s.id} name={s.name} live={s.status === "running"} presetId={s.presetId} />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="hidden h-4 w-4 shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)] group-hover:flex"
                              title="Session löschen"
                              aria-label={`${s.name} löschen`}
                              data-power-menu-ignore
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteSessionRow(s);
                              }}
                            >
                              <IconTrash size={10} />
                            </Button>
                          </div>
                        </PowerContextMenu>
                      ));
                    })()}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
          {projects.length === 0 && (
            <div className="px-2 py-2 text-[12px] text-[var(--text-muted)]">Noch keine Projekte.</div>
          )}
        </div>
        </PowerContextMenu>
      </div>

      <div className="hh-sidebar-footer">
        <TooltipProvider delayDuration={300}>
          <div className="hh-sidebar-dock" role="toolbar" aria-label="Werkzeugleiste">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button data-new-project size="icon" variant="ghost" className="hh-sidebar-dock-button" onClick={() => setShowCreateModal(true)} aria-label="Neues Projekt">
                  <IconPlus size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Neues Projekt</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className={cn("hh-sidebar-dock-button", showDashboard && "is-active")} onClick={onToggleDashboard} aria-label="Usage-Dashboard">
                  <IconUsage size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Usage-Dashboard</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className={cn("hh-sidebar-dock-button", showProviderSkills && "is-active")} onClick={onToggleProviderSkills} aria-label="Skills & Plugins">
                  <IconSkills size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Skills & Plugins</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="hh-sidebar-dock-button" onClick={onOpenSessionsView} aria-label="Sessions anzeigen">
                  <IconSplitHorizontal size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sessions anzeigen</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="hh-sidebar-dock-button" onClick={(e) => { e.stopPropagation(); onOpenSettings(); }} aria-label="Einstellungen">
                  <IconSettings size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Einstellungen</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <div className="hh-sidebar-status" aria-label="Aktueller Laufzeitstatus">
          <span className="hh-local-node-dot hh-status-dot-live" aria-hidden />
          <span className="hh-sidebar-status-copy">
            <span className="hh-sidebar-status-primary" title={`${statusProvider} · ${statusModel}`}>
              {statusProvider} · {statusModel}
            </span>
            <span className="hh-sidebar-status-secondary">
              {runningSessions.length} {runningSessions.length === 1 ? "aktive Session" : "aktive Sessions"}
            </span>
          </span>
        </div>
      </div>

      {showCreateModal && <NewProjectModal onClose={() => setShowCreateModal(false)} onCreated={handleCreated} />}
      {editingProject && (
        <NewProjectModal
          editProject={editingProject}
          onClose={() => setEditingProject(null)}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}

