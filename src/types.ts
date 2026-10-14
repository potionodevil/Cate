/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  slots?: ("action" | "sidebar" | "context")[];
}

export type PaneStatus = "starting" | "running" | "exited" | "stopped";

export interface PaneRecord {
  id: string;
  sessionId: string;
  projectId: string;
  presetId: string;
  profile?: string;
  model?: string;
  label: string;
  status: PaneStatus;
}

/** Layout node types mirrored from Layout.tsx so other modules can import
 * them from the central types file instead of creating circular imports. */
export type PaneLayoutNode =
  | { type: "leaf"; paneId: string; presetId: string; label: string; profile?: string; model?: string }
  | { type: "split"; direction: "horizontal" | "vertical"; children: PaneLayoutNode[] };

export type WorkspaceNode =
  | { type: "session"; sessionId: string; projectId: string; cwd: string; name: string; paneLayout: PaneLayoutNode }
  | { type: "split"; direction: "horizontal" | "vertical"; children: WorkspaceNode[] };

export interface SessionCallbacks {
  onSplit: (sessionId: string, paneId: string, direction: "horizontal" | "vertical") => void;
  /** Adds a new shell pane to the session as a flat sibling (side by side),
   * instead of nesting a split inside the targeted pane like onSplit does. */
  onAddPane: (sessionId: string, paneId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onClosePane?: (sessionId: string, paneId: string) => void;
  /** Right-click on the "+" add-pane button: opens the agent picker instead
   * of immediately adding a plain shell — lets the user add a pane running
   * any installed/connected CLI tool (Claude Code, Codex, OpenCode, ...),
   * not just a shell. */
  onRequestPanePicker?: (sessionId: string, paneId: string) => void;
}

export interface SessionRecord {
  id: string;
  projectId: string;
  name: string;
  cwd: string;
  status: "running" | "exited" | "stopped";
  createdAt: number;
  lastActiveAt: number;
  endedAt: number | null;
  paneIds: string[];
  /** Backward-compatible aliases for the existing renderer. */
  label?: string;
  presetId?: string;
  model?: string | null;
  profile?: string | null;
  contextPath?: string | null;
  expiresAt?: number | null;
  startedAt?: number;
  archivedAt?: number | null;
}

export interface CreateProjectOptions {
  icon?: string;
  defaultModel?: string;
  /** Kept for renderer compatibility; ignored by the backend. */
  terminalsPerWindow?: number;
}

/** Desktop cat preferences (mirrors electron/petSettings.ts). */
export interface PetSettings {
  enabled: boolean;
  fur: string;
  outline: string;
  eyes: string;
  scale: number;
  speed: number;
  area: "floor" | "screen" | "sit";
  anchor: "left" | "center" | "right";
  /** The one animal that visits the cat. */
  companion: "none" | "bunny" | "mouse" | "bird" | "butterfly";
  companionArea: "floor" | "top" | "screen";
  followOnNotify: boolean;
  idleSeconds: number;
  bubbleSeconds: number;
}

export interface HarnessApi {
  // Session-centric API (new)
  spawnSession(opts: {
    projectId: string;
    cwd: string;
    name: string;
    presetId?: string;
    profile?: string;
    model?: string;
  }): Promise<{ sessionId: string; paneId: string; presetId?: string; name?: string }>;
  listSessions(projectId: string): Promise<SessionRecord[]>;
  getSessionContext(id: string): Promise<{ ok: boolean; content: string }>;
  stopSession(id: string): Promise<{ ok: boolean }>;
  deleteSession(id: string): Promise<{ ok: boolean }>;
  archiveSession(id: string, archived: boolean): Promise<{ ok: boolean }>;
  renameSession(sessionId: string, name: string): Promise<{ ok: boolean; message?: string }>;
  splitSessionPane(
    sessionId: string,
    paneId: string,
    direction: "horizontal" | "vertical",
    presetId?: string
  ): Promise<{ ok: true; paneId: string } | { ok: false; error: { code: string; message: string } }>;
  reattachSession(sessionId: string, projectId: string): Promise<{ ok: true; sessionId: string; paneId: string } | { ok: false; error: { code: string; message: string } }> ;
  attachSessionPane(paneId: string): Promise<{ backlog: string } | null>;
  exportSessionPane(paneId: string): Promise<{ ok: boolean; path?: string; message?: string }>;
  writeSessionPane(paneId: string, data: string): void;
  resizeSessionPane(paneId: string, cols: number, rows: number): void;
  onSessionPaneData(paneId: string, cb: (data: string) => void): () => void;
  onSessionPaneExit(paneId: string, cb: (code: number) => void): () => void;
  onSessionRenamed(cb: (info: { id: string; label: string; sessionId?: string }) => void): () => void;
  onSessionSpawned(
    cb: (info: {
      projectId: string;
      sessionId: string;
      paneId: string;
      name: string;
      label?: string;
      presetId: string;
      cwd: string;
      profile?: string;
    }) => void
  ): () => void;

  // Backward-compatible pane API (existing renderer)
  spawnPane(opts: {
    projectId: string;
    cwd: string;
    presetId: string;
    profile?: string;
    model?: string;
    label: string;
  }): Promise<string>;
  attachPane(id: string): Promise<{ backlog: string } | null>;
  writePane(id: string, data: string): void;
  resizePane(id: string, cols: number, rows: number): void;
  onPaneData(id: string, cb: (data: string) => void): () => void;
  onPaneExit(id: string, cb: (code: number) => void): () => void;

  listProjects(): Promise<Project[]>;
  createProject(
    name: string,
    folder: string,
    options?: CreateProjectOptions
  ): Promise<{ project: Project; hermesProfileResult: { ok: boolean; message: string } }>;
  updateProject(id: string, patch: Partial<{ icon: string; defaultModel: string; name: string }>): Promise<Project | { ok: false }>;
  deleteProject(id: string): Promise<{ ok: boolean }>;
  exportProject(id: string): Promise<{ ok: boolean; path?: string; message?: string }>;
  importProject(): Promise<{ ok: boolean; canceled?: boolean; project?: Project; message?: string }>;
  recentUsage(profile?: string, limit?: number): Promise<SessionUsageRow[]>;
  usageSince(since: number, profile?: string): Promise<{ totalTokens: number; totalCostUsd: number }>;
  usageInsights(days: number): Promise<{
    ok: boolean;
    days: number;
    sessions: number;
    messages: number;
    totalTokens: number;
    estimatedCostUsd: number | null;
    unknownSessions: number;
    models: { model: string; sessions: number; tokens: number }[];
    activeTime?: string | null;
    error?: string;
  }>;
  usageLimits(): Promise<{
    ok: boolean;
    provider: string | null;
    source: string | null;
    plan: string | null;
    fetchedAt: string | null;
    windows: { label: string; usedPercent: number; resetsAt: string | null }[];
    error?: string;
  }>;
  codexUsage(days: number): Promise<{
    ok: boolean;
    days: number;
    sessions: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    byDay: { day: string; sessions: number; inputTokens: number; outputTokens: number; cachedTokens: number }[];
    error?: string;
  }>;
  listAgentPresets(): Promise<AgentPreset[]>;
  detectInstalledAgents(): Promise<{ id: string; label: string; installed: boolean }[]>;
  getUserName(): Promise<string | null>;
  setUserName(name: string): Promise<{ ok: boolean }>;
  getSidebarPosition(): Promise<"left" | "right">;
  setSidebarPosition(position: "left" | "right"): Promise<{ ok: boolean }>;
  getTheme(): Promise<"nous" | "obsidian" | "slate" | "daylight" | "aurora" | "copper">;
  setTheme(theme: "nous" | "obsidian" | "slate" | "daylight" | "aurora" | "copper"): Promise<{ ok: boolean }>;
  getMotionEnabled(): Promise<boolean>;
  setMotionEnabled(enabled: boolean): Promise<{ ok: boolean }>;
  minimizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  listPluginManifests(): Promise<PluginManifest[]>;
  onPluginShortcut(cb: () => void): () => void;
  getAgentDefaults(): Promise<{ defaultPresetId: string; defaultModel: string | null }>;
  listLocalModels(endpoint?: string): Promise<{ ok: boolean; models: string[]; message?: string }>;
  getAgentConfig(): Promise<{
    localModel: { enabled: boolean; endpoint: string; model: string } | null;
    mcpServers: { id: string; name: string; enabled: boolean; command?: string; args?: string[]; env?: Record<string, string>; url?: string }[];
    connectors: { name: string; command?: string; args?: string[]; url?: string }[];
  }>;
  setLocalModel(config: { enabled: boolean; endpoint: string; model: string } | null): Promise<{ ok: boolean }>;
  setMcpServers(servers: { id: string; name: string; enabled: boolean; command?: string; args?: string[]; env?: Record<string, string>; url?: string }[]): Promise<{ ok: boolean }>;
  setOnboardingAgent(presetId: string): Promise<{ ok: boolean; message?: string }>;
  improvePrompt(text: string, presetId: string): Promise<{ ok: true; text: string } | { ok: false; message: string }>;
  setDefaultPreset(presetId: string): Promise<{ ok: boolean; message?: string }>;
  setDefaultModel(model: string | null): Promise<{ ok: boolean }>;
  getRetentionDays(): Promise<number>;
  setRetentionDays(days: number): Promise<{ ok: boolean }>;
  getPetSettings(): Promise<PetSettings>;
  setPetSettings(patch: Partial<PetSettings>): Promise<PetSettings>;
  resetPetSettings(): Promise<PetSettings>;
  testPet(): Promise<void>;
  /** The desktop cat asked to show a running session (bubble click / double-click). */
  onPetOpenSession(cb: (info: { sessionId: string; projectId: string }) => void): () => void;
  pickFolder(): Promise<string | null>;
  isGitAvailable(): Promise<boolean>;
  cloneRepo(url: string, parentFolder: string): Promise<{ ok: boolean; path?: string; message: string }>;
  addApiKey(profile: string, provider: string, apiKey: string, label?: string): Promise<{ ok: boolean; message: string }>;
  listApiKeys(profile: string): Promise<{ ok: boolean; message: string; rows: AuthCredentialRow[] }>;
  removeApiKey(profile: string, provider: string, target: string): Promise<{ ok: boolean; message: string }>;
  listSessions(projectId: string): Promise<SessionRecord[]>;
  getSessionContext(id: string): Promise<{ ok: boolean; content: string }>;
  stopSession(id: string): Promise<{ ok: boolean }>;
  deleteSession(id: string): Promise<{ ok: boolean }>;
  renameSession(sessionId: string, name: string): Promise<{ ok: boolean; message?: string }>;
  listCachedModels(): Promise<{ provider: string; models: string[] }[]>;
  pickContextFile(): Promise<string | null>;
  setProjectContextText(projectId: string, text: string, sourceLabel: string): Promise<{ ok: boolean }>;
  setProjectContextFile(projectId: string, filePath: string): Promise<{ ok: boolean }>;
  getProjectContext(projectId: string): Promise<{ hasContext: boolean; sourceLabel: string | null; updatedAt: number | null; preview: string | null }>;
  clearProjectContext(projectId: string): Promise<{ ok: boolean }>;
  injectContext(sessionId: string, payload: { kind: "file" | "clipboard" | "text"; metadata: Record<string, string | number | boolean | undefined>; raw: string }): Promise<
    | { ok: true; value: { sessionId: string; context: { kind: "file" | "clipboard" | "text"; metadata: Record<string, string | number | boolean | undefined>; raw: string }; tokenCount: number } }
    | { ok: false; error: { code: string; message: string } }
  >;
  pickContextFiles(): Promise<
    | { ok: true; value: { kind: "file" | "clipboard" | "text"; metadata: Record<string, string | number | boolean | undefined>; raw: string }[] }
    | { ok: false; error: { code: string; message: string } }
  >;
  readClipboardContext(): Promise<
    | { ok: true; value: { kind: "file" | "clipboard" | "text"; metadata: Record<string, string | number | boolean | undefined>; raw: string } }
    | { ok: false; error: { code: string; message: string } }
  >;
}

export interface AuthCredentialRow {
  provider: string;
  index: number;
  label: string;
  type: string;
}

export interface Project {
  id: string;
  name: string;
  folder: string;
  hermesProfile: string;
  createdAt: number;
  icon?: string;
  defaultModel?: string;
}

export interface SessionUsageRow {
  id: string;
  title: string | null;
  model: string | null;
  profile_name: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
  started_at: number;
}

export interface AgentPreset {
  id: string;
  label: string;
  command: string;
  args: string[];
  supportsHermesFlags: boolean;
}

declare global {
  interface Window {
    harness: HarnessApi;
  }
}
