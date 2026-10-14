/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextPickerProvider, useContextPicker } from "./contextPickerPlugin";

function ContextPillsContent({ className }: { className?: string }) {
  const { context, loading, error, clear } = useContextPicker();
  if (!context?.hasContext && !loading && !error) return null;
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1", className)} aria-live="polite">
      {loading && <span className="context-pill context-pill-muted">Kontext wird geladen …</span>}
      {error && <span className="context-pill context-pill-error">{error}</span>}
      {context?.hasContext && !loading && (
        <span className="context-pill" title={context.preview ?? context.sourceLabel ?? "Angehängter Kontext"}>
          <span className="truncate">{context.sourceLabel ?? "Angehängter Kontext"}</span>
          <button type="button" className="context-pill-remove" onClick={() => void clear()} aria-label="Kontext entfernen" title="Kontext entfernen">
            <X size={11} />
          </button>
        </span>
      )}
    </div>
  );
}

export function ContextPills({ projectId, className }: { projectId?: string; className?: string }) {
  return <ContextPickerProvider projectId={projectId}><ContextPillsContent className={className} /></ContextPickerProvider>;
}

export { ContextPickerProvider, useContextPicker };
export default ContextPills;
