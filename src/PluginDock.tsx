/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { useEffect, useMemo, useState } from "react";
import { PanelRight, X, Puzzle, Check, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pluginRegistry } from "./pluginRegistry";
import type { PluginSidebarIcon } from "./pluginRegistry";

export interface PluginDockProps {
  className?: string;
  icons?: PluginSidebarIcon[];
}

export function PluginDock({ className, icons }: PluginDockProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showManagement, setShowManagement] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => pluginRegistry.subscribe(() => setVersion((value) => value + 1)), []);
  const registeredIcons = useMemo(() => {
    if (icons) return icons;
    return pluginRegistry.getSnapshot().sidebarIcons;
  }, [icons, version]);
  const selected = registeredIcons.find((item) => item.id === selectedId);
  const SelectedPanel = selected?.panel;
  const manifests = pluginRegistry.getRegisteredPlugins();


  return (
    <aside className={cn("flex items-center gap-1 border-l border-border bg-background/80 p-1", className)} aria-label="Plugin-Dock">
      {registeredIcons.map((item) => {
        const Icon = item.icon;
        return (
          <Button
            key={item.id}
            type="button"
            variant={selectedId === item.id ? "secondary" : "ghost"}
            size="icon"
            className="relative h-8 w-8"
            title={item.label}
            aria-label={item.label}
            onClick={() => {
              item.onSelect?.();
              setSelectedId((current) => (current === item.id ? null : item.id));
            }}
          >
            <Icon size={16} />
            {item.badge !== undefined && <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{item.badge}</span>}
          </Button>
        );
      })}
      {registeredIcons.length === 0 && <PanelRight size={15} className="text-muted-foreground" aria-hidden="true" />}
      <Button type="button" variant={showManagement ? "secondary" : "ghost"} size="icon" className="h-8 w-8" title="Plugins verwalten" aria-label="Plugins verwalten" onClick={() => setShowManagement((value) => !value)}><Puzzle size={16} /></Button>
      {showManagement && <div className="hh-plugin-management" role="dialog" aria-label="Plugin-Verwaltung">
        <div className="mb-2 flex items-center justify-between text-xs font-medium"><span>Plugins</span><Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Plugin-Verwaltung schließen" onClick={() => setShowManagement(false)}><X size={14} /></Button></div>
        {manifests.length === 0 ? <div className="text-xs text-muted-foreground">Keine Plugins registriert.</div> : manifests.map((plugin) => <button type="button" key={plugin.id} className="hh-plugin-management-row" onClick={() => pluginRegistry.setEnabled(plugin.id, !plugin.enabled)} aria-pressed={plugin.enabled}>
          <span className="min-w-0 flex-1 text-left"><strong>{plugin.name}</strong><small>{plugin.version}{plugin.description ? ` · ${plugin.description}` : ""}</small></span>
          {plugin.enabled ? <Check size={14} /> : <Ban size={14} />}
        </button>)}
      </div>}
      {SelectedPanel && (
        <div className="absolute right-2 top-12 z-40 w-72 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md">
          <div className="mb-2 flex items-center justify-between text-xs font-medium">
            <span>{selected?.label}</span>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Panel schließen" onClick={() => setSelectedId(null)}><X size={14} /></Button>
          </div>
          <SelectedPanel />
        </div>
      )}
    </aside>
  );
}

export default PluginDock;
