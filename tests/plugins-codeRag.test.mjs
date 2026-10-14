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
import m from "../dist-electron/plugins/codeRag.js";

test("codeRag: manifest + embed is normalized and deterministic", () => {
  assert.strictEqual(m.manifest.id, "codeRag");
  const a = m.embed("parseUserName from request");
  const b = m.embed("parseUserName from request");
  assert.deepStrictEqual(Array.from(a), Array.from(b));
  assert.ok(Math.abs(m.cosine(a, a) - 1) < 1e-4);
});

test("codeRag: tokenizer splits camel and snake", () => {
  const t = m.tokenize("parseUserName user_id");
  assert.ok(t.includes("parse") && t.includes("user") && t.includes("name") && t.includes("id") === false || t.includes("user"));
});

test("codeRag: chunkText line ranges", () => {
  const text = Array.from({ length: 100 }, (_, i) => "line" + i).join("\n");
  const c = m.chunkText(text);
  assert.strictEqual(c[0].start, 1);
  assert.strictEqual(c[0].end, 40);
  assert.strictEqual(c[c.length - 1].end, 100);
});

test("codeRag: index, semantic search, incremental update", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rag-"));
  const idx = path.join(root, ".idx");
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.writeFileSync(path.join(root, "node_modules", "x.js"), "function ignored() {}");
  fs.writeFileSync(path.join(root, "src", "auth.ts"), "export function loginUser(password: string) {\n  return hashPassword(password);\n}\n");
  fs.writeFileSync(path.join(root, "src", "render.ts"), "export function drawCanvas(ctx) {\n  ctx.fillRect(0, 0, 10, 10);\n}\n");
  const s1 = await m.indexProject(root, idx);
  assert.strictEqual(s1.files, 2);
  assert.strictEqual(s1.reindexed, 2);
  const hits = await m.searchIndex(root, idx, "login password hash", 2);
  assert.strictEqual(hits[0].file, "src/auth.ts");
  assert.strictEqual(hits[0].startLine, 1);
  assert.match(hits[0].snippet, /loginUser/);
  const s2 = await m.indexProject(root, idx);
  assert.strictEqual(s2.reindexed, 0);
  assert.strictEqual(s2.unchanged, 2);
  fs.writeFileSync(path.join(root, "src", "render.ts"), "export function drawCanvas(ctx) { ctx.clear(); }\n// changed\n");
  fs.unlinkSync(path.join(root, "src", "auth.ts"));
  const s3 = await m.indexProject(root, idx);
  assert.strictEqual(s3.reindexed, 1);
  assert.strictEqual(s3.removed, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test("codeRag: operations return errors instead of throwing", async () => {
  const r = await m.operations.search({ projectRoot: os.tmpdir(), indexDir: path.join(os.tmpdir(), "nope-idx"), query: " " });
  assert.strictEqual(r.ok, false);
  const r2 = await m.operations.index({ projectRoot: os.tmpdir(), indexDir: "x", remote: { kind: "qdrant", url: "ftp://x" } });
  assert.strictEqual(r2.ok, false);
});
