/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */

/**
 * Agent-spezifische Integration: Loop-Verhalten je Agent und die Slash-Befehle
 * /agentloop, /validate und /cate in den Konfigurationsordnern der Agents
 * (Claude Code, Codex, OpenCode, Hermes-Skills). Nichts davon passiert ohne
 * ausdrücklichen Klick in den Einstellungen; eigene Dateien des Nutzers werden
 * nie überschrieben (nur Dateien mit unserer Markierung).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

/** Markierung in jeder von Cate geschriebenen Datei. */
export const MANAGED_MARKER = "cate-managed:v1";

export interface LoopProfile {
  /** false = Loop sinnlos (z. B. Shell: das Ziel würde als Befehl ausgeführt). */
  supported: boolean;
  /** Ruhezeit ohne Ausgabe, ab der ein Schritt als beendet gilt. */
  quietMs: number;
  /** Fallback, falls nach dem Senden nie Ausgabe kam. */
  maxWaitMs: number;
  reason?: string;
}

/** TUIs mit Spinner/Streaming schreiben ständig; Hermes denkt auch länger still. */
const LOOP_PROFILES: Record<string, LoopProfile> = {
  hermes: { supported: true, quietMs: 10_000, maxWaitMs: 120_000 },
  "claude-code": { supported: true, quietMs: 8_000, maxWaitMs: 120_000 },
  codex: { supported: true, quietMs: 10_000, maxWaitMs: 120_000 },
  opencode: { supported: true, quietMs: 10_000, maxWaitMs: 120_000 },
  shell: { supported: false, quietMs: 0, maxWaitMs: 0, reason: "Eine Shell ist kein Agent: das Ziel würde als Befehl ausgeführt. Starte den Loop in einer Agent-Session." }
};

export function loopProfileFor(presetId: string | undefined): LoopProfile {
  return LOOP_PROFILES[presetId ?? ""] ?? { supported: true, quietMs: 10_000, maxWaitMs: 120_000 };
}

export type AgentKind = "claude-code" | "codex" | "opencode" | "hermes";
export const INTEGRATION_AGENTS: { id: AgentKind; label: string }[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex CLI" },
  { id: "opencode", label: "OpenCode" },
  { id: "hermes", label: "Hermes" }
];

interface CommandSpec {
  name: string;
  description: string;
  /** Hermes-Skill-Beschreibung, höchstens 60 Zeichen. */
  skillDescription: string;
  argHint: string;
  body: string;
}

const ENV_NOTE = "In einer Cate-Session sind $HH_SCRIPTS_DIR, $HH_SPAWN_QUEUE, $HH_PROJECT_ID und $HH_SESSION_ID gesetzt. Ist $HH_SPAWN_QUEUE leer, läuft der Agent nicht in Cate.";

const SPECS: CommandSpec[] = [
  {
    name: "agentloop",
    description: "Ziel in geprüften Durchläufen abarbeiten (Cate-Loop).",
    skillDescription: "/agentloop: iterate on a goal with checks until done.",
    argHint: "<Ziel> [max=N] [check=<Befehl>]",
    body: [
      "Arbeite das folgende Ziel in begrenzten Durchläufen ab: {{ARGS}}",
      "",
      ENV_NOTE,
      "",
      "1. Ist das Ziel unklar (nur wenige Wörter, kein erkennbarer Endzustand), kein Prüfbefehl genannt oder max über 20, stelle zuerst kurze Rückfragen (höchstens 3): Was muss am Ende gelten? Welcher Befehl beweist es (z. B. npm run test, npm run typecheck, npm run build, oder keiner)? Frage nichts, was schon dasteht.",
      "2. Läuft der Agent in Cate (`echo $HH_SPAWN_QUEUE` nicht leer): starte Cates eigenen Loop mit `node \"$HH_SCRIPTS_DIR/hh-loop.cjs\" start [--session <Name>] [--max N] [--check \"<Befehl>\"] \"<Ziel>\"`. Ohne --session läuft er in dieser Session: beende vorher deine Antwort. `node \"$HH_SCRIPTS_DIR/hh-loop.cjs\" list` zeigt den Stand, `stop` beendet ihn. Fertig, wenn `list` den Loop zeigt.",
      "3. Sonst (kein Cate): arbeite selbst in höchstens N Durchläufen (Standard 5, Grenze 20). Pro Durchlauf: kleinste Änderung zum Ziel, Prüfbefehl ausführen, Ergebnis notieren. Stopp bei Erfolg, beim Limit, oder wenn derselbe Fehler zweimal ohne neue Idee wiederkehrt.",
      "4. Prüfung nie aufweichen, nichts committen oder pushen, wenn nicht verlangt. Abschlussbericht: Durchläufe, Erfolg ja/nein, geänderte Dateien, offene Lücken."
    ].join("\n")
  },
  {
    name: "validate",
    description: "Projekt prüfen: Typecheck, Build und Tests mit echten Ergebnissen.",
    skillDescription: "/validate: typecheck, build and test a project.",
    argHint: "[Bereich]",
    body: [
      "Prüfe das Projekt und melde echte Ergebnisse. Bereich/Hinweis: {{ARGS}}",
      "",
      "1. `git status --short`: geänderte Dateien notieren.",
      "2. Prüfbefehle aus package.json (oder Makefile/pyproject) wählen: Typecheck, Build, Test. Fehlt node_modules: `npm ci --ignore-scripts --no-audit --no-fund` (Electron- und Native-Tests können dann aus Umgebungsgründen scheitern).",
      "3. Typecheck, Build, danach Tests ausführen. Tests einzeln mit Zeitlimit (z. B. `timeout 40 node --test <datei>`), damit ein hängender Test nicht alles blockiert.",
      "4. Jeden Fehler einordnen: vom Diff verursacht oder vorbestehend/umgebungsbedingt (Fehlertext prüfen).",
      "5. Bericht: ausgeführte Befehle, bestanden/fehlgeschlagen, Einordnung, was ungeprüft bleibt (z. B. UI nie gestartet). Nichts committen oder pushen."
    ].join("\n")
  },
  {
    name: "cate",
    description: "Cate-Werkzeuge: andere Sessions lesen, Nachrichten, Panes, Loops.",
    skillDescription: "/cate: read, message and spawn Cate sessions.",
    argHint: "",
    body: [
      "Cate-Werkzeuge für diese Session. {{ARGS}}",
      "",
      ENV_NOTE,
      "",
      "- Sessions auflisten/lesen: `node \"$HH_SCRIPTS_DIR/hh-peers.cjs\" list` bzw. `read <Name>`.",
      "- Nachricht an eine Session: `node \"$HH_SCRIPTS_DIR/hh-send.cjs\" --to <Name> \"Text\"`.",
      "- Neues getracktes Terminal-Pane: `node \"$HH_SCRIPTS_DIR/hh-spawn.cjs\" --label \"<Name>\" --preset shell --cwd .`.",
      "- Agent-Loop: `node \"$HH_SCRIPTS_DIR/hh-loop.cjs\" start|stop|list` (siehe /agentloop).",
      "Führe nur aus, was der Nutzer verlangt; fasse Ergebnisse kurz zusammen."
    ].join("\n")
  }
];

export interface CommandFile {
  agent: AgentKind;
  name: string;
  path: string;
  content: string;
}

function fill(body: string, args: string): string {
  return body.replace("{{ARGS}}", args);
}

function frontmatterMd(spec: CommandSpec, argsToken: string): string {
  const lines = ["---", `description: ${spec.description}`];
  if (spec.argHint) lines.push(`argument-hint: ${spec.argHint}`);
  lines.push("---", `<!-- ${MANAGED_MARKER} -->`, fill(spec.body, argsToken), "");
  return lines.join("\n");
}

function hermesSkill(spec: CommandSpec): string {
  return [
    "---",
    `name: ${spec.name}`,
    `description: "${spec.skillDescription}"`,
    "version: 0.1.0",
    "author: Cate",
    "license: MIT",
    "platforms: [linux, macos, windows]",
    "---",
    `<!-- ${MANAGED_MARKER} -->`,
    `# /${spec.name}`,
    "",
    fill(spec.body, "(Argumente des Nutzers hinter dem Befehl)"),
    ""
  ].join("\n");
}

export interface InstallPaths {
  home: string;
  /** Hermes-Basisordner (…/hermes), darin profiles/<name>/skills. */
  hermesHome: string;
  /** Hermes-Profile der Projekte, in die Skills gehören. */
  hermesProfiles: string[];
}

/** Alle Dateien, die für die gewünschten Agents entstehen würden. */
export function planCommandFiles(agents: AgentKind[], paths: InstallPaths): CommandFile[] {
  const out: CommandFile[] = [];
  for (const agent of agents) {
    for (const spec of SPECS) {
      if (agent === "claude-code") {
        out.push({ agent, name: spec.name, path: join(paths.home, ".claude", "commands", `${spec.name}.md`), content: frontmatterMd(spec, "$ARGUMENTS") });
      } else if (agent === "codex") {
        out.push({ agent, name: spec.name, path: join(paths.home, ".codex", "prompts", `${spec.name}.md`), content: frontmatterMd(spec, "$ARGUMENTS") });
      } else if (agent === "opencode") {
        out.push({ agent, name: spec.name, path: join(paths.home, ".config", "opencode", "command", `${spec.name}.md`), content: frontmatterMd(spec, "$ARGUMENTS") });
      } else if (agent === "hermes") {
        const profiles = paths.hermesProfiles.length ? paths.hermesProfiles : ["default"];
        for (const p of profiles) {
          const base = p === "default" ? paths.hermesHome : join(paths.hermesHome, "profiles", p);
          out.push({ agent, name: spec.name, path: join(base, "skills", "software-development", spec.name, "SKILL.md"), content: hermesSkill(spec) });
        }
      }
    }
  }
  return out;
}

export type FileState = "missing" | "current" | "outdated" | "foreign";

/** foreign = Datei existiert ohne unsere Markierung und wird nie überschrieben. */
export function fileState(file: CommandFile): FileState {
  if (!existsSync(file.path)) return "missing";
  let text = "";
  try {
    text = readFileSync(file.path, "utf8");
  } catch {
    return "foreign";
  }
  if (!text.includes(MANAGED_MARKER)) return "foreign";
  return text === file.content ? "current" : "outdated";
}

export interface AgentIntegrationStatus {
  agent: AgentKind;
  label: string;
  total: number;
  installed: number;
  foreign: number;
}

export function integrationStatus(paths: InstallPaths): AgentIntegrationStatus[] {
  return INTEGRATION_AGENTS.map(({ id, label }) => {
    const files = planCommandFiles([id], paths);
    const states = files.map(fileState);
    return {
      agent: id,
      label,
      total: files.length,
      installed: states.filter((s) => s === "current").length,
      foreign: states.filter((s) => s === "foreign").length
    };
  });
}

export interface InstallResult {
  written: string[];
  skipped: { path: string; reason: string }[];
}

export function installCommands(agents: AgentKind[], paths: InstallPaths): InstallResult {
  const result: InstallResult = { written: [], skipped: [] };
  for (const file of planCommandFiles(agents, paths)) {
    const state = fileState(file);
    if (state === "foreign") {
      result.skipped.push({ path: file.path, reason: "Eigene Datei vorhanden, nicht überschrieben." });
      continue;
    }
    if (state === "current") continue;
    try {
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, file.content, "utf8");
      result.written.push(file.path);
    } catch (e) {
      result.skipped.push({ path: file.path, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
