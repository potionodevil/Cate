/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
const test = require("node:test");
const assert = require("node:assert");
const { buildSpawnArgs, BUILTIN_AGENT_PRESETS } = require("../dist-electron/agentPresets.js");
const { slugifyProfileName } = require("../dist-electron/projectStore.js");
const { listCachedModels } = require("../dist-electron/modelCatalog.js");
const { compactProjectContext } = require("../dist-electron/airFormat.js");

test("Phase 3: agent presets include shell, hermes, claude-code, codex, opencode", () => {
  const ids = BUILTIN_AGENT_PRESETS.map((p) => p.id);
  assert.deepStrictEqual(ids, ["shell", "hermes", "claude-code", "codex", "opencode"]);
});

test("Phase 3+4: buildSpawnArgs injects --profile and -m only for hermes-flag-aware presets", () => {
  const hermes = BUILTIN_AGENT_PRESETS.find((p) => p.id === "hermes");
  const { command, args } = buildSpawnArgs(hermes, { profile: "hh-myproject", model: "sonnet" });
  // command is resolved to an absolute executable path (see resolveHermes.ts) rather
  // than the bare "hermes" string, so Electron's main process doesn't ENOENT when its
  // PATH doesn't yet include the Hermes install dir.
  assert.ok(command.length > 0);
  assert.deepStrictEqual(args, ["--profile", "hh-myproject", "-m", "sonnet"]);
});

test("Phase 3: non-hermes agent presets never get --profile/-m injected", () => {
  const codex = BUILTIN_AGENT_PRESETS.find((p) => p.id === "codex");
  const { args } = buildSpawnArgs(codex, { profile: "hh-myproject", model: "sonnet" });
  assert.deepStrictEqual(args, []);
});

test("Phase 3: shell preset spawns no command override", () => {
  const shell = BUILTIN_AGENT_PRESETS.find((p) => p.id === "shell");
  const { command, args } = buildSpawnArgs(shell, {});
  assert.strictEqual(command, "");
  assert.deepStrictEqual(args, []);
});

test("Phase 2: project name slugifies into a safe Hermes profile name", () => {
  assert.strictEqual(slugifyProfileName("My Cool Project!"), "hh-my-cool-project");
  assert.strictEqual(slugifyProfileName("  leading/trailing  "), "hh-leading-trailing");
  assert.ok(slugifyProfileName("x".repeat(100)).length <= 43); // "hh-" + 40 chars max
});

test("Feature A: listCachedModels returns [] when the cache file is missing", () => {
  const originalLocalAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = require("path").join(require("os").tmpdir(), "hh-nonexistent-" + Date.now());
  try {
    assert.deepStrictEqual(listCachedModels(), []);
  } finally {
    process.env.LOCALAPPDATA = originalLocalAppData;
  }
});

test("Feature A: listCachedModels parses the real provider_models_cache.json shape", () => {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const tmpDir = path.join(os.tmpdir(), "hh-model-cache-test-" + Date.now());
  fs.mkdirSync(path.join(tmpDir, "hermes"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "hermes", "provider_models_cache.json"),
    JSON.stringify({
      anthropic: { fp: "x", at: 123, models: ["claude-opus-4-5-20251101", "claude-sonnet-5"] },
      malformed: { fp: "x" }
    })
  );
  const originalLocalAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = tmpDir;
  try {
    const result = listCachedModels();
    assert.deepStrictEqual(result, [{ provider: "anthropic", models: ["claude-opus-4-5-20251101", "claude-sonnet-5"] }]);
  } finally {
    process.env.LOCALAPPDATA = originalLocalAppData;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Feature D: compactProjectContext collapses blank line runs and trims", () => {
  assert.strictEqual(compactProjectContext("  line1\n\n\n\nline2  "), "line1\n\nline2");
});

test("Feature D: compactProjectContext truncates the TAIL (keeps the head) when too long", () => {
  const raw = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
  const result = compactProjectContext(raw, 30);
  assert.ok(result.startsWith("line 0"));
  assert.ok(result.includes("[... gekürzt"));
  assert.ok(result.length > 30); // head + marker, not the whole string
});

test("New-agent popover: detectInstalledAgents probes every non-shell preset and never throws", async () => {
  const { detectInstalledAgents } = require("../dist-electron/agentDetection.js");
  const results = await detectInstalledAgents();
  const ids = results.map((r) => r.id).sort();
  assert.deepStrictEqual(ids, ["claude-code", "codex", "hermes", "opencode"].sort());
  for (const r of results) {
    assert.strictEqual(typeof r.installed, "boolean");
    assert.strictEqual(typeof r.label, "string");
  }
});
