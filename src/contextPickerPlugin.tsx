/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import * as React from "react";
import { ClipboardPaste, FileText } from "lucide-react";
import { pluginRegistry, type PluginContextKind } from "./pluginRegistry";

export interface AttachedContext {
  hasContext: boolean;
  sourceLabel: string | null;
  updatedAt: number | null;
  preview: string | null;
}

interface ContextPickerValue {
  projectId?: string;
  context: AttachedContext | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  pickFile: () => Promise<boolean>;
  pickClipboard: () => Promise<boolean>;
  clear: () => Promise<boolean>;
}

const ContextPickerContext = React.createContext<ContextPickerValue | null>(null);

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Kontext konnte nicht geladen werden.";
}

export function ContextPickerProvider({ projectId, children }: { projectId?: string; children: React.ReactNode }) {
  const [context, setContext] = React.useState<AttachedContext | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!projectId) { setContext(null); return; }
    setLoading(true); setError(null);
    try { setContext(await window.harness.getProjectContext(projectId)); }
    catch (reason) { setError(messageFrom(reason)); }
    finally { setLoading(false); }
  }, [projectId]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const run = React.useCallback(async (operation: () => Promise<void>) => {
    if (!projectId) { setError("Kein Projekt ausgewählt."); return false; }
    setLoading(true); setError(null);
    try { await operation(); await refresh(); return true; }
    catch (reason) { setError(messageFrom(reason)); return false; }
    finally { setLoading(false); }
  }, [projectId, refresh]);

  const pickFile = React.useCallback(() => run(async () => {
    const path = await window.harness.pickContextFile();
    if (path) { const result = await window.harness.setProjectContextFile(projectId!, path); if (!result.ok) throw new Error("Datei konnte nicht als Kontext gespeichert werden."); }
  }), [projectId, run]);

  const pickClipboard = React.useCallback(() => run(async () => {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) throw new Error("Die Zwischenablage ist leer.");
    const result = await window.harness.setProjectContextText(projectId!, text, "Zwischenablage");
    if (!result.ok) throw new Error("Zwischenablage konnte nicht als Kontext gespeichert werden.");
  }), [projectId, run]);

  const clear = React.useCallback(() => run(async () => {
    const result = await window.harness.clearProjectContext(projectId!);
    if (!result.ok) throw new Error("Kontext konnte nicht entfernt werden.");
  }), [projectId, run]);

  const value = React.useMemo(() => ({ projectId, context, loading, error, refresh, pickFile, pickClipboard, clear }), [projectId, context, loading, error, refresh, pickFile, pickClipboard, clear]);
  return <ContextPickerContext.Provider value={value}>{children}</ContextPickerContext.Provider>;
}

export function useContextPicker(): ContextPickerValue {
  const value = React.useContext(ContextPickerContext);
  if (!value) throw new Error("useContextPicker muss innerhalb eines ContextPickerProvider verwendet werden.");
  return value;
}

let unregister: (() => void) | undefined;
if (typeof window !== "undefined") {
  unregister = pluginRegistry.register({
    id: "context-picker",
    name: "Kontextauswahl",
    version: "1.0.0",
    description: "Dateien und Zwischenablage als Projekt-Kontext anhängen.",
    slots: ["action", "context"],
    actions: [
      { id: "context-picker.file", label: "Datei als Kontext", description: "Eine Datei an das Projekt anhängen.", icon: FileText, contextKinds: ["project"], run: (context) => contextPickerAction(context?.targetId, "file") },
      { id: "context-picker.clipboard", label: "Zwischenablage als Kontext", description: "Den aktuellen Zwischenablageinhalt anhängen.", icon: ClipboardPaste, contextKinds: ["project"], run: (context) => contextPickerAction(context?.targetId, "clipboard") }
    ]
  });
}

async function contextPickerAction(projectId: string | undefined, mode: "file" | "clipboard") {
  if (!projectId) return;
  if (mode === "file") {
    const path = await window.harness.pickContextFile();
    if (path) {
      const result = await window.harness.setProjectContextFile(projectId, path);
      if (!result.ok) throw new Error("Datei konnte nicht als Kontext gespeichert werden.");
    }
    return;
  }
  const text = await navigator.clipboard.readText();
  if (text.trim()) {
    const result = await window.harness.setProjectContextText(projectId, text, "Zwischenablage");
    if (!result.ok) throw new Error("Zwischenablage konnte nicht als Kontext gespeichert werden.");
  }
}

export { unregister as unregisterContextPickerPlugin };
