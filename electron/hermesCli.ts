/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { join } from "path";
import os from "os";
import { resolveHermesCommand, hermesNeedsShell } from "./resolveHermes";

const execFileAsync = promisify(execFile);

/** Runs `hermes <args>`, resolved to an absolute executable path when
 * possible (see resolveHermes.ts for why that matters on Windows).
 * Exported so other CLI-wrapper modules (hermesUsage.ts, agentDetection.ts)
 * reuse the same resolution instead of re-deriving it. */
export function runHermes(args: string[], timeout: number) {
  const cmd = resolveHermesCommand();
  return execFileAsync(cmd, args, { timeout, shell: hermesNeedsShell(cmd) });
}

/** Thin wrapper around the `hermes` CLI for profile management.
 * Never hand-edits config.yaml — always shells out to `hermes config set`
 * or `hermes profile *`, per the hard invariant in the hermes-agent skill. */
export async function hermesProfileCreate(name: string): Promise<{ ok: boolean; message: string }> {
  return createOrAdoptProfile(name);
}

/** Creates the Hermes profile for a project — or, when a stale/orphaned
 * profile with that name is ALREADY present, verifies it is usable and
 * adopts it instead of failing.
 *
 * Why: the app derives the profile name from the project name ("Pulsar" ->
 * "hh-pulsar"), so deleting the app-side project row while the Hermes-side
 * profile survived (delete flow failed, state file hand-edited, crash, ...)
 * makes every retry of "Neues Projekt" fail with "profile already exists"
 * — even though a perfectly good profile is sitting right there. The user
 * reported exactly this as a persistent bug they could not get rid of.
 * Creating something then deleting it from the app does NOT reliably clear
 * the Hermes side, so a hard create-or-die here bricks project creation.
 *
 * Adoption checks: the profile directory must exist (a bare `hermes profile
 * list` hit alone could be an alias/target miss). Telemetry is pre-answered
 * for adopted profiles too, so the first pane never hangs on the prompt. */
async function createOrAdoptProfile(name: string): Promise<{ ok: boolean; message: string }> {
  const create = await runHermes(["profile", "create", name], 30_000)
    .then(() => ({ ok: true as const, message: `Profil ${name} angelegt.` }))
    .catch((err: unknown): { ok: boolean; message: string } => {
      // promisified execFile rejects with the terse "Command failed: <cmd>"
      // message while the CLI's actual reason (e.g. "A profile named 'x'
      // already exists") arrives on STDOUT even on failure (hermes prints
      // its errors to stdout). Surface stdout/stderr, or the UI shows a
      // reason-less failure and the real problem is invisible.
      const e = err as { message?: string; stdout?: string | Buffer; stderr?: string | Buffer };
      const message = [
        e?.message ?? String(err),
        e?.stdout?.toString().trim(),
        e?.stderr?.toString().trim()
      ]
        .filter(Boolean)
        .join("\n");
      return { ok: false, message };
    });
  if (create.ok) return create;

  const conflict = /already exists/i.test(create.message);
  if (!conflict) return create;

  // Confirm the profile actually exists on disk before adopting it.
  const probe = await runHermes(["profile", "list"], 15_000)
    .then((r) => r.stdout)
    .catch(() => "");
  const row = probe
    .split("\n")
    .map((l) => l.trim())
    .find((l) => new RegExp(`(^|\\s)${escapeRegExp(name)}(\\s|$)`).test(l));
  if (!row) return create;
  const profileDir = join(process.env.LOCALAPPDATA ?? join(os.homedir(), "AppData", "Local"), "hermes", "profiles", name);
  if (!existsSync(profileDir)) return create;

  // Re-point telemetry prefs (a stale half-created profile may not have
  // them set), then adopt.
  await hermesDisableTelemetryPrompt(name);
  return { ok: true, message: `Vorhandenes Profil ${name} übernommen.` };
}

/** Escapes a string for literal use inside `new RegExp(...)`. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pre-answers the "help improve Hermes?" shared-metrics consent question
 * for a freshly created profile, via `hermes config set` (never hand-edits
 * config.yaml). A brand-new profile hasn't answered that question yet, so
 * the very first interactive `hermes` pane spawned under it sits there
 * waiting on a prompt the user never typed anything into a terminal to
 * see coming — pre-setting telemetry.shared_metrics up front means the
 * pane boots straight into a ready prompt instead. Opts the new profile
 * OUT by default (no data sharing) rather than silently opting it in;
 * never throws — a failure here just means the user sees the prompt once,
 * same as before this existed. */
export async function hermesDisableTelemetryPrompt(profile: string): Promise<void> {
  try {
    await runHermes(["config", "set", "telemetry.shared_metrics.enabled", "false", "--profile", profile], 15_000);
    await runHermes(["config", "set", "telemetry.shared_metrics.send", "false", "--profile", profile], 15_000);
  } catch {
    // best-effort only — see docstring
  }
}

export async function hermesProfileList(): Promise<string[]> {
  try {
    const { stdout } = await runHermes(["profile", "list"], 15_000);
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function hermesProfileDelete(name: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { stdout } = await runHermes(["profile", "delete", name, "--yes"], 30_000);
    return { ok: true, message: stdout.trim() };
  } catch (err: unknown) {
    // hermes prints errors to STDOUT even on failure; without this the UI
    // shows only the terse execFile "Command failed" line (same fix as in
    // createOrAdoptProfile).
    const e = err as { message?: string; stdout?: string | Buffer; stderr?: string | Buffer };
    const message = [e?.message ?? String(err), e?.stdout?.toString().trim(), e?.stderr?.toString().trim()]
      .filter(Boolean)
      .join("\n");
    return { ok: false, message };
  }
}

export interface AuthCredentialRow {
  provider: string;
  index: number;
  label: string;
  type: string;
}

/** Adds an api-key credential for `provider` under `profile`.
 * Never prompts interactively since --api-key is always passed. */
export async function hermesAuthAdd(
  profile: string,
  provider: string,
  apiKey: string,
  label?: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const args = ["auth", "add", provider, "--type", "api-key", "--api-key", apiKey, "--profile", profile];
    if (label) args.push("--label", label);
    const { stdout } = await runHermes(args, 30_000);
    return { ok: true, message: stdout.trim() };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

/** Lists credentials for `profile`, parsed into rows.
 * Output format (per `hermes auth list` --help / observed stdout):
 *   provider (N credentials):
 *     #1  label    type   id=... priority=... source ←
 * Parsing is defensive: unparseable lines are skipped, never thrown. */
export async function hermesAuthList(profile: string): Promise<{ ok: boolean; message: string; rows: AuthCredentialRow[] }> {
  try {
    const { stdout } = await runHermes(["auth", "list", "--profile", profile], 15_000);
    const rows: AuthCredentialRow[] = [];
    let currentProvider = "";
    for (const rawLine of stdout.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const providerHeader = line.match(/^([a-z0-9_-]+)\s*\(\d+ credentials?\):/i);
      if (providerHeader) {
        currentProvider = providerHeader[1];
        continue;
      }
      const entry = line.match(/^#(\d+)\s+(\S+)\s+(\S+)/);
      if (entry && currentProvider) {
        rows.push({
          provider: currentProvider,
          index: Number(entry[1]),
          label: entry[2],
          type: entry[3]
        });
      }
    }
    return { ok: true, message: stdout.trim(), rows };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message, rows: [] };
  }
}

export async function hermesAuthRemove(
  profile: string,
  provider: string,
  target: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const { stdout } = await runHermes(["auth", "remove", provider, target, "--profile", profile], 15_000);
    return { ok: true, message: stdout.trim() };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
