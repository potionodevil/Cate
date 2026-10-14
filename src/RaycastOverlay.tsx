/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { useEffect, useMemo, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { pluginRegistry } from "./pluginRegistry";
import type { PluginAction } from "./pluginRegistry";

export interface RaycastOverlayProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  actions?: PluginAction[];
}

export function RaycastOverlay({ open: controlledOpen, onOpenChange, actions }: RaycastOverlayProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setLocalOpen(next);
    onOpenChange?.(next);
  };
  const [version, setVersion] = useState(0);
  const availableActions = useMemo(() => actions ?? pluginRegistry.getSnapshot().actions, [actions, version]);

  useEffect(() => pluginRegistry.subscribe(() => setVersion((value) => value + 1)), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.code === "Space") {
        event.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[18%] max-w-xl translate-y-0 overflow-hidden p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Plugin-Aktionen</DialogTitle>
        <Command shouldFilter>
          <CommandInput placeholder="Aktion oder Plugin suchen …" autoFocus />
          <CommandList className="max-h-[min(60vh,420px)]">
            <CommandEmpty>Keine passende Aktion.</CommandEmpty>
            <CommandGroup heading="Aktionen">
              {availableActions.map((action) => {
                const Icon = action.icon;
                return (
                  <CommandItem
                    key={action.id}
                    value={[action.label, action.description, ...(action.keywords ?? [])].filter(Boolean).join(" ")}
                    onSelect={() => {
                      setOpen(false);
                      void action.run();
                    }}
                  >
                    {Icon && <Icon size={16} />}
                    <span className="flex flex-1 flex-col">
                      <span>{action.label}</span>
                      {action.description && <span className="text-xs text-muted-foreground">{action.description}</span>}
                    </span>
                    {action.shortcut && <span className="text-xs text-muted-foreground">{action.shortcut}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export default RaycastOverlay;
