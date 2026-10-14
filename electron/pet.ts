/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { BrowserWindow, ipcMain, screen } from "electron";
import { join } from "path";
import { loadState, saveState } from "./projectStore";
import type { SessionManager } from "./sessionManager";
import { PET_DEFAULTS, petBounds, sanitizePet, type PetSettings } from "./petSettings";
import { describeDisplays, rectsEqual, resolveDisplay, type DisplayList } from "./petDisplays";

type SessionRef = { id: string; name: string; projectId: string };

/**
 * The desktop cat: a transparent, click-through, always-on-top window on the work area of
 * the chosen display. The cat (assets/pet.html) walks around, reports when a
 * session is done, takes a quick prompt on click and opens the project on
 * double-click. Settings live in the app state (`pet`) and apply instantly.
 */
export function setupPet(win: BrowserWindow, sessions: SessionManager): { toggle(): void; setWaitingCount(n: number): void } {
  let settings = sanitizePet(loadState().pet);
  let lastDone: SessionRef | null = null;
  /** Display the cat jumped to on a notification while the display choice is "automatic". */
  let autoDisplayId: number | null = null;
  /** Anzahl der Sessions, die gerade auf eine Eingabe warten (renderer-seitige Erkennung). */
  let waitingCount = 0;

  /**
   * The display the cat belongs on: the saved choice (by display id) if it is still connected, else the main display.
   * Root cause of the old "monitor selection does nothing": there was no such setting at all, the window was created
   * on the primary work area and `apply()` re-fitted it to `getDisplayMatching(pet.getBounds())`, i.e. to wherever it
   * already was, so it could never leave the primary display on its own.
   */
  function target() {
    const all = screen.getAllDisplays();
    const primaryId = screen.getPrimaryDisplay().id;
    const { display, fallback } = resolveDisplay(all, settings.displayId ?? autoDisplayId, primaryId);
    return { display: display ?? screen.getPrimaryDisplay(), fallback: settings.displayId !== null && fallback, all, primaryId };
  }

  const pet = new BrowserWindow({
    ...petBounds(settings, target().display.workArea),
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload: join(__dirname, "petPreload.js"), contextIsolation: true, nodeIntegration: false }
  });
  pet.setAlwaysOnTop(settings.alwaysOnTop, "screen-saver");
  pet.setIgnoreMouseEvents(true, { forward: true });
  pet.loadFile(join(__dirname, "../assets/pet.html"));
  pet.once("ready-to-show", () => apply());

  /** Moves the window onto the target display. Windows applies the DPI of the display the window is *currently* on
   * to setBounds, so a hop between displays with different scaling lands wrong; a second call corrects it. */
  function place(): void {
    if (pet.isDestroyed()) return;
    const want = petBounds(settings, target().display.workArea);
    for (let i = 0; i < 2 && !rectsEqual(pet.getBounds(), want); i++) pet.setBounds(want);
  }

  /** Pushes the current settings into the window geometry, the idle detector and the page. */
  function apply(): void {
    if (pet.isDestroyed()) return;
    sessions.backend.idleMs = settings.idleSeconds * 1000;
    if (!settings.enabled) {
      pet.hide();
      syncCursor();
      return;
    }
    pet.setAlwaysOnTop(settings.alwaysOnTop, "screen-saver");
    if (settings.clickThrough) pet.setIgnoreMouseEvents(true, { forward: true });
    place();
    if (!pet.isVisible()) pet.showInactive();
    pet.webContents.send("pet:settings", settings);
    syncCursor();
  }

  function displayList(): DisplayList {
    const t = target();
    return { displays: describeDisplays(t.all, t.primaryId), selectedId: settings.displayId, activeId: t.display.id, fallback: t.fallback };
  }

  function update(patch: unknown): PetSettings {
    const before = settings.displayId;
    settings = sanitizePet(patch, settings);
    if (settings.displayId !== before) autoDisplayId = null;
    const state = loadState();
    state.pet = settings;
    saveState(state);
    apply();
    return settings;
  }

  // Displays come and go (monitor unplugged, resolution or taskbar changed): re-fit the cat and tell the settings UI.
  let displayTimer: NodeJS.Timeout | undefined;
  const onDisplaysChanged = () => {
    clearTimeout(displayTimer);
    displayTimer = setTimeout(() => {
      if (pet.isDestroyed()) return;
      if (autoDisplayId !== null && !screen.getAllDisplays().some((d) => d.id === autoDisplayId)) autoDisplayId = null;
      if (settings.enabled) place();
      if (!win.isDestroyed()) win.webContents.send("pet:displays-changed", displayList());
    }, 150);
  };
  screen.on("display-added", onDisplaysChanged);
  screen.on("display-removed", onDisplaysChanged);
  screen.on("display-metrics-changed", onDisplaysChanged);
  pet.once("closed", () => {
    clearTimeout(displayTimer);
    clearInterval(cursorTimer);
    screen.removeListener("display-added", onDisplaysChanged);
    screen.removeListener("display-removed", onDisplaysChanged);
    screen.removeListener("display-metrics-changed", onDisplaysChanged);
  });

  // "Follow the mouse": poll the pointer only while the option is on and tell the page where it is (window coordinates).
  let cursorTimer: NodeJS.Timeout | undefined;
  let lastCursor = "";
  function syncCursor(): void {
    clearInterval(cursorTimer);
    cursorTimer = undefined;
    if (!settings.enabled || !settings.followCursor) return;
    cursorTimer = setInterval(() => {
      if (pet.isDestroyed()) return;
      const p = screen.getCursorScreenPoint(), b = pet.getBounds();
      const inside = p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height;
      const msg = inside ? { x: p.x - b.x, y: p.y - b.y } : null;
      const key = msg ? `${Math.round(msg.x / 8)},${Math.round(msg.y / 8)}` : "out";
      if (key === lastCursor) return;
      lastCursor = key;
      pet.webContents.send("pet:cursor", msg);
    }, 150);
  }

  /** Brings the cat in front of every other window; in automatic mode also onto the display the user is working on. */
  function surface(): void {
    if (settings.displayId === null && settings.followOnNotify) {
      autoDisplayId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
      place();
    }
    if (!settings.alwaysOnTop) return;
    pet.setAlwaysOnTop(true, "screen-saver"); // re-assert: another topmost window may have taken the slot
    pet.moveTop();
  }

  function notify(text: string): void {
    if (pet.isDestroyed() || !settings.enabled) return;
    surface();
    pet.webContents.send("pet:notify", text);
  }

  sessions.backend.onIdle = (paneId) => {
    const s = sessions.paneSession(paneId);
    if (s) lastDone = s;
    notify(`Fertig: ${s?.name ?? "Terminal"}`);
  };

  ipcMain.on("pet:hover", (_e, over: boolean) => {
    if (!pet.isDestroyed()) pet.setIgnoreMouseEvents(settings.clickThrough || !over, { forward: true });
  });
  // The prompt box needs the keyboard, so the window is only focusable while it is open.
  ipcMain.on("pet:focusable", (_e, on: boolean) => {
    if (pet.isDestroyed()) return;
    pet.setFocusable(on);
    if (on) pet.focus();
  });
  ipcMain.handle("pet:getSettings", () => settings);
  ipcMain.handle("pet:listDisplays", () => displayList());
  ipcMain.handle("pet:setSettings", (_e, patch: unknown) => update(patch));
  ipcMain.handle("pet:reset", () => update(PET_DEFAULTS));
  ipcMain.handle("pet:test", () => notify("Miau! Hier meldet sich die Katze."));
  ipcMain.handle("pet:sessions", () => {
    const projects = loadState().projects;
    const running = sessions.runningSessions().map((s) => ({ ...s, projectName: projects.find((p) => p.id === s.projectId)?.name ?? "" }));
    const target = running.find((s) => s.id === lastDone?.id)?.id ?? running[0]?.id ?? null;
    return { sessions: running, target };
  });
  ipcMain.handle("pet:send", (_e, { sessionId, text }: { sessionId: string; text: string }) => {
    const clean = String(text ?? "").trim();
    return { ok: !!clean && sessions.deliverToSession(sessionId, clean) };
  });
  ipcMain.on("pet:openSession", (_e, sessionId?: string) => {
    const target = sessions.runningSessions().find((s) => s.id === (sessionId ?? lastDone?.id)) ?? sessions.runningSessions()[0];
    if (win.isDestroyed()) return;
    win.show();
    win.focus();
    if (target) win.webContents.send("pet:open-session", { sessionId: target.id, projectId: target.projectId });
  });

  return {
    toggle: () => void update({ enabled: !settings.enabled }),
    /** Warte-Zähler vom Renderer: nur bei Änderung an die Katze schicken. */
    setWaitingCount(n: number) {
      const count = Math.max(0, Math.floor(n));
      if (count === waitingCount) return;
      waitingCount = count;
      if (pet.isDestroyed() || !settings.enabled) return;
      pet.webContents.send("pet:waiting", count);
    }
  };
}
