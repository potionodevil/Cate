/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useRef } from "react";
import "../assets/catFrames.js"; // sets globalThis.CAT (shared with the desktop pet)
import { buildPalette } from "../assets/palette.mjs";

type Cat = { w: number; h: number; frames: Record<string, string[]> };

/** Die Cate-Katze: sitzt, wedelt, blinzelt und putzt sich alle paar Sekunden (stufenweise, Pixel-Stil). Mit `walk` trabt sie auf der Stelle, z. B. als Ladeanzeige.
 * Die Palette kommt aus PetSettings (fur/outline/eyes); ohne Angabe fällt sie auf den Default aus der Palette-Single-Source zurück.
 * `minimal` zeichnet nur das sit-Frame als Standbild (Farbvorlagen-Kachel) und animiert nicht. */
export function CatSprite({ scale = 6, walk = false, fur, outline, eyes, minimal = false }: {
  scale?: number;
  walk?: boolean;
  fur?: string;
  outline?: string;
  eyes?: string;
  minimal?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cat = (globalThis as unknown as { CAT: Cat }).CAT;
    const ctx = ref.current!.getContext("2d")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Palette je Aufruf aus PetSettings; fehlt eine Farbe, greift der Fallback der Palette-Quelle
    const pal = buildPalette(fur ?? "#f4f1ec", outline ?? "#2b2d3a", eyes ?? "#101218") as Record<string, string>;
    const draw = (name: string) => {
      const key = `${name}|${pal.w}|${pal.o}|${pal.e}`;
      if (key === ctx.canvas.dataset.frameKey) return;
      ctx.canvas.dataset.frameKey = key;
      ctx.clearRect(0, 0, cat.w, cat.h);
      cat.frames[name].forEach((row, y) => [...row].forEach((c, x) => pal[c] && ((ctx.fillStyle = pal[c]), ctx.fillRect(x, y, 1, 1))));
    };
    if (minimal || reduced) {
      draw("sit");
      return undefined;
    }
    let last = "";
    const paint = (name: string) => {
      if (name === last) return;
      last = name;
      draw(name);
    };
    const start = performance.now();
    const tick = () => {
      const t = performance.now() - start, cycle = t % 12000, blink = t % 4200 > 4050, wag = Math.floor(t / 700) % 3 === 0;
      draw(
        walk ? (Math.floor(t / 160) % 2 ? "walkB" : "walkA")
          : cycle > 6000 && cycle < 10000 ? (Math.floor(t / 320) % 2 ? "groomB" : "groomA")
          : blink && wag ? "sitTailBlink"
          : blink ? "sitBlink"
          : wag ? "sitTail" : "sit"
      );
    };
    tick();
    const id = window.setInterval(tick, 80);
    return () => clearInterval(id);
  }, [walk, fur, outline, eyes, minimal]);
  return <canvas ref={ref} width={32} height={24} role="img" aria-label="Cate-Katze" style={{ width: 32 * scale, height: 24 * scale, imageRendering: "pixelated" }} />;
}
