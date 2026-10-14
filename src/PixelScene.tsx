/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useMemo } from "react";

/** Kleiner deterministischer Zufall (mulberry32), damit die Stadt bei jedem Start gleich aussieht und nicht flackernd neu würfelt. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 240, H = 48;

type Block = { x: number; y: number; w: number; h: number; wins: { x: number; y: number; d: number }[] };

/** Baut eine Häuserzeile, die genau W breit ist — so passt sie nahtlos an ihre Kopie, wenn sie endlos vorbeizieht. */
function skyline(seed: number, minH: number, varH: number, windows: boolean): Block[] {
  const r = rng(seed);
  const out: Block[] = [];
  let x = 0;
  while (x < W) {
    const w = Math.min(W - x, 7 + Math.floor(r() * 12));
    const h = minH + Math.floor(r() * varH);
    const wins: Block["wins"] = [];
    if (windows) for (let wy = 3; wy < h - 2; wy += 3) for (let wx = 2; wx < w - 1; wx += 3) if (r() > 0.55) wins.push({ x: wx, y: wy, d: r() * 9 });
    out.push({ x, y: H - h, w, h, wins });
    x += w + (windows ? Math.floor(r() * 2) : 0);
  }
  return out;
}

/** Eine Ebene der Stadt als SVG-Kachel; zweimal nebeneinander gesetzt und verschoben ergibt sie das endlose Vorbeiziehen. */
function Layer({ blocks, fill, roof, lit }: { blocks: Block[]; fill: string; roof?: string; lit?: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" shapeRendering="crispEdges" className="hh-city-tile">
      {blocks.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={fill} />
          {roof && <rect x={b.x} y={b.y} width={b.w} height={1} fill={roof} />}
          {lit && b.wins.map((w, j) => (
            <rect key={j} className="hh-px-win" x={b.x + w.x} y={b.y + w.y} width={1} height={2} fill="var(--accent)" style={{ animationDelay: `${w.d}s` }} />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** Die vorbeiziehende Pixel-Stadt allein (zwei Ebenen, Parallax) — im Fensterhintergrund und sichtbar auf der Startseite. */
export function PixelCity({ className = "" }: { className?: string }) {
  const { far, near } = useMemo(() => ({ far: skyline(21, 14, 14, false), near: skyline(14, 6, 16, true) }), []);
  return (
    <div className={`hh-city ${className}`} aria-hidden>
      <div className="hh-city-strip hh-city-far">
        <Layer blocks={far} fill="color-mix(in srgb, var(--bg-elevated-2) 55%, var(--sky-b))" />
        <Layer blocks={far} fill="color-mix(in srgb, var(--bg-elevated-2) 55%, var(--sky-b))" />
      </div>
      <div className="hh-city-strip hh-city-near">
        <Layer blocks={near} fill="var(--bg-primary)" roof="var(--border-strong)" lit />
        <Layer blocks={near} fill="var(--bg-primary)" roof="var(--border-strong)" lit />
      </div>
    </div>
  );
}

/** Hintergrund des ganzen Fensters: weiche Aurora-Farbwolken, ein Pixel-Raster darüber, funkelnde Sterne und eine Pixel-Stadt, deren zwei Ebenen unterschiedlich schnell vorbeiziehen (Parallax). Die Farben kommen aus dem aktiven Theme; bei ausgeschalteten Animationen steht alles still. Rein dekorativ, daher für Screenreader versteckt. */
export function PixelBackdrop() {
  const { stars } = useMemo(() => {
    const r = rng(7);
    return {
      stars: Array.from({ length: 60 }, () => ({ x: r() * 100, y: r() * 55, d: r() * 3.2, big: r() > 0.85 }))
    };
  }, []);

  return (
    <div className="hh-backdrop" aria-hidden>
      <div className="hh-aurora"><i /><i /><i /></div>
      <div className="hh-stars">
        {stars.map((s, i) => (
          <span key={i} className="hh-px-star" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.big ? 3 : 2, height: s.big ? 3 : 2, animationDelay: `${s.d}s` }} />
        ))}
      </div>
      <PixelCity />
    </div>
  );
}
