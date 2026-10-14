#!/usr/bin/env node
/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/**
 * hh-peers.cjs — lets an agent see and read the other sessions of its project.
 *   node "%HH_SCRIPTS_DIR%/hh-peers.cjs" list
 *   node "%HH_SCRIPTS_DIR%/hh-peers.cjs" read <name|id> [--tail 4000]
 * Reads harness-peers.json (written by the app next to the spawn queue); works
 * for stopped sessions too since their transcript is stored as plain text.
 */
const fs = require("fs");
const path = require("path");

const queue = process.env.HH_SPAWN_QUEUE;
const projectId = process.env.HH_PROJECT_ID;
if (!queue || !projectId) {
  console.error("hh-peers: nur innerhalb eines Hermes-Harness-Panes nutzbar.");
  process.exit(1);
}
let peers = [];
try {
  peers = JSON.parse(fs.readFileSync(path.join(path.dirname(queue), "harness-peers.json"), "utf-8"))[projectId] || [];
} catch {
  /* no peers yet */
}
const [cmd, ref, ...rest] = process.argv.slice(2);
if (cmd === "list" || !cmd) {
  for (const p of peers) console.log(`${p.id}\t${p.status}\t${p.name}${p.id === process.env.HH_SESSION_ID ? "\t(du)" : ""}`);
} else if (cmd === "read" && ref) {
  const p = peers.find((x) => x.id === ref || x.name.toLowerCase() === ref.toLowerCase());
  if (!p) { console.error(`hh-peers: Session "${ref}" nicht gefunden.`); process.exit(1); }
  const tailIdx = rest.indexOf("--tail");
  const tail = tailIdx >= 0 ? Number(rest[tailIdx + 1]) || 4000 : 4000;
  try { console.log(fs.readFileSync(p.textPath, "utf-8").slice(-tail)); }
  catch { console.error("hh-peers: noch kein Verlauf gespeichert."); }
} else {
  console.error("Usage: hh-peers.cjs list | read <name|id> [--tail N]");
  process.exit(1);
}
