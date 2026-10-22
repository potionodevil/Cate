/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import os from "os";

/** Desktop-Datei, über die sich Cate beim Login starten lässt. */
const DESKTOP_FILE = "cate.desktop";

/** Pfad zur Autostart-Desktop-Datei (freedesktop-Standard, den GNOME, KDE & Co. alle lesen). */
function desktopFilePath(): string {
  return join(os.homedir(), ".config", "autostart", DESKTOP_FILE);
}

/** Schaltet „Beim Login starten“ unter Linux an oder aus.
 *
 * Electron kann das hier nicht selbst (setLoginItemSettings ist Windows/macOS
 * vorbehalten), also schreiben wir die Autostart-Desktop-Datei von Hand.
 * Bei AppImages zeigt `process.execPath` ins temporäre Mount-Verzeichnis, das
 * nach dem Beenden weg ist — deshalb greift dann das APPIMAGE-Image selbst. */
export function setLinuxAutoStart(on: boolean): void {
  const target = desktopFilePath();
  if (!on) {
    if (existsSync(target)) unlinkSync(target);
    return;
  }
  mkdirSync(join(os.homedir(), ".config", "autostart"), { recursive: true });
  const exe = process.env.APPIMAGE || process.execPath;
  writeFileSync(
    target,
    [
      "[Desktop Entry]",
      "Type=Application",
      "Name=Cate",
      "Comment=Multi-Terminal Harness mit Hermes-Integration",
      `Exec="${exe}" --hidden`,
      "Terminal=false",
      "Categories=Development;",
      "X-GNOME-Autostart-enabled=true",
      ""
    ].join("\n"),
    "utf-8"
  );
}
