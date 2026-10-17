/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const builtCustom = new URL("../dist-electron/customPlugins.js", import.meta.url);
const builtHost = new URL("../dist-electron/pluginHost.js", import.meta.url);
const skip = !existsSync(builtCustom) && "dist-electron not built";
const loadCustom = () => createRequire(import.meta.url)(builtCustom.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const loadHost = () => createRequire(import.meta.url)(builtHost.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const VALID_SRC = `module.exports = {
  manifest: { id: "helloWorld", name: "Hello World", version: "1.0.0", description: "Test-Plugin" },
  operations: {
    greet: async (args) => ({ ok: true, text: "Hallo " + (args && args.name ? args.name : "Welt") })
  }
};
`;

const SECOND_SRC = `module.exports = {
  manifest: { id: "secondOne", name: "Second", version: "1.0.0" },
  operations: { ping: async () => ({ ok: true }) }
};
`;

function writeTmp(dir, name, content) {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
}

test("validateModule: lehnt fehlerhafte Exporte mit deutschen Meldungen ab", { skip }, () => {
  const { validateModule } = loadCustom();
  assert.throws(() => validateModule(null, "x.js"), /exportiert kein Objekt/);
  assert.throws(() => validateModule({}, "x.js"), /manifest.*fehlt/);
  assert.throws(() => validateModule({ manifest: { id: "a", name: "", version: "1" } }, "x.js"), /manifest\.name/);
  assert.throws(() => validateModule({ manifest: { id: "1bad", name: "n", version: "1" }, operations: { a: () => {} } }, "x.js"), /ungültig/);
  assert.throws(() => validateModule({ manifest: { id: "ok", name: "n", version: "1" } }, "x.js"), /operations.*fehlt/);
  assert.throws(() => validateModule({ manifest: { id: "ok", name: "n", version: "1" }, operations: { a: "nope" } }, "x.js"), /keine Funktion/);
  const good = validateModule({ manifest: { id: "ok", name: "n", version: "1" }, operations: { a: async () => {} } }, "x.js");
  assert.equal(good.manifest.id, "ok");
});

test("installCustomPlugin + loadAllCustomPlugins + removeCustomPlugin: echte Dateien", { skip, timeout: 30000 }, () => {
  const { installCustomPlugin, loadAllCustomPlugins, removeCustomPlugin } = loadCustom();
  const base = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "customplugins-"));
  const src = join(base, "src");
  const dir = join(base, "custom-plugins");
  const builtinIds = new Set(["gitDiff", "notifier"]);
  try {
    const srcFile = writeTmp(src, "hello.js", VALID_SRC);
    const res = installCustomPlugin(dir, srcFile, builtinIds);
    assert.equal(res.ok, true, res.message);
    assert.equal(res.manifest.id, "helloWorld");
    assert.ok(existsSync(join(dir, "helloWorld.js")));

    // ID kollidiert mit eingebautem Plugin.
    const collideFile = writeTmp(src, "collide.js", `module.exports = { manifest: { id: "gitDiff", name: "x", version: "1" }, operations: { a: async () => {} } };`);
    const collideRes = installCustomPlugin(dir, collideFile, builtinIds);
    assert.equal(collideRes.ok, false);
    assert.match(collideRes.message, /eingebauten Plugins/);

    // Ungueltige Datei (Syntaxfehler) wird beim Scan uebersprungen, nicht geworfen.
    writeTmp(dir, "broken.js", "module.exports = {");
    writeTmp(dir, "second.js", SECOND_SRC);
    const { modules, issues } = loadAllCustomPlugins(dir, builtinIds);
    const ids = modules.map((m) => m.manifest.id).sort();
    assert.deepEqual(ids, ["helloWorld", "secondOne"]);
    assert.ok(issues.some((i) => i.fileName === "broken.js"));

    const rm = removeCustomPlugin(dir, "helloWorld");
    assert.equal(rm.ok, true);
    assert.equal(existsSync(join(dir, "helloWorld.js")), false);
    const rmAgain = removeCustomPlugin(dir, "helloWorld");
    assert.equal(rmAgain.ok, false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

const fakeCrypto = {
  isAvailable: () => true,
  encrypt: (s) => Buffer.from("ENC:" + s).toString("base64"),
  decrypt: (b) => Buffer.from(b, "base64").toString().slice(4)
};

test("PluginHost: eigene Plugins werden geladen, geschaltet, entfernt und invoke respektiert enabled", { skip, timeout: 30000 }, async () => {
  const { createPluginHost } = loadHost();
  const base = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "pluginhost-custom-"));
  const stateFile = join(base, "plugins-state.json");
  const customDir = join(base, "custom-plugins");
  try {
    const host = createPluginHost({ stateFile, appDataDir: base, crypto: fakeCrypto, customDir });
    const before = host.listPlugins().length;

    const srcDir = join(base, "src");
    const srcFile = writeTmp(srcDir, "hello.js", VALID_SRC);
    const install = host.installCustomPlugin(srcFile);
    assert.equal(install.ok, true, install.message);

    const list = host.listPlugins();
    assert.equal(list.length, before + 1);
    const entry = list.find((p) => p.id === "helloWorld");
    assert.ok(entry, "custom plugin missing from listPlugins()");
    assert.equal(entry.custom, true);
    assert.equal(entry.enabled, false); // nicht in DEFAULT_ENABLED -> Opt-in

    const disabledInvoke = await host.invoke("helloWorld", "greet", { name: "Rene" });
    assert.equal(disabledInvoke.ok, false);
    assert.match(disabledInvoke.message, /deaktiviert/);

    assert.equal(host.setEnabled("helloWorld", true).ok, true);
    const res = await host.invoke("helloWorld", "greet", { name: "Rene" });
    assert.equal(res.ok, true);
    assert.equal(res.text, "Hallo Rene");

    // Kollision mit eingebautem Plugin wird abgelehnt.
    const collideFile = writeTmp(srcDir, "collide.js", `module.exports = { manifest: { id: "gitDiff", name: "x", version: "1" }, operations: { a: async () => {} } };`);
    const collide = host.installCustomPlugin(collideFile);
    assert.equal(collide.ok, false);

    // Entfernen raeumt auch den Zustand auf, kommt bei einer neuen Host-Instanz nicht wieder.
    const removed = host.removeCustomPlugin("helloWorld");
    assert.equal(removed.ok, true);
    assert.equal(host.listPlugins().some((p) => p.id === "helloWorld"), false);

    const host2 = createPluginHost({ stateFile, appDataDir: base, crypto: fakeCrypto, customDir });
    assert.equal(host2.listPlugins().length, before);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
