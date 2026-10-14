/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const mod = new URL("../dist-electron/petDisplays.js", import.meta.url);
const settingsMod = new URL("../dist-electron/petSettings.js", import.meta.url);
const skip = (!existsSync(mod) || !existsSync(settingsMod)) && "dist-electron not built";
const req = createRequire(import.meta.url);
const path = (u) => u.pathname.replace(/^\/([A-Za-z]:)/, "$1");

const rect = (x, y, width, height) => ({ x, y, width, height });
const D = [
  { id: 7, label: "", bounds: rect(1920, 0, 2560, 1440), workArea: rect(1920, 0, 2560, 1400), scaleFactor: 1.25 },
  { id: 3, label: "DELL U2720Q", bounds: rect(0, 0, 1920, 1080), workArea: rect(0, 0, 1920, 1040), scaleFactor: 1 }
];

test("displays are listed left to right with physical resolution and primary marker", { skip }, () => {
  const { describeDisplays } = req(path(mod));
  const list = describeDisplays(D, 3);
  assert.deepEqual(list.map((d) => d.id), [3, 7]);
  assert.equal(list[0].name, "DELL U2720Q");
  assert.equal(list[0].primary, true);
  assert.equal(list[1].name, "Anzeige 2"); // no label from the OS
  assert.equal(list[1].width, 3200); // 2560 DIP * 1.25
  assert.equal(list[1].height, 1800);
  assert.equal(list[1].primary, false);
});

test("the chosen display wins, a missing one falls back to the primary display", { skip }, () => {
  const { resolveDisplay } = req(path(mod));
  assert.deepEqual(resolveDisplay(D, 7, 3), { display: D[0], fallback: false });
  assert.deepEqual(resolveDisplay(D, null, 3), { display: D[1], fallback: false });
  assert.deepEqual(resolveDisplay(D, undefined, 3), { display: D[1], fallback: false });
  assert.deepEqual(resolveDisplay(D, 99, 3), { display: D[1], fallback: true }); // unplugged
  assert.equal(resolveDisplay(D, 99, 42).display, D[0]); // primary unknown too: first display
  assert.deepEqual(resolveDisplay([], 1, 1), { display: null, fallback: true });
});

test("the cat window is fitted to the chosen display's work area", { skip }, () => {
  const { resolveDisplay } = req(path(mod));
  const { petBounds, PET_DEFAULTS } = req(path(settingsMod));
  const second = resolveDisplay(D, 7, 3).display;
  assert.deepEqual(petBounds({ ...PET_DEFAULTS, area: "screen" }, second.workArea), second.workArea);
  const strip = petBounds({ ...PET_DEFAULTS, area: "floor", companion: "none" }, second.workArea);
  assert.equal(strip.x, 1920);
  assert.equal(strip.y + strip.height, 1400);
});

test("rect helpers", { skip }, () => {
  const { rectsEqual, rectInside } = req(path(mod));
  assert.equal(rectsEqual(rect(1, 2, 3, 4), rect(1, 2, 3, 4)), true);
  assert.equal(rectsEqual(rect(1, 2, 3, 4), rect(1, 2, 3, 5)), false);
  assert.equal(rectInside(rect(10, 10, 50, 50), rect(0, 0, 100, 100)), true);
  assert.equal(rectInside(rect(80, 10, 50, 50), rect(0, 0, 100, 100)), false);
});

test("new pet settings are clamped, displayId accepts null and integers only", { skip }, () => {
  const { sanitizePet, PET_DEFAULTS } = req(path(settingsMod));
  assert.equal(PET_DEFAULTS.displayId, null);
  assert.equal(sanitizePet({ displayId: 12345 }).displayId, 12345);
  assert.equal(sanitizePet({ displayId: null }, { ...PET_DEFAULTS, displayId: 5 }).displayId, null);
  assert.equal(sanitizePet({ displayId: "x" }, { ...PET_DEFAULTS, displayId: 5 }).displayId, 5);
  assert.equal(sanitizePet({ displayId: 1.5 }, { ...PET_DEFAULTS, displayId: 5 }).displayId, 5);
  const s = sanitizePet({ opacity: 1, napChance: 500, groomEvery: 0, alwaysOnTop: "no", clickThrough: true, followCursor: true });
  assert.equal(s.opacity, 25);
  assert.equal(s.napChance, 100);
  assert.equal(s.groomEvery, 5);
  assert.equal(s.alwaysOnTop, true);
  assert.equal(s.clickThrough, true);
  assert.equal(s.followCursor, true);
});
