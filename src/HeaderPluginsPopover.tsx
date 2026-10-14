/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import * as React from "react";
import { Blocks, FileText, ClipboardPaste } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { pluginRegistry, type PluginAction } from "./pluginRegistry";
// Side-effect import: registers the built-in ContextPicker plugin's actions
// (file/clipboard-as-context) so they appear below without relying on some
// other component having imported it first.
import "./contextPickerPlugin";

/** Header popover (top-right) for plugins: shows every registered plugin
 * with its enable/disable state, plus one-click buttons for that plugin's
 * project-scoped actions (e.g. the ContextPicker plugin's "Datei/
 * Zwischenablage als Kontext anfügen"). Moved out of Settings since plugin
 * status and quick actions are something you reach for constantly while
 * working, not a one-time configuration step. */
export function HeaderPluginsPopover({ activeProjectId }: { activeProjectId: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [, setVersion] = React.useState(0);
  const [busyActionId, setBusyActionId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => pluginRegistry.subscribe(() => setVersion((v) => v + 1)), []);

  const plugins = pluginRegistry.getRegisteredPlugins();
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
          <Blocks size={15} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="hh-header-popover w-[280px] p-3">
        <div className="hh-section-header" style={{ marginBottom: "var(--space-2)" }}>
          Plugins
        </div>
        <div className="flex flex-col gap-1.5">
          {plugins.length === 0 && <p className="hh-faint m-0 text-xs">Keine Plugins registriert.</p>}
          {plugins.map((plugin) => (
            <div key={plugin.id} className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="h-[6px] w-[6px] shrink-0 rounded-full"
                style={{ background: plugin.enabled ? "var(--success)" : "var(--border)" }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{plugin.name}</div>
                <div className="hh-faint truncate text-[10px]">v{plugin.version}</div>
              </div>
              <Switch
                checked={plugin.enabled}
                onCheckedChange={(enabled) => pluginRegistry.setEnabled(plugin.id, enabled)}
                aria-label={`${plugin.name} aktivieren`}
              />
            </div>
          ))}
        </div>

        {projectActions.length > 0 && (
          <>
            <div className="hh-section-header" style={{ margin: "var(--space-3) 0 var(--space-2)" }}>
              Kontext-Aktionen
            </div>
            <div className="flex flex-col gap-1">
              {projectActions.map((action) => {
                const Icon = action.icon ?? (action.id.includes("clipboard") ? ClipboardPaste : FileText);
                return (
                  <Button
                    key={action.id}
                    size="sm"
                    variant="outline"
                    className="justify-start gap-2"
                    disabled={!activeProjectId || busyActionId === action.id}
                    onClick={() => runAction(action)}
                  >
                    <Icon size={13} />
                    {action.label}
                  </Button>
                );
              })}
            </div>
            {!activeProjectId && <p className="hh-faint m-0 mt-1 text-[11px]">Erst ein Projekt wählen.</p>}
            {actionError && (
              <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--danger)" }}>
                {actionError}
              </p>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
