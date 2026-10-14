/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/** Settings of the desktop cat. Pure helpers, no electron imports, so they can be unit-tested. */
export interface PetSettings {
  enabled: boolean;
  /** Colors as #rrggbb. Stripes and the light muzzle are derived from `fur` in the pet window. */
  fur: string;
  outline: string;
  eyes: string;
  /** Screen pixels per sprite pixel (the sprite is 24x16). */
  scale: number;
  /** Walking speed in px/s. */
  speed: number;
  /** floor = walks along the bottom edge, screen = wanders anywhere (also the middle), sit = stays put. */
  area: "floor" | "screen" | "sit";
  /** Resting place for area "sit" and start position otherwise. */
  anchor: "left" | "center" | "right";
  /** The one animal that visits the cat (only one at a time). */
  companion: "none" | "bunny" | "mouse" | "bird" | "butterfly";
  /** Wo das Tier unterwegs sein darf: unten am Rand, oben am Rand oder auf dem ganzen Bildschirm. */
  companionArea: "floor" | "top" | "screen";
  /** Jump to the monitor I'm working on when a session reports "fertig". */
  followOnNotify: boolean;
  /** A pane counts as done after this many seconds without output. */
  idleSeconds: number;
  /** How long the speech bubble stays. */
  bubbleSeconds: number;
}

export const PET_DEFAULTS: PetSettings = {
  enabled: true,
  fur: "#f4f1ec",
  outline: "#262a36",
  eyes: "#101218",
  scale: 4,
  speed: 52,
  area: "screen",
  anchor: "center",
  companion: "bunny",
  companionArea: "floor",
  followOnNotify: true,
  idleSeconds: 8,
  bubbleSeconds: 10
};

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);

/** Merges a (possibly partial or malformed) patch over `base`, clamping everything to sane ranges. */
export function sanitizePet(patch: unknown, base: PetSettings = PET_DEFAULTS): PetSettings {
  const p = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  const col = (k: "fur" | "outline" | "eyes") => (typeof p[k] === "string" && HEX.test(p[k] as string) ? (p[k] as string).toLowerCase() : base[k]);
  return {
    enabled: typeof p.enabled === "boolean" ? p.enabled : base.enabled,
    fur: col("fur"),
    outline: col("outline"),
    eyes: col("eyes"),
    scale: num(p.scale, 3, 8, base.scale),
    speed: num(p.speed, 15, 160, base.speed),
    area: pick(p.area, ["floor", "screen", "sit"], base.area),
    anchor: pick(p.anchor, ["left", "center", "right"], base.anchor),
    companion: pick(p.companion, ["none", "bunny", "mouse", "bird", "butterfly"], base.companion),
    companionArea: pick(p.companionArea, ["floor", "top", "screen"], base.companionArea),
    followOnNotify: typeof p.followOnNotify === "boolean" ? p.followOnNotify : base.followOnNotify,
    idleSeconds: num(p.idleSeconds, 3, 60, base.idleSeconds),
    bubbleSeconds: num(p.bubbleSeconds, 3, 30, base.bubbleSeconds)
  };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Window rectangle for the cat on a display's work area: the whole screen when it may wander,
 * otherwise a strip along the bottom tall enough for the sprite plus bubble/prompt. */
export function petBounds(s: PetSettings, wa: Rect): Rect {
  if (s.area === "screen" || (s.companion !== "none" && s.companionArea !== "floor")) return { ...wa };
  const height = Math.min(wa.height, 24 * s.scale + 220);
  return { x: wa.x, y: wa.y + wa.height - height, width: wa.width, height };
}
