/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface InferenceParameters {
  temperature: number;
  topP: number;
  contextWindow: number;
}

export interface InferenceControlsProps {
  value?: Partial<InferenceParameters>;
  defaultValue?: InferenceParameters;
  onChange?: (value: InferenceParameters) => void;
  className?: string;
  disabled?: boolean;
}

const DEFAULT_PARAMETERS: InferenceParameters = {
  temperature: 0.7,
  topP: 0.9,
  contextWindow: 8192,
};

const parameterMeta = [
  { key: "temperature", label: "Temperatur", min: 0, max: 2, step: 0.05, format: (v: number) => v.toFixed(2) },
  { key: "topP", label: "Top-P", min: 0, max: 1, step: 0.05, format: (v: number) => v.toFixed(2) },
  { key: "contextWindow", label: "Kontextfenster", min: 1024, max: 32768, step: 1024, format: (v: number) => `${Math.round(v / 1024)}k` },
] as const;

/** Compact right-edge inference parameter panel. */
export function InferenceControls({
  value,
  defaultValue = DEFAULT_PARAMETERS,
  onChange,
  className,
  disabled = false,
}: InferenceControlsProps) {
  const [parameters, setParameters] = React.useState<InferenceParameters>({ ...defaultValue, ...value });

  React.useEffect(() => {
    if (value) setParameters((current) => ({ ...current, ...value }));
  }, [value]);

  function update(key: keyof InferenceParameters, next: number) {
    const updated = { ...parameters, [key]: next };
    setParameters(updated);
    onChange?.(updated);
  }

  return (
    <Card className={cn("w-64 rounded-none border-y-0 border-r-0 bg-[var(--bg-elevated)] shadow-none", className)}>
      <CardHeader className="border-b border-[var(--border)] px-3 py-2">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
          Inferenz
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-3 py-3">
        {parameterMeta.map((item) => {
          const current = parameters[item.key];
          return (
            <label key={item.key} className="block space-y-2">
              <span className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <span>{item.label}</span>
                <output className="font-mono tabular-nums text-[var(--text-primary)]">{item.format(current)}</output>
              </span>
              <Slider
                aria-label={item.label}
                min={item.min}
                max={item.max}
                step={item.step}
                value={current}
                disabled={disabled}
                onChange={(next) => update(item.key, next)}
              />
            </label>
          );
        })}
      </CardContent>
    </Card>
  );
}

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number;
  onChange: (value: number) => void;
}

/** Local shadcn-compatible flat slider primitive; kept dependency-free for this renderer. */
function Slider({ className, value, onChange, ...props }: SliderProps) {
  return (
    <input
      {...props}
      type="range"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className={cn("hh-inference-slider", className)}
    />
  );
}

export { DEFAULT_PARAMETERS };
