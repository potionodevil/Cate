/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { existsSync } from "fs";
import { join } from "path";
import os from "os";

let cached: string | null = null;

/** Resolves the `hermes` CLI to an absolute, directly-executable path when
 * possible, instead of a bare "hermes" name.
 *
 * Why: Electron's main process does not always inherit the same PATH a
 * terminal shell has. The Hermes installer adds its bin dir to the user
 * PATH via the registry, but a GUI app launched from Explorer / a desktop
 * shortcut can start with an environment block that was cached before that
 * PATH update (no logoff/logon happened since install). That produced
 * "spawn hermes ENOENT" from this app even though `hermes` works fine from
 * any terminal opened after the PATH change. Preferring the .exe over the
 * .cmd shim in the same bin dir also sidesteps Node's requirement that
 * .cmd/.bat files need `shell: true` to execute at all (see hermesNeedsShell). */
export function resolveHermesCommand(): string {
  if (cached) return cached;
  const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local");
  const candidates =
    process.platform === "win32"
      ? [
          join(localAppData, "hermes", "bin", "hermes.exe"),
          join(localAppData, "hermes", "hermes-agent", ".hermes", "bin", "hermes.exe"),
          join(localAppData, "hermes", "bin", "hermes.cmd")
        ]
      : [join(os.homedir(), ".local", "bin", "hermes"), "/usr/local/bin/hermes", "/opt/homebrew/bin/hermes"];
  for (const c of candidates) {
    if (existsSync(c)) {
      cached = c;
      return c;
    }
  }
  // Nothing found at the known install locations -- fall back to a bare
  // PATH lookup (still works if the environment is actually current).
  cached = "hermes";
  return cached;
}

/** True if `cmd` needs Node's `shell: true` to execute on this platform:
 * a bare PATH lookup and Windows .cmd/.bat shims both require it (Node's
 * child_process refuses to exec .bat/.cmd directly even given a full path). */
export function hermesNeedsShell(cmd: string): boolean {
  return process.platform === "win32" && (cmd === "hermes" || /\.(cmd|bat)$/i.test(cmd));
}
