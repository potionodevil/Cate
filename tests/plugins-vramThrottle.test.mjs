/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const built = new URL("../dist-electron/plugins/vramThrottle.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

test("vramThrottle: nvidia-smi Parser", { skip }, () => {
  const m = load();
  assert.deepEqual(m.parseNvidiaSmi("4096, 8192, 37\n"), { memUsedMb: 4096, memTotalMb: 8192, utilPct: 37 });
  assert.equal(m.parseNvidiaSmi("garbage"), null);
});
test("vramThrottle: Level mit Hysterese", { skip }, () => {
  const m = load();
  assert.equal(m.computeLevel(0.5, "ok"), "ok");
  assert.equal(m.computeLevel(0.8, "ok"), "warn");
  assert.equal(m.computeLevel(0.95, "warn"), "critical");
  assert.equal(m.computeLevel(0.87, "critical"), "critical");
  assert.equal(m.computeLevel(0.8, "critical"), "warn");
  assert.equal(m.computeLevel(0.72, "warn"), "warn");
  assert.equal(m.computeLevel(0.6, "warn"), "ok");
});
test("vramThrottle: Controller mit Uhr und Sampler", { skip }, async () => {
  const m = load();
  let t = 0, used = 1000, calls = 0;
  const c = new m.ThrottleController(async () => { calls++; return { memUsedMb: used, memTotalMb: 1000 * 1, utilPct: 0 }; }, { now: () => t, minIntervalMs: 1000, baseParallel: 4 });
  assert.equal((await c.update()).level, "critical");
  assert.equal((await c.update()).maxParallel, 1);
  assert.equal(calls, 1);
  t = 2000; used = 100;
  const d = await c.update();
  assert.equal(d.level, "ok");
  assert.equal(d.maxParallel, 4);
  const none = new m.ThrottleController(async () => null);
  assert.equal((await none.update()).level, "ok");
});
test("vramThrottle: Limiter", { skip }, async () => {
  const m = load();
  const l = new m.Limiter(1);
  await l.acquire();
  let got = false;
  const p = l.acquire().then(() => { got = true; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(got, false);
  assert.equal(l.queued, 1);
  l.release();
  await p;
  assert.equal(got, true);
  l.setMax(3);
  await l.acquire(); await l.acquire();
  assert.equal(l.inFlight, 3);
});
