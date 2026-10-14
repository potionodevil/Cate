/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface LiveMetric {
  value?: React.ReactNode;
  unit?: string;
  status?: "live" | "idle" | "warning";
}

export interface LiveMetricsProps {
  speed?: LiveMetric | React.ReactNode;
  ttft?: LiveMetric | React.ReactNode;
  vram?: LiveMetric | React.ReactNode;
  className?: string;
  compact?: boolean;
  /** Überschreibt die automatisch ermittelte Anzeige „Agent aktiv“. */
  agentActive?: boolean;
  /** Überschreibt die automatisch ermittelte Anzeige „Kontext bereit“. */
  contextReady?: boolean;
}

const defaults = {
  speed: { value: "—", unit: "tok/s", status: "idle" as const },
  ttft: { value: "—", unit: "ms", status: "idle" as const },
  vram: { value: "—", unit: "GB", status: "idle" as const },
};

/** Macht aus einem rohen Wert oder einem Metrik-Objekt immer ein einheitliches Objekt, damit die Anzeige keine Sonderfälle kennt. */
function normalizeMetric(metric: LiveMetric | React.ReactNode | undefined, fallback: LiveMetric): LiveMetric {
  if (metric == null) return fallback;
  if (typeof metric === "object" && metric !== null && !React.isValidElement(metric) && "value" in metric) {
    return metric as LiveMetric;
  }
  return { value: metric as React.ReactNode };
}

/** Fragt alle paar Sekunden ab, ob irgendwo ein Agent läuft und ob Projekte (Kontext) vorhanden sind — so zeigen die Statuspillen in der Kopfzeile echten Zustand statt fester Texte. */
function useRuntimeStatus(override: { agentActive?: boolean; contextReady?: boolean }) {
  const [state, setState] = React.useState({ agentActive: false, contextReady: false });
  React.useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const projects = await window.harness.listProjects();
        const lists = await Promise.all(projects.map((p) => window.harness.listSessions(p.id)));
        if (cancelled) return;
        setState({
          contextReady: projects.length > 0,
          agentActive: lists.some((l) => l.some((s) => s.status === "running")),
        });
      } catch {
        /* Anzeige bleibt beim letzten Stand */
      }
    }
    void poll();
    const id = setInterval(() => void poll(), 6000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return {
    agentActive: override.agentActive ?? state.agentActive,
    contextReady: override.contextReady ?? state.contextReady,
  };
}

/** Pillenförmiges Statusabzeichen mit weichem Leuchten, solange der Zustand aktiv ist. */
function StatusPill({ on, tone, children }: { on: boolean; tone: "accent" | "success"; children: React.ReactNode }) {
  const color = tone === "accent" ? "var(--accent)" : "var(--success)";
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-[22px] gap-1.5 rounded-full border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 text-[11px] font-medium text-[var(--text-muted)] transition-colors",
        on && "text-[var(--text-primary)]"
      )}
      style={on ? { borderColor: `color-mix(in srgb, ${color} 35%, var(--border))`, background: `color-mix(in srgb, ${color} 9%, var(--bg-elevated))` } : undefined}
    >
      <span
        aria-hidden
        className={cn("h-1.5 w-1.5 rounded-full", on ? "hh-status-dot-live" : "bg-[var(--border-strong)]")}
        style={on ? { background: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 14%, transparent), 0 0 10px -1px ${color}` } : undefined}
      />
      {children}
    </Badge>
  );
}

/** Kopfzeilen-Block: dezente Laufzeitmetriken (tok/s, VRAM, Latenz) plus die Statuspillen „Agent aktiv“ und „Kontext bereit“. */
export function LiveMetrics({ speed, ttft, vram, className, compact = false, agentActive, contextReady }: LiveMetricsProps) {
  const status = useRuntimeStatus({ agentActive, contextReady });
  const metrics = [
    ["tok/s", normalizeMetric(speed, defaults.speed)],
    ["VRAM", normalizeMetric(vram, defaults.vram)],
    ["Latenz", normalizeMetric(ttft, defaults.ttft)],
  ] as const;

  return (
    <div className={cn("flex items-center gap-3 px-2", compact && "gap-2.5", className)} style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      <div className="flex items-center gap-1.5">
        <StatusPill on={status.agentActive} tone="accent">{status.agentActive ? "Agent aktiv" : "Agent inaktiv"}</StatusPill>
        <StatusPill on={status.contextReady} tone="success">{status.contextReady ? "Kontext bereit" : "Kein Kontext"}</StatusPill>
      </div>
      <Separator orientation="vertical" className="h-4 bg-[var(--border)] max-[1080px]:hidden" />
      <div className="flex items-center gap-3 max-[1080px]:hidden">
        {metrics.map(([label, metric]) => (
          <div key={label} className="flex items-baseline gap-1.5 font-mono tabular-nums" title={label}>
            <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
            <span
              className={cn(
                "text-[11px] text-[var(--text-secondary)]",
                metric.status === "live" && "text-[var(--success)]",
                metric.status === "warning" && "text-[var(--warning)]"
              )}
            >
              {metric.value ?? "—"}
              {metric.unit && label !== "tok/s" && <span className="ml-0.5 text-[10px] text-[var(--text-muted)]">{metric.unit}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
