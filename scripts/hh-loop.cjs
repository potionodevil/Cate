#!/usr/bin/env node
/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/**
 * hh-loop.cjs — start/stop/list Agent-Loops of this project's sessions.
 *   node "%HH_SCRIPTS_DIR%/hh-loop.cjs" start [--session <name|id>] [--max 5] [--check "<Befehl>"] "Ziel"
 *   node "%HH_SCRIPTS_DIR%/hh-loop.cjs" stop  [--session <name|id>]
 *   node "%HH_SCRIPTS_DIR%/hh-loop.cjs" list
 * --check: Prüfbefehl im Session-Ordner nach jedem Durchlauf; Exit 0 beendet den Loop.
 * Without --session the loop runs in the calling session itself (the goal is
 * typed into its own prompt). Requests go through the same queue file as
 * hh-spawn.cjs / hh-send.cjs; the app answers within a few seconds, state is
 * published in harness-loops.json (see "list").
 */
const fs = require("fs");
const path = require("path");

const queue = process.env.HH_SPAWN_QUEUE;
const projectId = process.env.HH_PROJECT_ID;
if (!queue || !projectId) {
  console.error("hh-loop: nur innerhalb eines Hermes-Harness-Panes nutzbar.");
  process.exit(1);
}

const [cmd, ...rest] = process.argv.slice(2);
let session = "";
let max = 5;
let check = "";
const text = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--session") session = rest[++i] || "";
  else if (rest[i] === "--max") max = Number(rest[++i]);
  else if (rest[i] === "--check") check = rest[++i] || "";
  else text.push(rest[i]);
}
if (!session) session = process.env.HH_SESSION_ID || "";

function usage() {
  console.error('Usage: hh-loop.cjs start [--session <name|id>] [--max N] [--check "<Befehl>"] "Ziel" | stop [--session <name|id>] | list');
  process.exit(1);
}

if (cmd === "list") {
  let loops = [];
  try {
    loops = JSON.parse(fs.readFileSync(path.join(path.dirname(queue), "harness-loops.json"), "utf-8"));
  } catch {
    /* none yet */
  }
  if (!loops.length) console.log("Keine Loops.");
  for (const l of loops) console.log(`${l.sessionId}\t${l.state}\t${l.iteration}/${l.maxIterations}\t${l.goal}${l.message ? "\t(" + l.message + ")" : ""}`);
} else if (cmd === "start" || cmd === "stop") {
  const goal = text.join(" ").trim();
  if (!session || (cmd === "start" && !goal)) usage();
  if (cmd === "start" && (!Number.isFinite(max) || max < 1)) {
    console.error("hh-loop: --max muss eine Zahl >= 1 sein.");
    process.exit(1);
  }
  fs.appendFileSync(
    queue,
    JSON.stringify({ type: "loop", action: cmd, projectId, session, goal, max: Math.min(100, Math.floor(max)), check, createdAt: Date.now() }) + "\n",
    "utf-8"
  );
  console.log(`hh-loop: ${cmd} für "${session}" eingereicht. Status: hh-loop.cjs list`);
} else {
  usage();
}
