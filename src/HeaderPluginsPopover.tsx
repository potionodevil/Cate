/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconPlugin, PluginGlyph } from "@/icons";
import { resolveIcon } from "@/pluginCatalog";
import { pluginRegistry, type PluginAction } from "./pluginRegistry";
// Side-effect import: registriert die Aktionen des ContextPicker-Plugins.
import "./contextPickerPlugin";

export interface HeaderPluginsPopoverProps {
  activeProjectId: string | null;
  /** Oeffnet den Plugin-Manager. Ohne diese Prop entfaellt der Verwalten-Eintrag. */
  onManage?: () => void;
}

/** Kopfzeilen-Popover: kompakte Liste der Plugins mit Schalter, darunter die
 * Projekt-Aktionen aktiver Plugins und der Einstieg in den Plugin-Manager.
 * Oeffnet nur per Linksklick (Radix-Trigger, kein onContextMenu). */
export function HeaderPluginsPopover({ activeProjectId, onManage }: HeaderPluginsPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [, setVersion] = React.useState(0);
  const [busyActionId, setBusyActionId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => pluginRegistry.subscribe(() => setVersion((v) => v + 1)), []);

  const plugins = pluginRegistry.getRegisteredPlugins();
  const activeCount = plugins.filter((p) => p.enabled).length;
  const projectActions = pluginRegistry.getSnapshot().actions.filter((a) => a.contextKinds?.includes("project"));

  async function runAction(action: PluginAction) {
    if (!activeProjectId) {
      setActionError("Kein Projekt ausgewählt.");
      return;
    }
    setBusyActionId(action.id);
    setActionError(null);
    try {
      await action.run({ kind: "project", targetId: activeProjectId });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusyActionId(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="hh-window-control" title="Plugins" aria-label="Plugins">
          <IconPlugin size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="hh-header-popover w-[300px] p-0">
        <div className="flex items-center justify-between px-3 pb-2 pt-3">
          <span className="text-xs font-medium">Plugins</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {activeCount} von {plugins.length} aktiv
          </span>
        </div>
        <ScrollArea className="max-h-[240px]">
          <div className="flex flex-col px-1.5 pb-1.5">
            {plugins.length === 0 && <p className="m-0 px-1.5 py-2 text-xs text-muted-foreground">Keine Plugins registriert.</p>}
            {plugins.map((plugin) => (
              <div key={plugin.id} className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/50">
                <span className="text-muted-foreground">
                  <PluginGlyph name={resolveIcon(plugin)} size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{plugin.name}</div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">v{plugin.version}</div>
                </div>
                <span
                  aria-hidden
                  className={"h-1.5 w-1.5 shrink-0 rounded-full " + (plugin.enabled ? "bg-amber-400" : "bg-muted-foreground/40")}
                />
                <Switch
                  checked={plugin.enabled}
                  onCheckedChange={(enabled) => pluginRegistry.setEnabled(plugin.id, enabled)}
                  aria-label={`${plugin.name} aktivieren`}
                />
              </div>
            ))}
          </div>
        </ScrollArea>

        {projectActions.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-1 p-2">
              <span className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">Aktionen</span>
              {projectActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.id}
                    size="sm"
                    variant="ghost"
                    className="h-7 justify-start gap-2 px-2 text-xs"
                    disabled={!activeProjectId || busyActionId === action.id}
                    onClick={() => runAction(action)}
                  >
                    {Icon ? <Icon size={13} /> : <IconPlugin size={13} />}
                    {action.label}
                  </Button>
                );
              })}
              {!activeProjectId && <p className="m-0 px-1 text-[11px] text-muted-foreground">Erst ein Projekt wählen.</p>}
              {actionError && <p className="m-0 px-1 text-[11px] text-destructive">{actionError}</p>}
            </div>
          </>
        )}

        {onManage && (
          <>
            <Separator />
            <div className="p-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full justify-center text-xs"
                onClick={() => {
                  setOpen(false);
                  onManage();
                }}
              >
                Plugins verwalten
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
