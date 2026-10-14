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
  /** The one animal shown on the desktop: cat with an optional companion — or bunny alone (never both). */
  petType: "cat" | "bunny";
  /** The one animal that visits the cat (only one at a time). bunny is a main pet option, not a companion. */
  companion: "none" | "mouse" | "bird" | "butterfly";
  /** Wo das Tier unterwegs sein darf: unten am Rand, oben am Rand oder auf dem ganzen Bildschirm. */
  companionArea: "floor" | "top" | "screen";
  /** Jump to the monitor I'm working on when a session reports "fertig". */
  followOnNotify: boolean;
  /** A pane counts as done after this many seconds without output. */
  idleSeconds: number;
  /** How long the speech bubble stays. */
  bubbleSeconds: number;
  /** Display (Electron display id) the cat lives on; null = main display (jumps along on a notification when `followOnNotify`). */
  displayId: number | null;
  /** Opacity of the cat and its visitor in percent. */
  opacity: number;
  /** Keep the cat in front of other windows. */
  alwaysOnTop: boolean;
  /** The cat ignores the mouse completely (nothing to click). */
  clickThrough: boolean;
  /** The cat trots after the mouse pointer while it is on the cat's display. */
  followCursor: boolean;
  /** Average pause in seconds between two grooming sessions. */
  groomEvery: number;
  /** Chance in percent that an idle phase becomes a nap in the basket. */
  napChance: number;
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
  petType: "cat",
  companion: "none",
  companionArea: "floor",
  followOnNotify: true,
  idleSeconds: 8,
  bubbleSeconds: 10,
  displayId: null,
  opacity: 100,
  alwaysOnTop: true,
  clickThrough: false,
  followCursor: false,
  groomEvery: 15,
  napChance: 40
};

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);

/** Merges a (possibly partial or malformed) patch over `base`, clamping everything to sane ranges. */
export function sanitizePet(patch: unknown, base: PetSettings = PET_DEFAULTS): PetSettings {
  const p = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  const col = (k: "fur" | "outline" | "eyes") => (typeof p[k] === "string" && HEX.test(p[k] as string) ? (p[k] as string).toLowerCase() : base[k]);
  const s: PetSettings = {
    enabled: typeof p.enabled === "boolean" ? p.enabled : base.enabled,
    fur: col("fur"),
    outline: col("outline"),
    eyes: col("eyes"),
    scale: num(p.scale, 3, 8, base.scale),
    speed: num(p.speed, 15, 160, base.speed),
    area: pick(p.area, ["floor", "screen", "sit"], base.area),
    anchor: pick(p.anchor, ["left", "center", "right"], base.anchor),
    petType: pick(p.petType, ["cat", "bunny"], base.petType),
    companion: pick(p.companion, ["none", "mouse", "bird", "butterfly"], base.companion),
    companionArea: pick(p.companionArea, ["floor", "top", "screen"], base.companionArea),
    followOnNotify: typeof p.followOnNotify === "boolean" ? p.followOnNotify : base.followOnNotify,
    idleSeconds: num(p.idleSeconds, 3, 60, base.idleSeconds),
    bubbleSeconds: num(p.bubbleSeconds, 3, 30, base.bubbleSeconds),
    displayId: p.displayId === null ? null : typeof p.displayId === "number" && Number.isInteger(p.displayId) ? p.displayId : base.displayId,
    opacity: num(p.opacity, 25, 100, base.opacity),
    alwaysOnTop: bool(p.alwaysOnTop, base.alwaysOnTop),
    clickThrough: bool(p.clickThrough, base.clickThrough),
    followCursor: bool(p.followCursor, base.followCursor),
    groomEvery: num(p.groomEvery, 5, 120, base.groomEvery),
    napChance: num(p.napChance, 0, 100, base.napChance)
  };
  // Nur ein Tier: als Haupttier Hase gewählt, gibt es keinen Begleiter-Besuch.
  // Alte Saves mit companion "bunny" migrieren sich damit automatisch (wird "none").
  if (s.petType !== "cat") s.companion = "none";
  return s;
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
