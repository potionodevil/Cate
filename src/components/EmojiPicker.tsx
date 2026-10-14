/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** Emoji-Picker für das Projekt-Icon-Feld. Kuratierte Auswahl (kein OS-Panel
 * nötig), kategorisiert, live-filterbar. Das Icon-Feld im Projektformular ist
 * die EINE explizit erlaubte Emoji-Ausnahme: user-facing Feature-Content für
 * ein Feature, das den User selbst ein Emoji wählen lässt — keine UI-Chrome-
 * Dekoration. Der Button-Trigger selbst nutzt ein SVG-Icon, kein Emoji. */

const CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Objekte",
    emojis: [
      "🚀","🛰️","🧭","⚙️","🧲","🧪","💡","🔋","📦","🧰","🛠️","🔧","📎","📁","🗂️","📌","🔒","🔑","🖥️","💾","📡"
    ]
  },
  {
    label: "Natur",
    emojis: [
      "🌊","🔥","⚡","🌱","🌴","🌙","⭐","☀️","❄️","🌈","🪐","🌍","🏔️","🌪️","🍁","🌵","🍄","🪨","💧","🌺"
    ]
  },
  {
    label: "Tiere",
    emojis: [
      "🐝","🐙","🦊","🐺","🦅","🦈","🐊","🦎","🐍","🦌","🐝","🦋","🐞","🐢","🐬","🐳","🦂","🕷️","🦉","🐆"
    ]
  },
  {
    label: "Symbole",
    emojis: [
      "∞","⌀","🔧","📌","🎯","🧩","🔁","🔄","📈","📉","💥","✳️","⭕","🔷","🔶","⬛","⬜","🔺","🔻","💠"
    ]
  },
  {
    label: "Status",
    emojis: [
      "✅","❌","⚠️","❓","❗","🚩","🏁","🚧","🔴","🟠","🟡","🟢","🔵","🟣","🟤","⚫","⚪","🟦","🟧","🟨"
    ]
  }
];

export function EmojiPickerButton({
  onPick,
  className,
  size = 28
}: {
  onPick: (emoji: string) => void;
  className?: string;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return CATEGORIES;
    return CATEGORIES.map((c) => ({ ...c, emojis: c.emojis.filter((e) => e.includes(query.trim())) })).filter((c) => c.emojis.length > 0);
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("hh-icon-btn shrink-0", className)}
          style={{ width: size, height: size }}
          title="Icon auswählen"
          aria-label="Icon auswählen"
        >
          {/* smiles-24 / icon-collage: simple SVG, kein Emoji im Trigger */}
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10" cy="10" r="7" />
            <path d="M7 12.2c.9 1 2 1.5 3 1.5s2.1-.5 3-1.5" />
            <circle cx="7.2" cy="8" r="0.6" fill="currentColor" stroke="none" />
            <circle cx="12.8" cy="8" r="0.6" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[260px] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center gap-2 border-b px-3 py-2 border-[var(--border)]">
          <input
            placeholder="Emoji suchen..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="hh-input text-xs"
            aria-label="Emoji suchen"
          />
        </div>
        <ScrollArea className="w-full max-h-64 [&>[data-radix-scroll-area-viewport]]:max-h-64">
          <div className="py-2">
            {filtered.map((cat) => (
              <div key={cat.label}>
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{cat.label}</div>
                <div className="grid grid-cols-8 gap-1 px-2">
                  {cat.emojis.map((e, i) => (
                    <button
                      key={`${e}-${i}`}
                      type="button"
                      className="rounded-sm h-7 w-7 flex items-center justify-center text-base hover:bg-[var(--bg-hover)]"
                      onClick={() => {
                        onPick(e);
                        setOpen(false);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="text-xs hh-faint px-3 py-2">Kein Emoji gefunden.</div>}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
