/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const built = new URL("../dist-electron/plugins/sessionTeleport.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const state = { cwd: "/w/p q", openFiles: ["a.ts"], tasks: [{ title: "t" }], env: { API_KEY: "supersecretvalue", PATH: "/bin" }, agentPreset: "dev", context: "token=abcdefghijkl123 done" };

test("sessionTeleport: Bundle enthält nur Env-Namen, keine Secrets", { skip }, () => {
  const m = load();
  const b = m.createBundle(state);
  assert.deepEqual(b.state.envNames, ["API_KEY", "PATH"]);
  const json = JSON.stringify(b);
  assert.ok(!json.includes("supersecretvalue") && !json.includes("abcdefghijkl123"));
  assert.equal(m.validateBundle(b).ok, true);
  assert.equal(m.manifest.id, "sessionTeleport");
});
test("sessionTeleport: Manipulation und Version erkannt", { skip }, () => {
  const m = load();
  const b = m.createBundle(state);
  b.state.cwd = "/evil";
  assert.equal(m.validateBundle(b).ok, false);
  assert.equal(m.validateBundle({ ...m.createBundle(state), version: 9 }).ok, false);
  assert.equal(m.validateBundle(null).ok, false);
});
test("sessionTeleport: Schreiben/Lesen und Pfadprüfung", { skip }, () => {
  const m = load();
  const root = mkdtempSync(join(tmpdir(), "tp-"));
  const w = m.writeBundle(root, ".hermes/b.json", state);
  assert.equal(w.ok, true);
  const r = m.readBundle(root, ".hermes/b.json");
  assert.equal(r.ok, true);
  assert.equal(r.bundle.checksum, w.checksum);
  assert.equal(m.writeBundle(root, "../x.json", state).ok, false);
  assert.equal(m.readBundle(root, "nope.json").ok, false);
});
test("sessionTeleport: Restore-Skripte", { skip }, () => {
  const m = load();
  const b = m.createBundle(state);
  const tmux = m.buildRestoreScript(b, { variant: "tmux", sessionName: "s 1" });
  assert.ok(tmux.includes("tmux new-session -d -s 's_1' -c '/w/p q'"));
  assert.ok(tmux.includes('${API_KEY:?'));
  const sh = m.buildRestoreScript(b);
  assert.ok(sh.includes("cd '/w/p q' || exit 1"));
  assert.ok(!sh.includes("supersecretvalue"));
});
