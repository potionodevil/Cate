/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/** Phase 3 groundwork: generic agent-CLI registry. A pane type is just a
 * preset name + spawn command — no CLI-specific logic required. */
import { resolveHermesCommand } from "./resolveHermes";

export interface AgentPreset {
  id: string;
  label: string;
  /** Executable to run, resolved against PATH. */
  command: string;
  /** Extra args appended after profile/model are applied. */
  args: string[];
  /** true if this preset understands --profile / -m flags like Hermes. */
  supportsHermesFlags: boolean;
}

export const BUILTIN_AGENT_PRESETS: AgentPreset[] = [
  { id: "shell", label: "Shell", command: "", args: [], supportsHermesFlags: false },
  { id: "hermes", label: "Hermes", command: resolveHermesCommand(), args: [], supportsHermesFlags: true },
  { id: "claude-code", label: "Claude Code", command: "claude", args: [], supportsHermesFlags: false },
  { id: "codex", label: "Codex CLI", command: "codex", args: [], supportsHermesFlags: false },
  { id: "opencode", label: "OpenCode", command: "opencode", args: [], supportsHermesFlags: false }
];

/** Default preset used when a new session doesn't specify one explicitly.
 * 'hermes' instead of 'shell': the user asked for sessions to START IN
 * HERMES immediately (a live agent prompt, not an idle empty shell). */
export const DEFAULT_PRESET_ID = "hermes";

export function buildSpawnArgs(
  preset: AgentPreset,
  opts: { profile?: string; model?: string; seedQuery?: string }
): { command: string; args: string[] } {
  if (preset.id === "shell") {
    return { command: "", args: [] };
  }
  const args = [...preset.args];
  if (preset.supportsHermesFlags) {
    //hermes chat -q "<text>": auf einem echten TTY (node-pty) seedet die Query
    // die interaktive TUI als erste Turn (CLI-Doku: "submitted literally as the
    // first turn"). Die Anfangsnachricht wird damit wirklich abgeschickt, statt
    // als ungesendeter Text im TUI-Eingabefeld zu liegen (das alte writePane+\n
    // nach fixem Timeout kam unzuverlaessig an und blieb ungesendet).
    if (opts.seedQuery) args.push("chat", "-q", opts.seedQuery);
    if (opts.profile) args.push("--profile", opts.profile);
    if (opts.model) args.push("-m", opts.model);
  }
  return { command: preset.command, args };
}
