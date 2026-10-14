/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type AttachResult = { ok: true; paths: string[]; text?: string } | { ok: false; message: string };

/** Setzt Pfade in Anführungszeichen, sobald sie Leerzeichen enthalten, damit der Agent sie als einen Pfad liest. */
function quote(path: string): string {
  return /\s/.test(path) ? `"${path}"` : path;
}

/** Schreibt Anhänge als eingefügten Text (Bracketed Paste) in die Eingabe des Agenten, ohne Enter: Claude Code, Hermes & Co.
 * erkennen Bild- und Dateipfade darin und nehmen sie als Kontext; du kannst die Nachricht davor noch ergänzen. */
export function insertAttachment(paneId: string, result: AttachResult): string | null {
  if (!result.ok) return result.message;
  const body = [result.paths.map(quote).join(" "), result.text ?? ""].filter(Boolean).join(" ");
  if (!body) return null;
  window.harness.writeSessionPane(paneId, `\u001b[200~${body} \u001b[201~`);
  return null;
}

/** Macht aus abgelegten oder eingefügten Dateien Pfade: echte Dateien behalten ihren Pfad, alles ohne Pfad
 * (z. B. ein Bild aus dem Browser oder ein Screenshot) wird erst gespeichert. */
export async function filesToResult(files: File[]): Promise<AttachResult> {
  const paths: string[] = [];
  for (const file of files) {
    const direct = window.harness.pathForFile(file);
    if (direct) { paths.push(direct); continue; }
    const saved = await window.harness.attachSaveBytes(file.name || (file.type.startsWith("image/") ? "bild.png" : "anhang"), new Uint8Array(await file.arrayBuffer()));
    if (!saved.ok) return saved;
    paths.push(...saved.paths);
  }
  return { ok: true, paths };
}

/** Büroklammer im Kopf eines Terminals: ein Klick öffnet die Ablage, in die man Bilder oder Dateien zieht, einfügt (Strg+V)
 * oder auswählt. Alles landet als Pfad in der Eingabe dieses Agenten und steht ihm damit als Kontext zur Verfügung. */
export function AttachButton({ paneId, disabled }: { paneId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(result: AttachResult | Promise<AttachResult>) {
    const err = insertAttachment(paneId, await result);
    setError(err);
    if (!err) setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); setError(null); }}>
      <PopoverTrigger asChild>
        <button type="button" className="hh-attach-btn" disabled={disabled} title="Bild oder Datei anhängen" aria-label="Bild oder Datei als Kontext anhängen">
          <svg width="14" height="14" viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
            <path d="M2 0h3v1h1v4H5V1H2v5h2V2h1v4H4v1H2V6H1V1h1z" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="hh-attach-pop w-[280px] p-3">
        <div
          className="hh-attach-drop"
          data-over={over || undefined}
          tabIndex={0}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void finish(filesToResult([...e.dataTransfer.files])); }}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            e.preventDefault();
            void finish(files.length ? filesToResult(files) : window.harness.attachFromClipboard());
          }}
        >
          <svg width="28" height="28" viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
            <path fillRule="evenodd" d="M0 1h7v5H0zM1 2v3h5V2z" />
            <path d="M2 4h1V3h1v1h1v1H2z" />
          </svg>
          <span>Bild oder Datei hierher ziehen</span>
          <span className="hh-attach-hint">oder Strg+V</span>
        </div>
        <div className="hh-attach-actions">
          <button type="button" onClick={() => void finish(window.harness.attachFromClipboard())}>Aus Zwischenablage</button>
          <button type="button" onClick={() => void finish(window.harness.attachPickFiles())}>Datei wählen …</button>
        </div>
        {error && <p className="hh-attach-error" role="alert">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
