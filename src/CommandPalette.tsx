/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command";
import { FolderOpen, Plus, PanelLeftOpen, Moon, Sun, Monitor, Layers, History } from "lucide-react";
import type { Project, SessionRecord } from "./types";
import { THEME_OPTIONS } from "./themes";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenProject: (p: Project) => void;
  onOpenSessionsView: () => void;
  onOpenSession: (s: SessionRecord) => void;
  activeProjectId?: string | null;
}

export function CommandPalette({ open, onClose, onOpenProject, onOpenSessionsView, onOpenSession, activeProjectId }: CommandPaletteProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionRecord[]>([]);

  // Load fresh data whenever the palette is opened, so long-running instances
  // don't show stale project/session lists.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      window.harness.listProjects(),
      activeProjectId ? window.harness.listSessions(activeProjectId) : Promise.resolve([])
    ]).then(([ps, sessions]) => {
      if (cancelled) return;
      setProjects(ps);
      // Most recent first, then cap at 5 for the palette.
      const sorted = [...sessions].sort((a, b) => (b.lastActiveAt ?? b.createdAt) - (a.lastActiveAt ?? a.createdAt));
      setRecentSessions(sorted.slice(0, 5));
    });
    return () => {
      cancelled = true;
    };
  }, [open, activeProjectId]);

  function run(fn: () => void) {
    onClose();
    fn();
  }

  return (
    <CommandDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <CommandInput placeholder="Suche Projekt, Aktion, Theme…" />
      <CommandList>
        <CommandEmpty>Keine Treffer.</CommandEmpty>

        <CommandGroup heading="Projekte">
          {projects.map((p) => (
            <CommandItem key={p.id} onSelect={() => run(() => onOpenProject(p))}>
              <FolderOpen />
              <span>Öffnen {p.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Aktionen">
          <CommandItem
            onSelect={() =>
              run(() => {
                const btn = document.querySelector<HTMLElement>("[data-new-project]");
                btn?.click();
              })
            }
          >
            <Plus />
            <span>Projekt anlegen</span>
          </CommandItem>
          <CommandItem onSelect={() => run(onOpenSessionsView)}>
            <PanelLeftOpen />
            <span>Sessions anzeigen</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Aussehen">
          {THEME_OPTIONS.map((t) => (
            <CommandItem key={t.id} onSelect={() => run(() => { window.harness.setTheme(t.id); })}>
              <Moon />
              <span>Theme: {t.label}</span>
            </CommandItem>
          ))}
          {(["left", "right"] as const).map((pos) => (
            <CommandItem key={pos} onSelect={() => run(() => { window.harness.setSidebarPosition(pos); })}>
              {pos === "left" ? <Layers /> : <Monitor />}
              <span>Sidebar: {pos === "left" ? "Links" : "Rechts"}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {recentSessions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Letzte Sessions">
              {recentSessions.map((s) => (
                <CommandItem key={s.id} onSelect={() => run(() => onOpenSession(s))}>
                  <History />
                  <span>{s.name || s.label || s.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      <div className="hh-palette-foot" aria-hidden>
        <span>↑↓ wählen</span>
        <span>↵ öffnen</span>
        <span>Esc schließen</span>
      </div>
    </CommandDialog>
  );
}
