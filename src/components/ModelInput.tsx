/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** Model picker input: free-text entry with a themed, scrollable suggestion
 * dropdown (shadcn Popover + ScrollArea). Replaces the native <datalist>:
 * its dropdown renders as an OS-styled white list that ignores the app
 * theme and cannot scroll long model lists. Typing still works exactly as
 * before; the popover only ADDS the pickable list (open on focus,
 * live-filtered).
 *
 * Radix dismissal contract (verified against react-popover/dist +
 * react-dismissable-layer/dist): with `PopoverAnchor` the built-in
 * trigger-protection in PopoverContentNonModal is dead — triggerRef is only
 * composed by PopoverTrigger, so any pointerdown ON the anchored input
 * would dismiss the freshly-opened list. The wrapper div around the input
 * is both the Popper anchor AND the protected zone: pointerdown/focus
 * inside it calls preventDefault on the outside-events, clicks elsewhere
 * and Escape keep working (document-level handlers). */
export function ModelInput({
  value,
  onChange,
  groups,
  placeholder,
  disabled,
  id
}: {
  value: string;
  onChange: (v: string) => void;
  groups: { provider: string; models: string[] }[];
  placeholder: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Wrapper um das Input: dient als Popper-Anchor UND als Schutzone,
  // damit Interaktionen auf/näch am Input das Popover nicht dismissen.
  const anchorWrapRef = useRef<HTMLDivElement>(null);

  const isInsideAnchor = (target: EventTarget | null): boolean =>
    target instanceof Node && !!anchorWrapRef.current?.contains(target);

  const options = useMemo(() => {
    const q = value.trim().toLowerCase();
    return groups
      .map((g) => ({ provider: g.provider, models: Array.from(new Set(g.models)).filter((m) => !q || m.toLowerCase().includes(q)) }))
      .filter((g) => g.models.length > 0);
  }, [groups, value]);

  const total = options.reduce((n, g) => n + g.models.length, 0);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) inputRef.current?.focus();
      }}
    >
      <PopoverAnchor asChild>
        <div ref={anchorWrapRef} className="w-full">
          <Input
            ref={inputRef}
            id={id}
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            disabled={disabled}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
          />
        </div>
      </PopoverAnchor>
      {total > 0 && (
        <PopoverContent
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="w-[var(--radix-popover-trigger-width)] p-0"
          onWheel={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDownOutside={(e) => {
            if (isInsideAnchor(e.detail.originalEvent.target)) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (isInsideAnchor(e.detail.originalEvent.target)) e.preventDefault();
          }}
          onFocusOutside={(e) => {
            if (isInsideAnchor(e.target)) e.preventDefault();
          }}
        >
          <ScrollArea className="w-full max-h-56 [&>[data-radix-scroll-area-viewport]]:max-h-56">
            <div className="py-1">
              {options.map((g) => (
                <div key={g.provider}>
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{g.provider}</div>
                  {g.models.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={cn(
                        "flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)]",
                        m === value && "bg-[var(--accent-dim)] text-[var(--accent-hover)]"
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onChange(m);
                        setOpen(false);
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      )}
    </Popover>
  );
}
