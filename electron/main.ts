/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut, Tray, nativeImage, powerMonitor } from "electron";
import { join, dirname } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync, readdirSync } from "fs";
import { homedir } from "os";
import { loadState, saveState, slugifyProfileName, projectExportData, parseProjectExport, type Project } from "./projectStore";
import { hermesProfileCreate, hermesProfileDelete, hermesAuthAdd, hermesAuthList, hermesAuthRemove, hermesDisableTelemetryPrompt } from "./hermesCli";
import { readRecentUsage, sumUsageSince } from "./usageReader";
import { getUsageInsights, getAccountLimits } from "./hermesUsage";
import { getCodexUsage } from "./codexUsage";
import { BUILTIN_AGENT_PRESETS, buildSpawnArgs, DEFAULT_PRESET_ID } from "./agentPresets";
import { cloneRepository, isGitAvailable } from "./gitRepo";
import { stripAnsi, readAirFile } from "./airFormat";
import { SessionManager, contextTextPath, type CreateSessionOptions } from "./sessionManager";
import { listCachedModels } from "./modelCatalog";
import { detectInstalledAgents } from "./agentDetection";
import {
  setProjectContextText,
  setProjectContextFile,
  getProjectContext,
  getProjectContextForInjection,
  clearProjectContext
} from "./projectContext";
import { randomUUID } from "crypto";
import { listPluginManifests, registerPluginManifest } from "./pluginRegistry";
import { injectContext, type ContextPayload } from "./contextCore";
import { pickContextFiles, readClipboardContext } from "./contextPicker";
import { markOrphanedRunningSessions } from "./sessionStore";
import { agentExtras, buildBanner, listLocalModels, CONNECTOR_CATALOG, type LocalModelConfig, type McpServer } from "./agentConfig";
import { improvePrompt } from "./promptImprover";
import { setupPet } from "./pet";

const isDev = process.env.NODE_ENV === "development";
const sessionManager = new SessionManager();
sessionManager.agentExtrasFor = (presetId) => agentExtras(presetId, loadState());
sessionManager.bannerFor = buildBanner;

registerPluginManifest({
  id: "context-picker",
  name: "Context Picker",
  version: "1.0.0",
  description: "Inject local files and clipboard text into agent sessions.",
  slots: ["context", "action"]
});

/** CLI flags that make an agent resume its previous conversation in the same
 * cwd (Hermes is resumed through the context seed instead). */
const RESUME_ARGS: Record<string, string[]> = {
  codex: ["resume", "--last"],
  opencode: ["--continue"]
};

/** Claude Code resumes by id (the Harness session id, see SessionManager.createSession).
 * Falls back to starting a fresh conversation under that id when no transcript
 * exists yet (session never got a first message). */
function claudeResumeArgs(sessionId: string): string[] {
  const root = join(homedir(), ".claude", "projects");
  try {
    if (readdirSync(root).some((d) => existsSync(join(root, d, `${sessionId}.jsonl`)))) return ["--resume", sessionId];
  } catch {
    /* no claude projects dir yet */
  }
  return ["--session-id", sessionId];
}

function retentionDays(): number {
  return loadState().contextRetentionDays ?? 30;
}

function spawnQueuePath(): string {
  const dir = app.getPath("userData");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "harness-spawn-queue.jsonl");
}

function scriptsDir(): string {
  // Dev: electron/../scripts. Packaged: shipped alongside via build.files.
  return join(__dirname, "../scripts");
}

function createWindow(): BrowserWindow {
  // No File/Edit/View/Window/Help menu bar: this app has no menu-driven
  // commands, and the default menu was just dead chrome stacked above the
  // window's own "Willkommen zurueck" bar + the native titlebar (three
  // visually different header languages on top of each other).
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    icon: join(__dirname, "../assets/icon.png"),
    frame: false,
    // Match :root --bg-primary of the default theme so the frame the OS
    // composes before the first renderer paint is never white.
    backgroundColor: "#0d1117",
    // Never-Sleep-Terminals: closing the window must not destroy the
    // BrowserWindow (and with it the page, its xterm state and the IPC
    // channels to live agent panes) — close is intercepted below to hide().
    // Everything keeps running while the window is hidden.
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  // Intercept the X button / Alt+F4 / taskbar close: hide instead of
  // destroy. The explicit "Beenden" from the tray menu still quits the
  // whole app (that path sets app.isQuitting first).
  win.on("close", (event) => {
    sessionManager.checkpointAll();
    if (!(globalThis as { __hhQuitting?: boolean }).__hhQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  if (isDev) {
    const devUrl = "http://localhost:5173/";
    let reloadAttempts = 0;
    win.webContents.on("did-fail-load", (_event, errorCode, _errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || !validatedURL.startsWith(devUrl)) return;
      if (reloadAttempts < 5) {
        reloadAttempts += 1;
        setTimeout(() => {
          if (!win.isDestroyed()) void win.loadURL(devUrl);
        }, 350 * reloadAttempts);
        return;
      }
      const fallback = join(__dirname, "../dist-renderer/index.html");
      if (existsSync(fallback) && !win.isDestroyed()) void win.loadFile(fallback);
    });
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(join(__dirname, "../dist-renderer/index.html"));
  }
  return win;
}

/** Builds the base options for a new session. Resolves preset/model through
 * the precedence chain: explicit opts > project override > global default
 * (settings) > DEFAULT_PRESET_ID ('hermes') / no model. */
function buildSessionOpts(
  project: Project,
  opts: { cwd?: string; presetId?: string; profile?: string; model?: string; name: string }
): CreateSessionOptions {
  const state = loadState();
  const presetId = opts.presetId || project.defaultPresetId || state.defaultPresetId || DEFAULT_PRESET_ID;
  const preset = BUILTIN_AGENT_PRESETS.find((p) => p.id === presetId) || BUILTIN_AGENT_PRESETS[0];
  const model = opts.model || project.defaultModel || state.defaultModel || undefined;
  const { command, args } = buildSpawnArgs(preset, { profile: opts.profile, model });
  const extras = agentExtras(preset.id, state);
  return {
    projectId: project.id,
    name: opts.name,
    presetId: presetId || "hermes",
    profile: opts.profile,
    model,
    cwd: opts.cwd || project.folder,
    shellOverride: command || undefined,
    args: command ? [...args, ...extras.args] : [],
    banner: command ? buildBanner(preset.label) : undefined,
    env: {
      ...extras.env,
      HH_PROJECT_ID: project.id,
      HH_SPAWN_QUEUE: spawnQueuePath(),
      HH_SCRIPTS_DIR: scriptsDir()
    }
  };
}

/** Builds the initial Hermes seed message: project context + cross-session
 * digest + a hint that the agent can open its own tracked sub-pane. Built
 * BEFORE the spawn so it can seed `hermes chat -q` (real first turn, sent
 * immediately — see buildSpawnArgs for why not a delayed stdin write). */
function buildHermesSeedQuery(projectId: string, excludeSessionId: string, scriptsDirPath: string): string {
  const digest = sessionManager.getProjectActivityDigest(projectId, excludeSessionId);
  const projectContext = getProjectContextForInjection(projectId);
  return (
    (projectContext ? `Projekt-Kontext:\n${projectContext}\n\n` : "") +
    `[Hermes Harness] Du laeufst in einer Multi-Terminal-Harness fuer dieses Projekt. ` +
    `Bestaetige kurz, dass du den Kontext gelesen hast, und warte auf meine eigentliche Aufgabe. ` +
    `Andere Sessions dieses Projekts siehst/liest du mit: node "${scriptsDirPath}/hh-peers.cjs" list bzw. read <name>; ` +
    `Nachricht an eine Session: node "${scriptsDirPath}/hh-send.cjs" --to <name> "Text". ` +
    `Bei Bedarf kannst du ein weiteres getracktes Terminal-Pane oeffnen mit: ` +
    `node "${scriptsDirPath}/hh-spawn.cjs" --label "<Name>" --preset shell --cwd .\n` +
    (digest
      ? `Andere aktuell laufende Sessions in diesem Projekt:\n${digest}\n`
      : `Keine weiteren aktiven Sessions in diesem Projekt.\n`)
  );
}

/** Spawns a new session with a single pane, optionally seeding a Hermes pane
 * with project context and a cross-session activity digest as its real
 * first turn (hermes chat -q). */
function spawnTrackedSession(
  win: BrowserWindow,
  project: Project,
  opts: { cwd?: string; presetId?: string; profile?: string; model?: string; name: string }
): { sessionId: string; paneId: string } {
  const sessionOpts = buildSessionOpts(project, opts);
  if (sessionOpts.presetId === "hermes" && sessionOpts.shellOverride) {
    //Seed-Nachricht als echte erste Turn: buildSessionOpts hat schon
    // command+args via buildSpawnArgs — hier nur die Query dranhaengen
    // (hermes chat -q "<text>" seedet die interaktive TUI, siehe agentPresets).
    // Neu gespawnt => Digest schliesst NUR die neue Session aus; deren id ist
    // noch nicht bekannt, aber ihr Backlog ist leer, darum Stoert sie nicht.
    const seed = buildHermesSeedQuery(project.id, "", scriptsDir());
    sessionOpts.args = [...(sessionOpts.args ?? []), "chat", "-q", seed].filter(
      (a) => a !== ""
    );
  }
  const sessionId = sessionManager.createSession(sessionOpts, win.webContents, retentionDays());
  const session = sessionManager.listSessions(project.id).find((s) => s.id === sessionId);
  const paneId = session?.paneIds[0] ?? "";

  return { sessionId, paneId };
}

function inboxPath(sessionId: string): string {
  const dir = join(app.getPath("userData"), "session-inbox");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, `${sessionId}.jsonl`);
}

/** Publishes the project's session list for hh-peers.cjs (plain JSON next to
 * the spawn queue; the script can't open the SQLite DB). */
function writePeersFile(): void {
  try {
    const out: Record<string, unknown[]> = {};
    for (const p of loadState().projects) {
      out[p.id] = sessionManager.listSessions(p.id).map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        textPath: contextTextPath(s.id)
      }));
    }
    writeFileSync(join(dirname(spawnQueuePath()), "harness-peers.json"), JSON.stringify(out), "utf-8");
  } catch {
    /* best effort */
  }
}

const lastSend = new Map<string, number>();

/** Agent-to-agent message: typed into the target if it is live, otherwise
 * stored in its inbox and delivered on the next reattach. */
function routeSessionMessage(projectId: string, from: string, to: string, text: string): void {
  if (!text.trim()) return;
  const sessions = sessionManager.listSessions(projectId);
  const target = sessions.find((s) => s.id === to) ?? sessions.find((s) => s.name.toLowerCase() === to.toLowerCase());
  if (!target || target.id === from) return;
  const key = `${from}>${target.id}`;
  const now = Date.now();
  if (now - (lastSend.get(key) ?? 0) < 5000) return; // loop guard
  lastSend.set(key, now);
  const fromName = sessions.find((s) => s.id === from)?.name ?? "andere Session";
  const line = `[Nachricht von Session "${fromName}"] ${text.trim().slice(0, 2000)}`;
  if (target.status === "running" && sessionManager.deliverToSession(target.id, line)) return;
  try {
    appendFileSync(inboxPath(target.id), JSON.stringify({ line }) + "\n", "utf-8");
  } catch {
    /* best effort */
  }
}

/** Pending inbox lines for a session (consumed). */
function takeInbox(sessionId: string): string[] {
  const p = inboxPath(sessionId);
  if (!existsSync(p)) return [];
  try {
    const lines = readFileSync(p, "utf-8").split("\n").filter(Boolean).map((l) => (JSON.parse(l) as { line: string }).line);
    unlinkSync(p);
    return lines;
  } catch {
    return [];
  }
}

/** Polls the agent-writable spawn-request queue every few seconds while the
 * app is open and turns pending requests into real tracked sessions. */
function startSpawnQueueWatcher(win: BrowserWindow): void {
  const path = spawnQueuePath();
  setInterval(() => {
    writePeersFile();
    if (!existsSync(path)) return;
    let raw: string;
    try {
      raw = readFileSync(path, "utf-8");
    } catch {
      return;
    }
    if (!raw.trim()) return;
    try {
      writeFileSync(path, "", "utf-8");
    } catch {
      /* best effort */
    }
    const lines = raw.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      let req: { type?: string; projectId: string; label: string; presetId: string; cwd: string; from?: string; to?: string; text?: string };
      try {
        req = JSON.parse(line);
      } catch {
        continue;
      }
      if (req.type === "send") {
        routeSessionMessage(req.projectId, req.from ?? "", req.to ?? "", req.text ?? "");
        continue;
      }
      const project = loadState().projects.find((p) => p.id === req.projectId);
      if (!project) continue;
      const { sessionId, paneId } = spawnTrackedSession(win, project, {
        cwd: req.cwd || project.folder,
        presetId: req.presetId || project.defaultPresetId || loadState().defaultPresetId || DEFAULT_PRESET_ID,
        profile: project.hermesProfile,
        name: req.label || "Sub-Terminal",
        model: undefined
      });
      if (!win.webContents.isDestroyed()) {
        win.webContents.send("sessions:spawned", {
          projectId: project.id,
          sessionId,
          paneId,
          name: req.label || "Sub-Terminal",
          label: req.label || "Sub-Terminal",
          presetId: req.presetId || project.defaultPresetId || loadState().defaultPresetId || DEFAULT_PRESET_ID,
          cwd: req.cwd || project.folder,
          profile: project.hermesProfile
        });
      }
    }
  }, 4000);
}

// Never-Sleep single-instance guard: a second launch must not fork a
// duplicate Electron process tree (whose panes would double-start agents);
// it signals the first instance, which brings the hidden window back.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

app.whenReady().then(async () => {
  // Terminals live in a detached PTY daemon (ptyHost.ts) so they survive app
  // restarts; connect (starting it if needed) before anything can spawn.
  try {
    await sessionManager.backend.connect();
  } catch (err) {
    dialog.showErrorBox("Cate", `Terminal-Dienst konnte nicht gestartet werden.\n${err instanceof Error ? err.message : String(err)}`);
    app.exit(1);
    return;
  }

  // Crash/PC-restart safety: checkpoint live session context every 20s and on
  // OS shutdown/suspend/lock, so a hard kill loses at most one interval.
  setInterval(() => sessionManager.checkpointAll(), 20_000);
  for (const ev of ["shutdown", "suspend", "lock-screen"] as const) {
    powerMonitor.on(ev as "suspend", () => sessionManager.checkpointAll());
  }

  // Start with Windows (hidden, in the tray) so persistent sessions come back
  // after a PC restart. Disable with `autoStart: false` in the state file.
  if (!isDev && loadState().autoStart !== false) {
    app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });
  }
  const win = createWindow();
  if (process.argv.includes("--hidden")) win.hide();
  // Sessions whose panes survived in the daemon are adopted as-is; any other
  // "running" row lost its pty (daemon gone, e.g. after a PC reboot) and is
  // re-stamped "stopped" so the auto-resume loop below respawns it.
  markOrphanedRunningSessions(Date.now(), sessionManager.adoptLive(win.webContents, retentionDays()));
  startSpawnQueueWatcher(win);

  // Tray icon: after Never-Sleep-Terminals hide-on-close, the ONLY way back
  // into the app is this menu (plus the taskbar entry for a minimized
  // window). Shows the window again and offers an explicit quit.
  const tray = new Tray(nativeImage.createFromPath(join(__dirname, "../assets/tray.png")));
  tray.setToolTip("Cate");
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Cate anzeigen",
      click: () => {
        if (win.isDestroyed()) return;
        win.show();
        win.focus();
      }
    },
    { label: "Katze ein/aus", click: () => petCtl.toggle() },
    { type: "separator" },
    {
      label: "Beenden (Sessions laufen weiter)",
      click: () => {
        (globalThis as { __hhQuitting?: boolean }).__hhQuitting = true;
        app.quit();
      }
    },
    {
      label: "Beenden && alle Sessions stoppen",
      click: () => {
        (globalThis as { __hhQuitting?: boolean; __hhKillAll?: boolean }).__hhKillAll = true;
        (globalThis as { __hhQuitting?: boolean }).__hhQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on("click", () => {
    if (win.isDestroyed()) return;
    win.show();
    win.focus();
  });

  // Daemon gone (killed, crashed): keep every session's context and resume flag
  // untouched and restart the app, which starts a fresh daemon and respawns the
  // sessions with their agent's resume — the same path as after a PC reboot.
  sessionManager.backend.onLost = () => {
    sessionManager.checkpointAll();
    app.relaunch();
    app.exit(0);
  };

  const petCtl = setupPet(win, sessionManager);

  const registered = globalShortcut.register("Alt+Space", () => {
    if (!win.isDestroyed()) win.webContents.send("plugins:shortcut");
  });
  if (!registered) console.warn("Alt+Space konnte nicht global registriert werden; lokaler Overlay-Fallback bleibt aktiv.");

  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle("window:close", (event) => {
    // "Never Sleep Terminals": the X button hides the window instead of
    // quitting the app, so every agent pty keeps running and the session
    // keeps accumulating context while the window is gone. A real quit
    // still happens via window-all-closed → app.quit(), but that path is
    // only reached from an explicit taskbar/tray quit, not the X button.
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.hide();
    }
  });
  ipcMain.handle("plugins:list", () => listPluginManifests());
  ipcMain.handle("context:inject", (_e, { sessionId, payload }: { sessionId: string; payload: ContextPayload }) =>
    injectContext(sessionId, payload)
  );
  ipcMain.handle("context:pickFiles", () => pickContextFiles(win));
  ipcMain.handle("context:readClipboard", () => readClipboardContext());

  // Session-centric IPC routes
  ipcMain.handle(
    "session:create",
    (
      _e,
      opts: { projectId: string; cwd: string; name: string; presetId?: string; profile?: string; model?: string }
    ) => {
        const project = loadState().projects.find((p) => p.id === opts.projectId);
        if (!project) throw new Error("Project not found");
        const state = loadState();
        const presetId = opts.presetId || project.defaultPresetId || state.defaultPresetId || DEFAULT_PRESET_ID;
        const model = opts.model || project.defaultModel || state.defaultModel || undefined;
        // Sensibler Default-Name: "<Preset-Label> · <Projektname>" statt vier
        // identischer "Hermes"/"Shell"-Zeilen in der Sidebar.
        const presetLabel = BUILTIN_AGENT_PRESETS.find((p) => p.id === presetId)?.label || presetId;
        const name = opts.name?.trim() || `${presetLabel} · ${project.name}`;
        const { sessionId, paneId } = spawnTrackedSession(win, project, {
          cwd: opts.cwd,
          presetId,
          profile: opts.profile || project.hermesProfile,
          model,
          name
        });
        if (!win.webContents.isDestroyed()) {
          win.webContents.send("sessions:spawned", {
            projectId: project.id,
            sessionId,
            paneId,
            name,
            label: name,
            presetId,
            cwd: opts.cwd,
            profile: opts.profile || project.hermesProfile
          });
        }
        return { sessionId, paneId, presetId, name };
      }
  );

  ipcMain.handle("session:attachPane", (_e, { paneId }: { paneId: string }) => sessionManager.attachPane(paneId));

  // Terminal-Export: PTY-Backlog eines Panes per Save-Dialog als .txt ablegen.
  // ANSI-Steuersequenzen werden vorher entfernt, damit die Datei lesbar ist.
  ipcMain.handle("session:exportPane", async (_e, { paneId }: { paneId: string }) => {
    const backlog = sessionManager.attachPane(paneId)?.backlog;
    if (backlog == null) return { ok: false, message: "Pane nicht gefunden oder nicht (mehr) live." };
    const result = await dialog.showSaveDialog(win, {
      title: "Als .txt speichern",
      defaultPath: join(app.getPath("downloads"), "terminal-export.txt"),
      filters: [{ name: "Textdatei", extensions: ["txt"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, message: "Abgebrochen." };
    try {
      writeFileSync(result.filePath, stripAnsi(backlog), "utf-8");
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle(
    "session:splitPane",
    (
      _e,
      { sessionId, paneId, direction, presetId }: { sessionId: string; paneId: string; direction: "horizontal" | "vertical"; presetId?: string }
    ) => sessionManager.splitPane(sessionId, paneId, direction, presetId, win.webContents, retentionDays())
  );

  const reattachById = (sessionId: string, projectId: string) => {
    const record = sessionManager.listSessions(projectId).find((s) => s.id === sessionId);
    const project = loadState().projects.find((p) => p.id === projectId);
    if (!record || !project) return { ok: false, error: { code: "SESSION_NOT_FOUND", message: "Saved session not found." } };
    // Restores the CLI tool the session actually used (persisted on the
    // session row since the preset-persistence fix below), not the
    // project's current default — otherwise reattaching a "shell" session
    // in a project whose default is "hermes" silently handed you a
    // different tool, which looked like "reopening old sessions is broken".
    const opts = buildSessionOpts(project, {
      cwd: record.cwd,
      presetId: record.presetId || project.defaultPresetId || DEFAULT_PRESET_ID,
      profile: record.profile || project.hermesProfile,
      model: record.model || undefined,
      name: record.name
    });
    const inbox = takeInbox(record.id);
    const isHermes = opts.presetId === "hermes" && !!opts.shellOverride;
    if (record.contextPath && existsSync(record.contextPath) && isHermes) {
      try {
        const restoredContext = readAirFile(record.contextPath);
        // Wiederhergestellter Kontext wird dem normalen Start-Seed
        // VORANGESTELLT statt ihn zu ersetzen, damit der Agent sowohl die
        // alte Session-Historie als auch die uebliche Erst-Nachricht
        // (Projekt-Kontext, Multi-Terminal-Hinweis, Aktivitaets-Digest) bekommt.
        const seed = buildHermesSeedQuery(project.id, "", scriptsDir());
        const pending = inbox.length ? `Neue Nachrichten anderer Sessions:\n${inbox.join("\n")}\n\n` : "";
        const combined = `Wiederhergestellter Session-Kontext:\n${restoredContext}\n\n${pending}${seed}`;
        opts.args = [...(opts.args ?? []), "chat", "-q", combined];
      } catch {
        // Spawn without context if the saved file cannot be read.
      }
    }
    const resumeArgs = opts.presetId === "claude-code" ? claudeResumeArgs(record.id) : RESUME_ARGS[opts.presetId ?? ""];
    if (!isHermes && resumeArgs && opts.shellOverride) opts.args = [...(opts.args ?? []), ...resumeArgs];
    const result = sessionManager.reattachSession(record, opts, win.webContents, retentionDays());
    // Non-Hermes CLIs cannot take a seed query: type a one-line pointer to the
    // plain-text transcript (and pending inbox messages) once the CLI is up.
    const txt = contextTextPath(record.id);
    if (!isHermes && (existsSync(txt) || inbox.length)) {
      const hint =
        (existsSync(txt) ? `[Hermes Harness] Session wiederhergestellt. Lies den bisherigen Verlauf in ${txt} und mach dort weiter. ` : "") +
        (inbox.length ? inbox.join(" ") + " " : "") +
        `Andere Sessions: node "${scriptsDir()}/hh-peers.cjs" list | read <name>; senden: node "${scriptsDir()}/hh-send.cjs" --to <name> "Text"`;
      setTimeout(() => sessionManager.deliverToSession(record.id, hint), 4000);
    }
    if (!win.webContents.isDestroyed()) win.webContents.send("sessions:spawned", { projectId, sessionId: result.sessionId, paneId: result.paneId, name: record.name, label: record.name, presetId: opts.presetId, cwd: record.cwd, profile: opts.profile });
    return result;
  };
  ipcMain.handle("session:reattach", (_e, { sessionId, projectId }: { sessionId: string; projectId: string }) =>
    reattachById(sessionId, projectId)
  );

  // Persistence across app restarts / PC reboot: every session that was
  // running when the app (or the PC) went down and was not stopped by the
  // user is respawned automatically, resuming its agent conversation.
  for (const p of loadState().projects) {
    for (const s of sessionManager.listSessions(p.id)) {
      if (s.resume && s.status !== "running") reattachById(s.id, p.id);
    }
  }

  ipcMain.on("session:paneInput", (e, { paneId, data }: { paneId: string; data: string }) => {
    sessionManager.writePane(paneId, data, { sender: e.sender });
  });

  ipcMain.on("session:paneResize", (_e, { paneId, cols, rows }: { paneId: string; cols: number; rows: number }) => {
    sessionManager.resizePane(paneId, cols, rows);
  });

  // Backward-compatible pane API (existing renderer)
  ipcMain.handle(
    "pty:spawn",
    (_e, opts: { projectId: string; cwd: string; presetId: string; profile?: string; model?: string; label: string }) => {
      const project = loadState().projects.find((p) => p.id === opts.projectId);
      if (!project) throw new Error("Project not found");
      const { sessionId, paneId } = spawnTrackedSession(win, project, {
        cwd: opts.cwd,
        presetId: opts.presetId,
        profile: opts.profile || project.hermesProfile,
        model: opts.model,
        name: opts.label
      });
      if (!win.webContents.isDestroyed()) {
        win.webContents.send("sessions:spawned", {
          projectId: project.id,
          sessionId,
          paneId,
          name: opts.label,
          label: opts.label,
          presetId: opts.presetId,
          cwd: opts.cwd,
          profile: opts.profile || project.hermesProfile
        });
      }
      return paneId;
    }
  );

  ipcMain.handle("pty:attach", (_e, { id }: { id: string }) => sessionManager.attachPane(id));

  ipcMain.on("pty:input", (e, { id, data }: { id: string; data: string }) => {
    sessionManager.writePane(id, data, { sender: e.sender });
  });

  ipcMain.on("pty:resize", (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    sessionManager.resizePane(id, cols, rows);
  });

  ipcMain.handle("dialog:pickFolder", async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
      title: "Ordner auswählen"
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("git:isAvailable", () => isGitAvailable());

  ipcMain.handle("git:clone", async (_e, { url, parentFolder }: { url: string; parentFolder: string }) =>
    cloneRepository(url, parentFolder)
  );

  ipcMain.handle("project:list", () => loadState().projects);

  ipcMain.handle("project:export", async (_e, { id }: { id: string }) => {
    const project = loadState().projects.find((p) => p.id === id);
    if (!project) return { ok: false, message: "Projekt nicht gefunden." };
    const result = await dialog.showSaveDialog(win, {
      title: "Projekt exportieren",
      defaultPath: `${project.name.replace(/[^a-z0-9_-]+/gi, "-")}.hermes-project.json`,
      filters: [{ name: "Hermes-Projekt", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    writeFileSync(result.filePath, JSON.stringify(projectExportData(project), null, 2), "utf-8");
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle("project:import", async () => {
    const picked = await dialog.showOpenDialog(win, {
      title: "Projekt importieren", properties: ["openFile"],
      filters: [{ name: "Hermes-Projekt", extensions: ["json"] }]
    });
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
    try {
      const imported = parseProjectExport(JSON.parse(readFileSync(picked.filePaths[0], "utf-8")));
      const state = loadState();
      const hermesProfile = slugifyProfileName(imported.name);
      const profileResult = await hermesProfileCreate(hermesProfile);
      if (profileResult.ok) await hermesDisableTelemetryPrompt(hermesProfile);
      const project: Project = { id: randomUUID(), createdAt: Date.now(), hermesProfile, ...imported };
      state.projects.push(project); state.lastActiveProjectId = project.id; saveState(state);
      return { ok: true, project, hermesProfileResult: profileResult };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Import fehlgeschlagen." };
    }
  });


  ipcMain.handle("project:create", async (_e, { name, folder, icon, defaultModel }: { name: string; folder: string; icon?: string; defaultModel?: string }) => {
    const hermesProfile = slugifyProfileName(name);
    const result = await hermesProfileCreate(hermesProfile);
    // läuft im Hintergrund weiter: das Projekt erscheint sofort, die Telemetrie-Voreinstellung ist nur Komfort
    if (result.ok) void hermesDisableTelemetryPrompt(hermesProfile);
    const state = loadState();
    const project: Project = {
      id: randomUUID(),
      name,
      folder,
      hermesProfile,
      createdAt: Date.now(),
      icon: icon || undefined,
      defaultModel: defaultModel || undefined
    };
    state.projects.push(project);
    state.lastActiveProjectId = project.id;
    saveState(state);
    return { project, hermesProfileResult: result };
  });

  ipcMain.handle(
    "project:update",
    (_e, { id, patch }: { id: string; patch: Partial<Pick<Project, "icon" | "defaultModel" | "name">> }) => {
      const state = loadState();
      const project = state.projects.find((p) => p.id === id);
      if (!project) return { ok: false };
      Object.assign(project, patch);
      saveState(state);
      return project;
    }
  );

  ipcMain.handle("project:delete", async (_e, { id }: { id: string }) => {
    const state = loadState();
    const project = state.projects.find((p) => p.id === id);
    if (!project) return { ok: false, message: "not found" };
    sessionManager.deleteProjectSessions(id);
    const result = await hermesProfileDelete(project.hermesProfile);
    state.projects = state.projects.filter((p) => p.id !== id);
    saveState(state);
    return { ok: true, hermesProfileResult: result };
  });

  ipcMain.handle("usage:recent", (_e, { profile, limit }: { profile?: string; limit?: number }) =>
    readRecentUsage(profile, limit)
  );

  ipcMain.handle("usage:since", (_e, { profile, since }: { profile?: string; since: number }) =>
    sumUsageSince(profile, since)
  );

  ipcMain.handle("usage:insights", (_e, { days }: { days: number }) => getUsageInsights(days));

  ipcMain.handle("usage:limits", () => getAccountLimits());

  ipcMain.handle("usage:codex", (_e, { days }: { days: number }) => getCodexUsage(days));

  ipcMain.handle("agents:list", () => BUILTIN_AGENT_PRESETS);

  ipcMain.handle("agents:localModels", (_e, { endpoint }: { endpoint?: string }) => listLocalModels(endpoint));

  ipcMain.handle("settings:getAgentConfig", () => {
    const state = loadState();
    return { localModel: state.localModel ?? null, mcpServers: state.mcpServers ?? [], connectors: CONNECTOR_CATALOG };
  });

  ipcMain.handle("settings:setLocalModel", (_e, { config }: { config: LocalModelConfig | null }) => {
    const state = loadState();
    state.localModel = config ? { enabled: !!config.enabled, endpoint: String(config.endpoint || "").trim(), model: String(config.model || "").trim() } : undefined;
    saveState(state);
    return { ok: true };
  });

  ipcMain.handle("settings:setMcpServers", (_e, { servers }: { servers: McpServer[] }) => {
    const state = loadState();
    state.mcpServers = (servers ?? [])
      .filter((s) => s && String(s.name).trim() && (s.command || s.url))
      .map((s) => ({ ...s, name: String(s.name).trim().replace(/[^A-Za-z0-9_-]/g, "-"), id: s.id || randomUUID() }));
    saveState(state);
    return { ok: true };
  });

  ipcMain.handle("onboarding:setAgent", (_e, { presetId }: { presetId: string }) => {
    if (!BUILTIN_AGENT_PRESETS.some((p) => p.id === presetId)) return { ok: false, message: "Unbekanntes Agent-Preset." };
    const state = loadState();
    state.defaultPresetId = presetId;
    state.onboardedAgent = true;
    saveState(state);
    return { ok: true };
  });

  ipcMain.handle("prompt:improve", (_e, { text, presetId }: { text: string; presetId: string }) =>
    improvePrompt(text, presetId, loadState())
  );

  ipcMain.handle("agents:detectInstalled", () => detectInstalledAgents());

  ipcMain.handle("settings:getUserName", () => loadState().userName ?? null);

  ipcMain.handle("settings:setUserName", (_e, { name }: { name: string }) => {
    const state = loadState();
    state.userName = name;
    saveState(state);
    return { ok: true };
  });

  ipcMain.handle("settings:getSidebarPosition", () => loadState().sidebarPosition ?? "left");

  ipcMain.handle("settings:setSidebarPosition", (_e, { position }: { position: "left" | "right" }) => {
    const state = loadState();
    state.sidebarPosition = position;
    saveState(state);
    return { ok: true };
  });

  ipcMain.handle("settings:getTheme", () => loadState().theme ?? "nous");

  ipcMain.handle("settings:setTheme", (_e, { theme }: { theme: "nous" | "obsidian" | "slate" | "daylight" | "aurora" | "copper" }) => {
    const state = loadState();
    state.theme = theme;
    saveState(state);
    return { ok: true };
  });

  ipcMain.handle("settings:getMotionEnabled", () => loadState().motionEnabled ?? true);

  ipcMain.handle("settings:setMotionEnabled", (_e, { enabled }: { enabled: boolean }) => {
    const state = loadState();
    state.motionEnabled = enabled;
    saveState(state);
    return { ok: true };
  });

  // Combined read so the Settings dialog fetches both agent defaults in one IPC round-trip.
  ipcMain.handle("settings:getAgentDefaults", () => {
    const state = loadState();
    return { defaultPresetId: state.defaultPresetId ?? "hermes", defaultModel: state.defaultModel ?? null };
  });

  ipcMain.handle("settings:setDefaultPreset", (_e, { presetId }: { presetId: string }) => {
    if (!BUILTIN_AGENT_PRESETS.some((p) => p.id === presetId)) return { ok: false, message: "Unbekanntes Agent-Preset." };
    const state = loadState();
    state.defaultPresetId = presetId;
    saveState(state);
    return { ok: true };
  });

  ipcMain.handle("settings:setDefaultModel", (_e, { model }: { model: string | null }) => {
    const state = loadState();
    const cleaned = String(model ?? "").trim();
    state.defaultModel = cleaned || undefined;
    saveState(state);
    return { ok: true };
  });

  ipcMain.handle("settings:getRetentionDays", () => retentionDays());

  ipcMain.handle("settings:setRetentionDays", (_e, { days }: { days: number }) => {
    const state = loadState();
    state.contextRetentionDays = Math.max(1, Math.floor(days));
    saveState(state);
    return { ok: true };
  });

  ipcMain.handle(
    "auth:add",
    async (_e, { profile, provider, apiKey, label }: { profile: string; provider: string; apiKey: string; label?: string }) =>
      hermesAuthAdd(profile, provider, apiKey, label)
  );

  ipcMain.handle("auth:list", async (_e, { profile }: { profile: string }) => hermesAuthList(profile));

  ipcMain.handle(
    "auth:remove",
    async (_e, { profile, provider, target }: { profile: string; provider: string; target: string }) =>
      hermesAuthRemove(profile, provider, target)
  );

  ipcMain.handle("sessions:list", (_e, { projectId }: { projectId: string }) => sessionManager.listSessions(projectId));

  ipcMain.handle("sessions:getContext", (_e, { id }: { id: string }) => sessionManager.getSessionContext(id));

  ipcMain.handle("sessions:stop", (_e, { id }: { id: string }) => ({ ok: sessionManager.stopSession(id) }));

  ipcMain.handle("sessions:delete", (_e, { id }: { id: string }) => {
    sessionManager.deleteSession(id);
    return { ok: true };
  });

  ipcMain.handle("sessions:archive", (_e, { id, archived }: { id: string; archived: boolean }) => ({
    ok: sessionManager.archiveSession(id, archived)
  }));

  ipcMain.handle(
    "session:rename",
    (_e, { sessionId, name }: { sessionId: string; name: string }) => {
      // Umlaute/Gross-/Kleinschreibung/Leerzeichen bewusst erlaubt — dieser
      // Name ist ein Anzeigetitel, kein Hermes-Profilname (der Profile-Slug
      // slugifyProfileName betrifft nur profile create und bleibt strikt).
      const cleaned = String(name ?? "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, 80);
      if (!cleaned) return { ok: false, message: "Der Name darf nicht leer sein." };
      const ok = sessionManager.renameSessionManual(sessionId, cleaned);
      return ok ? { ok: true } : { ok: false, message: "Session nicht gefunden." };
    }
  );

  ipcMain.handle("models:listCached", () => listCachedModels());

  ipcMain.handle("dialog:pickContextFile", async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      title: "Datei anhängen"
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("project:setContextText", (_e, { projectId, text, sourceLabel }: { projectId: string; text: string; sourceLabel: string }) => {
    setProjectContextText(projectId, text, sourceLabel);
    return { ok: true };
  });

  ipcMain.handle("project:setContextFile", (_e, { projectId, filePath }: { projectId: string; filePath: string }) => {
    setProjectContextFile(projectId, filePath);
    return { ok: true };
  });

  ipcMain.handle("project:getContext", (_e, { projectId }: { projectId: string }) => getProjectContext(projectId));

  ipcMain.handle("project:clearContext", (_e, { projectId }: { projectId: string }) => {
    clearProjectContext(projectId);
    return { ok: true };
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("second-instance", () => {
  // Never-Sleep: a second launch (desktop shortcut double-click) while the
  // first instance lives in the tray brings the hidden window back instead
  // of starting a duplicate process tree.
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

app.on("window-all-closed", () => {
  // Never-Sleep-Terminals: with hide-on-close the window is only ever
  // DESTROYED from the tray's explicit "Beenden" — reaching this event at
  // all means a real quit was intended. (With the window merely hidden,
  // window-all-closed never fires, so agent panes keep running.)
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  globalShortcut.unregister("Alt+Space");
  (globalThis as { __hhQuitting?: boolean }).__hhQuitting = true;
  // Sessions live in the PTY daemon, so a normal quit leaves them running
  // (re-adopted on next start); just flush their context. Only the tray's
  // "Beenden & alle Sessions stoppen" kills them.
  if ((globalThis as { __hhKillAll?: boolean }).__hhKillAll) {
    sessionManager.finalizeAllOnQuit(retentionDays());
    sessionManager.backend.killAll();
  } else {
    sessionManager.checkpointAll();
  }
  sessionManager.backend.detach();
});
