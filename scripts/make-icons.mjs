/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
// Generates the app/tray icons from the shared pixel sprite (src/logoSprite.mjs).
//   node scripts/make-icons.mjs
// Writes assets/logo.svg, assets/icon.svg, assets/icon.png (512), assets/icon.ico, assets/tray.png.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { SPRITE, ICON_COLORS as C } from "../src/logoSprite.mjs";

const OUT = new URL("../assets/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const TILE = 20; // grid units; the 16x16 sprite sits at offset 2, one unit lower than centered for optical balance

/** Cells of the app-icon tile as [x, y, hex]: dark tile, 1-unit border, cut corners, sprite on top. */
function tileCells() {
  const cells = [];
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const edgeX = x === 0 || x === TILE - 1, edgeY = y === 0 || y === TILE - 1;
      if (edgeX && edgeY) continue; // pixel-cut corner
      cells.push([x, y, edgeX || edgeY ? C.tileBorder : C.tile]);
    }
  return cells.concat(markCells(2, 2));
}

/** Sprite cells (transparent where '.'), shifted by (ox, oy). */
function markCells(ox = 0, oy = 0) {
  const cells = [];
  SPRITE.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && cells.push([x + ox, y + oy, C[ch]])));
  return cells;
}

function svg(cells, size) {
  // merge horizontal runs of one color per row to keep the file small
  const rects = [];
  const byRow = new Map();
  for (const [x, y, c] of cells) (byRow.get(y) ?? byRow.set(y, []).get(y)).push([x, c]);
  for (const [y, row] of byRow) {
    row.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < row.length; ) {
      let j = i;
      while (j + 1 < row.length && row[j + 1][0] === row[j][0] + 1 && row[j + 1][1] === row[i][1]) j++;
      rects.push(`<rect x="${row[i][0]}" y="${y}" width="${j - i + 1}" height="1" fill="${row[i][1]}"/>`);
      i = j + 1;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">\n${rects.join("\n")}\n</svg>\n`;
}

// --- minimal PNG / ICO encoders (no dependencies) ---
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
function png(px, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "binary"), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Rasterizes cells at an integer scale, centered on a size x size transparent canvas. */
function raster(cells, grid, size) {
  const scale = Math.max(1, Math.floor(size / grid));
  const off = Math.floor((size - grid * scale) / 2);
  const px = Buffer.alloc(size * size * 4);
  for (const [cx, cy, hex] of cells) {
    const [r, g, b] = rgb(hex);
    for (let dy = 0; dy < scale; dy++)
      for (let dx = 0; dx < scale; dx++) {
        const i = ((off + cy * scale + dy) * size + off + cx * scale + dx) * 4;
        px.set([r, g, b, 255], i);
      }
  }
  return png(px, size);
}

/** Small sizes use the bare mark (16-grid); larger ones the dark tile. */
const frame = (size) => (size < 32 ? raster(markCells(), 16, size) : raster(tileCells(), TILE, size));

const sizes = [16, 24, 32, 48, 64, 128, 256];
const frames = sizes.map(frame);
const dir = Buffer.alloc(6 + 16 * sizes.length);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(sizes.length, 4);
let offset = dir.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  dir[e] = s === 256 ? 0 : s;
  dir[e + 1] = s === 256 ? 0 : s;
  dir.writeUInt16LE(1, e + 4);
  dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(frames[i].length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += frames[i].length;
});

const w = (name, data) => writeFileSync(new URL(name, OUT), data);
w("logo.svg", svg(markCells(), 16));
w("icon.svg", svg(tileCells(), TILE));
w("icon.png", frame(512));
w("icon.ico", Buffer.concat([dir, ...frames]));
w("tray.png", raster(markCells(), 16, 32));
console.log("icons written to assets/");
