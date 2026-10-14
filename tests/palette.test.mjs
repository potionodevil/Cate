/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const paletteUrl = new URL("../assets/palette.mjs", import.meta.url);
const palettePath = fileURLToPath(paletteUrl);
const skip = !existsSync(palettePath) && "palette.mjs not built";

test("palette.mjs: single source builds cat palette from settings", { skip }, async () => {
  const { buildPalette, MIX_HEX, ACCENT, MOCKUP_PRESET } = await import(paletteUrl);
  const pal = buildPalette("#f4f1ec", "#262a36", "#101218");
  assert.equal(pal.o, "#262a36");
  assert.equal(pal.w, "#f4f1ec");
  assert.equal(pal.e, "#101218");
  assert.deepEqual(MIX_HEX("#f4f1ec", "#000000", 0.16), pal.g); // g ist der abgeleitete Fell-Schatten
  assert.equal(pal.p, "#e58aa0"); // Mockup-Rosa
  assert.equal(pal.c, ACCENT);
  assert.equal(pal.k, ACCENT);
  assert.equal(ACCENT, "#e08a4c");
  assert.equal(MOCKUP_PRESET.fur, "#f1ede6");
  assert.equal(MOCKUP_PRESET.outline, "#3a3a48");
  assert.equal(MOCKUP_PRESET.eyes, "#1a1a22");
});

test("palette.mjs: companion palette shares outline + accent, keeps own threads", { skip }, async () => {
  const { buildPalette, buildCompanionPalette } = await import(paletteUrl);
  const cat = buildPalette("#f4f1ec", "#262a36", "#101218");
  const comp = buildCompanionPalette("#f4f1ec", "#262a36", "#101218");
  assert.equal(comp.o, cat.o); // Outline vom Tier, Ein-Tier-Familie
  assert.equal(comp.c, cat.c); // nur EIN Orange im UI (kein Doppel-Orange mehr)
  assert.equal(comp.c2, cat.c);
  assert.equal(comp.u, "#8a5a2b"); // Korb-Braun bleibt eigen
  assert.equal(comp.r, "#c68a4a");
});

test("palette.mjs: mix tolerates malformed input without throwing", { skip }, async () => {
  const { MIX_HEX } = await import(paletteUrl);
  assert.match(MIX_HEX("red", "#000000", 0.5), /^#[0-9a-f]{6}$/); // ungültige Eingabe -> kein Crash, gültiger Hex-Wert
  assert.equal(MIX_HEX("#ff0000", "#000000", 1), "#000000");
});
