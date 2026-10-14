/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { spawn } from "child_process";
import type { AppState } from "./projectStore";
import { DEFAULT_LOCAL_ENDPOINT } from "./agentConfig";
import { resolveHermesCommand } from "./resolveHermes";

/** Meta-prompt: rewrites a rough user prompt into an agent-ready brief using
 * the CO-STAR framework plus a mixture-of-experts style task split. */
export function buildImproverPrompt(raw: string): string {
  return `Du bist ein Prompt-Engineer für KI-Coding-Agents. Überarbeite den folgenden Roh-Prompt zu einem perfekten Agent-Prompt.

Regeln:
1. Strukturiere nach CO-STAR: Context, Objective, Style, Tone, Audience, Response (nur Abschnitte, die für die Aufgabe relevant sind; kurze Überschriften).
2. Mixture-of-Experts: Zerlege die Aufgabe in unabhängige Teilaufgaben. Entscheide selbst, wie viele Sub-Agents sinnvoll sind (1 = keine Aufteilung, bei kleinen Aufgaben). Für jeden Sub-Agent: Rolle/Expertise, konkrete Teilaufgabe, erwartetes Ergebnis. Schließe mit einem Schritt, der die Ergebnisse zusammenführt und prüft.
3. Füge überprüfbare Akzeptanzkriterien hinzu und nenne Randbedingungen. Erfinde keine Fakten, Dateinamen oder Anforderungen, die nicht im Roh-Prompt stehen oder offensichtlich daraus folgen; Unklares als "Annahme:" kennzeichnen.
4. Behalte die Sprache des Roh-Prompts bei.
5. Antworte AUSSCHLIESSLICH mit dem fertigen Prompt, ohne Einleitung, Erklärung oder Code-Zaun.

Roh-Prompt:
"""
${raw}
"""`;
}

/** Spawns a command, feeds `stdin`, resolves with trimmed stdout. */
function runCli(command: string, args: string[], stdin: string | null, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // shell:true so npm-installed .cmd shims resolve on Windows; the prompt
    // goes through stdin / a fixed arg list, never through shell-parsed text.
    const child = spawn(command, args, { shell: process.platform === "win32", windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Zeitüberschreitung beim Verbessern des Prompts."));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d.toString("utf-8")));
    child.stderr.on("data", (d) => (err += d.toString("utf-8")));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(err.trim().slice(0, 300) || `Agent beendete sich mit Code ${code}`));
    });
    if (stdin !== null) child.stdin.end(stdin, "utf-8");
    else child.stdin.end();
  });
}

function stripFence(text: string): string {
  const m = text.match(/^```[a-z]*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : text).trim();
}

/** Improves `raw` with the local model if configured, otherwise with the CLI
 * of the pane's agent running headless. */
export async function improvePrompt(
  raw: string,
  presetId: string,
  state: AppState
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const text = raw.trim();
  if (!text) return { ok: false, message: "Kein Text markiert." };
  const prompt = buildImproverPrompt(text);
  try {
    const local = state.localModel;
    if (local?.enabled && local.model.trim()) {
      const base = (local.endpoint || DEFAULT_LOCAL_ENDPOINT).replace(/\/+$/, "");
      const res = await fetch(`${base}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: local.model, prompt, stream: false }),
        signal: AbortSignal.timeout(120_000)
      });
      if (!res.ok) return { ok: false, message: `Lokales Modell: HTTP ${res.status}` };
      const json = (await res.json()) as { response?: string };
      return { ok: true, text: stripFence(json.response ?? "") };
    }
    let out: string;
    switch (presetId) {
      case "claude-code":
        out = await runCli("claude", ["-p"], prompt, 120_000);
        break;
      case "codex":
        out = await runCli("codex", ["exec", "-"], prompt, 120_000);
        break;
      case "opencode":
        out = await runCli("opencode", ["run"], prompt, 120_000);
        break;
      default:
        out = await runCli(resolveHermesCommand(), ["chat", "-q", prompt], null, 120_000);
    }
    return { ok: true, text: stripFence(out) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
