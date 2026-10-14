/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert";
import m from "../dist-electron/plugins/testHealer.js";

const NODE_OUT = `TAP version 13
# Subtest: adds
    not ok 1 - adds
      ---
      duration_ms: 1.2
      location: 'C:\\proj\\tests\\a.test.js:5:1'
      failureType: 'testCodeFailure'
      error: 'Expected values to be strictly equal'
      code: 'ERR_ASSERTION'
      stack: |-
        TestContext.<anonymous> (C:\\proj\\tests\\a.test.js:6:10)
      ...
not ok 1 - adds
  ---
  error: 'Expected values to be strictly equal'
  ...
`;
const JEST_OUT = `FAIL src/a.test.ts
  ● math › adds

    expect(received).toBe(expected)

    Expected: 3
    Received: 2

      at Object.<anonymous> (src/a.test.ts:4:20)
`;
const PYTEST_OUT = `=================================== FAILURES ===================================
______________________________ test_add ______________________________

    def test_add():
>       assert add(1, 1) == 3
E       assert 2 == 3

tests/test_a.py:5: AssertionError
=========================== short test summary info ============================
FAILED tests/test_a.py::test_add - assert 2 == 3
`;
const CARGO_OUT = `failures:

---- tests::it_adds stdout ----
thread 'tests::it_adds' panicked at src/lib.rs:12:9:
assertion failed: left == right

failures:
    tests::it_adds
`;

test("testHealer: manifest", () => { assert.strictEqual(m.manifest.id, "testHealer"); });

test("testHealer: node:test parsing", () => {
  const f = m.parseFailures(NODE_OUT, "auto", "node --test");
  assert.ok(f.length >= 1);
  assert.strictEqual(f[0].name, "adds");
  assert.strictEqual(f[0].line, 5);
  assert.match(f[0].file, /a\.test\.js$/);
});

test("testHealer: jest parsing", () => {
  const f = m.parseFailures(JEST_OUT, "auto", "npx jest");
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].file, "src/a.test.ts");
  assert.strictEqual(f[0].line, 4);
});

test("testHealer: pytest parsing", () => {
  const f = m.parseFailures(PYTEST_OUT, "auto", "pytest");
  assert.strictEqual(f[0].name, "test_add");
  assert.strictEqual(f[0].file, "tests/test_a.py");
  assert.strictEqual(f[0].line, 5);
  assert.match(f[0].message, /2 == 3/);
});

test("testHealer: cargo parsing", () => {
  const f = m.parseFailures(CARGO_OUT, "auto", "cargo test");
  assert.strictEqual(f[0].file, "src/lib.rs");
  assert.strictEqual(f[0].line, 12);
  assert.strictEqual(f[0].column, 9);
});

test("testHealer: prompt payload", () => {
  const f = m.parseFailures(PYTEST_OUT, "pytest");
  const p = m.buildPrompt(f, "pytest", 2);
  assert.match(p, /test_add/);
  assert.match(p, /tests\/test_a\.py:5/);
});

test("testHealer: healLoop reaches green and respects max", async () => {
  let n = 0, fixes = 0;
  const run = async () => (++n >= 3 ? { ok: true, exitCode: 0, output: "", failures: [], prompt: "" } : { ok: false, exitCode: 1, output: "x", failures: [], prompt: "p" });
  const r = await m.healLoop({ projectRoot: ".", command: "x", maxIterations: 5, runner: run, fix: async () => { fixes++; } });
  assert.strictEqual(r.green, true);
  assert.strictEqual(r.iterations, 3);
  assert.strictEqual(fixes, 2);
  const never = await m.healLoop({ projectRoot: ".", command: "x", maxIterations: 2, runner: async () => ({ ok: false, exitCode: 1, output: "", failures: [], prompt: "" }), fix: async () => {} });
  assert.strictEqual(never.green, false);
  assert.strictEqual(never.iterations, 2);
});

test("testHealer: runTests with real command", async () => {
  const bad = await m.runTests(process.cwd(), `"${process.execPath}" -e "process.exit(1)"`);
  assert.strictEqual(bad.ok, false);
  const good = await m.runTests(process.cwd(), `"${process.execPath}" -e "0"`);
  assert.strictEqual(good.ok, true);
  const missing = await m.operations.runTests({ projectRoot: process.cwd(), command: "definitely-not-a-cmd-xyz" });
  assert.strictEqual(missing.ok, false);
});
