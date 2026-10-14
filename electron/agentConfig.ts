/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { app } from "electron";
import type { AppState } from "./projectStore";

/** Local-model (Ollama / any OpenAI+Anthropic-compatible server) settings. */
export interface LocalModelConfig {
  enabled: boolean;
  /** Server root, e.g. http://localhost:11434 */
  endpoint: string;
  model: string;
}

/** One MCP server / connector. stdio (command) or remote (url). */
export interface McpServer {
  id: string;
  name: string;
  enabled: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export const DEFAULT_LOCAL_ENDPOINT = "http://localhost:11434";

/** One-click connectors (all public npm MCP servers, started via npx). */
export const CONNECTOR_CATALOG: Omit<McpServer, "id" | "enabled">[] = [
  { name: "filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "."] },
  { name: "fetch", command: "npx", args: ["-y", "@modelcontextprotocol/server-fetch"] },
  { name: "memory", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
  { name: "github", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
  { name: "playwright", command: "npx", args: ["-y", "@playwright/mcp@latest"] }
];

// ---------------------------------------------------------------- banner

// 5-row pixel font; each X becomes a two-column block so letters look square.
const FONT: Record<string, string[]> = {
  H: ["X.X", "X.X", "XXX", "X.X", "X.X"],
  E: ["XXX", "X..", "XX.", "X..", "XXX"],
  R: ["XX.", "X.X", "XX.", "X.X", "X.X"],
  M: ["X...X", "XX.XX", "X.X.X", "X...X", "X...X"],
  S: ["XXX", "X..", "XXX", "..X", "XXX"],
  A: [".X.", "X.X", "XXX", "X.X", "X.X"],
  N: ["X...X", "XX..X", "X.X.X", "X..XX", "X...X"]
};

function renderWord(word: string): string[] {
  const rows = ["", "", "", "", ""];
  for (const ch of word) {
    const glyph = FONT[ch];
    if (!glyph) continue;
    for (let r = 0; r < 5; r++) {
      rows[r] += glyph[r].replace(/X/g, "██").replace(/\./g, "  ") + "  ";
    }
  }
  return rows;
}

/** ASCII splash shown for ~1.5s before an agent CLI starts, then cleared. */
export function buildBanner(agentLabel: string): string {
  const ORANGE = "\x1b[38;5;208m";
  const DIM = "\x1b[2m";
  const RESET = "\x1b[0m";
  const lines = [...renderWord("HERMES"), "", ...renderWord("HARNESS")];
  return (
    "\x1b[2J\x1b[H\r\n" +
    lines.map((l) => `  ${ORANGE}${l}${RESET}`).join("\r\n") +
    `\r\n\r\n  ${DIM}starte ${agentLabel} …${RESET}\r\n`
  );
}

// ------------------------------------------------- per-agent configuration

export interface AgentExtras {
  args: string[];
  env: Record<string, string>;
}

function mcpDir(): string {
  const dir = join(app.getPath("userData"), "mcp");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function stdioOrUrl(s: McpServer) {
  return s.url ? { type: "http", url: s.url } : { command: s.command, args: s.args ?? [], env: s.env ?? {} };
}

/** Extra CLI args + env that wire the global local-model and MCP settings into
 * a specific agent CLI. Pure config → flags; no process is started here. */
export function agentExtras(presetId: string, state: AppState): AgentExtras {
  const out: AgentExtras = { args: [], env: {} };
  const local = state.localModel;
  const useLocal = !!local?.enabled && !!local.model.trim();
  const endpoint = (local?.endpoint || DEFAULT_LOCAL_ENDPOINT).replace(/\/+$/, "");
  const model = local?.model.trim() ?? "";
  const servers = (state.mcpServers ?? []).filter((s) => s.enabled && (s.command || s.url));

  switch (presetId) {
    case "claude-code": {
      if (useLocal) {
        // Ollama (and compatible servers) expose the Anthropic Messages API.
        Object.assign(out.env, {
          ANTHROPIC_BASE_URL: endpoint,
          ANTHROPIC_AUTH_TOKEN: "ollama",
          ANTHROPIC_API_KEY: "",
          ANTHROPIC_MODEL: model,
          ANTHROPIC_SMALL_FAST_MODEL: model
        });
      }
      if (servers.length) {
        const file = join(mcpDir(), "claude.json");
        const mcpServers = Object.fromEntries(servers.map((s) => [s.name, stdioOrUrl(s)]));
        writeFileSync(file, JSON.stringify({ mcpServers }, null, 2), "utf-8");
        out.args.push("--mcp-config", file);
      }
      break;
    }
    case "codex": {
      if (useLocal) {
        out.args.push("--oss", "-m", model);
        if (endpoint !== DEFAULT_LOCAL_ENDPOINT) out.env.CODEX_OSS_BASE_URL = `${endpoint}/v1`;
      }
      for (const s of servers) {
        if (s.command) {
          out.args.push("-c", `mcp_servers.${s.name}.command=${JSON.stringify(s.command)}`);
          out.args.push("-c", `mcp_servers.${s.name}.args=${JSON.stringify(s.args ?? [])}`);
        } else if (s.url) {
          out.args.push("-c", `mcp_servers.${s.name}.url=${JSON.stringify(s.url)}`);
        }
      }
      break;
    }
    case "opencode": {
      const cfg: Record<string, unknown> = {};
      if (useLocal) {
        cfg.provider = {
          ollama: {
            npm: "@ai-sdk/openai-compatible",
            name: "Ollama",
            options: { baseURL: `${endpoint}/v1` },
            models: { [model]: {} }
          }
        };
        cfg.model = `ollama/${model}`;
      }
      if (servers.length) {
        cfg.mcp = Object.fromEntries(
          servers.map((s) => [
            s.name,
            s.url
              ? { type: "remote", url: s.url, enabled: true }
              : { type: "local", command: [s.command, ...(s.args ?? [])], environment: s.env ?? {}, enabled: true }
          ])
        );
      }
      if (Object.keys(cfg).length) out.env.OPENCODE_CONFIG_CONTENT = JSON.stringify(cfg);
      break;
    }
    case "hermes": {
      // Best effort: Hermes honours OpenAI-compatible env + -m for custom endpoints.
      if (useLocal) {
        Object.assign(out.env, { OPENAI_BASE_URL: `${endpoint}/v1`, OPENAI_API_KEY: "ollama" });
        out.args.push("-m", model);
      }
      break;
    }
  }
  return out;
}

/** Lists models installed on the local Ollama-compatible server. */
export async function listLocalModels(endpoint?: string): Promise<{ ok: boolean; models: string[]; message?: string }> {
  const base = (endpoint || DEFAULT_LOCAL_ENDPOINT).replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return { ok: false, models: [], message: `HTTP ${res.status}` };
    const json = (await res.json()) as { models?: { name: string }[] };
    return { ok: true, models: (json.models ?? []).map((m) => m.name) };
  } catch (err) {
    return { ok: false, models: [], message: err instanceof Error ? err.message : String(err) };
  }
}
