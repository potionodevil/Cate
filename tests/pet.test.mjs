/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { SPRITE } from "../src/logoSprite.mjs";

const built = new URL("../dist-electron/petSettings.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

test("logo sprite is a 16x16 grid", () => {
  assert.equal(SPRITE.length, 16);
  for (const row of SPRITE) {
    assert.equal(row.length, 16);
  }
});

test("pet settings are clamped and malformed input falls back to the base", { skip }, () => {
  const { sanitizePet, PET_DEFAULTS } = load();
  const s = sanitizePet({ scale: 99, speed: -5, fur: "red", eyes: "#ABCDEF", area: "nope", idleSeconds: 2.6, enabled: "yes" });
  assert.equal(s.scale, 8);
  assert.equal(s.speed, 15);
  assert.equal(s.fur, PET_DEFAULTS.fur); // not a #rrggbb color
  assert.equal(s.eyes, "#abcdef");
  assert.equal(s.area, PET_DEFAULTS.area);
  assert.equal(s.idleSeconds, 3);
  assert.equal(s.enabled, PET_DEFAULTS.enabled);
  assert.deepEqual(sanitizePet(undefined), PET_DEFAULTS);
  assert.equal(sanitizePet({ scale: 6 }, { ...PET_DEFAULTS, speed: 100 }).speed, 100); // patches merge over the base
});

test("pet settings keep cat and bunny exclusive (one pet at a time)", { skip }, () => {
  const { sanitizePet, PET_DEFAULTS } = load();
  assert.equal(PET_DEFAULTS.petType, "cat"); // Default: Katze mit optionalem Begleiter
  assert.equal(PET_DEFAULTS.companion, "none");
  assert.equal(sanitizePet({ petType: "bunny" }).companion, "none"); // Hase kommt ohne Begleiter
  assert.equal(sanitizePet({ petType: "bunny", companion: "bird" }).companion, "none"); // nie Hase + Begleiter
  assert.equal(sanitizePet({ petType: "cat", companion: "bird" }).companion, "bird"); // Katze darf Besuch haben
  assert.equal(sanitizePet({ petType: "nonsense", companion: "bird" }).companion, "bird"); // unbekanntes Tier -> cat-Regel
  // Alte Saves mit companion "bunny" migrieren automatisch: ungültiger Wert -> Default "none"
  assert.equal(sanitizePet({ companion: "bunny" }).companion, "none");
  assert.equal(sanitizePet({ petType: "bunny", companion: "bunny" }).companion, "none");
});

test("the cat window covers the screen when it may wander, else a bottom strip", { skip }, () => {
  const { petBounds, PET_DEFAULTS } = load();
  const wa = { x: 10, y: 20, width: 1920, height: 1040 };
  assert.deepEqual(petBounds({ ...PET_DEFAULTS, area: "screen" }, wa), wa);
  const strip = petBounds({ ...PET_DEFAULTS, area: "floor", scale: 5 }, wa);
  assert.equal(strip.height, 24 * 5 + 220);
  assert.equal(strip.y + strip.height, wa.y + wa.height);
  assert.equal(petBounds({ ...PET_DEFAULTS, area: "sit" }, { ...wa, height: 100 }).height, 100); // never taller than the display
});
