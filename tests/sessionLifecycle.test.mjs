/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manager = readFileSync(new URL("../electron/sessionManager.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("../electron/main.ts", import.meta.url), "utf8");
const snapshot = readFileSync(new URL("../electron/sessionSnapshot.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../electron/sessionStore.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/Layout.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/ProjectSidebar.tsx", import.meta.url), "utf8");

test("pane limit is enforced before spawning and is eight panes", () => {
  assert.match(manager, /MAX_PANES_PER_SESSION\s*=\s*8/);
  assert.match(manager, /session\.paneIds\.length\s*>=\s*MAX_PANES_PER_SESSION/);
  assert.match(manager, /code:\s*"PANE_LIMIT"/);
});

test("split panes spawn a real shell in the same session", () => {
  assert.match(manager, /splitPane\([\s\S]*?this\.pty\.spawnWithId\(newPaneId/);
  assert.match(manager, /HH_SESSION_ID:\s*sessionId/);
  assert.match(layout, /direction === "horizontal" \? "row" : "column"/);
});

test("split panes spawn the preset's real agent command, not always a plain shell", () => {
  // Regression: splitPane used to hardcode shellOverride: DEFAULT_SHELL for
  // every added pane regardless of presetId, so "+" never actually started
  // the configured agent CLI — an "Agentic CLI Harness" silently behaved
  // like a plain shell/terminal multiplexer for every pane but the first.
  assert.match(manager, /buildSpawnArgs\(preset,\s*\{\s*profile:\s*sibling\.profile,\s*model:\s*sibling\.model\s*\}\)/);
  assert.match(manager, /shellOverride:\s*command\s*\|\|\s*DEFAULT_SHELL/);
  assert.match(app, /inheritedPresetFor\(tabsRef\.current,\s*sessionId\)/);
});

test("renderer surfaces structured split errors", () => {
  assert.match(app, /result\.error\.code/);
  assert.match(app, /role="alert"/);
});

test("reattach uses saved context and creates a new live record", () => {
  assert.match(main, /record\.contextPath[\s\S]*?readAirFile\(record\.contextPath\)/);
  assert.match(main, /Wiederhergestellter Session-Kontext/);
  assert.match(manager, /const sessionId = randomUUID\(\);[\s\S]*?createSession\(\{/);
  assert.match(manager, /return \{ ok: true, sessionId, paneId \}/);
});

test("reattach restores the session's own CLI preset instead of always the project default", () => {
  // Regression: reattaching used to hardcode presetId: project.defaultPresetId,
  // silently switching tools for sessions started with a different preset —
  // which looked like "reopening old sessions is broken" to the user.
  assert.match(main, /presetId:\s*record\.presetId\s*\|\|\s*project\.defaultPresetId/);
  assert.match(main, /profile:\s*record\.profile\s*\|\|\s*project\.hermesProfile/);
});

test("session preset/profile/model are persisted on the sessions row for reattach to read back", () => {
  const store = readFileSync(new URL("../electron/sessionStore.ts", import.meta.url), "utf8");
  assert.match(store, /ADD COLUMN preset_id/);
  assert.match(store, /preset_id,\s*profile,\s*model/);
  assert.match(manager, /presetId:\s*opts\.presetId,\s*\n\s*profile:\s*opts\.profile/);
});

test("tabs are idempotent against the sessions:spawned broadcast race", () => {
  // Regression: every spawnSession/reattachSession IPC call also broadcasts
  // "sessions:spawned" (used for agent-initiated sub-sessions); without a
  // dedup check the renderer's own direct append PLUS that broadcast's
  // listener both opened a second tab for the same session, showing a
  // confusing duplicate.
  assert.match(app, /function findTab/);
  assert.match(app, /function openOrFocusTab/);
  assert.match(app, /if \(findTab\(tabs, session\.sessionId\)\) return tabs;/);
});

test("reopening a session never crams it next to the active tab — each session is its own tab", () => {
  // Regression: appendSession used to wrap sessions into a WorkspaceNode
  // split, visually cramming a reattached/reopened session next to
  // whatever was already on screen ("öffnet daneben statt in neuem Tab").
  assert.match(app, /const \[tabs, setTabs\] = useState<SessionNode\[\]>\(\[\]\);/);
  assert.match(app, /const activeTab = tabs\.find\(\(t\) => t\.sessionId === activeTabId\) \?\? null;/);
  assert.match(app, /<LayoutRenderer node=\{activeTab\} callbacks=\{sessionCallbacks\} \/>/);
});

test("reattaching a still-running session reconnects to its live pty instead of spawning a new one", () => {
  // Regression: handleReattach always called session:reattach, which
  // ALWAYS spawns a brand-new pty — even when the session's own process
  // was still alive in the backend (its tab was just closed). That
  // orphaned the live process and started a redundant duplicate agent.
  assert.match(app, /session\.status === "running" && session\.paneIds\.length > 0/);
  assert.match(app, /window\.harness\.attachSessionPane\(session\.paneIds\[0\]\)/);
});

test("left-click on \"Anderen Agent wählen\" offers other installed/connected agents", () => {
  // Geschützte Bedienkonvention: Menüs öffnen nur per Linksklick — der Agent-Picker
  // ist deshalb ein eigener Button, kein onContextMenu mehr.
  assert.match(app, /<Button variant="outline" onClick=\{openNewAgentPicker\}>Anderen Agent wählen<\/Button>/);
  assert.match(app, /<NewAgentPopover/);
  assert.doesNotMatch(app, /onContextMenu/); // nie wieder Rechtsklick-Menüs
  assert.match(app, /window\.harness\.listAgentPresets\(\)/);
});

test("left-click on the session's agent picker button also offers other agents", () => {
  // The initial "Anderen Agent wählen" button only exists before a
  // project's first session; the per-session picker is what gets clicked every
  // day, so it needs the same agent picker (auch per Linksklick).
  assert.match(layout, /\{onAddPanePicker && \(/);
  assert.match(layout, /onClick=\{onAddPanePicker\}/);
  assert.match(app, /onRequestPanePicker:\s*handleRequestPanePicker/);
  assert.match(app, /onPaneStarted=\{handlePaneStarted\}/);
  const popover = readFileSync(new URL("../src/NewAgentPopover.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(popover, /onContextMenu/);
  assert.match(popover, /window\.harness\.splitSessionPane\(sessionId, paneId, "horizontal", preset\.id\)/);
});

test("snapshot-backed deletion removes both snapshot and its context", () => {
  assert.match(manager, /deleteSessionSnapshot\(sessionId\)/);
  assert.match(manager, /unlinkSync\(contextPath\)/);
  assert.match(snapshot, /unlinkSync\(path\)/);
});

test("sidebar sessions can be opened and deleted via the power context menu", () => {
  // Regression: the quick session tree in the sidebar only had a plain
  // onClick with no delete affordance and no right-click menu at all.
  assert.match(sidebar, /onOpenInSession=\{\(\) => onOpenSession\(s\)\}/);
  assert.match(sidebar, /onDelete=\{\(\) => void deleteSessionRow\(s\)\}/);
  assert.match(sidebar, /await window\.harness\.deleteSession\(s\.id\)/);
  assert.match(sidebar, /onSessionDeleted\?\.\(s\.id\)/);
});

test("backlog is captured before pty kill so the .air context file gets written", () => {
  // Regression (root cause of "alte Sessions laden ihren Kontext nicht"):
  // PtyManager.kill() drops the pane entry synchronously, so finalizeSession
  // read a null backlog after every stop and never wrote the .air file —
  // context_path stayed NULL and a reopened session started the agent with
  // no history at all. Stop/quit/delete paths must capture the backlog
  // BEFORE the kill.
  assert.match(manager, /exitBacklogs = new Map<string, string>\(\)/);
  assert.match(manager, /const backlog = this\.pty\.getBacklog\(paneId\);\s*\n\s*if \(backlog\) this\.exitBacklogs\.set\(paneId, backlog\);\s*\n\s*this\.manualStops\.add\(paneId\);\s*\n\s*this\.pty\.kill\(paneId\);/);
  // And finalizeSession must prefer the captured copy:
  assert.match(manager, /const backlog = this\.exitBacklogs\.get\(paneId\) \?\? this\.pty\.getBacklog\(paneId\);/);
});

test("orphaned running sessions are re-stamped to stopped at startup", () => {
  // Regression: a hard app exit left rows stuck at status "running" with no
  // live process, so reopening them probed a nonexistent pane and silently
  // did nothing useful.
  assert.match(store, /export function markOrphanedRunningSessions/);
  assert.match(main, /markOrphanedRunningSessions\(Date\.now\(\), sessionManager\.adoptLive\(/);
  assert.match(store, /status = 'stopped', ended_at = \?/);
});

test("reattaching revives the SAME session row instead of inserting a new one", () => {
  // Regression (the "2 laufende -> 3 Sessions" bug): reattachSession used to
  // generate a fresh sessionId + INSERT per click. It must now reuse
  // record.id and UPDATE the existing row (reviveSessionRow).
  assert.match(manager, /const sessionId = record\.id;/);
  assert.match(manager, /reviveSessionRow\(sessionId, session\.paneIds\);/);
  // And the store helper must be an UPDATE, never an INSERT:
  assert.match(store, /export function reviveSessionRow/);
  const reviveBody = store.match(/export function reviveSessionRow[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(reviveBody.includes("UPDATE sessions SET"), "reviveSessionRow must UPDATE");
  assert.ok(!reviveBody.includes("INSERT INTO"), "reviveSessionRow must not INSERT");
});

test("window close is intercepted to hide (Never-Sleep-Terminals), only explicit quit destroys", () => {
  assert.match(main, /win\.on\("close", \(event\) =>/);
  assert.match(main, /event\.preventDefault\(\);\s*\n\s*win\.hide\(\);/);
  assert.match(main, /requestSingleInstanceLock/);
  // before-quit stamps the quitting flag so the close interceptor lets go:
  assert.match(main, /__hhQuitting = true/);
});

test("closing a tab never stops the session; stopped sessions stay listed, no auto-expiry", () => {
  assert.doesNotMatch(app, /void window.harness.stopSession(sessionId)/);
  assert.ok(manager.includes("setSessionResume(sessionId, false)"));
  assert.doesNotMatch(manager, /sweepExpiredSessions()/);
});

test("sessions running at quit/reboot are respawned automatically with resume args", () => {
  assert.ok(manager.includes(`s.resume && s.status !== "running"`));
  assert.match(main, /sessionManager\.listRestorable\(/);
  assert.match(main, /RESUME_ARGS/);
  assert.match(main, /setLoginItemSettings/);
});

test("running sessions are checkpointed periodically and on OS shutdown", () => {
  assert.match(manager, /checkpointAll\(\)/);
  assert.match(main, /setInterval\(\(\) => sessionManager\.checkpointAll\(\), 20_000\)/);
  assert.match(main, /powerMonitor\.on/);
});

test("sessions can message each other through the shared queue", () => {
  assert.match(main, /req\.type === "send"/);
  assert.match(main, /function routeSessionMessage/);
});

test("agents get splash banner, local-model/MCP extras, and never fall back to a plain shell on split", () => {
  const cfg = readFileSync(new URL("../electron/agentConfig.ts", import.meta.url), "utf8");
  const pty = readFileSync(new URL("../electron/ptyManager.ts", import.meta.url), "utf8");
  assert.ok(cfg.includes("ANTHROPIC_BASE_URL") && cfg.includes("OPENCODE_CONFIG_CONTENT") && cfg.includes("--mcp-config"));
  assert.ok(pty.includes("opts.banner") && pty.includes("\\x1b[2J\\x1b[3J"));
  assert.ok(manager.includes('sibling.presetId || "shell"'));
  assert.ok(main.includes('"prompt:improve"') && main.includes('"onboarding:setAgent"'));
});

test("claude sessions reuse the harness session id so they can be resumed after a reboot", () => {
  assert.match(manager, /\["--session-id", sessionId\]/);
  assert.match(main, /\["--resume", sessionId\]/);
  assert.match(main, /opts\.presetId === "claude-code" \? claudeResumeArgs\(record\.id\)/);
});

test("a normal quit leaves sessions running in the PTY daemon; only the tray kill-all stops them", () => {
  assert.match(main, /__hhKillAll[\s\S]*?finalizeAllOnQuit[\s\S]*?backend\.killAll\(\)[\s\S]*?checkpointAll\(\)[\s\S]*?backend\.detach\(\)/);
});
