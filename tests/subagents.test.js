/** Tests für die profilbezogene Hermes-state.db-Erkennung. */
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { hermesDbPath, encodeHermesRef, decodeHermesRef, projectsByHermesProfile } = require("../dist-electron/subagents.js");

test("hermesDbPath: default und Profil", () => {
  assert.strictEqual(hermesDbPath("", "X"), path.join("X", "hermes", "state.db"));
  assert.strictEqual(hermesDbPath("default", "X"), path.join("X", "hermes", "state.db"));
  assert.strictEqual(hermesDbPath("cate", "X"), path.join("X", "hermes", "profiles", "cate", "state.db"));
});

test("Hermes-ref Roundtrip", () => {
  assert.deepStrictEqual(decodeHermesRef(encodeHermesRef("cate", "a|b")), { profile: "cate", sessionId: "a|b" });
  assert.deepStrictEqual(decodeHermesRef("plain"), { profile: "default", sessionId: "plain" });
});

test("projectsByHermesProfile: erstes Projekt je Profil", () => {
  const m = projectsByHermesProfile([
    { id: "1", folder: "a", hermesProfile: "p" },
    { id: "2", folder: "b", hermesProfile: "p" },
    { id: "3", folder: "c", hermesProfile: "" }
  ]);
  assert.strictEqual(m.get("p"), "1");
  assert.strictEqual(m.get("default"), "3");
});
