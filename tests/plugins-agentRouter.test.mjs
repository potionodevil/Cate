/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const built = new URL("../dist-electron/plugins/agentRouter.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

test("agentRouter: Manifest und Operationen", { skip }, () => {
  const m = load();
  assert.equal(m.manifest.id, "agentRouter");
  assert.equal(m.manifest.category, "multiagent");
  for (const k of ["classify", "route", "getRoutes", "setRoute"]) assert.equal(typeof m.operations[k], "function");
});
test("agentRouter: Klassifizierung", { skip }, () => {
  const c = (t) => load().classify({ text: t }).taskClass;
  assert.equal(c("Entwirf die Architektur für das neue Plugin-System"), "architecture");
  assert.equal(c("Bitte refactor diese Klasse und benenne Methoden um"), "refactor");
  assert.equal(c("Fix the eslint syntax error: missing semicolon"), "syntax");
  assert.equal(c("Debug: App crash mit stack trace, Fehler beim Start"), "debugging");
  assert.equal(c("Schreibe die README Dokumentation"), "docs");
  assert.equal(c("Write unit tests with vitest for the parser"), "tests");
  assert.equal(c("Hallo"), "general");
  assert.equal(load().classify({ text: "x", codeSize: 40000 }).estimatedTokens, 10001);
});
test("agentRouter: Standardrouten", { skip }, async () => {
  const m = load();
  assert.equal((await m.route("Architektur Entwurf für Microservices")).selected.provider, "anthropic");
  const r = await m.route("refactor this module");
  assert.equal(r.selected.provider, "ollama");
  assert.ok(r.selected.model.includes("qwen"));
  assert.ok((await m.route("lint syntax error")).selected.model.includes("gemma"));
});
test("agentRouter: Fallback bei Nichtverfügbarkeit, Kontext und Kosten", { skip }, async () => {
  const m = load();
  const down = await m.route("refactor this", { isAvailable: (r) => r.provider !== "ollama" });
  assert.equal(down.selected.provider, "anthropic");
  assert.equal(down.skipped.length, 1);
  const big = await m.route({ text: "lint syntax", codeSize: 100000 });
  assert.ok(big.selected.maxContextTokens >= 25000);
  assert.equal((await m.route("Architektur Entwurf", { maxCostTier: "free" })).selected.costTier, "free");
  const none = await m.route("refactor", { isAvailable: async () => false });
  assert.equal(none.ok, false);
  assert.match(none.message, /Kein verfügbares/);
  assert.equal((await m.route("refactor", { isAvailable: () => { throw new Error("x"); } })).ok, false);
  assert.equal((await m.route("Architektur Entwurf", { preferLocal: true })).selected.provider, "ollama");
});
test("agentRouter: setRoute / getRoutes", { skip }, async () => {
  const m = load();
  assert.equal(m.setRoute(undefined, { taskClass: "x" }).ok, false);
  const r = m.setRoute(undefined, { taskClass: "docs", provider: "openai", model: "gpt-x", maxContextTokens: 1000, costTier: "low" }, "first");
  assert.equal(r.ok, true);
  assert.equal((await m.route("README Dokumentation", { routes: r.routes })).selected.model, "gpt-x");
  const up = m.setRoute(r.routes, { taskClass: "docs", provider: "openai", model: "gpt-x", maxContextTokens: 2000, costTier: "low" });
  assert.equal(up.routes.length, r.routes.length);
  assert.equal((await m.operations.getRoutes({})).routes.length, m.DEFAULT_ROUTES.length);
  assert.equal((await m.operations.route({ task: "refactor", unavailableProviders: ["ollama"] })).selected.provider, "anthropic");
});
