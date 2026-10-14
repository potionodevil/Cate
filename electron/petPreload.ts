/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("pet", {
  onNotify: (cb: (text: string) => void) => ipcRenderer.on("pet:notify", (_e, text: string) => cb(text)),
  onSettings: (cb: (s: unknown) => void) => ipcRenderer.on("pet:settings", (_e, s: unknown) => cb(s)),
  getSettings: () => ipcRenderer.invoke("pet:getSettings"),
  /** Window is click-through; only the cat, bubble and prompt catch the mouse. */
  hover: (over: boolean) => ipcRenderer.send("pet:hover", over),
  /** Prompt box open/closed: the window may only take keyboard focus while it is open. */
  focusable: (on: boolean) => ipcRenderer.send("pet:focusable", on),
  sessions: () => ipcRenderer.invoke("pet:sessions"),
  send: (sessionId: string, text: string) => ipcRenderer.invoke("pet:send", { sessionId, text }),
  openSession: (sessionId?: string) => ipcRenderer.send("pet:openSession", sessionId)
});
