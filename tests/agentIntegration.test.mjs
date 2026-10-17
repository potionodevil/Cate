import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const built = new URL("../dist-electron/agentIntegration.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

function paths() {
  const root = mkdtempSync(join(tmpdir(), "cate-int-"));
  return { root, p: { home: join(root, "home"), hermesHome: join(root, "hermes"), hermesProfiles: ["proj-a", "proj-b"] } };
}

test("loop profiles: shell unsupported, agents supported", { skip }, () => {
  const { loopProfileFor } = load();
  assert.equal(loopProfileFor("shell").supported, false);
  assert.match(loopProfileFor("shell").reason, /Agent/);
  for (const id of ["hermes", "claude-code", "codex", "opencode"]) assert.equal(loopProfileFor(id).supported, true, id);
});

test("plan: each agent gets commands in its own folder; hermes per project profile", { skip }, () => {
  const { planCommandFiles } = load();
  const { p } = paths();
  const files = planCommandFiles(["claude-code", "codex", "opencode", "hermes"], p);
  const has = (frag) => files.some((f) => f.path.replace(/\\/g, "/").includes(frag));
  assert.ok(has(".claude/commands/agentloop.md"));
  assert.ok(has(".codex/prompts/validate.md"));
  assert.ok(has(".config/opencode/command/cate.md"));
  assert.ok(has("profiles/proj-a/skills/software-development/agentloop/SKILL.md"));
  assert.ok(has("profiles/proj-b/skills/software-development/validate/SKILL.md"));
  assert.equal(files.length, 3 + 3 + 3 + 6);
  const claude = files.find((f) => f.agent === "claude-code" && f.name === "agentloop");
  assert.match(claude.content, /\$ARGUMENTS/);
  assert.match(claude.content, /hh-loop\.cjs/);
  const skillDesc = files.find((f) => f.agent === "hermes").content.match(/description: "(.*)"/)[1];
  assert.ok(skillDesc.length <= 60, skillDesc);
});

test("install writes files, is idempotent and never overwrites foreign files", { skip }, () => {
  const { installCommands, planCommandFiles, integrationStatus } = load();
  const { root, p } = paths();
  const foreign = planCommandFiles(["claude-code"], p).find((f) => f.name === "validate");
  mkdirSync(dirname(foreign.path), { recursive: true });
  writeFileSync(foreign.path, "meine eigene Datei", "utf8");
  const r1 = installCommands(["claude-code", "codex"], p);
  assert.equal(r1.written.length, 5);
  assert.equal(r1.skipped.length, 1);
  assert.equal(readFileSync(foreign.path, "utf8"), "meine eigene Datei");
  const r2 = installCommands(["claude-code", "codex"], p);
  assert.equal(r2.written.length, 0);
  const st = integrationStatus(p).find((s) => s.agent === "claude-code");
  assert.deepEqual([st.installed, st.foreign, st.total], [2, 1, 3]);
  rmSync(root, { recursive: true, force: true });
});

test("loop manager refuses unsupported agents and uses per-agent quiet time", { skip }, () => {
  const { AgentLoopManager } = createRequire(import.meta.url)(new URL("../dist-electron/agentLoop.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const env = { t: 1000, last: 0, writes: [] };
  const profiles = { sh: { supported: false, quietMs: 0, maxWaitMs: 0, reason: "keine Shell" }, cl: { supported: true, quietMs: 2000, maxWaitMs: 9000 } };
  const mgr = new AgentLoopManager({ write: (_i, t) => (env.writes.push(t), true), lastActive: () => env.last, now: () => env.t, emit() {}, profileFor: (id) => profiles[id] });
  const bad = mgr.start({ sessionId: "sh", goal: "x", maxIterations: 2 });
  assert.equal(bad.ok, false);
  assert.equal(bad.message, "keine Shell");
  assert.equal(mgr.start({ sessionId: "cl", goal: "x", maxIterations: 2 }).ok, true);
  env.t = 2500; mgr.tick(); // noch keine Ausgabe, maxWait 9 s nicht erreicht
  assert.equal(env.writes.length, 1);
  env.last = 2600; env.t = 3000; mgr.tick(); // 0,4 s still
  assert.equal(env.writes.length, 1);
  env.t = 4700; mgr.tick(); // 2,1 s still > 2 s Profil (Standard waere 10 s)
  assert.equal(env.writes.length, 2);
});
