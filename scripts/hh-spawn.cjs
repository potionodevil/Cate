#!/usr/bin/env node
/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/**
 * hh-spawn.cjs — companion CLI an agent running inside a Hermes Harness pane
 * can call to ask the Harness to open another tracked pane for the same
 * project (Requirement 4: "agent can open its own sub-terminals").
 *
 * It does NOT talk to the Electron app's SQLite session DB directly (that
 * database is opened with better-sqlite3 built against Electron's ABI, which
 * a plain `node` process invoked from a shell can't safely load — see
 * README's native-module section). Instead it appends one JSON line to a
 * plain append-only queue file that the Electron main process polls every
 * few seconds while any project is open. No native deps, works from any
 * plain Node on PATH.
 *
 * The Harness sets two env vars on every pane it spawns so this script does
 * not need any arguments beyond what the agent wants to run:
 *   HH_SPAWN_QUEUE   - path to the queue file to append to
 *   HH_PROJECT_ID    - the project this pane belongs to
 *
 * Usage (from inside a running Harness pane's shell):
 *   node "%HH_SCRIPTS_DIR%/hh-spawn.cjs" --label "tests" --preset shell --cwd .
 *
 * --preset accepts the same ids as the Harness UI: shell | hermes | claude-code | codex | opencode
 */
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const out = { label: "Sub-Terminal", preset: "", cwd: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--label") out.label = argv[++i];
    else if (a === "--preset") out.preset = argv[++i];
    else if (a === "--cwd") out.cwd = argv[++i];
  }
  return out;
}

function main() {
  const queuePath = process.env.HH_SPAWN_QUEUE;
  const projectId = process.env.HH_PROJECT_ID;
  if (!queuePath || !projectId) {
    console.error(
      "hh-spawn: HH_SPAWN_QUEUE / HH_PROJECT_ID not set — this script only works inside a pane spawned by Hermes Harness."
    );
    process.exitCode = 1;
    return;
  }
  const { label, preset, cwd } = parseArgs(process.argv.slice(2));
  const resolvedCwd = path.resolve(process.cwd(), cwd);
  const request = {
    projectId,
    label,
    presetId: preset,
    cwd: resolvedCwd,
    createdAt: Date.now()
  };
  fs.appendFileSync(queuePath, JSON.stringify(request) + "\n", "utf-8");
  console.log(`hh-spawn: Anfrage eingereicht — Pane "${label}" (${preset}) wird in Kürze geöffnet.`);
}

main();
