/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */

export type PluginCategoryId =
  | "code"
  | "context"
  | "workflow"
  | "hardware"
  | "security"
  | "multiagent"
  | "web3"
  | "ui"
  | "tools";

export const PLUGIN_CATEGORIES: Array<{ id: PluginCategoryId; label: string }> = [
  { id: "code", label: "Code & Qualität" },
  { id: "context", label: "Kontext & Gedächtnis" },
  { id: "workflow", label: "Workflow" },
  { id: "hardware", label: "Hardware" },
  { id: "security", label: "Sicherheit" },
  { id: "multiagent", label: "Multi-Agent" },
  { id: "web3", label: "Web3" },
  { id: "ui", label: "UI & Feedback" },
  { id: "tools", label: "Werkzeuge" }
];

export type PluginStatus = "active" | "inactive" | "error";

export type PluginConfigFieldType = "string" | "number" | "boolean" | "select" | "secret" | "list";

export interface PluginConfigField {
  key: string;
  label: string;
  type: PluginConfigFieldType;
  description?: string;
  placeholder?: string;
  default?: unknown;
  required?: boolean;
  /** Nur fuer type "select". */
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  category?: string;
  enabled: boolean;
  status?: PluginStatus;
  statusMessage?: string;
  icon?: string;
  configFields?: PluginConfigField[];
  operations?: string[];
  /** true fuer selbst hochgeladene Plugins (Einstellungen > Plugins > Hochladen); nur diese lassen sich entfernen. */
  custom?: boolean;
}

export interface PluginCatalogEntry {
  id: string;
  name: string;
  description: string;
  category: PluginCategoryId;
  icon: string;
}

export const PLUGIN_CATALOG: Record<string, PluginCatalogEntry> = {};

function add(entry: PluginCatalogEntry): void {
  PLUGIN_CATALOG[entry.id] = entry;
}

add({ id: "astRefactor", name: "AST-Refactoring", category: "code", icon: "code", description: "Strukturelle Code-Umbauten über den Syntaxbaum statt per Textersetzung." });
add({ id: "testHealer", name: "Test-Heiler", category: "code", icon: "test", description: "Analysiert fehlgeschlagene Tests und schlägt Korrekturen vor." });
add({ id: "vulnScanner", name: "Schwachstellen-Scanner", category: "security", icon: "search", description: "Prüft Abhängigkeiten und Quellcode auf bekannte Sicherheitslücken." });
add({ id: "codeRag", name: "Code-Gedächtnis", category: "context", icon: "chart", description: "Semantische Suche über die Codebasis als Kontextquelle für Agenten." });
add({ id: "gitDiff", name: "Git-Diff-Ansicht", category: "workflow", icon: "diff", description: "Zeigt Änderungen des Arbeitsverzeichnisses direkt neben der Sitzung." });
add({ id: "gitTimeline", name: "Git-Verlauf", category: "workflow", icon: "timeline", description: "Zeitleiste der Commits und Sitzungen eines Projekts." });
add({ id: "notifier", name: "Benachrichtigungen", category: "ui", icon: "bell", description: "Meldet abgeschlossene Sitzungen und Fehler per Systembenachrichtigung." });
add({ id: "taskSync", name: "Aufgaben-Sync", category: "workflow", icon: "sync", description: "Gleicht Aufgaben mit externen Trackern wie Issues oder Boards ab." });
add({ id: "prReviewer", name: "PR-Prüfer", category: "code", icon: "review", description: "Erstellt automatische Reviews für Pull Requests." });
add({ id: "vramThrottle", name: "VRAM-Drossel", category: "hardware", icon: "chip", description: "Begrenzt parallele Agenten anhand des freien Grafikspeichers." });
add({ id: "sessionTeleport", name: "Sitzungs-Transfer", category: "context", icon: "teleport", description: "Überträgt Sitzungskontext zwischen Projekten und Rechnern." });
add({ id: "commandPolicy", name: "Befehlsrichtlinie", category: "security", icon: "policy", description: "Erlaubt oder blockiert Shell-Befehle anhand definierter Regeln." });
add({ id: "secretGuard", name: "Geheimnis-Wächter", category: "security", icon: "key", description: "Verhindert, dass Schlüssel und Tokens in Ausgaben oder Commits gelangen." });
add({ id: "agentRouter", name: "Agenten-Router", category: "multiagent", icon: "route", description: "Verteilt Aufgaben je nach Art auf passende Agenten und Modelle." });
add({ id: "peerReview", name: "Gegenprüfung", category: "multiagent", icon: "users", description: "Lässt einen zweiten Agenten Ergebnisse des ersten prüfen." });
add({ id: "contractGuard", name: "Vertragsprüfer", category: "web3", icon: "contract", description: "Prüft Smart Contracts auf typische Fehler vor dem Deployment." });
add({ id: "dexFeed", name: "DEX-Kursfeed", category: "web3", icon: "chart", description: "Liefert Kurs- und Liquiditätsdaten dezentraler Börsen." });
add({ id: "visualDiff", name: "Visueller Vergleich", category: "ui", icon: "visual", description: "Vergleicht Screenshots vor und nach einer Änderung." });
add({ id: "voiceBridge", name: "Sprachbrücke", category: "tools", icon: "mic", description: "Sprachein- und -ausgabe für Sitzungen." });
add({ id: "gitGuard", name: "GitGuard — Auto-Commit & Push", category: "workflow", icon: "shield", description: "Committet und pusht Änderungen automatisch in festen Abständen." });
add({ id: "contextPicker", name: "Kontext-Auswahl", category: "context", icon: "puzzle", description: "Hängt Dateien oder die Zwischenablage als Kontext an ein Projekt an." });

function normalizeId(id: string): string {
  return id.replace(/[-_.\s]+([a-zA-Z0-9])/g, (_m, c: string) => c.toUpperCase());
}

/** Katalogeintrag zu einer Plugin-ID; toleriert kebab-case ("context-picker"). */
export function getCatalogEntry(id: string): PluginCatalogEntry | undefined {
  return PLUGIN_CATALOG[id] ?? PLUGIN_CATALOG[normalizeId(id)];
}

export function resolveCategory(plugin: Pick<PluginInfo, "id" | "category">): PluginCategoryId {
  const known = PLUGIN_CATEGORIES.find((c) => c.id === plugin.category);
  if (known) return known.id;
  return getCatalogEntry(plugin.id)?.category ?? "tools";
}

export function categoryLabel(id: PluginCategoryId): string {
  return PLUGIN_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function resolveIcon(plugin: Pick<PluginInfo, "id" | "icon">): string {
  return plugin.icon ?? getCatalogEntry(plugin.id)?.icon ?? "puzzle";
}

export function resolveStatus(plugin: Pick<PluginInfo, "enabled" | "status">): PluginStatus {
  return plugin.status ?? (plugin.enabled ? "active" : "inactive");
}

/** Beschreibung/Name: Angaben des Plugins haben Vorrang, Katalog fuellt Luecken. */
export function resolveDisplay(plugin: PluginInfo): { name: string; description: string } {
  const entry = getCatalogEntry(plugin.id);
  return {
    name: plugin.name?.trim() || entry?.name || plugin.id,
    description: plugin.description?.trim() || entry?.description || ""
  };
}

export function statusLabel(status: PluginStatus): string {
  return status === "active" ? "Aktiv" : status === "error" ? "Fehler" : "Inaktiv";
}
