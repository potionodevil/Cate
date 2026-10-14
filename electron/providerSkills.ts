/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/**
 * Read-only Collector für "Skills & Plugins je Provider": liest Skills,
 * Plugins und Konfigurationen der unterstützten Agent-CLIs (Hermes,
 * Claude Code, Codex CLI, OpenCode) und liefert sie als zeigbare Zeilen an
 * die UI. NIEMALS wird hier geschrieben — alle Quellen sind Read-only
 * (CLI-Aufrufe mit listarischer Wirkung sowie JSON/TOML/JSONC-Dateien,
 * die vom jeweiligen CLI-Tool selbst gepflegt werden).
 *
 * Alle Aufrufergebnisse sind fehlertolerant: eine nicht verfügbare Quelle
 * liefert einen leeren Resultblock mit ok:false + message, nie einen Wurf.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { runHermes } from "./hermesCli";

const execFileAsync = promisify(execFile);

/** Row-Typen wie Export nach dist-electron für Tests. */
export interface ProviderSkillRow {
  name: string;
  category?: string;
  source?: string;
  trust?: string;
  status: "enabled" | "disabled" | string;
}

export interface ProviderPluginRow {
  name: string;
  version?: string;
  source?: string;
  status: "enabled" | "disabled" | string;
  marketplace?: string;
}

export interface ProviderConfigRow {
  name: string;
  value?: string;
}

export interface ProviderSkillsResult {
  ok: boolean;
  message?: string;
  skills: ProviderSkillRow[];
  plugins: ProviderPluginRow[];
  configs: ProviderConfigRow[];
  /** Anzeigbare Pfade der Quelldateien — als "in <Pfad> bearbeiten"-Hinweis. */
  paths: { skills?: string; plugins?: string; configs?: string };
  /** Hermes-Footer knappe Zählzeile, falls erkannt. */
  countLine?: string;
}

const EMPTY: ProviderSkillsResult = { ok: false, skills: [], plugins: [], configs: [], paths: {} };

/** Zeilenwächter ("Zeynep"): entfernt BOM, NBSP, ANSI-Steuersequenzen und
 * CRLF-Reste aus einer gelesenen Zeile, bevor sie weiterverarbeitet wird. */
function sanitizeLine(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
}

/** Trimm-Variante, die auch leere Zeilen zu "" kollabiert. */
function cleanCell(raw: string): string {
  return sanitizeLine(raw).trim();
}

// ---------------------------------------------------------------------------
// Hermes: `hermes skills list` (mit kanonischer `hermes -p <profile>` Form)
// ---------------------------------------------------------------------------

/** Erwartete CLI-Ausgabe:
 *   Installed Skills
 *   ┌──…──┬──…──┬──…──┬──…──┬──…──┐
 *   │ Name │ Category │ Source │ Trust │ Status │
 *   ├───┼───┼───┤
 *   │ agent-branch-handoff │  │ local  │ local  │ enabled │
 *   └───┴───┴───┘
 *   0 hub-installed, 52 builtin, 7 local — 59 enabled, 0 disabled
 * Parsing defensiv: unbekannte Zeilen werden überlesen, nie geworfen. */
export function parseHermesSkillsList(stdout: string): { rows: ProviderSkillRow[]; countLine?: string } {
  const rows: ProviderSkillRow[] = [];
  let countLine: string | undefined;
  for (const raw of stdout.split("\n")) {
    const line = cleanCell(raw);
    if (!line) continue;
    // Footer-Zähler ("0 hub-installed, 52 builtin, 7 local — 59 enabled, 0 disabled")
    if (/hub-installed/.test(line) && /builtin/.test(line) && /local/.test(line) && /enabled/.test(line)) {
      countLine = line;
      continue;
    }
    if (!line.includes("│")) continue;
    // Tabellenrahmen (nur Box-Drawing-Zeichen) überspringen.
    if (/^[┌└├┤┬┴┼─]+$/.test(line.replace(/│/g, "").trim())) continue;
    const cells = line.split("│").map(cleanCell);
    // Leere Rahmenzellen links/rechts entfernen, aber echte leere Zellen
    // in der Mitte (leere Kategorie) bewusst behalten.
    if (cells.length && cells[0] === "") cells.splice(0, 1);
    const lastIdx = cells.length - 1;
    if (lastIdx >= 0 && cells[lastIdx] === "") cells.splice(lastIdx, 1);
    // Kopfzeile und Rahmen sind keine Inhaltszeilen
    if (cells.length < 4) continue;
    if (/^Name$/i.test(cells[0])) continue;
    rows.push({
      // Zeilenwächter: abgeschnittene Namen mit "…" so übernehmen.
      name: cells[0].replace(/…$/, ""),
      category: cells[1] || undefined,
      source: cells[2] || undefined,
      trust: cells[3] || undefined,
      status: cells[4] && cells[4].length > 0 ? cells[4] : "unknown"
    });
  }
  return { rows, countLine };
}

export async function readHermesSkills(profile: string): Promise<ProviderSkillsResult> {
  const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local");
  const profileDir = join(localAppData, "hermes", "profiles", profile);
  try {
    const { stdout } = await runHermes(["-p", profile, "skills", "list"], 25_000);
    const { rows, countLine } = parseHermesSkillsList(stdout);
    return {
      ok: true,
      skills: rows,
      plugins: [],
      configs: [],
      paths: { skills: join(profileDir, "skills") },
      countLine
    };
  } catch (err: unknown) {
    const e = err as { message?: string; stdout?: string | Buffer; stderr?: string | Buffer };
    const message = [e?.message ?? String(err), e?.stdout?.toString().trim(), e?.stderr?.toString().trim()]
      .filter(Boolean)
      .join("\n");
    return { ...EMPTY, message };
  }
}

// ---------------------------------------------------------------------------
// Claude Code: installed_plugins.json (v2) + settings.json enabledPlugins
//              + ~/.claude/skills/*-Verzeichnisse als eigene Skills
// ---------------------------------------------------------------------------

interface ClaudeRegistryV2 {
  version?: number;
  plugins?: Record<string, Array<{ scope?: string; installPath?: string; version?: string }>>;
}

/** Parst die Registrierungsdatei + die enabledPlugins-Map. Reine Funktion. */
export function parseClaudePlugins(registryJson: string, settingsJson: string): ProviderPluginRow[] {
  const rows: ProviderPluginRow[] = [];
  try {
    const reg = JSON.parse(registryJson) as ClaudeRegistryV2;
    let enabled: Record<string, unknown> = {};
    try {
      const settings = JSON.parse(settingsJson) as { enabledPlugins?: Record<string, unknown> };
      enabled = settings.enabledPlugins ?? {};
    } catch {
      /* settings.json fehlt/ungültig — Standard enabled */
    }
    const plugins = reg?.plugins ?? {};
    for (const key of Object.keys(plugins)) {
      const entries = Array.isArray(plugins[key]) ? plugins[key] : [];
      const first = entries[0] ?? {};
      const at = key.indexOf("@");
      const name = at > 0 ? key.slice(0, at) : key;
      const marketplace = at > 0 ? key.slice(at + 1) : undefined;
      const enabledVal = enabled[key];
      const isEnabled = enabledVal === undefined ? true : Boolean(enabledVal);
      rows.push({
        name,
        version: first.version,
        marketplace,
        source: entries.length > 1 ? `${entries.length} Installationen` : first.scope,
        status: isEnabled ? "enabled" : "disabled"
      });
    }
  } catch {
    /* JSON fehlerhaft — leere Liste, nie werfen */
  }
  return rows;
}

/** Parst die Sichtbarkeit der ~/.claude/skills-Verzeichnisse als Skillzeilen. */
export function parseClaudeSkillDirs(dirs: string[]): ProviderSkillRow[] {
  // 'synced' ist Claude-Codes interner Synchronisationsordner, kein Skill.
  return dirs
    .filter((d) => d && d !== "synced" && !d.startsWith("."))
    .map((d) => ({ name: d.replace(/…$/, ""), source: "lokal", trust: "lokal", status: "enabled" as const }));
}

export async function readClaudeSkills(): Promise<ProviderSkillsResult> {
  const home = os.homedir();
  const pluginsPath = join(home, ".claude", "plugins", "installed_plugins.json");
  const settingsPath = join(home, ".claude", "settings.json");
  const skillsDir = join(home, ".claude", "skills");
  let regJson = "";
  let settingsJson = "";
  try {
    if (existsSync(pluginsPath)) regJson = readFileSync(pluginsPath, "utf8");
  } catch {
    /* Lesefehler — tolerant */
  }
  try {
    if (existsSync(settingsPath)) settingsJson = readFileSync(settingsPath, "utf8");
  } catch {
    /* Lesefehler — tolerant */
  }
  const plugins = parseClaudePlugins(regJson, settingsJson);
  let skills: ProviderSkillRow[] = [];
  try {
    if (existsSync(skillsDir)) {
      skills = parseClaudeSkillDirs(readdirSync(skillsDir, { withFileTypes: true }).map((e) => e.name));
    }
  } catch {
    /* Verzeichnis nicht lesbar — leere Liste */
  }
  const anySource = plugins.length > 0 || skills.length > 0;
  return {
    ok: anySource,
    message: anySource ? undefined : "Keine Claude-Code-Skills oder -Plugins gefunden.",
    skills,
    plugins,
    configs: [],
    paths: { skills: skillsDir, plugins: pluginsPath }
  };
}

// ---------------------------------------------------------------------------
// Codex CLI: `codex plugin list` bevorzugt, sonst ~/.codex/config.toml
//                                                            + ~/.codex/skills/*
// ---------------------------------------------------------------------------

/** Parst `codex plugin list`-Ausgabe: Marketplace-Blöcke mit Zeilen
 *   PLUGIN  STATUS  VERSION  SOURCE  — Spalten mit 2+ Leerzeichen getrennt. */
export function parseCodexPluginList(stdout: string): ProviderPluginRow[] {
  const rows: ProviderPluginRow[] = [];
  for (const raw of stdout.split("\n")) {
    const line = cleanLine(raw);
    if (!line || line.startsWith("Marketplace") || /^PLUGIN\b/.test(line)) continue;
    if (!line.includes("@")) continue;
    const parts = line.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const pluginCol = parts[0];
    const statusCol = parts[1] ?? "";
    const notInstalled = /not\s*installed/i.test(statusCol);
    const at = pluginCol.indexOf("@");
    const name = at > 0 ? pluginCol.slice(0, at) : pluginCol;
    const marketplace = at > 0 ? pluginCol.slice(at + 1) : undefined;
    rows.push({
      name: name.replace(/…$/, ""),
      marketplace,
      status: notInstalled ? "disabled" : "enabled",
      version: notInstalled ? undefined : parts[2],
      source: notInstalled ? undefined : parts[3]
    });
  }
  return rows;
}

function cleanLine(raw: string): string {
  return sanitizeLine(raw).trim();
}

/** Parst [plugins."name@marketplace"]-Sektionen aus der Codex-TOML-Datei. */
export function parseCodexTomlPlugins(toml: string): ProviderPluginRow[] {
  const rows: ProviderPluginRow[] = [];
  const sectionRe = /\[\s*plugins\."([^"]+)"\s*\]([^\[]*)/g;
  let m: RegExpExecArray | null = sectionRe.exec(toml);
  while (m) {
    const key = m[1];
    const body = m[2];
    const enabled = /enabled\s*=\s*true/i.test(body);
    const at = key.indexOf("@");
    rows.push({
      name: at > 0 ? key.slice(0, at).replace(/…$/, "") : key,
      marketplace: at > 0 ? key.slice(at + 1) : undefined,
      status: enabled ? "enabled" : "disabled"
    });
    m = sectionRe.exec(toml);
  }
  return rows;
}

/** Liest die [plugins]-Sektion aus codex config.toml (read-only Prüfung). */
function readCodexTomlPlugins(configPath: string): string {
  try {
    if (existsSync(configPath)) return readFileSync(configPath, "utf8");
  } catch {
    /* Lesefehler — tolerant */
  }
  return "";
}

export async function runCodexPluginList(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("codex", ["plugin", "list"], {
      timeout: 15_000,
      shell: process.platform === "win32",
      windowsHide: true
    });
    return stdout ?? "";
  } catch {
    return null;
  }
}

export async function readCodexSkills(): Promise<ProviderSkillsResult> {
  const home = os.homedir();
  const configPath = join(home, ".codex", "config.toml");
  const skillsDir = join(home, ".codex", "skills");
  const cliOut = await runCodexPluginList();
  let plugins: ProviderPluginRow[] = [];
  let paths: ProviderSkillsResult["paths"] = {};
  if (cliOut !== null && /\S/.test(cliOut)) {
    plugins = parseCodexPluginList(cliOut);
    paths.plugins = "codex plugin list";
  } else {
    const toml = readCodexTomlPlugins(configPath);
    plugins = parseCodexTomlPlugins(toml);
    if (toml) paths.plugins = configPath;
  }
  let skills: ProviderSkillRow[] = [];
  try {
    if (existsSync(skillsDir)) {
      skills = readdirSync(skillsDir, { withFileTypes: true })
        .map((e) => e.name)
        .filter((d) => d && !d.startsWith("."))
        .map((d) => ({ name: d.replace(/…$/, ""), source: "lokal", trust: "lokal", status: "enabled" as const }));
    }
  } catch {
    /* Verzeichnis nicht lesbar */
  }
  const anySource = plugins.length > 0 || skills.length > 0;
  return {
    ok: anySource,
    message: anySource ? undefined : "Keine Codex-Skills oder -Plugins gefunden.",
    skills,
    plugins,
    configs: [],
    paths: { ...paths, skills: skillsDir }
  };
}

// ---------------------------------------------------------------------------
// OpenCode: opencode.json im Projektordner oder ~/.config/opencode/opencode.jsonc
// ---------------------------------------------------------------------------

/** Entfernt Line- und Blockkommentare sowie Nachlaufkommas aus JSONC. */
export function stripJsonc(text: string): string {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const noLine = noBlock.split("\n").map((l) => {
    // `//`-Kommentar nur entfernen, wenn er nicht in einem String liegt.
    let inStr = false;
    let esc = false;
    let out = "";
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (esc) {
        out += ch;
        esc = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        esc = true;
        continue;
      }
      if (ch === '"') inStr = !inStr;
      if (!inStr && ch === "/" && l[i + 1] === "/") break;
      out += ch;
    }
    return out;
  });
  return noLine.join("\n").replace(/,(\s*[}\]])/g, "$1");
}

/** Parst OpenCode-Konfiguration: "plugin", "mcp", "provider" als Zeilen. */
export function parseOpenCodeConfig(jsonc: string): { plugins: ProviderPluginRow[]; configs: ProviderConfigRow[] } {
  const plugins: ProviderPluginRow[] = [];
  const configs: ProviderConfigRow[] = [];
  try {
    const cfg = JSON.parse(stripJsonc(jsonc)) as {
      plugin?: unknown;
      mcp?: Record<string, unknown>;
      provider?: Record<string, unknown>;
    };
    const pluginList = Array.isArray(cfg.plugin) ? cfg.plugin : [];
    for (const p of pluginList) {
      // "-"-Präfix: lokal deaktiviert (Opencode-Konvention).
      const disabled = typeof p === "string" && p.startsWith("-");
      const raw = disabled && typeof p === "string" ? p.slice(1) : String(p ?? "");
      plugins.push({ name: raw, status: disabled ? "disabled" : "enabled", source: "npm" });
    }
    const mcp = cfg.mcp ?? {};
    for (const key of Object.keys(mcp)) {
      const conf = (mcp as Record<string, Record<string, unknown>>)[key];
      const enabled = conf?.enabled === undefined ? true : Boolean(conf.enabled);
      configs.push({ name: `MCP: ${key}`, value: enabled ? "aktiviert" : "deaktiviert" });
    }
    const provider = cfg.provider ?? {};
    for (const key of Object.keys(provider)) {
      configs.push({ name: `Provider: ${key}` });
    }
  } catch {
    /* JSON fehlerhaft — leer, nie werfen */
  }
  return { plugins, configs };
}

export async function readOpencodeSkills(projectFolder?: string): Promise<ProviderSkillsResult> {
  const home = os.homedir();
  const globalPath = join(home, ".config", "opencode", "opencode.jsonc");
  let usedPath: string | null = null;
  let text = "";
  if (projectFolder) {
    for (const candidate of ["opencode.json", "opencode.jsonc"]) {
      const p = join(projectFolder, candidate);
      if (existsSync(p)) {
        try {
          text = readFileSync(p, "utf8");
          usedPath = p;
          break;
        } catch {
          /* Lesefehler — nächster Kandidat */
        }
      }
    }
  }
  if (!text && existsSync(globalPath)) {
    try {
      text = readFileSync(globalPath, "utf8");
      usedPath = globalPath;
    } catch {
      /* Lesefehler — tolerant */
    }
  }
  const { plugins, configs } = usedPath ? parseOpenCodeConfig(text) : { plugins: [], configs: [] };
  const anySource = plugins.length > 0 || configs.length > 0;
  return {
    ok: anySource,
    message: anySource ? undefined : usedPath ? "OpenCode-Konfiguration enthält keine Plugins oder Konfigurationen." : "Keine OpenCode-Konfiguration gefunden.",
    skills: [],
    plugins,
    configs,
    paths: { plugins: usedPath ?? globalPath, configs: usedPath ?? globalPath }
  };
}

// ---------------------------------------------------------------------------
// Weiterleitung anhand des Preset-Namens
// ---------------------------------------------------------------------------

export async function collectProviderSkills(
  presetId: string,
  opts: { profile?: string; projectFolder?: string }
): Promise<ProviderSkillsResult> {
  switch (presetId) {
    case "hermes":
      return readHermesSkills(opts.profile ?? "default");
    case "claude-code":
      return readClaudeSkills();
    case "codex":
      return readCodexSkills();
    case "opencode":
      return readOpencodeSkills(opts.projectFolder);
    default:
      return { ...EMPTY, message: `Unbekannter Provider: ${presetId}` };
  }
}
