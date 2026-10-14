#!/usr/bin/env node
/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/**
 * hh-send.cjs — send a message to another session of the same project.
 *   node "%HH_SCRIPTS_DIR%/hh-send.cjs" --to <name|id> "Nachricht"
 * Running targets get it typed into their terminal; stopped targets get it on
 * their next open. Appends to the same queue file as hh-spawn.cjs.
 */
const fs = require("fs");
const argv = process.argv.slice(2);
let to = "";
const text = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--to") to = argv[++i];
  else text.push(argv[i]);
}
const queue = process.env.HH_SPAWN_QUEUE;
const projectId = process.env.HH_PROJECT_ID;
if (!queue || !projectId || !to || !text.length) {
  console.error('Usage: hh-send.cjs --to <name|id> "Nachricht" (nur in einem Harness-Pane)');
  process.exit(1);
}
fs.appendFileSync(queue, JSON.stringify({ type: "send", projectId, from: process.env.HH_SESSION_ID || "", to, text: text.join(" "), createdAt: Date.now() }) + "\n", "utf-8");
console.log(`hh-send: Nachricht an "${to}" eingereicht.`);
