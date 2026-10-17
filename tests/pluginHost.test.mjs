import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPluginHost, PLUGIN_MODULES, SECRET_SET_MARKER } from "../dist-electron/pluginHost.js";

const fakeCrypto = {
  isAvailable: () => true,
  encrypt: (s) => Buffer.from("ENC:" + s.split("").reverse().join("")).toString("base64"),
  decrypt: (b) => Buffer.from(b, "base64").toString().slice(4).split("").reverse().join("")
};

function mk(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pluginhost-"));
  const stateFile = join(dir, "plugins-state.json");
  const host = createPluginHost({ stateFile, appDataDir: dir, crypto: fakeCrypto, ...extra });
  return { dir, stateFile, host, again: () => createPluginHost({ stateFile, appDataDir: dir, crypto: fakeCrypto, ...extra }) };
}

test("all 20 modules are listed with defaults", () => {
  const { host, dir } = mk();
  const list = host.listPlugins();
  assert.equal(list.length, 20);
  assert.equal(PLUGIN_MODULES.length, 20);
  const on = list.filter((p) => p.enabled).map((p) => p.id).sort();
  assert.deepEqual(on, ["commandPolicy", "gitDiff", "gitTimeline", "secretGuard", "vramThrottle"]);
  for (const p of list) assert.ok(p.operations.length > 0, p.id);
  rmSync(dir, { recursive: true, force: true });
});

test("enable state persists across host instances", () => {
  const { host, again, dir } = mk();
  assert.equal(host.setEnabled("notifier", true).ok, true);
  assert.equal(host.setEnabled("gitDiff", false).ok, true);
  const h2 = again();
  assert.equal(h2.isEnabled("notifier"), true);
  assert.equal(h2.isEnabled("gitDiff"), false);
  assert.equal(h2.setEnabled("nope", true).ok, false);
  rmSync(dir, { recursive: true, force: true });
});

test("disabled plugins refuse invoke, enabled ones run", async () => {
  const { host, dir } = mk();
  const refused = await host.invoke("notifier", "preview", { event: { type: "custom", title: "x" } });
  assert.equal(refused.ok, false);
  assert.match(refused.message, /deaktiviert/);
  host.setEnabled("notifier", true);
  const ok = await host.invoke("notifier", "preview", { event: { type: "custom", title: "x" } });
  assert.equal(ok.ok, true);
  assert.equal((await host.invoke("nope", "x")).ok, false);
  assert.equal((await host.invoke("secretGuard", "doesNotExist")).ok, false);
  rmSync(dir, { recursive: true, force: true });
});

test("invoke never throws", async () => {
  const bad = { manifest: { id: "boom", name: "Boom", version: "1" }, operations: { go: async () => { throw new Error("kaputt"); } } };
  const { host, dir } = mk({ modules: [bad] });
  host.setEnabled("boom", true);
  const r = await host.invoke("boom", "go", {});
  assert.deepEqual(r, { ok: false, message: "kaputt" });
  assert.equal(host.listPlugins()[0].status, "error");
  rmSync(dir, { recursive: true, force: true });
});

test("secrets are encrypted on disk and never returned", () => {
  const { host, stateFile, again, dir } = mk();
  const SECRET = "sk-super-secret-123";
  assert.equal(host.setConfig("dexFeed", "axiomApiKey", SECRET).ok, true);
  assert.equal(host.setConfig("dexFeed", "provider", "axiom").ok, true);
  assert.equal(host.setConfig("dexFeed", "timeoutMs", "5000").ok, true);
  assert.equal(host.setConfig("dexFeed", "bogus", "x").ok, false);
  assert.equal(host.setConfig("dexFeed", "provider", "invalid").ok, false);
  const cfg = host.getConfig();
  assert.equal(cfg.dexFeed.axiomApiKey, SECRET === cfg.dexFeed.axiomApiKey ? "LEAK" : SECRET_SET_MARKER);
  assert.equal(cfg.dexFeed.provider, "axiom");
  assert.equal(cfg.dexFeed.timeoutMs, 5000);
  assert.ok(!JSON.stringify(host.listPlugins()).includes(SECRET));
  assert.ok(!JSON.stringify(cfg).includes(SECRET));
  assert.ok(!readFileSync(stateFile, "utf8").includes(SECRET));
  assert.equal(again().getConfig().dexFeed.axiomApiKey, SECRET_SET_MARKER);
  host.setConfig("dexFeed", "axiomApiKey", "");
  assert.equal("axiomApiKey" in host.getConfig().dexFeed, false);
  rmSync(dir, { recursive: true, force: true });
});

test("secret fallback without crypto is stored but still not returned", () => {
  const { dir, stateFile } = mk();
  const h = createPluginHost({ stateFile, appDataDir: dir, crypto: null });
  h.setConfig("dexFeed", "axiomApiKey", "plainsecret");
  assert.ok(!JSON.stringify(h.getConfig()).includes("plainsecret"));
  assert.ok(!JSON.stringify(h.listPlugins()).includes("plainsecret"));
  rmSync(dir, { recursive: true, force: true });
});

test("invoke injects config/appDataDir/projectRoot; explicit args win", async () => {
  const seen = [];
  const mod = {
    manifest: { id: "probe", name: "Probe", version: "1", configFields: [{ key: "k", label: "K", type: "string", default: "d" }, { key: "tok", label: "T", type: "secret" }] },
    operations: { go: async (a) => { seen.push(a); return { ok: true }; } }
  };
  const { host, dir } = mk({ modules: [mod] });
  host.setEnabled("probe", true);
  host.setConfig("probe", "tok", "abc");
  await host.invoke("probe", "go", {}, { projectRoot: "/p" });
  assert.equal(seen[0].config.k, "d");
  assert.equal(seen[0].config.tok, "abc");
  assert.equal(seen[0].appDataDir, dir);
  assert.equal(seen[0].projectRoot, "/p");
  await host.invoke("probe", "go", { projectRoot: "/explicit", appDataDir: "/x", config: { k: "over" } }, { projectRoot: "/p" });
  assert.equal(seen[1].projectRoot, "/explicit");
  assert.equal(seen[1].appDataDir, "/x");
  assert.equal(seen[1].config.k, "over");
  assert.equal(seen[1].config.tok, "abc");
  rmSync(dir, { recursive: true, force: true });
});

test("corrupt state file is backed up instead of silently resetting toggles", async () => {
  const { writeFileSync, readdirSync } = await import("node:fs");
  const { host, stateFile, dir, again } = mk();
  host.setEnabled("notifier", true);
  writeFileSync(stateFile, "{ kaputt", "utf8");
  const fresh = again();
  assert.equal(fresh.listPlugins().find((p) => p.id === "notifier").enabled, false);
  assert.ok(readdirSync(dir).some((f) => f.includes(".corrupt-")));
  rmSync(dir, { recursive: true, force: true });
});

test("enabled state survives a new host instance", () => {
  const { host, dir, again } = mk();
  host.setEnabled("notifier", true);
  host.setEnabled("gitDiff", false);
  const list = again().listPlugins();
  assert.equal(list.find((p) => p.id === "notifier").enabled, true);
  assert.equal(list.find((p) => p.id === "gitDiff").enabled, false);
  rmSync(dir, { recursive: true, force: true });
});
