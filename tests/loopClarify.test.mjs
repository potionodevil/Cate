import test from "node:test";
import assert from "node:assert/strict";
import { clarifyLoop, applyAnswers, NO_CHECK } from "../src/loopClarify.mjs";

test("vague goal without check asks goal and check questions", () => {
  const qs = clarifyLoop({ goal: "fix", check: "", max: 5 });
  assert.deepEqual(qs.map((q) => q.id), ["goal", "check"]);
});

test("clear goal with check asks nothing", () => {
  assert.equal(clarifyLoop({ goal: "Alle Tests in tests/ grün bekommen", check: "npm run test", max: 5 }).length, 0);
});

test("high iteration count asks for confirmation", () => {
  const qs = clarifyLoop({ goal: "Alle Tests in tests/ grün bekommen", check: "npm run test", max: 50 });
  assert.deepEqual(qs.map((q) => q.id), ["max"]);
});

test("answered questions are not asked again", () => {
  assert.equal(clarifyLoop({ goal: "x", check: "", max: 50 }, { goal: "a", check: NO_CHECK, max: 10 }).length, 0);
});

test("applyAnswers merges goal, check and max", () => {
  const r = applyAnswers({ goal: "Fix", check: "", max: 50 }, { goal: "Tests grün", check: "npm run test", max: 10 });
  assert.equal(r.goal, "Fix. Fertig, wenn: Tests grün");
  assert.equal(r.check, "npm run test");
  assert.equal(r.max, 10);
  assert.equal(applyAnswers({ goal: "g", check: "x", max: 3 }, { check: NO_CHECK }).check, "");
});
