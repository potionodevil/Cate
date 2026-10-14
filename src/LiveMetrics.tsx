/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
}

const defaults = {
  speed: { value: "—", unit: "tok/s", status: "idle" as const },
  ttft: { value: "—", unit: "ms", status: "idle" as const },
  vram: { value: "—", unit: "GB", status: "idle" as const },
};

function normalizeMetric(metric: LiveMetric | React.ReactNode | undefined, fallback: LiveMetric): LiveMetric {
  if (metric == null) return fallback;
  if (typeof metric === "object" && metric !== null && !React.isValidElement(metric) && "value" in metric) {
    return metric as LiveMetric;
  }
  return { value: metric as React.ReactNode };
}

/** Header-ready live runtime metrics with stable monospace alignment. */
export function LiveMetrics({ speed, ttft, vram, className, compact = false }: LiveMetricsProps) {
  const metrics = [
    ["Geschwindigkeit", normalizeMetric(speed, defaults.speed)],
    ["TTFT", normalizeMetric(ttft, defaults.ttft)],
    ["VRAM", normalizeMetric(vram, defaults.vram)],
  ] as const;

  return (
    <Card className={cn("rounded-none border-x-0 border-t-0 bg-transparent shadow-none", className)}>
      <CardContent className={cn("flex items-center gap-3 px-3 py-2", compact && "gap-2 py-1.5")}>
        {metrics.map(([label, metric], index) => (
          <React.Fragment key={label}>
            {index > 0 && <span aria-hidden className="h-5 w-px bg-[var(--border)]" />}
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
              <Badge
                variant="outline"
                className={cn(
                  "h-5 rounded-sm border-[var(--border)] px-1.5 font-mono text-[11px] font-normal tabular-nums text-[var(--text-primary)]",
                  metric.status === "live" && "border-[var(--success)] text-[var(--success)]",
                  metric.status === "warning" && "border-[var(--warning)] text-[var(--warning)]",
                )}
              >
                {metric.value ?? "—"}{metric.unit && <span className="ml-1 text-[var(--text-secondary)]">{metric.unit}</span>}
              </Badge>
            </div>
          </React.Fragment>
        ))}
      </CardContent>
    </Card>
  );
}
