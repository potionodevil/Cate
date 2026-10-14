/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import * as React from "react";
import {
  FilePlus2,
  FolderOpen,
  Layers3,
  Trash2,
  X,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { pluginRegistry, type PluginAction, type PluginContextKind } from "./pluginRegistry";
import "./contextPickerPlugin";

export type PowerContextMenuKind = "session" | "project" | "file" | "background";

export interface PowerContextMenuProps {
  kind: PowerContextMenuKind;
  children: React.ReactNode;
  label?: string;
  /** Identifies the session, project, or file for the host callback. */
  targetId?: string;
  /** Called when the user asks to open the target in a session. */
  onOpenInSession?: (targetId?: string) => void | Promise<void>;
  /** Called after a file is selected, or directly when no native picker exists. */
  onAddFile?: (filePath: string) => void | Promise<void>;
  /** Called for destructive deletion of the target. */
  onDelete?: (targetId?: string) => void | Promise<void>;
  /** Called whenever the menu closes, including after an action. */
  onClose?: () => void;
  /** Optional controlled visibility for integrations that own menu state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Additional actions supplied directly by the host. */
  actions?: PluginAction[];
  className?: string;
}

function action<T extends (...args: never[]) => unknown>(callback: T | undefined, ...args: Parameters<T>) {
  if (callback) void callback(...args);
}

/**
 * Compact, keyboard-friendly power menu for sidebar/session/file rows.
 * A LEFT-click on the wrapped content always selects/opens it normally
 * (the row's own onClick, e.g. project selection) — the menu never
 * intercepts that. A RIGHT-click (`onContextMenu`) opens this menu instead,
 * with the native browser/OS context menu suppressed and the event kept
 * from bubbling further (no double-handling by an ancestor row).
 */
export function PowerContextMenu({
  kind,
  children,
  label,
  targetId,
  onOpenInSession,
  onAddFile,
  onDelete,
  onClose,
  open: controlledOpen,
  onOpenChange,
  actions,
  className,
}: PowerContextMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [version, setVersion] = React.useState(0);
  React.useEffect(() => pluginRegistry.subscribe(() => setVersion((value) => value + 1)), []);
  const contextKind = kind as PluginContextKind;
  const pluginActions = React.useMemo(
    () => (actions ?? pluginRegistry.getSnapshot().actions).filter((item) => item.contextKinds?.includes(contextKind)),
    [actions, contextKind, version]
  );
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
    if (!next) onClose?.();
  };

  const title = label ?? (kind === "session" ? "Sitzung" : kind === "project" ? "Projekt" : kind === "background" ? "Projekte" : "Datei");
  const canAddFile = kind === "project" || kind === "file";
  const canOpen = kind !== "file";

  async function addFile() {
    if (!onAddFile) return;
    const picker = window.harness?.pickContextFile;
    const picked = picker ? await picker() : null;
    if (picked) await onAddFile(picked);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <span
        className={className}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const target = event.target;
          if (target instanceof Element && target.closest("button,a,input,textarea,select,[data-power-menu-ignore]")) return;
          setPosition({ x: event.clientX, y: event.clientY });
          setOpen(true);
        }}
      >
        {children}
      </span>
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        style={{
          position: "fixed",
          left: position.x,
          top: position.y,
          minWidth: "188px",
          padding: "4px",
          borderColor: "var(--power-menu-border, var(--border-strong))",
          background: "var(--power-menu-bg, var(--bg-elevated))",
          boxShadow: "var(--power-menu-shadow, var(--shadow-2))",
        }}
      >
        <DropdownMenuLabel className="power-context-menu-label">{title}</DropdownMenuLabel>
        {canOpen && onOpenInSession && (
          <DropdownMenuItem onSelect={() => action(onOpenInSession, targetId)}>
            <FolderOpen />
            <span>In Sitzung öffnen</span>
            <DropdownMenuShortcut>↵</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {canAddFile && onAddFile && (
          <DropdownMenuItem onSelect={() => void addFile()}>
            <FilePlus2 />
            <span>Datei hinzufügen</span>
            <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {kind === "project" && onOpenInSession && (
          <DropdownMenuItem onSelect={() => action(onOpenInSession, targetId)}>
            <Layers3 />
            <span>Neue Sitzung starten</span>
            <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="power-context-menu-danger"
              onSelect={() => action(onDelete, targetId)}
            >
              <Trash2 />
              <span>{kind === "file" ? "Datei entfernen" : "Löschen"}</span>
              <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        )}
        {pluginActions.length > 0 && <DropdownMenuSeparator />}
        {pluginActions.map((item) => {
          const Icon = item.icon;
          return <DropdownMenuItem key={item.id} disabled={item.disabled} onSelect={() => void item.run({ kind: contextKind, targetId })}>
            {Icon && <Icon />}
            <span>{item.label}</span>
          </DropdownMenuItem>;
        })}
        <DropdownMenuItem onSelect={() => setOpen(false)}>
          <X />
          <span>Schließen</span>
          <DropdownMenuShortcut>Esc</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default PowerContextMenu;
