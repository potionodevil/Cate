/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { LocalModelConfig, McpServer } from "./agentConfig";

export interface Project {
  id: string;
  name: string;
  folder: string;
  hermesProfile: string;
  createdAt: number;
  /** Short user-typed glyph/emoji for display — genuine user content, not
   * decorative chrome, so it's fine as a plain text field. */
  icon?: string;
  /** Passed as PaneConfig.model / -m flag for the project's hermes panes. */
  defaultModel?: string;
  /** Per-project override of the global default CLI preset (wins over
   * settings.defaultPresetId, loses over an explicit spawn-opts preset). */
  defaultPresetId?: string;
}

export interface AppState {
  projects: Project[];
  lastActiveProjectId?: string;
  userName?: string;
  sidebarPosition?: "left" | "right";
  theme?: "nous" | "obsidian" | "slate" | "daylight" | "aurora" | "copper";
  contextRetentionDays?: number;
  autoStart?: boolean;
  /** Desktop cat preferences (partial; defaults + clamping live in petSettings.ts). */
  pet?: Partial<import("./petSettings").PetSettings>;
  /** Global local-model (Ollama etc.) override for agent CLIs. */
  localModel?: LocalModelConfig;
  /** Global MCP servers / connectors handed to supported agent CLIs. */
  mcpServers?: McpServer[];
  /** Set after the first-run onboarding finished the agent choice. */
  onboardedAgent?: boolean;
  /** Entrance-animation kill switch ("Animationen deaktivieren"), default true. */
  motionEnabled?: boolean;
  /** Global fallback CLI preset for new sessions (project override wins). */
  defaultPresetId?: string;
  /** Global fallback model for new sessions (project override wins). */
  defaultModel?: string;
}

function storePath(): string {
  const dir = app.getPath("userData");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "hermes-harness-state.json");
}

export function loadState(): AppState {
  const p = storePath();
  if (!existsSync(p)) return { projects: [] };
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return { projects: [] };
  }
}

export function saveState(state: AppState): void {
  writeFileSync(storePath(), JSON.stringify(state, null, 2), "utf-8");
}

export function slugifyProfileName(name: string): string {
  return (
    "hh-" +
    name
      .toLowerCase()
      // ASCII-normalize BEFORE stripping non-alphanumerics: combining accent
      // marks are removed but the base letter survives — "Já-va" → "ja-va"
      // statt literal "j-va"; Umlaute werden auseinandergezogen und fallen
      // dann unter den Dash-Collapse (siehe Testvertrag oben).
      .normalize("NFKD")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
  );
}


export interface ProjectExport {
  format: "hermes-harness-project";
  version: 1;
  project: Pick<Project, "name" | "folder" | "icon" | "defaultModel" | "defaultPresetId">;
}

export function projectExportData(project: Project): ProjectExport {
  return {
    format: "hermes-harness-project",
    version: 1,
    project: {
      name: project.name,
      folder: project.folder,
      ...(project.icon ? { icon: project.icon } : {}),
      ...(project.defaultModel ? { defaultModel: project.defaultModel } : {}),
      ...(project.defaultPresetId ? { defaultPresetId: project.defaultPresetId } : {})
    }
  };
}

export function parseProjectExport(value: unknown): ProjectExport["project"] {
  if (!value || typeof value !== "object") throw new Error("Ungültiges Projektformat.");
  const raw = value as Record<string, unknown>;
  const payload = raw.format === "hermes-harness-project" ? raw.project : value;
  if (!payload || typeof payload !== "object") throw new Error("Ungültiges Projektformat.");
  const p = payload as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name.trim() || typeof p.folder !== "string" || !p.folder.trim()) {
    throw new Error("Projekt benötigt Name und Ordner.");
  }
  const result: ProjectExport["project"] = { name: p.name.trim(), folder: p.folder.trim() };
  if (typeof p.icon === "string" && p.icon.trim()) result.icon = p.icon.trim().slice(0, 8);
  if (typeof p.defaultModel === "string" && p.defaultModel.trim()) result.defaultModel = p.defaultModel.trim();
  if (typeof p.defaultPresetId === "string" && p.defaultPresetId.trim()) result.defaultPresetId = p.defaultPresetId.trim();
  return result;
}
