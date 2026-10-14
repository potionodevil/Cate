/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { IconPlugin, IconSquareGlyph, PluginGlyph } from "@/icons";
import { resolveIcon } from "@/pluginCatalog";
import { cn } from "@/lib/utils";
import { pluginRegistry } from "./pluginRegistry";
import type { PluginSidebarIcon } from "./pluginRegistry";

export interface PluginDockProps {
  className?: string;
  icons?: PluginSidebarIcon[];
  /** Oeffnet den Plugin-Manager. Ohne Prop zeigt der Dock eine kompakte Schalterliste. */
  onManage?: () => void;
}

export function PluginDock({ className, icons, onManage }: PluginDockProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    <TooltipProvider delayDuration={300}>
      <aside className={cn("relative flex items-center gap-1 border-l border-border bg-background/80 p-1", className)} aria-label="Plugin-Dock">
        {registeredIcons.map((item) => {
          const Icon = item.icon;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={selectedId === item.id ? "secondary" : "ghost"}
                  size="icon"
                  className="relative h-8 w-8"
                  aria-label={item.label}
                  aria-pressed={selectedId === item.id}
                  onClick={() => {
                    item.onSelect?.();
                    setSelectedId((current) => (current === item.id ? null : item.id));
                  }}
                >
                  <Icon size={16} />
                  {item.badge !== undefined && (
                    <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] font-normal">{item.badge}</Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
        {registeredIcons.length === 0 && (
          <span className="px-1 text-muted-foreground">
            <IconSquareGlyph size={8} />
          </span>
        )}
        {registeredIcons.length > 0 && <Separator orientation="vertical" className="mx-0.5 h-5" />}

        {onManage ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Plugins verwalten" onClick={onManage}>
                <IconPlugin size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Plugins verwalten</TooltipContent>
          </Tooltip>
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Plugins verwalten">
                <IconPlugin size={16} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[280px] p-2" aria-label="Plugin-Verwaltung">
              <div className="px-1.5 pb-1.5 text-xs font-medium">Plugins</div>
              {manifests.length === 0 && <p className="m-0 px-1.5 py-1 text-xs text-muted-foreground">Keine Plugins registriert.</p>}
              {manifests.map((plugin) => (
                <div key={plugin.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/50">
                  <span className="text-muted-foreground">
                    <PluginGlyph name={resolveIcon(plugin)} size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{plugin.name}</div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">v{plugin.version}</div>
                  </div>
                  <Switch checked={plugin.enabled} onCheckedChange={(v) => pluginRegistry.setEnabled(plugin.id, v)} aria-label={`${plugin.name} aktivieren`} />
                </div>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {SelectedPanel && (
          <div className="absolute right-2 top-12 z-40 w-72 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md">
            <div className="mb-2 flex items-center justify-between text-xs font-medium">
              <span>{selected?.label}</span>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setSelectedId(null)}>
                Schließen
              </Button>
            </div>
            <SelectedPanel />
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}

export default PluginDock;
