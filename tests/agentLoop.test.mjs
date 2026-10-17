/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const built = new URL("../dist-electron/agentLoop.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

function setup(extra = {}) {
  const { AgentLoopManager } = load();
  const env = { t: 1000, last: 1000, alive: true, writes: [], events: [] };
  const mgr = new AgentLoopManager({
    write: (id, text) => (env.alive ? (env.writes.push(text), true) : false),
    lastActive: () => (env.alive ? env.last : null),
    now: () => env.t,
    emit: (i) => env.events.push(i),
    quietMs: 10_000,
    maxWaitMs: 60_000,
    ...extra
  });
  return { mgr, env };
}

test("start sends the goal; no continuation while output is still flowing", { skip }, () => {
  const { mgr, env } = setup();
  assert.equal(mgr.start({ sessionId: "s", goal: "Baue X", maxIterations: 3 }).ok, true);
  assert.deepEqual(env.writes, ["Baue X"]);
  env.t += 5000; env.last = env.t; mgr.tick();
  env.t += 9000; mgr.tick();
  assert.deepEqual(env.writes, ["Baue X"]);
});

test("continues with 'Weiter' after quiet period and finishes at maxIterations", { skip }, () => {
  const { mgr, env } = setup();
  mgr.start({ sessionId: "s", goal: "Ziel", maxIterations: 2 });
  env.t += 2000; env.last = env.t; // Agent antwortet
  env.t += 10_000; mgr.tick();
  assert.deepEqual(env.writes, ["Ziel", "Weiter"]);
  assert.equal(mgr.list()[0].iteration, 2);
  env.t += 1000; env.last = env.t;
  env.t += 10_000; mgr.tick();
  assert.equal(env.writes.length, 2);
  assert.equal(mgr.list()[0].state, "done");
  assert.equal(env.events.at(-1).state, "done");
});

test("fallback: no output at all still advances after maxWaitMs", { skip }, () => {
  const { mgr, env } = setup();
  env.last = 500; // keine Ausgabe seit dem Senden
  mgr.start({ sessionId: "s", goal: "Ziel", maxIterations: 2 });
  env.t += 30_000; mgr.tick();
  assert.equal(env.writes.length, 1);
  env.t += 30_000; mgr.tick();
  assert.deepEqual(env.writes, ["Ziel", "Weiter"]);
});

test("stop halts the loop; dead session stops it; duplicates and empty goals are rejected", { skip }, () => {
  const { mgr, env } = setup();
  assert.equal(mgr.start({ sessionId: "s", goal: "  ", maxIterations: 2 }).ok, false);
  mgr.start({ sessionId: "s", goal: "Ziel", maxIterations: 5 });
  assert.equal(mgr.start({ sessionId: "s", goal: "Ziel", maxIterations: 5 }).ok, false);
  assert.equal(mgr.stop("s"), true);
  assert.equal(mgr.list()[0].state, "stopped");
  env.t += 100_000; mgr.tick();
  assert.equal(env.writes.length, 1);

  mgr.start({ sessionId: "s", goal: "Nochmal", maxIterations: 5 });
  env.alive = false; mgr.tick();
  assert.equal(mgr.list()[0].state, "stopped");
  assert.equal(mgr.start({ sessionId: "s", goal: "x", maxIterations: 1 }).ok, false); // Session tot
});

test("maxIterations is clamped", { skip }, () => {
  const { mgr } = setup();
  assert.equal(mgr.start({ sessionId: "s", goal: "g", maxIterations: 9999 }).loop.maxIterations, 100);
  assert.equal(mgr.start({ sessionId: "t", goal: "g", maxIterations: -4 }).loop.maxIterations, 1);
});
