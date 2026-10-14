/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useRef } from "react";
import "../assets/catFrames.js"; // sets globalThis.CAT (shared with the desktop pet)

type Cat = { w: number; h: number; frames: Record<string, string[]> };
const PAL: Record<string, string> = {
  o: "#2b2d3a", w: "#f4f1ec", g: "#cdc6bd", e: "#2b2d3a", h: "#ffffff", p: "#f2a7b5",
  n: "#e8758c", c: "#ff7a1a", y: "#ffd24a", t: "#ff6f8a", k: "#ffe08a", z: "#8fb8ff"
};

/** Die Cate-Katze: sitzt, wedelt, blinzelt und putzt sich alle paar Sekunden (stufenweise, Pixel-Stil). Mit `walk` trabt sie auf der Stelle, z. B. als Ladeanzeige. */
export function CatSprite({ scale = 6, walk = false }: { scale?: number; walk?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cat = (globalThis as unknown as { CAT: Cat }).CAT;
    const ctx = ref.current!.getContext("2d")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last = "";
    const draw = (name: string) => {
      if (name === last) return;
      last = name;
      ctx.clearRect(0, 0, cat.w, cat.h);
      cat.frames[name].forEach((row, y) => [...row].forEach((c, x) => PAL[c] && ((ctx.fillStyle = PAL[c]), ctx.fillRect(x, y, 1, 1))));
    };
    const start = performance.now();
    const tick = () => {
      const t = performance.now() - start, cycle = t % 12000;
      draw(
        reduced ? "sit"
          : walk ? (Math.floor(t / 160) % 2 ? "walkB" : "walkA")
          : cycle > 6000 && cycle < 10000 ? (Math.floor(t / 320) % 2 ? "groomB" : "groomA")
          : t % 4200 > 4050 ? "sitBlink"
          : Math.floor(t / 700) % 3 === 0 ? "sitTail" : "sit"
      );
    };
    tick();
    const id = reduced ? 0 : window.setInterval(tick, 80);
    return () => clearInterval(id);
  }, [walk]);
  return <canvas ref={ref} width={32} height={24} aria-hidden style={{ width: 32 * scale, height: 24 * scale, imageRendering: "pixelated" }} />;
}
