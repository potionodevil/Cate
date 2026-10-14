/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/500.css";
import "@fontsource/pixelify-sans/600.css";
import "@fontsource/vt323/400.css";
import "@fontsource-variable/geist-mono";
import "@fontsource/silkscreen/400.css";
import "@fontsource/silkscreen/700.css";
import "./theme.css";
import { App } from "./App";

/** Known xterm.js (@xterm/xterm 5.5.0) internal race: Viewport installs its
 * own ResizeObserver on the terminal's viewport element; when a pane is
 * removed/disposed right as a resize is in flight (e.g. closing a pane or
 * React StrictMode's deliberate double-invoke of our effect), the queued
 * ResizeObserver callback can still fire AFTER Terminal.dispose() has torn
 * down `_renderService`, throwing "Cannot read properties of undefined
 * (reading 'dimensions')" from Viewport.syncScrollArea. This is internal to
 * the library (not something TerminalPane.tsx's own ResizeObserver/fit()
 * calls trigger — those are already guarded) and does not affect any live
 * terminal: the pane being disposed is already gone. Swallow only this exact
 * signature so a genuinely broken terminal pane still surfaces loudly.
 * Remove this once @xterm/xterm ships a fix (tracked upstream; re-check on
 * the next @xterm/xterm bump by removing this and re-running the rapid
 * add/close-pane stress scenario). */
window.addEventListener("error", (event) => {
  const fromXterm = event.filename?.includes("@xterm_xterm") || event.filename?.includes("@xterm/xterm");
  const isDimensionsRace = event.message?.includes("reading 'dimensions'") || event.error?.message?.includes("reading 'dimensions'");
  if (fromXterm && isDimensionsRace) {
    console.debug("[hh] suppressed known xterm.js dispose/ResizeObserver race (harmless):", event.error);
    event.preventDefault();
  }
});

// Eine Datei, die neben einem Terminal losgelassen wird, darf das Fenster nicht auf diese Datei umleiten (Electron-Standard) — dann wäre die ganze Oberfläche weg.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
