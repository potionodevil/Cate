/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { app, clipboard, dialog, type BrowserWindow } from "electron";
import { mkdirSync, writeFileSync } from "fs";
import { basename, extname, join } from "path";

export type AttachResult = { ok: true; paths: string[]; text?: string } | { ok: false; message: string };

/** Ablage für angehängte Bilder und Dateien, nach Tag sortiert, damit der Ordner nicht ins Unendliche wächst. */
function attachmentDir(): string {
  const dir = join(app.getPath("userData"), "attachments", new Date().toISOString().slice(0, 10));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Zeitstempel für Dateinamen, der unter Windows erlaubt ist. */
function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Holt, was gerade in der Zwischenablage liegt, als Anhang für den Agenten: ein Bild wird als PNG gespeichert und
 * sein Pfad zurückgegeben, eine im Explorer kopierte Datei liefert ihren Pfad, reiner Text kommt als Text zurück. */
export function attachFromClipboard(): AttachResult {
  const image = clipboard.readImage();
  if (!image.isEmpty()) {
    const path = join(attachmentDir(), `bild-${stamp()}.png`);
    writeFileSync(path, image.toPNG());
    return { ok: true, paths: [path] };
  }
  // Im Explorer kopierte Datei: Windows legt den Pfad als UTF-16 unter „FileNameW“ ab.
  const raw = clipboard.readBuffer("FileNameW");
  if (raw.length > 0) {
    const path = raw.toString("utf16le").replace(/\0+$/, "");
    if (path) return { ok: true, paths: [path] };
  }
  const text = clipboard.readText();
  if (text.trim()) return { ok: true, paths: [], text };
  return { ok: false, message: "Die Zwischenablage ist leer." };
}

/** Öffnet die Dateiauswahl (beliebige Dateien, mehrere erlaubt) und gibt die gewählten Pfade zurück. */
export async function attachPickFiles(win: BrowserWindow): Promise<AttachResult> {
  const picked = await dialog.showOpenDialog(win, { title: "Datei oder Bild anhängen", properties: ["openFile", "multiSelections"] });
  if (picked.canceled) return { ok: true, paths: [] };
  return { ok: true, paths: picked.filePaths };
}

/** Speichert eine abgelegte Datei ohne eigenen Pfad (z. B. ein Bild, das aus dem Browser gezogen wurde) und gibt den neuen Pfad zurück. */
export function attachSaveBytes(name: string, data: Uint8Array): AttachResult {
  if (data.byteLength > 50 * 1024 * 1024) return { ok: false, message: "Die Datei ist größer als 50 MB." };
  const safe = basename(name || "anhang").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "anhang";
  const ext = extname(safe);
  const path = join(attachmentDir(), `${safe.slice(0, safe.length - ext.length).slice(0, 60)}-${stamp()}${ext || ".bin"}`);
  writeFileSync(path, Buffer.from(data));
  return { ok: true, paths: [path] };
}
