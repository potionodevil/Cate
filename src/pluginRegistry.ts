/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import type { ComponentType, ReactNode } from "react";

export type PluginSlot = "action" | "sidebar" | "context" | "notification";
export type PluginContextKind = "session" | "project" | "file" | "background";

export interface PluginAction {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  keywords?: string[];
  icon?: ComponentType<{ size?: any; className?: any }>;
  /** When set, the action is also available in matching context menus. */
  contextKinds?: PluginContextKind[];
  /** Shown greyed out and not clickable (e.g. Import/Export without a selected project). */
  disabled?: boolean;
  run: (context?: { kind: PluginContextKind; targetId?: string }) => void | Promise<void>;
}

export interface SessionFinishedEvent {
  sessionId: string;
  paneId?: string;
  exitCode?: number;
  label?: string;
}

export interface PluginNotification {
  id: string;
  label: string;
  notify: (event: SessionFinishedEvent) => void | Promise<void>;
}

export interface PluginSidebarIcon {
  id: string;
  label: string;
  icon: ComponentType<{ size?: any; className?: any }>;
  badge?: string | number;
  panel?: ComponentType;
  onSelect?: () => void;
}

export interface PluginContextProvider {
  id: string;
  label: string;
  matches: (context: { kind: string; targetId?: string }) => boolean;
  render: (context: { kind: string; targetId?: string }) => ReactNode;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  slots?: PluginSlot[];
}

export interface PluginDefinition extends PluginManifest {
  actions?: PluginAction[];
  sidebarIcons?: PluginSidebarIcon[];
  contextProviders?: PluginContextProvider[];
  notifications?: PluginNotification[];
}

export interface PluginRegistrySnapshot {
  manifests: PluginManifest[];
  actions: PluginAction[];
  sidebarIcons: PluginSidebarIcon[];
  contextProviders: PluginContextProvider[];
  notifications: PluginNotification[];
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

export class PluginRegistry {
  private readonly plugins = new Map<string, PluginDefinition>();
  private readonly disabled = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly defaultNotification: PluginNotification = {
    id: "harness.session-finished",
    label: "Sitzungsabschluss melden",
    notify: (event) => {
      if (typeof Notification === "undefined" || Notification.permission === "denied") return;
      const show = () => new Notification("Sitzung abgeschlossen", { body: event.label ?? event.sessionId });
      if (Notification.permission === "granted") show();
      else void Notification.requestPermission().then((permission) => { if (permission === "granted") show(); });
    }
  };

  register(plugin: PluginDefinition): () => void {
    this.validateManifest(plugin);
    this.plugins.set(plugin.id, { ...plugin, slots: plugin.slots ? [...plugin.slots] : undefined });
    this.emit();
    return () => this.unregister(plugin.id);
  }

  registerManifest(manifest: PluginManifest): () => void {
    this.validateManifest(manifest);
    const existing = this.plugins.get(manifest.id);
    this.plugins.set(manifest.id, existing ? { ...existing, ...manifest } : { ...manifest });
    this.emit();
    return () => { if (!existing) this.unregister(manifest.id); };
  }

  unregister(pluginId: string): void {
    this.disabled.delete(pluginId);
    if (this.plugins.delete(pluginId)) this.emit();
  }

  clear(): void {
    if (this.plugins.size === 0) return;
    this.plugins.clear();
    this.disabled.clear();
    this.emit();
  }

  setEnabled(pluginId: string, enabled: boolean): void {
    if (!this.plugins.has(pluginId)) return;
    if (enabled) this.disabled.delete(pluginId);
    else this.disabled.add(pluginId);
    this.emit();
  }

  isEnabled(pluginId: string): boolean {
    return this.plugins.has(pluginId) && !this.disabled.has(pluginId);
  }

  getRegisteredPlugins(): Array<PluginManifest & { enabled: boolean }> {
    return Array.from(this.plugins.values()).map(({ actions: _a, sidebarIcons: _s, contextProviders: _c, notifications: _n, ...manifest }) => ({ ...manifest, enabled: this.isEnabled(manifest.id) }));
  }

  getSnapshot(): PluginRegistrySnapshot {
    const plugins = Array.from(this.plugins.values()).filter((plugin) => this.isEnabled(plugin.id));
    return {
      manifests: plugins.map(({ actions: _a, sidebarIcons: _s, contextProviders: _c, notifications: _n, ...manifest }) => manifest),
      actions: uniqueById(plugins.flatMap((plugin) => plugin.actions ?? [])),
      sidebarIcons: uniqueById(plugins.flatMap((plugin) => plugin.sidebarIcons ?? [])),
      contextProviders: uniqueById(plugins.flatMap((plugin) => plugin.contextProviders ?? [])),
      notifications: uniqueById([this.defaultNotification, ...plugins.flatMap((plugin) => plugin.notifications ?? [])])
    };
  }

  async notifySessionFinished(event: SessionFinishedEvent): Promise<void> {
    await Promise.all(this.getSnapshot().notifications.map((notification) => notification.notify(event)));
  }

  registerNotification(notification: PluginNotification): () => void {
    const id = `notification:${notification.id}`;
    const plugin: PluginDefinition = { id, name: notification.label, version: "runtime", notifications: [notification], slots: ["notification"] };
    return this.register(plugin);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    Array.from(this.listeners).forEach((listener) => listener());
  }

  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id.trim()) throw new Error("Plugin benötigt eine ID.");
    if (!manifest.name.trim()) throw new Error("Plugin benötigt einen Namen.");
    if (!manifest.version.trim()) throw new Error("Plugin benötigt eine Version.");
  }
}

export const pluginRegistry = new PluginRegistry();

export function registerPlugin(plugin: PluginDefinition): () => void {
  return pluginRegistry.register(plugin);
}

export function getPluginRegistrySnapshot(): PluginRegistrySnapshot {
  return pluginRegistry.getSnapshot();
}
