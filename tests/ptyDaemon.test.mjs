/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

// Integration test against the built daemon (npm run build:main first). Uses a
// throwaway pipe so it can never touch a developer's live sessions. Under plain
// node the daemon runs in its pipe-fallback mode (node-pty targets Electron's ABI).
const built = new URL("../dist-electron/ptyManager.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
process.env.HH_PTY_PIPE = process.platform === "win32" ? `\\\\.\\pipe\\hh-test-${process.pid}` : `/tmp/hh-test-${process.pid}.sock`;

const sender = (log) => ({ isDestroyed: () => false, send: (ch, d) => log.push([ch, d]) });
const until = async (fn, ms = 8000) => {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 50));
  }
};

test("panes survive a client restart and are re-adopted with their backlog", { skip }, async () => {
  const { PtyManager } = createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const shell = process.platform === "win32" ? "cmd.exe" : "sh";
  const args = process.platform === "win32" ? ["/c", "echo HELLO && ping -n 30 127.0.0.1 >nul"] : ["-c", "echo HELLO; sleep 30"];

  const a = new PtyManager();
  await a.connect();
  a.spawnWithId("p1", { cwd: process.cwd(), shellOverride: shell, args }, sender([]));
  await until(() => a.getBacklog("p1")?.includes("HELLO"));
  a.detach(); // simulates the app quitting
  await new Promise((r) => setTimeout(r, 300));

  const b = new PtyManager();
  await b.connect();
  assert.deepEqual(b.liveIds(), ["p1"]); // still running in the daemon
  assert.match(b.getBacklog("p1"), /HELLO/);

  const log = [];
  let exited = null;
  assert.ok(b.adopt("p1", sender(log), { onExit: (_id, code) => (exited = code) }));
  b.kill("p1");
  await until(() => exited !== null);
  assert.equal(b.has("p1"), false);
  assert.ok(log.some(([ch]) => ch === "pty:exit:p1"));

  b.killAll();
  b.detach();
});
