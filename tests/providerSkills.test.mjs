/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

// Tests laufen gegen das kompilierte Modul in dist-electron (gleicher Weg wie
// die plugin*-Tests). Ohne Build wird der Block übersprungen, nicht rot.
const modPath = new URL("../dist-electron/providerSkills.js", import.meta.url);
const skip = !existsSync(modPath) && "dist-electron not built";
const req = createRequire(import.meta.url);
const path = (u) => u.pathname.replace(/^\/([A-Za-z]:)/, "$1");

/* ------------------------------ Fixture-Strings ------------------------------ */

// Getreue Nachbildung der echten `hermes skills list`-Tabelle (Box-Zeichnung,
// leere Kategorie-Zellen, Footer-Zähler).
const HERMES_SKILLS_OUTPUT = [
  "Installed Skills",
  "┌────────────────────────┬──────────────────────┬─────────┬─────────┬─────────┐",
  "│ Name                   │ Category             │ Source  │ Trust   │ Status  │",
  "├────────────────────────┼──────────────────────┼─────────┼─────────┼─────────┤",
  "│ agent-branch-handoff   │                      │ local   │ local   │ enabled │",
  "│ claude-code            │ autonomous-ai-agents │ builtin │ builtin │ enabled │",
  "│ ecommerce-campaign-ro… │ creative             │ local   │ local   │ disabled │",
  "│ blocked-page-recovery  │ web                  │ hub     │ trusted │ enabled │",
  "└────────────────────────┴──────────────────────┴─────────┴─────────┴─────────┘",
  "0 hub-installed, 52 builtin, 7 local — 59 enabled, 0 disabled"
].join("\r\n");

// Zeynep-Zeilenwächter-Fall: NBSP statt Leerzeichen, ANSI-Sequence, BOM.
const HERMES_NOISY_ROW = "\uFEFF│ noisy-skill │\u00a0creative │ \u001b[1mlocal\u001b[0m │ local │ disabled │";

// Claude Code: installed_plugins.json v2 + settings.json enabledPlugins.
const CLAUDE_REGISTRY = JSON.stringify({
  version: 2,
  plugins: {
    "frontend-design@claude-plugins-official": [
      { scope: "user", installPath: "C:\\u\\p\\frontend-design", version: "641d925db5a6" }
    ],
    "ponytail@ponytail": [{ scope: "user", installPath: "C:\\u\\p\\ponytail", version: "4.8.4" }]
  }
});
const CLAUDE_SETTINGS = JSON.stringify({
  enabledPlugins: { "frontend-design@claude-plugins-official": true, "ponytail@ponytail": false }
});
const CLAUDE_DIRS = ["impeccable", "synced", ".hidden"];

// Codex: `codex plugin list` (Marketplace-Blöcke) und config.toml-Fallback.
const CODEX_PLUGIN_LIST = [
  "",
  "Marketplace `openai-bundled`",
  "",
  "PLUGIN                               STATUS              VERSION        SOURCE",
  "codex-app-tools@openai-bundled       installed, enabled  0.1.6          C:\\u\\plugins\\codex-app-tools",
  "browser@openai-bundled               installed, enabled  26.1007.21434  C:\\u\\plugins\\browser",
  "chrome@openai-bundled                not installed                      C:\\u\\plugins\\chrome",
  "",
  "Marketplace `openai-primary-runtime`",
  "",
  "PLUGIN                                   STATUS              VERSION        SOURCE",
  "pdf@openai-primary-runtime               installed, enabled  26.1011.11113  C:\\u\\plugins\\pdf"
].join("\n");

const CODEX_TOML = [
  '[plugins."codex-app-tools@openai-bundled"]',
  "enabled = true",
  "",
  '[plugins."browser@openai-bundled"]',
  "enabled = true",
  "",
  '[plugins."spreadsheets@openai-primary-runtime"]',
  "enabled = false",
  "",
  "[mcp_servers.node_repl]",
  "args = []"
].join("\n");

// OpenCode: opencode.jsonc mit Kommentaren, Nackkommas, "-", MCP, Provider.
const OPENCODE_JSONC = [
  "{",
  '  // $schema keeps tooling happy',
  '  "$schema": "https://opencode.ai/config.json",',
  '  "plugin": ["some-plugin", "-disabled-plugin"], // trailing comment',
  '  "mcp": {',
  '    "myserver": { "enabled": true, "command": "node", "args": ["x.js"], },',
  '    "offserver": { "enabled": false },',
  '  },',
  '  "provider": { "opencode": {}, },',
  "}",
  ""
].join("\n");

/* ---------------------------------- Tests ---------------------------------- */

test("hermes: Tabelle geparst inkl. leerer Kategorie und Footer-Zähler", { skip }, () => {
  const { parseHermesSkillsList } = req(path(modPath));
  const { rows, countLine } = parseHermesSkillsList(HERMES_SKILLS_OUTPUT);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((r) => r.name),
    ["agent-branch-handoff", "claude-code", "ecommerce-campaign-ro", "blocked-page-recovery"]
  );
  assert.equal(rows[0].category, undefined); // leere Kategorie bleibt leer
  assert.equal(rows[2].status, "disabled");
  assert.equal(rows[3].source, "hub");
  assert.equal(rows[3].trust, "trusted");
  assert.match(countLine, /59 enabled, 0 disabled/);
});

test("hermes: Kopf-/Rahmenzeilen und Nicht-Tabellenzeilen werden überlesen", { skip }, () => {
  const { parseHermesSkillsList } = req(path(modPath));
  const { rows } = parseHermesSkillsList(HERMES_SKILLS_OUTPUT);
  assert.ok(!rows.some((r) => r.name === "Name"));
  const garbage = parseHermesSkillsList("irgendein text ohne Tabelle\n\n");
  assert.deepEqual(garbage.rows, []);
});

test("hermes: Zeynep-Zeilenwächter (BOM/NBSP/ANSI) fällt nicht auf die Nase", { skip }, () => {
  const { parseHermesSkillsList } = req(path(modPath));
  const { rows } = parseHermesSkillsList(HERMES_NOISY_ROW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "noisy-skill");
  assert.equal(rows[0].source, "local");
  assert.equal(rows[0].status, "disabled");
});

test("claude: Registry v2 + enabledPlugins-Schalter korrekt gemerged", { skip }, () => {
  const { parseClaudePlugins } = req(path(modPath));
  const rows = parseClaudePlugins(CLAUDE_REGISTRY, CLAUDE_SETTINGS);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.name),
    ["frontend-design", "ponytail"]
  );
  assert.equal(rows[0].status, "enabled");
  assert.equal(rows[0].marketplace, "claude-plugins-official");
  assert.equal(rows[0].version, "641d925db5a6");
  assert.equal(rows[1].status, "disabled");
});

test("claude: kaputtes JSON liefert leere Liste, nie einen Wurf", { skip }, () => {
  const { parseClaudePlugins } = req(path(modPath));
  assert.deepEqual(parseClaudePlugins("{definitiv kaputt", CLAUDE_SETTINGS), []);
  assert.deepEqual(parseClaudePlugins("", ""), []);
});

test("claude: Skill-Verzeichnisse ohne 'synced'/Punkt-Ordner", { skip }, () => {
  const { parseClaudeSkillDirs } = req(path(modPath));
  const rows = parseClaudeSkillDirs(CLAUDE_DIRS);
  assert.deepEqual(
    rows.map((r) => r.name),
    ["impeccable"]
  );
});

test("codex: plugin list-Blöcke inkl. 'not installed' geparst", { skip }, () => {
  const { parseCodexPluginList } = req(path(modPath));
  const rows = parseCodexPluginList(CODEX_PLUGIN_LIST);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((r) => r.name),
    ["codex-app-tools", "browser", "chrome", "pdf"]
  );
  assert.equal(rows[2].status, "disabled"); // not installed
  assert.equal(rows[2].version, undefined);
  assert.equal(rows[0].marketplace, "openai-bundled");
  assert.equal(rows[3].version, "26.1011.11113");
});

test("codex: config.toml [plugins.\"...\"]-Sektionen als Fallback", { skip }, () => {
  const { parseCodexTomlPlugins } = req(path(modPath));
  const rows = parseCodexTomlPlugins(CODEX_TOML);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, "codex-app-tools");
  assert.equal(rows[0].status, "enabled");
  assert.equal(rows[2].name, "spreadsheets");
  assert.equal(rows[2].status, "disabled");
  assert.equal(rows[2].marketplace, "openai-primary-runtime");
});

test("opencode: JSONC (Kommentare, Nackkommas) geparst; '-' = deaktiviert", { skip }, () => {
  const { stripJsonc, parseOpenCodeConfig } = req(path(modPath));
  const stripped = stripJsonc(OPENCODE_JSONC);
  assert.doesNotThrow(() => JSON.parse(stripped));
  const { plugins, configs } = parseOpenCodeConfig(OPENCODE_JSONC);
  assert.deepEqual(
    plugins.map((p) => p.name),
    ["some-plugin", "disabled-plugin"]
  );
  assert.equal(plugins[1].status, "disabled");
  // MCP + Provider landen in configs
  assert.ok(configs.some((c) => c.name === "MCP: myserver" && c.value === "aktiviert"));
  assert.ok(configs.some((c) => c.name === "MCP: offserver" && c.value === "deaktiviert"));
  assert.ok(configs.some((c) => c.name === "Provider: opencode"));
});

test("opencode: Kommentare innerhalb von Strings bleiben erhalten", { skip }, () => {
  const { stripJsonc } = req(path(modPath));
  const keep = '{"url": "https://example.com/a//b"}';
  assert.equal(JSON.parse(stripJsonc(keep)).url, "https://example.com/a//b");
});
