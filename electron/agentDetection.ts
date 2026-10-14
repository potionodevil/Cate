/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { existsSync } from "fs";
import { execFile } from "child_process";
import { BUILTIN_AGENT_PRESETS } from "./agentPresets";
import { resolveHermesCommand } from "./resolveHermes";

/** Probes whether `cmd` resolves to a runnable executable on PATH.
 *
 * Windows has no universal `which`, so we shell out to `where <cmd>`
 * (needs shell:true since `where` is a cmd.exe builtin, not an exe on
 * PATH itself); POSIX uses `command -v <cmd>` for the same reason.
 * This never throws: a probe failure (ENOENT, non-zero exit, timeout)
 * just means "not installed", not a crash — detection results are a
 * best-effort hint for the UI, never a hard gate on spawning. */
function probeOnPath(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const probeCmd = isWin ? "where" : "command";
    const probeArgs = isWin ? [cmd] : ["-v", cmd];
    try {
      execFile(probeCmd, probeArgs, { shell: true, timeout: 1500, windowsHide: true }, (err) => {
        resolve(!err);
      });
    } catch {
      resolve(false);
    }
  });
}

/** Is `preset.command` actually runnable on this machine right now?
 * Special-cased for hermes: resolveHermesCommand() may already have found
 * an absolute path at a known install location (see resolveHermes.ts) —
 * trust that directly via existsSync instead of re-probing PATH, and only
 * fall back to a PATH probe when it degraded to the bare "hermes" name. */
async function isPresetInstalled(presetId: string, command: string): Promise<boolean> {
  if (presetId === "hermes") {
    const resolved = resolveHermesCommand();
    if (resolved !== "hermes") return existsSync(resolved);
    return probeOnPath("hermes");
  }
  if (!command) return true; // shell-style presets with no external command
  return probeOnPath(command);
}

export interface DetectedAgent {
  id: string;
  label: string;
  installed: boolean;
}

/** Detects, in parallel, which of the BUILTIN_AGENT_PRESETS (besides the
 * always-available "shell") have their CLI actually installed on this
 * machine — used by the "new agent" popover so it never claims a tool is
 * available without a real probe. Resolves well under 2s typically since
 * every probe runs concurrently with its own 1.5s timeout. */
export async function detectInstalledAgents(): Promise<DetectedAgent[]> {
  const presets = BUILTIN_AGENT_PRESETS.filter((p) => p.id !== "shell");
  const results = await Promise.all(
    presets.map(async (p) => ({
      id: p.id,
      label: p.label,
      installed: await isPresetInstalled(p.id, p.command)
    }))
  );
  return results;
}
