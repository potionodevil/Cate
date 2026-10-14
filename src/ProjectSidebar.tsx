/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useState } from "react";
import type { Project, SessionRecord } from "./types";
import { NewProjectModal } from "./NewProjectModal";
import { IconPlus, IconSettings, IconUsage, IconPlay, IconPencil, IconTrash, IconChevronRight, IconSplitHorizontal, IconArchiveUp, IconExport } from "./icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PowerContextMenu } from "./PowerContextMenu";

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

function applyFilter(sessions: SessionRecord[], filter: SessionFilter): SessionRecord[] {
  const active = sessions.filter((s) => !s.archivedAt);
  const byRecent = (a: SessionRecord, b: SessionRecord) => b.lastActiveAt - a.lastActiveAt;
  switch (filter) {
    case "aktuell":
      return active.filter((s) => s.status === "running").sort(byRecent);
    case "zuletzt":
      return active.filter((s) => Date.now() - s.lastActiveAt < RECENT_MS).sort(byRecent);
    case "gestoppt":
      return active.filter((s) => s.status !== "running").sort(byRecent);
    default:
      return active.sort((a, b) => Number(b.status === "running") - Number(a.status === "running") || byRecent(a, b));
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
  onOpenSettings,
  onOpenSession,
  onSessionDeleted,
  onOpenSessionsView
}: {
  activeProjectId: string | null;
  onSelect: (p: Project) => void;
  onOpenWorkspace: (p: Project) => void;
  onCreated: (p: Project) => void;
  position: "left" | "right";
  showDashboard: boolean;
  onToggleDashboard: () => void;
  onOpenSettings: () => void;
  onOpenSession: (session: SessionRecord) => void;
  /** Called after a session is deleted from this sidebar's quick tree, so
   * the host (App.tsx) can also close its workspace tab if it has one. */
  onSessionDeleted?: (sessionId: string) => void;
  onOpenSessionsView: () => void;
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
    }
    void poll();
    const interval = setInterval(() => void poll(), 6000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projects]);

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
      <div style={{ padding: "var(--space-2) var(--space-3) 0", display: "flex", flexDirection: "column", gap: "var(--space-2)", flex: 1, minHeight: 0 }}>
        <h3 className="hh-section-header" style={{ paddingTop: "var(--space-1)" }}>Projekte</h3>
        <div className="hh-segmented hh-sidebar-filter" role="group" aria-label="Sessions filtern">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={filter === f.id ? "active" : ""}
              aria-pressed={filter === f.id}
              onClick={() => changeFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
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
        <div className="flex flex-col gap-px flex-1 overflow-y-auto">
          {projects.map((p, idx) => {
            const isExpanded = expanded.has(p.id);
            const sessions = sessionsByProject[p.id] ?? [];
            const runningCount = sessions.filter((s) => s.status === "running").length;
            const isActive = p.id === activeProjectId;
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
                  onKeyDown={(e) => e.key === "Enter" && onSelect(p)}
                  className={cn(
                    "hh-slide-in group relative flex items-center gap-1 rounded-sm px-1.5 py-0.5 cursor-pointer select-none",
                    "hover:bg-[var(--bg-hover)] transition-colors duration-fast",
                    isActive && "bg-[var(--bg-active)] hover:bg-[var(--bg-active)]"
                  )}
                  style={{ "--stagger-i": idx, "--hh-slide-delay": `${idx * 35}ms` } as React.CSSProperties}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-[var(--accent)]" />
                  )}
                  <CollapsibleTrigger asChild>
                    <button
                      onClick={(e) => toggleExpanded(e, p.id)}
                      className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
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
                    <span className="shrink-0 h-3.5 w-3.5 rounded-[3px] bg-[var(--accent-dim)] text-[var(--accent)] text-[9px] font-semibold flex items-center justify-center">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                  )}

                  <span className={cn("flex-1 min-w-0 truncate text-[12px] font-medium", isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
                    {p.name}
                  </span>

                  {runningCount > 0 && (
                    <span
                      className="shrink-0 h-1.5 w-1.5 rounded-full bg-[var(--session-live)] hh-status-dot-live"
                      title={`${runningCount} Session(en) laufen`}
                    />
                  )}

                  <div className="hidden group-hover:flex items-center gap-px shrink-0">
                    <button
                      className="hh-icon-btn h-5 w-5"
                      title="Workspace öffnen"
                      aria-label="Workspace öffnen"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenWorkspace(p);
                      }}
                    >
                      <IconPlay size={11} />
                    </button>
                    <button
                      className="hh-icon-btn h-5 w-5"
                      title="Projekt bearbeiten"
                      aria-label="Projekt bearbeiten"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingProject(p);
                      }}
                    >
                      <IconPencil size={11} />
                    </button>
                    <button className="hh-icon-btn h-5 w-5" title="Projekt löschen" aria-label="Projekt löschen" onClick={(e) => handleDelete(e, p)}>
                      <IconTrash size={11} />
                    </button>
                  </div>
                </div>
                </PowerContextMenu>

                <CollapsibleContent className="overflow-hidden data-[state=open]:animate-[hh-collapsible-down_var(--duration-normal)_var(--ease-standard)] data-[state=closed]:animate-[hh-collapsible-up_var(--duration-normal)_var(--ease-standard)]">
                  <div className="hh-session-expand ml-[18px] flex flex-col gap-px border-l border-[var(--border)] pl-1.5 py-0.5" style={{ transformOrigin: "top" }}>
                    {(() => {
                      // Stopped sessions stay listed (dimmed) until the user
                      // deletes them; only archived ones move to the full view.
                      const live = applyFilter(sessions, filter);
                      if (live.length === 0)
                        return <div className="text-[11px] text-[var(--text-muted)] py-1 px-1.5 hh-faint">{sessions.length ? "Keine Treffer für diesen Filter" : "Noch keine Sessions"}</div>;
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
                            className="hh-session-leaf hh-slide-in flex items-center gap-1.5 w-full text-left"
                            style={{ "--hh-slide-delay": `${i * 30}ms` } as React.CSSProperties}
                          >
                            <span
                              className={cn("h-1.5 w-1.5 rounded-full shrink-0", s.status === "running" ? "hh-status-dot-live" : "border")}
                              style={s.status === "running" ? { background: STATUS_COLOR.running } : { borderColor: STATUS_COLOR.stopped, opacity: 0.7 }}
                              role="img"
                              aria-label={s.status === "running" ? "Läuft" : "Gestoppt"}
                              title={s.status === "running" ? "Läuft" : "Gestoppt – Klick öffnet und stellt den Kontext wieder her"}
                            />
                            <span className={cn("flex-1 min-w-0 truncate text-[11px]", s.status === "running" ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]")}>{s.name}</span>
                            <button
                              className="hh-icon-btn h-4 w-4 shrink-0 hidden group-hover:flex"
                              title="Session löschen"
                              aria-label={`${s.name} löschen`}
                              data-power-menu-ignore
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteSessionRow(s);
                              }}
                            >
                              <IconTrash size={10} />
                            </button>
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
            <div className="hh-faint" style={{ fontSize: "var(--text-sm)", padding: "var(--space-2)" }}>
              Noch keine Projekte.
            </div>
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

