/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { contextBridge, ipcRenderer } from "electron";
import type { ContextPayload, ContextResult } from "./contextCore";

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
  label?: string;
  presetId?: string;
  profile?: string | null;
  contextPath?: string | null;
  expiresAt?: number | null;
  startedAt?: number;
}

export interface CreateProjectOptions {
  icon?: string;
  defaultModel?: string;
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
  followOnNotify: boolean;
  idleSeconds: number;
  bubbleSeconds: number;
}

export interface HarnessApi {
  // Session-centric API
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
  reattachSession(sessionId: string, projectId: string): Promise<{ ok: true; sessionId: string; paneId: string } | { ok: false; error: { code: string; message: string } }>;
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

  listProjects(): Promise<unknown[]>;
  createProject(name: string, folder: string, options?: CreateProjectOptions): Promise<unknown>;
  updateProject(id: string, patch: Partial<{ icon: string; defaultModel: string; name: string }>): Promise<unknown>;
  deleteProject(id: string): Promise<unknown>;
  exportProject(id: string): Promise<{ ok: boolean; path?: string; message?: string }>;
  importProject(): Promise<{ ok: boolean; canceled?: boolean; project?: unknown; message?: string }>;
  recentUsage(profile?: string, limit?: number): Promise<unknown[]>;
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
  listAgentPresets(): Promise<unknown[]>;
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
  listPluginManifests(): Promise<{ id: string; name: string; version: string; description?: string; slots?: ("action" | "sidebar" | "context")[] }[]>;
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
  getAutostart(): Promise<boolean>;
  setAutostart(on: boolean): Promise<boolean>;
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
  listCachedModels(): Promise<{ provider: string; models: string[] }[]>;
  pickContextFile(): Promise<string | null>;
  setProjectContextText(projectId: string, text: string, sourceLabel: string): Promise<{ ok: boolean }>;
  setProjectContextFile(projectId: string, filePath: string): Promise<{ ok: boolean }>;
  getProjectContext(projectId: string): Promise<{ hasContext: boolean; sourceLabel: string | null; updatedAt: number | null; preview: string | null }>;
  clearProjectContext(projectId: string): Promise<{ ok: boolean }>;
  injectContext(sessionId: string, payload: ContextPayload): Promise<ContextResult<{ sessionId: string; context: ContextPayload; tokenCount: number }>>;
  pickContextFiles(): Promise<ContextResult<ContextPayload[]>>;
  readClipboardContext(): Promise<ContextResult<ContextPayload>>;
}

export interface AuthCredentialRow {
  provider: string;
  index: number;
  label: string;
  type: string;
}

const api: HarnessApi = {
  // Session-centric API
  spawnSession: (opts) => ipcRenderer.invoke("session:create", opts),
  attachSessionPane: (paneId) => ipcRenderer.invoke("session:attachPane", { paneId }),
  exportSessionPane: (paneId) => ipcRenderer.invoke("session:exportPane", { paneId }),
  splitSessionPane: (sessionId, paneId, direction, presetId) =>
    ipcRenderer.invoke("session:splitPane", { sessionId, paneId, direction, presetId }),
  reattachSession: (sessionId, projectId) => ipcRenderer.invoke("session:reattach", { sessionId, projectId }),
  writeSessionPane: (paneId, data) => ipcRenderer.send("session:paneInput", { paneId, data }),
  resizeSessionPane: (paneId, cols, rows) => ipcRenderer.send("session:paneResize", { paneId, cols, rows }),
  onSessionPaneData: (paneId, cb) => {
    const channel = `pty:data:${paneId}`;
    const listener = (_e: Electron.IpcRendererEvent, data: string) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onSessionPaneExit: (paneId, cb) => {
    const channel = `pty:exit:${paneId}`;
    const listener = (_e: Electron.IpcRendererEvent, code: number) => cb(code);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onSessionRenamed: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, info: any) => cb(info);
    ipcRenderer.on("sessions:renamed", listener);
    return () => ipcRenderer.removeListener("sessions:renamed", listener);
  },
  onSessionSpawned: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, info: any) => cb(info);
    ipcRenderer.on("sessions:spawned", listener);
    return () => ipcRenderer.removeListener("sessions:spawned", listener);
  },
  listSessions: (projectId) => ipcRenderer.invoke("sessions:list", { projectId }),
  getSessionContext: (id) => ipcRenderer.invoke("sessions:getContext", { id }),
  stopSession: (id) => ipcRenderer.invoke("sessions:stop", { id }),
  deleteSession: (id) => ipcRenderer.invoke("sessions:delete", { id }),
  archiveSession: (id, archived) => ipcRenderer.invoke("sessions:archive", { id, archived }),
  renameSession: (sessionId, name) => ipcRenderer.invoke("session:rename", { sessionId, name }),

  // Backward-compatible pane API
  spawnPane: (opts) => ipcRenderer.invoke("pty:spawn", opts),
  attachPane: (id) => ipcRenderer.invoke("pty:attach", { id }),
  writePane: (id, data) => ipcRenderer.send("pty:input", { id, data }),
  resizePane: (id, cols, rows) => ipcRenderer.send("pty:resize", { id, cols, rows }),
  onPaneData: (id, cb) => {
    const channel = `pty:data:${id}`;
    const listener = (_e: Electron.IpcRendererEvent, data: string) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onPaneExit: (id, cb) => {
    const channel = `pty:exit:${id}`;
    const listener = (_e: Electron.IpcRendererEvent, code: number) => cb(code);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  listProjects: () => ipcRenderer.invoke("project:list"),
  createProject: (name, folder, options) => ipcRenderer.invoke("project:create", { name, folder, ...options }),
  updateProject: (id, patch) => ipcRenderer.invoke("project:update", { id, patch }),
  deleteProject: (id) => ipcRenderer.invoke("project:delete", { id }),
  exportProject: (id) => ipcRenderer.invoke("project:export", { id }),
  importProject: () => ipcRenderer.invoke("project:import"),
  recentUsage: (profile, limit) => ipcRenderer.invoke("usage:recent", { profile, limit }),
  usageSince: (since, profile) => ipcRenderer.invoke("usage:since", { profile, since }),
  usageInsights: (days) => ipcRenderer.invoke("usage:insights", { days }),
  usageLimits: () => ipcRenderer.invoke("usage:limits"),
  codexUsage: (days) => ipcRenderer.invoke("usage:codex", { days }),
  listAgentPresets: () => ipcRenderer.invoke("agents:list"),
  detectInstalledAgents: () => ipcRenderer.invoke("agents:detectInstalled"),
  getUserName: () => ipcRenderer.invoke("settings:getUserName"),
  setUserName: (name) => ipcRenderer.invoke("settings:setUserName", { name }),
  getSidebarPosition: () => ipcRenderer.invoke("settings:getSidebarPosition"),
  setSidebarPosition: (position) => ipcRenderer.invoke("settings:setSidebarPosition", { position }),
  getTheme: () => ipcRenderer.invoke("settings:getTheme"),
  setTheme: (theme) => ipcRenderer.invoke("settings:setTheme", { theme }),
  getMotionEnabled: () => ipcRenderer.invoke("settings:getMotionEnabled"),
  setMotionEnabled: (enabled) => ipcRenderer.invoke("settings:setMotionEnabled", { enabled }),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  listPluginManifests: () => ipcRenderer.invoke("plugins:list"),
  onPluginShortcut: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("plugins:shortcut", listener);
    return () => ipcRenderer.removeListener("plugins:shortcut", listener);
  },
  getAgentDefaults: () => ipcRenderer.invoke("settings:getAgentDefaults"),
  listLocalModels: (endpoint) => ipcRenderer.invoke("agents:localModels", { endpoint }),
  getAgentConfig: () => ipcRenderer.invoke("settings:getAgentConfig"),
  setLocalModel: (config) => ipcRenderer.invoke("settings:setLocalModel", { config }),
  setMcpServers: (servers) => ipcRenderer.invoke("settings:setMcpServers", { servers }),
  setOnboardingAgent: (presetId) => ipcRenderer.invoke("onboarding:setAgent", { presetId }),
  improvePrompt: (text, presetId) => ipcRenderer.invoke("prompt:improve", { text, presetId }),
  setDefaultPreset: (presetId) => ipcRenderer.invoke("settings:setDefaultPreset", { presetId }),
  setDefaultModel: (model) => ipcRenderer.invoke("settings:setDefaultModel", { model }),
  getRetentionDays: () => ipcRenderer.invoke("settings:getRetentionDays"),
  setRetentionDays: (days) => ipcRenderer.invoke("settings:setRetentionDays", { days }),
  getAutostart: () => ipcRenderer.invoke("app:getAutostart"),
  setAutostart: (on) => ipcRenderer.invoke("app:setAutostart", on),
  getPetSettings: () => ipcRenderer.invoke("pet:getSettings"),
  setPetSettings: (patch) => ipcRenderer.invoke("pet:setSettings", patch),
  resetPetSettings: () => ipcRenderer.invoke("pet:reset"),
  testPet: () => ipcRenderer.invoke("pet:test"),
  onPetOpenSession: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, info: { sessionId: string; projectId: string }) => cb(info);
    ipcRenderer.on("pet:open-session", listener);
    return () => ipcRenderer.removeListener("pet:open-session", listener);
  },
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
  isGitAvailable: () => ipcRenderer.invoke("git:isAvailable"),
  cloneRepo: (url, parentFolder) => ipcRenderer.invoke("git:clone", { url, parentFolder }),
  addApiKey: (profile, provider, apiKey, label) => ipcRenderer.invoke("auth:add", { profile, provider, apiKey, label }),
  listApiKeys: (profile) => ipcRenderer.invoke("auth:list", { profile }),
  removeApiKey: (profile, provider, target) => ipcRenderer.invoke("auth:remove", { profile, provider, target }),
  listCachedModels: () => ipcRenderer.invoke("models:listCached"),
  pickContextFile: () => ipcRenderer.invoke("dialog:pickContextFile"),
  setProjectContextText: (projectId, text, sourceLabel) =>
    ipcRenderer.invoke("project:setContextText", { projectId, text, sourceLabel }),
  setProjectContextFile: (projectId, filePath) => ipcRenderer.invoke("project:setContextFile", { projectId, filePath }),
  getProjectContext: (projectId) => ipcRenderer.invoke("project:getContext", { projectId }),
  clearProjectContext: (projectId) => ipcRenderer.invoke("project:clearContext", { projectId }),
  injectContext: (sessionId, payload) => ipcRenderer.invoke("context:inject", { sessionId, payload }),
  pickContextFiles: () => ipcRenderer.invoke("context:pickFiles"),
  readClipboardContext: () => ipcRenderer.invoke("context:readClipboard")
};

contextBridge.exposeInMainWorld("harness", api);
