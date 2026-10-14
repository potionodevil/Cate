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

type SessionRef = { id: string; name: string; projectId: string };

/**
 * The desktop cat: a transparent, click-through, always-on-top window on the
 * display's work area. The cat (assets/pet.html) walks around, reports when a
 * session is done, takes a quick prompt on click and opens the project on
 * double-click. Settings live in the app state (`pet`) and apply instantly.
 */
export function setupPet(win: BrowserWindow, sessions: SessionManager): { toggle(): void } {
  let settings = sanitizePet(loadState().pet);
  let lastDone: SessionRef | null = null;

  const primary = () => screen.getPrimaryDisplay().workArea;
  const pet = new BrowserWindow({
    ...petBounds(settings, primary()),
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
  pet.setAlwaysOnTop(true, "screen-saver");
  pet.setIgnoreMouseEvents(true, { forward: true });
  pet.loadFile(join(__dirname, "../assets/pet.html"));
  pet.once("ready-to-show", () => apply());

  /** Pushes the current settings into the window geometry, the idle detector and the page. */
  function apply(): void {
    if (pet.isDestroyed()) return;
    sessions.backend.idleMs = settings.idleSeconds * 1000;
    if (!settings.enabled) {
      pet.hide();
      return;
    }
    pet.setBounds(petBounds(settings, screen.getDisplayMatching(pet.getBounds()).workArea));
    if (!pet.isVisible()) pet.showInactive();
    pet.webContents.send("pet:settings", settings);
  }

  function update(patch: unknown): PetSettings {
    settings = sanitizePet(patch, settings);
    const state = loadState();
    state.pet = settings;
    saveState(state);
    apply();
    return settings;
  }

  /** Brings the cat in front of every other window, on the display the user is working on. */
  function surface(): void {
    if (settings.followOnNotify) pet.setBounds(petBounds(settings, screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea));
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
    if (!pet.isDestroyed()) pet.setIgnoreMouseEvents(!over, { forward: true });
  });
  // The prompt box needs the keyboard, so the window is only focusable while it is open.
  ipcMain.on("pet:focusable", (_e, on: boolean) => {
    if (pet.isDestroyed()) return;
    pet.setFocusable(on);
    if (on) pet.focus();
  });
  ipcMain.handle("pet:getSettings", () => settings);
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

  return { toggle: () => void update({ enabled: !settings.enabled }) };
}
