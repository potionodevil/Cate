/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import * as React from "react";
import { Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconCheck } from "./icons";
import { THEME_OPTIONS, type ThemeName } from "./themes";

/** Header popover (top-right, next to the window controls) for quick theme
 * switching — moved out of the deeply-nested Settings dialog since picking
 * a color scheme is a frequent, lightweight action that deserves a
 * one-click surface, not three clicks into a modal. */
export function HeaderThemePopover({
  theme,
  onThemeChange
}: {
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function chooseTheme(next: ThemeName) {
    if (next === theme || saving) return;
    setSaving(true);
    try {
      await window.harness.setTheme(next as "nous" | "obsidian" | "slate" | "daylight");
      onThemeChange(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hh-window-control"
          title="Theme wählen"
          aria-label="Theme wählen"
        >
          <Palette size={15} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="hh-header-popover w-[232px] p-3">
        <div className="hh-section-header" style={{ marginBottom: "var(--space-2)" }}>
          Theme
        </div>
        <div className="flex flex-col gap-1">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`hh-theme-row${theme === opt.id ? " active" : ""}`}
              disabled={saving}
              onClick={() => chooseTheme(opt.id)}
            >
              <span className="hh-theme-swatch-dot" style={{ background: opt.swatch }} aria-hidden />
              <span className="hh-theme-row-label">{opt.label}</span>
              {theme === opt.id && (
                <span className="hh-theme-check" aria-hidden>
                  <IconCheck size={11} />
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
