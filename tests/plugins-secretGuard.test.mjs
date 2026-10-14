/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const built = new URL("../dist-electron/plugins/secretGuard.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

// Fake-Tokens werden zur Laufzeit zusammengesetzt, damit kein Scanner das Repo beanstandet.
const fake = {
  aws: "AKIA" + "ABCDEFGHIJKLMNOP",
  gcp: "AIza" + "SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q",
  gh: "ghp" + "_" + "aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0eF3hJ6",
  slack: "xoxb" + "-123456789012-abcdefABCDEF",
  stripe: "sk" + "_live_" + "51HxYz0123456789abcdefgh",
  openai: "sk" + "-proj-" + "Ab12Cd34Ef56Gh78Ij90Kl12",
  anthropic: "sk" + "-ant-" + "api03-Ab12Cd34Ef56Gh78Ij90Kl12",
  telegram: "123456789" + ":" + "AAH1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q",
  jwt: "eyJhbGciOiJIUzI1NiJ9" + "." + "eyJzdWIiOiIxMjM0NTY3ODkwIn0" + "." + "dBjftJeZ4CVPmB92K27uhbUJU1p1r",
  eth: "0x" + "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318",
  sol: "5Kd3NBUAdUnhyzenEwVLy9pBKxSwXvE9FMPyR4UKZv".repeat(2) + "ppp",
};
const kinds = (t) => load().scanText(t).map((f) => f.kind);

test("secretGuard: Manifest und Operationen", { skip }, () => {
  const m = load();
  assert.equal(m.manifest.id, "secretGuard");
  for (const k of ["scanText", "redact", "scanStagedDiff", "installHook", "uninstallHook"]) assert.equal(typeof m.operations[k], "function");
});
test("secretGuard: Detektoren", { skip }, () => {
  const exp = { aws: "aws-access-key", gcp: "gcp-api-key", gh: "github-token", slack: "slack-token", stripe: "stripe-key", openai: "openai-key", anthropic: "anthropic-key", telegram: "telegram-bot-token", jwt: "jwt", eth: "eth-private-key", sol: "solana-private-key" };
  for (const [k, kind] of Object.entries(exp)) assert.deepEqual(kinds(`x = ${fake[k]} end`), [kind], k);
  assert.deepEqual(kinds("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----"), ["pem-private-key"]);
});
test("secretGuard: Seed-Phrase-Heuristik", { skip }, () => {
  const words = "abandon ability able about above absent absorb abstract absurd abuse access accident".split(" ");
  assert.deepEqual(kinds(words.join(" ")), ["possible-seed-phrase"]);
  assert.deepEqual(kinds(words.slice(0, 11).join(" ")), []);
  assert.deepEqual(kinds("the quick brown fox jumps over the lazy dog and the cat"), []);
});
test("secretGuard: generische Zuweisungen mit Entropie", { skip }, () => {
  assert.deepEqual(kinds('api_key = "a8Zk29xQpLm4Vb7Nc3"'), ["high-entropy-assignment"]);
  assert.deepEqual(kinds("password=aaaaaaaaaaaa"), []);
  assert.deepEqual(kinds("password=your_password_here"), []);
  assert.deepEqual(kinds("const token = process.env.API_TOKEN"), []);
  assert.deepEqual(kinds("sha: " + "ab".repeat(32)), []);
  assert.deepEqual(kinds("privkey: " + "ab12".repeat(16)), ["hex-private-key"]);
});
test("secretGuard: Positionen, Maskierung, nie das volle Geheimnis", { skip }, () => {
  const m = load();
  const [f] = m.scanText(`line1\n  token ${fake.gh}\n`);
  assert.equal(f.line, 2);
  assert.equal(f.col, 9);
  assert.ok(f.preview.length < 20);
  const all = JSON.stringify(m.scanText(Object.values(fake).join("\n")));
  for (const v of Object.values(fake)) assert.ok(!all.includes(v));
});
test("secretGuard: redact und Allowlist", { skip }, () => {
  const m = load();
  const out = m.redact(`a ${fake.aws} b\n-----BEGIN PRIVATE KEY-----\nxyz\n-----END PRIVATE KEY-----\nok`);
  assert.ok(!out.includes(fake.aws) && !out.includes("xyz"));
  assert.ok(out.includes("[GESCHWÄRZT:aws-access-key]") && out.endsWith("ok"));
  assert.deepEqual(m.scanText(fake.aws, { allowlist: [m.secretHash(fake.aws)] }), []);
});
test("secretGuard: Diff-Scan (execFile injiziert)", { skip }, async () => {
  const m = load();
  const diff = `diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -1,0 +5,2 @@\n+ok line\n+const k = "${fake.stripe}";\n-removed ${fake.aws}\n`;
  const exec = (file, args, o, cb) => { assert.equal(file, "git"); assert.ok(args.includes("--cached")); cb(null, diff, ""); };
  const r = await m.scanStagedDiff("C:/x", {}, exec);
  assert.equal(r.ok, true);
  assert.equal(r.clean, false);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].file, "a.js");
  assert.equal(r.findings[0].line, 6);
  assert.equal((await m.scanStagedDiff("C:/x", {}, (f, a, o, cb) => cb(new Error("kaputt"), "", ""))).ok, false);
});
test("secretGuard: Hook install/uninstall, fremde Hooks unangetastet", { skip }, () => {
  const m = load();
  const root = mkdtempSync(join(tmpdir(), "sg-"));
  assert.equal(m.installPreCommitHook(root).ok, false);
  mkdirSync(join(root, ".git", "hooks"), { recursive: true });
  const p = join(root, ".git", "hooks", "pre-commit");
  assert.equal(m.installPreCommitHook(root).ok, true);
  assert.ok(readFileSync(p, "utf8").includes(m.HOOK_MARKER));
  assert.equal(m.installPreCommitHook(root).replaced, true);
  assert.equal(m.uninstallPreCommitHook(root).removed, true);
  assert.equal(existsSync(p), false);
  writeFileSync(p, "#!/bin/sh\necho foreign\n");
  assert.equal(m.installPreCommitHook(root).ok, false);
  assert.equal(m.uninstallPreCommitHook(root).ok, false);
  assert.equal(readFileSync(p, "utf8"), "#!/bin/sh\necho foreign\n");
});
