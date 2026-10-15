/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
// Plugin-Host: statische Modulliste, Aktivierungs-/Konfigurationszustand,
// Verschlüsselung von Geheimnissen und ein einziger Dispatcher (invoke).
// Reine Logik: Electron wird nur in getDefaultPluginHost() geladen, damit die
// Tests ohne Electron laufen (createPluginHost bekommt alle Abhängigkeiten).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { dirname, join } from "path";

import * as astRefactor from "./plugins/astRefactor";
import * as testHealer from "./plugins/testHealer";
import * as vulnScanner from "./plugins/vulnScanner";
import * as codeRag from "./plugins/codeRag";
import * as gitTimeline from "./plugins/gitTimeline";
import * as gitDiff from "./plugins/gitDiff";
import * as notifier from "./plugins/notifier";
import * as taskSync from "./plugins/taskSync";
import * as prReviewer from "./plugins/prReviewer";
import * as vramThrottle from "./plugins/vramThrottle";
import * as sessionTeleport from "./plugins/sessionTeleport";
import * as commandPolicy from "./plugins/commandPolicy";
import * as secretGuard from "./plugins/secretGuard";
import * as agentRouter from "./plugins/agentRouter";
import * as peerReview from "./plugins/peerReview";
import * as contractGuard from "./plugins/contractGuard";
import * as dexFeed from "./plugins/dexFeed";
import * as visualDiff from "./plugins/visualDiff";
import * as voiceBridge from "./plugins/voiceBridge";

export type PluginOp = (args: any) => Promise<unknown>;

export interface PluginModule {
  manifest: {
    id: string;
    name: string;
    version: string;
    description?: string;
    category?: string;
    configFields?: ReadonlyArray<Record<string, any>>;
  };
  operations: Record<string, PluginOp>;
}

export interface PluginConfigFieldInfo {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "secret" | "list";
  description?: string;
  placeholder?: string;
  default?: unknown;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}

export interface HostPluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  configFields: PluginConfigFieldInfo[];
  operations: string[];
  enabled: boolean;
  status: "active" | "inactive" | "error";
  statusMessage?: string;
}

export type HostResult = { ok: true; [k: string]: unknown } | { ok: false; message: string };

/** Marker, den der Renderer statt eines Geheimnisses sieht (nur wenn gesetzt). */
export const SECRET_SET_MARKER = "__secret_set__";

export const DEFAULT_ENABLED: ReadonlySet<string> = new Set(["gitDiff", "gitTimeline", "secretGuard", "commandPolicy", "vramThrottle"]);

const DEFAULT_CATEGORY: Record<string, string> = {
  astRefactor: "code",
  testHealer: "code",
  prReviewer: "code",
  gitDiff: "workflow",
  gitTimeline: "workflow",
  notifier: "ui",
  taskSync: "workflow",
  vramThrottle: "hardware",
  sessionTeleport: "context",
  codeRag: "context",
  vulnScanner: "security"
};

/** Statische Importtabelle aller 19 Plugin-Module. */
export const PLUGIN_MODULES: PluginModule[] = [
  astRefactor, testHealer, vulnScanner, codeRag, gitTimeline, gitDiff, notifier, taskSync, prReviewer, vramThrottle,
  sessionTeleport, commandPolicy, secretGuard, agentRouter, peerReview, contractGuard, dexFeed, visualDiff, voiceBridge
] as unknown as PluginModule[];

export interface SecretCrypto {
  isAvailable(): boolean;
  encrypt(plain: string): string; // -> base64
  decrypt(b64: string): string;
}

interface StoredSecret {
  enc: boolean;
  v: string;
}

interface PluginState {
  enabled: Record<string, boolean>;
  config: Record<string, Record<string, unknown>>;
  secrets: Record<string, Record<string, StoredSecret>>;
}

export interface PluginHostOptions {
  /** Pfad der plugins-state.json. */
  stateFile: string;
  /** App-Datenordner (wird als args.appDataDir injiziert). */
  appDataDir: string;
  crypto?: SecretCrypto | null;
  modules?: PluginModule[];
}

export interface InvokeContext {
  projectRoot?: string;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function normalizeField(raw: Record<string, any>): PluginConfigFieldInfo {
  const options = Array.isArray(raw.options)
    ? raw.options.map((o: any) => (typeof o === "string" ? { value: o, label: o } : { value: String(o.value), label: String(o.label ?? o.value) }))
    : undefined;
  const out: PluginConfigFieldInfo = {
    key: String(raw.key),
    label: String(raw.label ?? raw.key),
    type: (raw.type ?? "string") as PluginConfigFieldInfo["type"]
  };
  const description = raw.description ?? raw.help;
  if (description !== undefined) out.description = String(description);
  if (raw.placeholder !== undefined) out.placeholder = String(raw.placeholder);
  if (raw.default !== undefined) out.default = raw.default;
  if (raw.required !== undefined) out.required = !!raw.required;
  if (options) out.options = options;
  if (typeof raw.min === "number") out.min = raw.min;
  if (typeof raw.max === "number") out.max = raw.max;
  return out;
}

function emptyState(): PluginState {
  return { enabled: {}, config: {}, secrets: {} };
}

function coerce(field: PluginConfigFieldInfo, value: unknown): unknown {
  switch (field.type) {
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) throw new Error(`„${field.label}“ erwartet eine Zahl.`);
      return n;
    }
    case "boolean":
      return value === true || value === "true";
    case "list":
      if (Array.isArray(value)) return value.map(String);
      if (typeof value === "string") return value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      throw new Error(`„${field.label}“ erwartet eine Liste.`);
    case "select": {
      const v = String(value);
      if (field.options && !field.options.some((o) => o.value === v)) throw new Error(`Ungültiger Wert für „${field.label}“.`);
      return v;
    }
    default:
      return typeof value === "string" ? value : String(value ?? "");
  }
}

export function createPluginHost(opts: PluginHostOptions) {
  const modules = opts.modules ?? PLUGIN_MODULES;
  const byId = new Map<string, PluginModule>(modules.map((m) => [m.manifest.id, m]));
  const crypto = opts.crypto ?? null;
  let state: PluginState | null = null;
  const lastError = new Map<string, string>();

  function load(): PluginState {
    if (state) return state;
    try {
      const parsed = JSON.parse(readFileSync(opts.stateFile, "utf8")) as Partial<PluginState>;
      state = {
        enabled: parsed.enabled && typeof parsed.enabled === "object" ? parsed.enabled : {},
        config: parsed.config && typeof parsed.config === "object" ? parsed.config : {},
        secrets: parsed.secrets && typeof parsed.secrets === "object" ? parsed.secrets : {}
      };
    } catch (e) {
      // Fehlende Datei = erster Start. Eine vorhandene, aber unlesbare Datei wird gesichert, statt
      // beim naechsten save() stillschweigend alle Schalter auf die Defaults zurueckzusetzen.
      if (existsSync(opts.stateFile)) {
        try {
          renameSync(opts.stateFile, `${opts.stateFile}.corrupt-${Date.now()}`);
        } catch {
          /* best effort */
        }
        console.warn(`[plugins] ${opts.stateFile} unlesbar (${errMsg(e)}), Sicherung angelegt.`);
      }
      state = emptyState();
    }
    return state;
  }

  function save(): void {
    const dir = dirname(opts.stateFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${opts.stateFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(load(), null, 2), "utf8");
    renameSync(tmp, opts.stateFile);
  }

  function fieldsOf(mod: PluginModule): PluginConfigFieldInfo[] {
    return (mod.manifest.configFields ?? []).map(normalizeField);
  }

  function isEnabled(id: string): boolean {
    const v = load().enabled[id];
    return typeof v === "boolean" ? v : DEFAULT_ENABLED.has(id);
  }

  function readSecret(id: string, key: string): string | undefined {
    const s = load().secrets[id]?.[key];
    if (!s) return undefined;
    if (!s.enc) return s.v;
    try {
      return crypto ? crypto.decrypt(s.v) : undefined;
    } catch {
      return undefined;
    }
  }

  /** Vollständige Konfiguration inkl. Defaults und entschlüsselter Geheimnisse – nur für den Hauptprozess. */
  function resolvedConfig(mod: PluginModule): Record<string, unknown> {
    const id = mod.manifest.id;
    const out: Record<string, unknown> = {};
    for (const f of fieldsOf(mod)) {
      if (f.type === "secret") {
        const s = readSecret(id, f.key);
        if (s !== undefined) out[f.key] = s;
      } else if (load().config[id]?.[f.key] !== undefined) out[f.key] = load().config[id][f.key];
      else if (f.default !== undefined) out[f.key] = f.default;
    }
    return out;
  }

  function listPlugins(): HostPluginInfo[] {
    return modules.map((mod) => {
      const m = mod.manifest;
      const enabled = isEnabled(m.id);
      const err = lastError.get(m.id);
      return {
        id: m.id,
        name: m.name,
        version: m.version,
        description: m.description ?? "",
        category: m.category ?? DEFAULT_CATEGORY[m.id] ?? "tools",
        configFields: fieldsOf(mod),
        operations: Object.keys(mod.operations),
        enabled,
        status: err ? "error" : enabled ? "active" : "inactive",
        ...(err ? { statusMessage: err } : {})
      };
    });
  }

  /** Nur nicht-geheime Werte; Geheimnisse erscheinen nur als Marker, wenn gesetzt. */
  function getConfig(): Record<string, Record<string, unknown>> {
    const out: Record<string, Record<string, unknown>> = {};
    for (const mod of modules) {
      const id = mod.manifest.id;
      const cfg: Record<string, unknown> = {};
      for (const f of fieldsOf(mod)) {
        if (f.type === "secret") {
          if (load().secrets[id]?.[f.key]) cfg[f.key] = SECRET_SET_MARKER;
        } else if (load().config[id]?.[f.key] !== undefined) cfg[f.key] = load().config[id][f.key];
      }
      out[id] = cfg;
    }
    return out;
  }

  function setEnabled(id: string, enabled: boolean): HostResult {
    if (!byId.has(id)) return { ok: false, message: `Unbekanntes Plugin: ${id}` };
    try {
      load().enabled[id] = !!enabled;
      if (enabled) lastError.delete(id);
      save();
      return { ok: true };
    } catch (e) {
      return { ok: false, message: errMsg(e) };
    }
  }

  function setConfig(id: string, key: string, value: unknown): HostResult {
    const mod = byId.get(id);
    if (!mod) return { ok: false, message: `Unbekanntes Plugin: ${id}` };
    try {
      const field = fieldsOf(mod).find((f) => f.key === key);
      if (!field) return { ok: false, message: `Unbekanntes Feld: ${key}` };
      const st = load();
      if (field.type === "secret") {
        const secrets = (st.secrets[id] ??= {});
        const plain = String(value ?? "");
        if (plain === "") {
          delete secrets[key];
        } else if (crypto && crypto.isAvailable()) {
          secrets[key] = { enc: true, v: crypto.encrypt(plain) };
        } else {
          secrets[key] = { enc: false, v: plain };
        }
      } else {
        (st.config[id] ??= {})[key] = coerce(field, value);
      }
      save();
      return { ok: true };
    } catch (e) {
      return { ok: false, message: errMsg(e) };
    }
  }

  /** Ergänzt Argumente um gespeicherte Konfiguration/Pfade; explizite Argumente gewinnen immer. */
  function buildArgs(mod: PluginModule, args: unknown, ctx?: InvokeContext): any {
    const id = mod.manifest.id;
    const explicit = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
    const cfg = resolvedConfig(mod);
    const injected: Record<string, unknown> = { ...cfg, config: cfg, appDataDir: opts.appDataDir };
    const root = typeof explicit.projectRoot === "string" && explicit.projectRoot ? explicit.projectRoot : ctx?.projectRoot;
    if (root) injected.projectRoot = root;
    if (id === "commandPolicy") {
      injected.policy = {
        defaultDecision: cfg.defaultDecision,
        whitelist: cfg.whitelist,
        disabledDefaults: cfg.disabledDefaults
      };
    }
    if (id === "codeRag" && root) {
      injected.indexDir = join(opts.appDataDir, "code-rag", createHash("sha1").update(root).digest("hex").slice(0, 12));
    }
    const merged: Record<string, unknown> = { ...injected, ...explicit };
    // Teil-Objekte (config/policy) nicht komplett überschreiben, sondern ergänzen.
    for (const k of ["config", "policy"]) {
      const a = injected[k];
      const b = explicit[k];
      if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(b)) {
        merged[k] = { ...(a as object), ...(b as object) };
      }
    }
    return merged;
  }

  async function invoke(id: string, op: string, args?: unknown, ctx?: InvokeContext): Promise<unknown> {
    try {
      const mod = byId.get(String(id));
      if (!mod) return { ok: false, message: `Unbekanntes Plugin: ${id}` };
      if (!isEnabled(mod.manifest.id)) return { ok: false, message: `Plugin „${mod.manifest.name}“ ist deaktiviert.` };
      if (typeof op !== "string" || !Object.prototype.hasOwnProperty.call(mod.operations, op)) {
        return { ok: false, message: `Unbekannte Operation: ${String(op)}` };
      }
      const result = await mod.operations[op](buildArgs(mod, args, ctx));
      lastError.delete(mod.manifest.id);
      return result === undefined ? { ok: true } : result;
    } catch (e) {
      const message = errMsg(e);
      lastError.set(String(id), message);
      return { ok: false, message };
    }
  }

  /** Ereignis an interessierte Plugins (derzeit: sessionEnded -> notifier). Wirft nie. */
  async function emit(event: "sessionEnded", payload: { sessionId: string; name?: string; status?: string }): Promise<void> {
    try {
      if (event === "sessionEnded" && isEnabled("notifier")) {
        await invoke("notifier", "send", {
          event: {
            type: "task_done",
            title: `Session beendet: ${payload.name ?? payload.sessionId}`,
            message: payload.status ? `Status: ${payload.status}` : undefined
          }
        });
      }
    } catch {
      /* Benachrichtigungen dürfen nie den Sitzungsabschluss stören */
    }
  }

  return { listPlugins, invoke, setEnabled, setConfig, getConfig, isEnabled, emit, appDataDir: opts.appDataDir };
}

export type PluginHost = ReturnType<typeof createPluginHost>;

let defaultHost: PluginHost | null = null;

/** Produktiver Host: userData/plugins-state.json, Geheimnisse via Electron safeStorage. */
export function getDefaultPluginHost(): PluginHost {
  if (defaultHost) return defaultHost;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app, safeStorage } = require("electron") as typeof import("electron");
  const dir = app.getPath("userData");
  const crypto: SecretCrypto = {
    isAvailable: () => {
      try {
        return safeStorage.isEncryptionAvailable();
      } catch {
        return false;
      }
    },
    encrypt: (plain) => safeStorage.encryptString(plain).toString("base64"),
    decrypt: (b64) => safeStorage.decryptString(Buffer.from(b64, "base64"))
  };
  defaultHost = createPluginHost({ stateFile: join(dir, "plugins-state.json"), appDataDir: dir, crypto });
  return defaultHost;
}
