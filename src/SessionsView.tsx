/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { SessionRecord } from "./types";
import { IconTrash, IconPencil, IconCheck, IconClose, IconArchiveDown, IconArchiveUp, IconChevronDown } from "./icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function formatRelative(ts: number | null): string {
  if (!ts) return "-";
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `vor ${hours} h`;
  const days = Math.round(hours / 24);
  return `vor ${days} d`;
}

const STATUS_LABEL: Record<SessionRecord["status"], string> = {
  running: "läuft",
  exited: "beendet",
  stopped: "gestoppt"
};

const STATUS_COLOR: Record<SessionRecord["status"], string> = {
  running: "var(--session-live)",
  exited: "var(--session-live)",
  stopped: "var(--session-live)"
};

/** Per-project history of sessions — including ones not currently shown in the
 * workspace layout, since sessions keep running/persisting in the background
 * independent of the UI. Rechtsklick (oder Pfeil-Button) auf eine Karte öffnet
 * ein Kontextmenü: Umbenennen, Verlauf, Archivieren/Wiederherstellen, Löschen.
 * Der Aktiv/Archiv-Segmented-Filter oben schaltet die Liste um. */
export function SessionsView({
  projectId,
  onReattach
}: {
  projectId: string;
  onReattach: (session: SessionRecord) => void;
}) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewFilter, setViewFilter] = useState<"active" | "archived">("active");
  const [viewingContext, setViewingContext] = useState<{ session: SessionRecord; content: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  // Session ids currently being reopened: shows a loader on that row and
  // disables its "Öffnen" button until handleReattach's agent respawn with
  // the restored context has produced a live session (no paranoid
  // double-clicked reattach storm possible this way either).
  const [openingIds, setOpeningIds] = useState<Set<string>>(new Set());

  async function openWithLoader(s: SessionRecord) {
    if (openingIds.has(s.id)) return;
    setOpeningIds((prev) => new Set(prev).add(s.id));
    try {
      await onReattach(s);
    } finally {
      setOpeningIds((prev) => {
        const next = new Set(prev);
        next.delete(s.id);
        return next;
      });
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const rows = await window.harness.listSessions(projectId);
      setSessions(rows);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Sessions konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 6000);
    // Auto-Titel (erste Nachricht) + manuelle Renames aus anderen Panels
    // sofort mitsyncen, statt erst beim naechsten 6s-Poll.
    const disposeRename = window.harness.onSessionRenamed(({ id, label }) =>
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, name: label } : s)))
    );
    return () => {
      clearInterval(interval);
      disposeRename();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function beginRename(s: SessionRecord) {
    setEditingId(s.id);
    setEditingValue(s.name);
    setRenameError(null);
  }

  async function commitRename(s: SessionRecord) {
    const value = editingValue.trim();
    if (!editingId) return;
    if (!value) {
      setRenameError("Der Name darf nicht leer sein.");
      return;
    }
    const res = await window.harness.renameSession(s.id, value);
    if (res.ok) {
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, name: value } : x)));
      setEditingId(null);
      setRenameError(null);
    } else {
      setRenameError(res.message || "Umbenennen fehlgeschlagen.");
    }
  }

  function cancelRename() {
    setEditingId(null);
    setEditingValue("");
    setRenameError(null);
  }

  async function stop(s: SessionRecord) {
    setBusyId(s.id);
    try {
      await window.harness.stopSession(s.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(s: SessionRecord) {
    setBusyId(s.id);
    try {
      await window.harness.deleteSession(s.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleArchive(s: SessionRecord) {
    setBusyId(s.id);
    try {
      await window.harness.archiveSession(s.id, !s.archivedAt);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  // ponytail: client-side match on name/agent/status; add a main-process transcript search if history search is needed
  const needle = query.trim().toLowerCase();
  const visible = sessions.filter(
    (s) =>
      (viewFilter === "archived" ? !!s.archivedAt : !s.archivedAt) &&
      (!needle || `${s.name} ${s.presetId || "shell"} ${STATUS_LABEL[s.status]}`.toLowerCase().includes(needle))
  );

  async function viewContext(s: SessionRecord) {
    const result = await window.harness.getSessionContext(s.id);
    setViewingContext({ session: s, content: result.content });
  }

  return (
    <div className="p-4 overflow-y-auto h-full" onContextMenu={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="hh-title text-lg">Sessions</h3>
          <Tabs value={viewFilter} onValueChange={(v) => setViewFilter(v as typeof viewFilter)} aria-label="Sessions filtern">
            <TabsList className="h-[28px] gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-0.5">
              <TabsTrigger value="active" className="h-full min-w-0 rounded-md px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors duration-fast hover:text-[var(--text-primary)] data-[state=active]:bg-[var(--bg-active)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none">Aktiv</TabsTrigger>
              <TabsTrigger value="archived" className="h-full min-w-0 rounded-md px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors duration-fast hover:text-[var(--text-primary)] data-[state=active]:bg-[var(--bg-active)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none">Archiv</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <span className="hh-faint text-xs">Läuft im Hintergrund weiter, auch wenn kein Pane dafür offen ist.</span>
      </div>

      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setQuery("")}
        placeholder="Sessions suchen (Name, Agent, Status) …"
        aria-label="Sessions durchsuchen"
        className="h-8 text-sm mb-3"
      />

      {loading && sessions.length === 0 && <div className="hh-empty-state">Lade…</div>}
      {loadError && <div className="hh-empty-state" style={{ color: "var(--danger)" }}>{loadError}</div>}
      {!loading && visible.length === 0 && (
        <div className="hh-empty-state">
          {needle ? `Keine Treffer für „${query.trim()}“.` : viewFilter === "archived" ? "Keine archivierten Sessions." : "Noch keine Sessions für dieses Projekt."}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {visible.map((s) => (
          <div
            key={s.id}
            className={cn("hh-session-card hh-card-in", s.archivedAt && "hh-archived")}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuFor(s.id);
            }}
          >
            <span
              className={s.status === "running" ? "hh-session-dot hh-status-dot-live" : "hh-session-dot"}
              style={s.status === "running" ? { background: STATUS_COLOR.running } : { background: "transparent", boxShadow: `inset 0 0 0 1.5px ${STATUS_COLOR[s.status]}`, opacity: 0.75 }}
              role="img"
              aria-label={STATUS_LABEL[s.status]}
            />
            <div className="flex flex-col gap-0.5 min-w-0">
              {editingId === s.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    autoFocus
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(s);
                      if (e.key === "Escape") cancelRename();
                    }}
                    className="h-7 text-sm"
                    aria-label="Session-Namen eingeben"
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Speichern" aria-label="Namen speichern" onClick={() => commitRename(s)}>
                    <IconCheck size={12} />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Abbrechen" aria-label="Abbrechen" onClick={cancelRename}>
                    <IconClose size={12} />
                  </Button>
                </div>
              ) : (
                <strong className="text-sm">{s.name}</strong>
              )}
              <span className="hh-faint text-xs font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>
                {s.presetId || "shell"} · {STATUS_LABEL[s.status]} · {s.paneIds.length} Panes · zuletzt aktiv {formatRelative(s.lastActiveAt)}
              </span>
              {editingId === s.id && renameError && (
                <span className="text-xs" style={{ color: "var(--danger)" }}>{renameError}</span>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              {editingId !== s.id && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="Umbenennen"
                  aria-label="Session umbenennen"
                  onClick={() => beginRename(s)}
                >
                  <IconPencil size={13} />
                </Button>
              )}
              <Button size="sm" disabled={openingIds.has(s.id)} onClick={() => void openWithLoader(s)}>
                {openingIds.has(s.id) ? (
                  <>
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                    Öffne…
                  </>
                ) : (
                  "Öffnen"
                )}
              </Button>
              {s.status !== "running" && <Button size="sm" variant="secondary" onClick={() => viewContext(s)}>Verlauf</Button>}
              {s.status === "running" && (
                <Button size="sm" variant="secondary" disabled={busyId === s.id} onClick={() => stop(s)}>
                  Beenden
                </Button>
              )}
              {/*Archiviere/Wiederherstellen: Inline-Icon; zusätzlich im Rechtsklick-Menü */}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title={s.archivedAt ? "Wiederherstellen" : "Archivieren"}
                aria-label={s.archivedAt ? "Session wiederherstellen" : "Session archivieren"}
                disabled={busyId === s.id}
                onClick={() => toggleArchive(s)}
              >
                {s.archivedAt ? <IconArchiveUp size={13} /> : <IconArchiveDown size={13} />}
              </Button>
              {/*Rechtsklick-Kontextmenü: öffnet auch per Klick auf den Chevron-Button */}
              <DropdownMenu open={menuFor === s.id} onOpenChange={(o) => setMenuFor(o ? s.id : null)}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Aktionen"
                    aria-label="Session-Aktionen"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuFor(s.id);
                    }}
                  >
                    <IconChevronDown size={13} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={() => beginRename(s)}>Umbenennen</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => viewContext(s)}>Verlauf anzeigen</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => toggleArchive(s)}>
                    {s.archivedAt ? "Wiederherstellen" : "Archivieren"}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-[var(--danger)] focus:text-[var(--danger)]" onSelect={() => remove(s)}>
                    Löschen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!viewingContext} onOpenChange={(open) => !open && setViewingContext(null)}>
        <DialogContent className="max-w-[640px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Verlauf — {viewingContext?.session.name}</DialogTitle>
          </DialogHeader>
          <pre
            className="m-0 p-3 rounded-md border font-mono text-xs whitespace-pre-wrap overflow-y-auto flex-1"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
          >
            {viewingContext?.content || "(leer)"}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
