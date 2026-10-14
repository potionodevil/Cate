/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import m from "../dist-electron/plugins/astRefactor.js";

const SRC = "export function foo(a: number) { return a + 1; }\nconst x = foo(2);\nclass Bar { go() { return foo(3); } }\n";

test("astRefactor: manifest + operations", () => {
  assert.strictEqual(m.manifest.id, "astRefactor");
  assert.strictEqual(typeof m.operations.renameSymbol, "function");
});

test("astRefactor: listNodes finds function and class", () => {
  const n = m.listNodes(SRC, "a.ts");
  assert.ok(n.some((x) => x.kind === "FunctionDeclaration" && x.name === "foo" && x.line === 1));
  assert.ok(n.some((x) => x.kind === "ClassDeclaration" && x.name === "Bar"));
});

test("astRefactor: rename replaces all identifiers", () => {
  const r = m.renameSymbolInSource(SRC, "foo", "baz", "a.ts");
  assert.strictEqual(r.count, 3);
  assert.ok(!r.text.includes("foo"));
  assert.ok(m.checkTsSyntax(r.text, "a.ts").ok);
});

test("astRefactor: syntax check detects errors", () => {
  assert.strictEqual(m.checkTsSyntax("function (", "a.ts").ok, false);
});

test("astRefactor: replace/insert/remove node", () => {
  const rep = m.replaceNodeInSource(SRC, "a.ts", "FunctionDeclaration", "foo", "function foo() { return 0; }");
  assert.ok(rep.includes("return 0"));
  const ins = m.insertAfterNodeInSource(SRC, "a.ts", "ClassDeclaration", "Bar", "const y = 1;");
  assert.ok(ins.includes("const y = 1;"));
  const rm = m.removeNodeInSource(SRC, "a.ts", "ClassDeclaration", "Bar");
  assert.ok(!rm.text.includes("class Bar"));
  assert.throws(() => m.replaceNodeInSource(SRC, "a.ts", "ClassDeclaration", "Nope", "x"));
});

test("astRefactor: operation writes valid, refuses invalid, blocks path escape", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ast-"));
  fs.writeFileSync(path.join(dir, "a.ts"), SRC);
  const ok = await m.operations.renameSymbol({ projectRoot: dir, file: "a.ts", oldName: "foo", newName: "baz" });
  assert.strictEqual(ok.ok, true);
  assert.ok(fs.readFileSync(path.join(dir, "a.ts"), "utf8").includes("baz"));
  const before = fs.readFileSync(path.join(dir, "a.ts"), "utf8");
  const bad = await m.operations.replaceNode({ projectRoot: dir, file: "a.ts", kind: "FunctionDeclaration", name: "baz", text: "function baz( {" });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(fs.readFileSync(path.join(dir, "a.ts"), "utf8"), before);
  const esc = await m.operations.listNodes({ projectRoot: dir, file: "../x.ts" });
  assert.strictEqual(esc.ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});
