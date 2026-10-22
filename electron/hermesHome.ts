/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { join } from "path";
import os from "os";

/** Wo Hermes seine Daten ablegt — plattformgerecht.
 *
 * Die Windows-Installation nutzt %LOCALAPPDATA%\hermes (Registry-PATH des
 * Installers), Linux und macOS ~/.hermes. Ein gesetztes LOCALAPPDATA gewinnt
 * immer, damit Tests und portable Installationen den Ort vorgeben können.
 * Vorher steckte diese Regel verstreut in fünf Modulen, die überall
 * "AppData/Local" angenommen haben — auf Linux ein nicht existierender Pfad. */
export function hermesHomeDir(): string {
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) return join(localAppData, "hermes");
  return process.platform === "win32"
    ? join(os.homedir(), "AppData", "Local", "hermes")
    : join(os.homedir(), ".hermes");
}

/** Ordner eines Hermes-Profils (so wie ihn `hermes profile create` anlegt). */
export function hermesProfileDir(name: string): string {
  return join(hermesHomeDir(), "profiles", name);
}
