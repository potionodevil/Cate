/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { clipboard, dialog, type BrowserWindow } from "electron";
import { readFile } from "fs/promises";
import { extname, basename } from "path";
import type { ContextPayload, ContextResult } from "./contextCore";
import { makeContextPayload } from "./contextCore";

const ALLOWED_EXTENSIONS = new Set([".rs", ".cpp", ".txt", ".md"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 32;
const MAX_CLIPBOARD_CHARS = 2 * 1024 * 1024;

function failure(code: string, message: string): ContextResult<never> {
  return { ok: false, error: { code, message } };
}

async function readPath(filePath: string): Promise<ContextResult<ContextPayload>> {
  const extension = extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) return failure("UNSUPPORTED_FILE", `Unsupported context file type: ${extension || "unknown"}.`);
  try {
    const data = await readFile(filePath);
    if (data.byteLength > MAX_FILE_BYTES) return failure("FILE_TOO_LARGE", `Context files are limited to ${MAX_FILE_BYTES} bytes.`);
    return { ok: true, value: makeContextPayload("file", data.toString("utf8"), { source: basename(filePath), path: filePath, extension }) };
  } catch (err) {
    return failure("READ_FAILED", err instanceof Error ? err.message : "Could not read context file.");
  }
}

export async function pickContextFiles(window: BrowserWindow): Promise<ContextResult<ContextPayload[]>> {
  const picked = await dialog.showOpenDialog(window, {
    title: "Pick context files",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Context files", extensions: ["rs", "cpp", "txt", "md"] }]
  });
  if (picked.canceled) return { ok: true, value: [] };
  if (picked.filePaths.length > MAX_FILES) return failure("TOO_MANY_FILES", `Select no more than ${MAX_FILES} files.`);
  const results = await Promise.all(picked.filePaths.map(readPath));
  const failed = results.find((result) => !result.ok);
  if (failed && !failed.ok) return failed;
  return { ok: true, value: results.flatMap((result) => result.ok ? [result.value] : []) };
}

export function readClipboardContext(): ContextResult<ContextPayload> {
  try {
    const raw = clipboard.readText();
    if (!raw.trim()) return failure("EMPTY_CLIPBOARD", "The clipboard does not contain text.");
    if (raw.length > MAX_CLIPBOARD_CHARS) return failure("CLIPBOARD_TOO_LARGE", `Clipboard context is limited to ${MAX_CLIPBOARD_CHARS} characters.`);
    return { ok: true, value: makeContextPayload("clipboard", raw, { source: "clipboard" }) };
  } catch (err) {
    return failure("CLIPBOARD_READ_FAILED", err instanceof Error ? err.message : "Could not read clipboard text.");
  }
}
