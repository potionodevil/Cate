/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { PetDisplayInfo, PetDisplayList, PetSettings } from "./types";
import "../assets/catFrames.js"; // sets globalThis.CAT (shared with the desktop pet)
import { buildCompanionPalette, MOCKUP_PRESET, MIX_HEX } from "../assets/palette.mjs";
import { CatSprite } from "./CatSprite";
import { IconMonitor, IconRefresh } from "./icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const preset: { name: string; fur: string; outline: string; eyes: string } = {
  name: MOCKUP_PRESET.name, fur: MOCKUP_PRESET.fur, outline: MOCKUP_PRESET.outline, eyes: MOCKUP_PRESET.eyes
};

const COLOR_PRESETS: { name: string; fur: string; outline: string; eyes: string }[] = [
  preset,
  { name: "Grau", fur: "#8d96aa", outline: "#262a36", eyes: "#101218" },
  { name: "Schwarz", fur: "#3a3d46", outline: "#0b0c10", eyes: "#ffd36b" },
  { name: "Weiß", fur: "#e8ebf2", outline: "#4a5060", eyes: "#2a5db0" },
  { name: "Orange", fur: "#e0913c", outline: "#7a3d0c", eyes: "#101218" },
  { name: "Creme", fur: "#d8c3a0", outline: "#4b3a28", eyes: "#2b6f9c" }
];

const AREAS: { value: PetSettings["area"]; label: string }[] = [
  { value: "screen", label: "Ganzer Bildschirm" },
  { value: "floor", label: "Unterer Rand" },
  { value: "sit", label: "Sitzt still" }
];
const ANCHORS: { value: PetSettings["anchor"]; label: string }[] = [
  { value: "left", label: "Links" },
  { value: "center", label: "Mitte" },
  { value: "right", label: "Rechts" }
];
const COMPANIONS: { value: PetSettings["companion"]; label: string }[] = [
  { value: "mouse", label: "Maus" },
  { value: "bird", label: "Vogel" },
  { value: "butterfly", label: "Schmetterling" },
  { value: "none", label: "Keins" }
];
const COMPANION_AREAS: { value: PetSettings["companionArea"]; label: string }[] = [
  { value: "floor", label: "Unterer Rand" },
  { value: "top", label: "Oberer Rand" },
  { value: "screen", label: "Ganzer Bildschirm" }
];

const muted = "text-[var(--text-secondary)]";
const faint = "text-[var(--text-tertiary,var(--text-secondary))]";

/** Einstellungen der Desktop-Katze: Tabs + Live-Vorschau, jede Änderung wird sofort gespeichert und an die laufende Katze gesendet. */
export function PetSettingsTab() {
  const [s, setS] = useState<PetSettings | null>(null);
  const [displays, setDisplays] = useState<PetDisplayList | null>(null);
  const pending = useRef<Partial<PetSettings>>({});
  const timer = useRef<number | undefined>(undefined);
  const bunny = s?.petType === "bunny";

  const refreshDisplays = useCallback(() => void window.harness.listPetDisplays().then(setDisplays), []);

  function flush() {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length) void window.harness.setPetSettings(patch).then(() => refreshDisplays());
  }

  useEffect(() => {
    void window.harness.getPetSettings().then(setS);
    refreshDisplays();
    const off = window.harness.onPetDisplaysChanged(setDisplays);
    return () => {
      off();
      flush(); // letzte Slider-Bewegung nicht verlieren
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshDisplays]);

  /** Sofort lokal anzeigen, gebündelt (alle 100 ms) speichern und an die Katze schicken: Slider bleiben flüssig. */
  function change(patch: Partial<PetSettings>) {
    setS((cur) => (cur ? { ...cur, ...patch } : cur));
    pending.current = { ...pending.current, ...patch };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 100);
  }

  async function reset() {
    window.clearTimeout(timer.current);
    pending.current = {};
    setS(await window.harness.resetPetSettings());
    refreshDisplays();
  }

  if (!s) return <p className={`m-0 text-sm ${muted}`}>Lade…</p>;
  const dis = !s.enabled;

  /** Wörter je nach gewähltem Tier: "die Katze ..." vs. "der Hase ...". */
  const tier = bunny ? "Hase" : "Katze";
  const tArt = bunny ? "der Hase" : "die Katze";
  const tNom = bunny ? "Er" : "Sie";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PetPreview s={s} />

      <Tabs defaultValue="general" className="flex min-w-0 flex-col gap-3">
        <TabsList className="grid h-auto w-full grid-cols-4">
          <TabsTrigger value="general">Allgemein</TabsTrigger>
          <TabsTrigger value="behavior">Verhalten</TabsTrigger>
          <TabsTrigger value="look">Darstellung</TabsTrigger>
          <TabsTrigger value="display">Anzeige</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="m-0 flex flex-col gap-3">
          <Group title="Tier" hint="Es ist immer nur ein Tier aktiv: Katze oder Hase. Klick öffnet ein Textfeld für einen neuen Prompt, Doppelklick öffnet das Projekt.">
            <Field label="Angezeigtes Tier" hint={bunny ? "Der Hase hat keinen Begleiter-Besuch — dafür hüpft er." : "Katze mit oder ohne Besuch von Maus, Vogel oder Schmetterling."}>
              <Segmented
                value={bunny ? "bunny" : "cat"}
                options={[{ value: "cat", label: "Katze" }, { value: "bunny", label: "Hase" }]}
                disabled={dis}
                onChange={(petType) => change({ petType, companion: "none" })}
              />
            </Field>
            <ToggleRow id="pet-enabled" label="Tier anzeigen" hint={`Blendet ${tArt} auf dem Desktop ein oder aus.`} checked={s.enabled} onChange={(enabled) => change({ enabled })} />
            <ToggleRow id="pet-top" label="Immer im Vordergrund" hint={`${tNom} bleibt vor anderen Fenstern.`} checked={s.alwaysOnTop} disabled={dis} onChange={(alwaysOnTop) => change({ alwaysOnTop })} />
            <ToggleRow id="pet-through" label="Klicks durchlassen" hint={`${tNom} reagiert nicht auf die Maus, alles darunter bleibt klickbar. Prompt-Feld und Doppelklick sind dann nicht erreichbar.`} checked={s.clickThrough} disabled={dis} onChange={(clickThrough) => change({ clickThrough })} />
          </Group>

          <Group title="Meldungen" hint={`${tNom} meldet sich, wenn eine Session fertig ist.`}>
            <ToggleRow
              id="pet-follow"
              label="Bei Meldung zum aktiven Monitor springen"
              hint={s.displayId === null ? "Gilt bei Anzeige „Automatisch“: die Katze wechselt zum Monitor, an dem der Mauszeiger ist." : "Nur bei Anzeige „Automatisch“ verfügbar. Die Katze bleibt auf dem gewählten Monitor."}
              checked={s.followOnNotify}
              disabled={dis || s.displayId !== null}
              onChange={(followOnNotify) => change({ followOnNotify })}
            />
            <SliderRow label="Fertig nach" unit="s Stille" hint="So lange darf ein Terminal ruhig sein, bis es als fertig gilt." min={3} max={60} value={s.idleSeconds} disabled={dis} onChange={(idleSeconds) => change({ idleSeconds })} />
            <SliderRow label="Sprechblase bleibt" unit="s" min={3} max={30} value={s.bubbleSeconds} disabled={dis} onChange={(bubbleSeconds) => change({ bubbleSeconds })} />
            <div>
              <Button size="sm" variant="secondary" disabled={dis} onClick={() => void window.harness.testPet()}>
                Test-Meldung senden
              </Button>
            </div>
          </Group>
        </TabsContent>

        <TabsContent value="behavior" className="m-0 flex flex-col gap-3">
          <Group title="Bewegung" hint={`Wo und wie schnell ${tArt} unterwegs ist.`}>
            <Field label="Bewegungsbereich" hint="„Unterer Rand“ hält sie an der Taskleiste, „Ganzer Bildschirm“ lässt sie überall laufen.">
              <Segmented value={s.area} options={AREAS} disabled={dis} onChange={(area) => change({ area })} />
            </Field>
            <Field label="Ruheplatz" hint="Startposition und Platz, an dem sie sitzt, wenn sie still sitzen soll.">
              <Segmented value={s.anchor} options={ANCHORS} disabled={dis} onChange={(anchor) => change({ anchor })} />
            </Field>
            <SliderRow label="Lauftempo" unit="px/s" min={15} max={160} step={5} value={s.speed} disabled={dis || s.area === "sit"} onChange={(speed) => change({ speed })} />
            <ToggleRow id="pet-cursor" label="Dem Mauszeiger folgen" hint="Solange der Zeiger auf dem Monitor der Katze ist, läuft sie zu ihm." checked={s.followCursor} disabled={dis || s.area === "sit"} onChange={(followCursor) => change({ followCursor })} />
          </Group>

          <Group title="Ruhe und Schlaf" hint="Wie oft sie sich putzt und in den Korb legt.">
            <SliderRow label="Putzen alle" unit="s" hint="Durchschnittlicher Abstand zwischen zwei Ruhephasen." min={5} max={120} step={5} value={s.groomEvery} disabled={dis} onChange={(groomEvery) => change({ groomEvery })} />
            <SliderRow label="Schlafwahrscheinlichkeit" unit="%" hint="Chance, dass eine Ruhephase im Korb endet (nur wenn keine Session läuft). 0 = nie." min={0} max={100} step={5} value={s.napChance} disabled={dis} onChange={(napChance) => change({ napChance })} />
          </Group>

          <Group title="Besuch" hint={bunny ? "Der Hase kommt allein — kein Begleiter-Besuch." : "Ein Tier schaut gelegentlich vorbei; es folgt dem Mauszeiger und lässt sich streicheln."}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Begleiter">
                <PlainSelect value={s.companion} options={COMPANIONS} disabled={dis || bunny} onChange={(companion) => change({ companion })} />
              </Field>
              <Field label="Bewegungsbereich des Begleiters">
                <PlainSelect value={s.companionArea} options={COMPANION_AREAS} disabled={dis || bunny || s.companion === "none"} onChange={(companionArea) => change({ companionArea })} />
              </Field>
            </div>
          </Group>
        </TabsContent>

        <TabsContent value="look" className="m-0 flex flex-col gap-3">
          <Group title="Fellfarbe" hint="Vorlage wählen oder die Farben einzeln anpassen.">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Farbvorlagen">
              {COLOR_PRESETS.map((p) => {
                const active = p.fur === s.fur && p.outline === s.outline && p.eyes === s.eyes;
                return (
                  <Button key={p.name} type="button" size="sm" variant={active ? "secondary" : "outline"} disabled={dis} aria-pressed={active} className={active ? "border-[var(--accent)]" : ""} onClick={() => change({ fur: p.fur, outline: p.outline, eyes: p.eyes })}>
                    <span className="rounded-sm overflow-hidden shrink-0" aria-hidden style={{ width: 30, height: 22 }}>
                      <CatSprite scale={0.95} fur={p.fur} outline={p.outline} eyes={p.eyes} minimal />
                    </span>
                    {p.name}
                  </Button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-4">
              {([["fur", "Fell"], ["outline", "Umriss"], ["eyes", "Augen"]] as const).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <Input id={`pet-color-${key}`} type="color" disabled={dis} className="h-8 w-10 cursor-pointer p-0.5" value={s[key]} onChange={(e) => change({ [key]: e.target.value })} />
                  <Label htmlFor={`pet-color-${key}`} className="text-sm">{label}</Label>
                </div>
              ))}
            </div>
          </Group>

          <Group title="Größe und Sichtbarkeit">
            <SliderRow label="Größe" unit="×" hint="Bildschirm-Pixel pro Sprite-Pixel." min={3} max={8} value={s.scale} disabled={dis} onChange={(scale) => change({ scale })} />
            <SliderRow label="Deckkraft" unit="%" hint="Macht Katze und Besuch durchscheinend; Sprechblasen bleiben lesbar." min={25} max={100} step={5} value={s.opacity} disabled={dis} onChange={(opacity) => change({ opacity })} />
          </Group>
        </TabsContent>

        <TabsContent value="display" className="m-0 flex flex-col gap-3">
          <DisplayPicker s={s} list={displays} disabled={dis} onPick={(displayId) => change({ displayId })} onRefresh={refreshDisplays} />
        </TabsContent>
      </Tabs>

      <Separator />
      <div className="flex items-center justify-between gap-3">
        <p className={`m-0 text-xs ${faint}`}>Änderungen werden sofort gespeichert und angewendet.</p>
        <Button size="sm" variant="ghost" onClick={() => void reset()}>
          <IconRefresh size={14} />
          Auf Standard zurücksetzen
        </Button>
      </div>
    </div>
  );
}

/* ---------- Anzeige ---------- */

function DisplayPicker({ s, list, disabled, onPick, onRefresh }: {
  s: PetSettings;
  list: PetDisplayList | null;
  disabled: boolean;
  onPick: (id: number | null) => void;
  onRefresh: () => void;
}) {
  if (!list) return <p className={`m-0 text-sm ${muted}`}>Lade Monitore…</p>;
  const known = list.displays.some((d) => d.id === s.displayId);
  const value = s.displayId === null ? "auto" : String(s.displayId);
  const active = list.displays.find((d) => d.id === list.activeId);
  return (
    <Group title="Monitor" hint="Auf welchem Monitor die Katze lebt. Die Auswahl bleibt gespeichert; fehlt der Monitor, sitzt die Katze auf dem Hauptmonitor.">
      <DisplayMap list={list} selected={s.displayId} activeId={list.activeId} disabled={disabled} onPick={onPick} />
      <div className="flex items-end gap-2">
        <Field label="Katze lebt auf" className="min-w-0 flex-1">
          <Select value={value} disabled={disabled} onValueChange={(v) => onPick(v === "auto" ? null : Number(v))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatisch (Hauptmonitor)</SelectItem>
              {list.displays.map((d) => <SelectItem key={d.id} value={String(d.id)}>{displayLabel(d)}</SelectItem>)}
              {s.displayId !== null && !known && <SelectItem value={String(s.displayId)} disabled>Nicht verbunden</SelectItem>}
            </SelectContent>
          </Select>
        </Field>
        <Button size="icon" variant="outline" aria-label="Monitore neu einlesen" title="Monitore neu einlesen" onClick={onRefresh}>
          <IconRefresh size={14} />
        </Button>
      </div>
      {list.fallback && (
        <p className="m-0 text-sm text-[var(--warning)]" role="status">
          Der gewählte Monitor ist nicht verbunden. Die Katze sitzt vorübergehend auf {active ? displayLabel(active) : "dem Hauptmonitor"} und kehrt zurück, sobald er wieder da ist.
        </p>
      )}
      {active && !list.fallback && (
        <p className={`m-0 text-xs ${faint}`}>
          Aktiv: {displayLabel(active)}, Arbeitsbereich {active.workArea.width}×{active.workArea.height} (ohne Taskleiste).
        </p>
      )}
    </Group>
  );
}

/** Schematische Anordnung aller Monitore, wie in den Windows-Anzeigeeinstellungen. */
function DisplayMap({ list, selected, activeId, disabled, onPick }: {
  list: PetDisplayList;
  selected: number | null;
  activeId: number;
  disabled: boolean;
  onPick: (id: number | null) => void;
}) {
  const ds = list.displays;
  const minX = Math.min(...ds.map((d) => d.bounds.x)), minY = Math.min(...ds.map((d) => d.bounds.y));
  const maxX = Math.max(...ds.map((d) => d.bounds.x + d.bounds.width)), maxY = Math.max(...ds.map((d) => d.bounds.y + d.bounds.height));
  const w = maxX - minX, h = maxY - minY;
  return (
    <div className="rounded-[var(--radius-md,8px)] border border-[var(--border)] bg-[var(--bg-primary)] p-3">
      <div className="relative mx-auto w-full" style={{ aspectRatio: `${w} / ${h}`, maxHeight: 150, maxWidth: Math.min(420, (150 * w) / h) }} role="group" aria-label="Monitor-Anordnung">
        {ds.map((d) => {
          const picked = selected === d.id, isActive = activeId === d.id;
          return (
            <Button
              key={d.id}
              type="button"
              variant={picked ? "secondary" : "outline"}
              disabled={disabled}
              aria-pressed={picked}
              aria-label={`${displayLabel(d)}${picked ? ", ausgewählt" : ""}`}
              onClick={() => onPick(d.id)}
              className={`absolute h-auto flex-col gap-0 rounded-sm p-1 text-xs ${picked ? "border-[var(--accent)]" : ""}`}
              style={{ left: `${((d.bounds.x - minX) / w) * 100}%`, top: `${((d.bounds.y - minY) / h) * 100}%`, width: `calc(${(d.bounds.width / w) * 100}% - 4px)`, height: `calc(${(d.bounds.height / h) * 100}% - 4px)`, margin: 2 }}
            >
              <IconMonitor size={14} />
              <span className="font-mono tabular-nums">{d.index}</span>
              {d.primary && <span className={`text-[10px] ${muted}`}>Haupt</span>}
              {isActive && <span className="text-[10px] text-[var(--accent)]">Katze</span>}
            </Button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        <Badge variant={selected === null ? "secondary" : "outline"}>{selected === null ? "Automatisch" : "Fest gewählt"}</Badge>
        <Badge variant="outline">{ds.length} {ds.length === 1 ? "Monitor" : "Monitore"}</Badge>
      </div>
    </div>
  );
}

const displayLabel = (d: PetDisplayInfo) => `${d.name} · ${d.width}×${d.height}${d.primary ? " · Hauptmonitor" : ""}`;

/* ---------- Vorschau ---------- */

/** Kleine Live-Vorschau: zeichnet die echten Sprite-Frames mit den gewählten Farben, Größe, Tempo und Deckkraft.
 * Erkennt petType: im Hasen-Modus läuft hierder Hase mit den Bunny-Frames (bunnyA/B) und seinen echten Farben. */
function PetPreview({ s }: { s: PetSettings }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const live = useRef(s);
  live.current = s;

  useEffect(() => {
    const cat = (globalThis as unknown as { CAT: { w: number; h: number; frames: Record<string, string[]> } }).CAT;
    const frameset = () => (live.current.petType === "bunny"
      ? { w: cat.frames.bunnyA[0].length, h: cat.frames.bunnyA.length, frames: { bunnyA: cat.frames.bunnyA, bunnyB: cat.frames.bunnyB } }
      : { w: cat.w, h: cat.h, frames: cat.frames });
    const ctx = canvas.current!.getContext("2d")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lastKey = "", x = 0, dir = 1, prev = performance.now();
    const t0 = prev;
    const tick = () => {
      const t = performance.now(), dt = Math.min(0.1, (t - prev) / 1000);
      prev = t;
      const cur = live.current, el = canvas.current, box = holder.current;
      if (!el || !box) return;
      const set = frameset();
      const px = Math.min(cur.scale, 6);
      if (el.width !== set.w || el.height !== set.h) el.width = set.w, el.height = set.h;
      el.style.width = `${set.w * px}px`;
      el.style.height = `${set.h * px}px`;
      const room = Math.max(0, box.clientWidth - set.w * px - 16);
      const walking = cur.area !== "sit" && !reduced && cur.enabled;
      if (walking) {
        x += dir * cur.speed * 0.6 * dt;
        if (x > room) { x = room; dir = -1; } else if (x < 0) { x = 0; dir = 1; }
      } else x = cur.anchor === "left" ? 0 : cur.anchor === "right" ? room : room / 2;
      x = Math.min(x, room);
      el.style.transform = `translateX(${Math.round(x)}px) scaleX(${walking && dir < 0 ? -1 : 1})`;
      el.style.opacity = String((cur.enabled ? cur.opacity : 30) / 100);
      const cycle = (t - t0) % 9000, blink = (t - t0) % 4200 > 4050, wag = Math.floor(t / 700) % 3 === 0;
      // Katze: A/B-Hüpfer im Lauf, sonst sitzt/blinzelt/putzt sie — inkl. sitTailBlink (kein Nackt-Blink mehr).
      const name = cur.petType === "bunny"
        ? cur.enabled && !reduced && Math.floor(t / 260) % 2 ? "bunnyB" : "bunnyA" // Hase: 2-Frame-Hüpfer mit den echten Begleiter-Frames
        : reduced ? "sit" : walking ? (Math.floor(t / Math.min(400, Math.max(80, 10400 / cur.speed))) % 2 ? "walkB" : "walkA")
        : cycle > 5000 && cycle < 7500 ? (Math.floor(t / 320) % 2 ? "groomB" : "groomA")
        : blink && wag ? "sitTailBlink"
        : blink ? "sitBlink"
        : wag ? "sitTail" : "sit";
      const key = `${name}|${cur.fur}|${cur.outline}|${cur.eyes}|${cur.petType}`;
      if (key === lastKey) return;
      lastKey = key;
      const pal: Record<string, string> = cur.petType === "bunny"
        ? buildCompanionPalette(cur.fur, cur.outline, cur.eyes)
        : { o: cur.outline, w: cur.fur, g: MIX_HEX(cur.fur, "#000000", 0.16), e: cur.eyes, h: "#ffffff", p: "#e58aa0", n: "#e8758c", c: "#e08a4c", y: "#ffd24a", t: "#ff6f8a", k: "#e08a4c", z: "#8fb8ff", i: "#f2b24c", m: "#cfd2de" };
      ctx.clearRect(0, 0, set.w, set.h);
      set.frames[name].forEach((row, yy) => [...row].forEach((ch, xx) => { if (pal[ch]) { ctx.fillStyle = pal[ch]; ctx.fillRect(xx, yy, 1, 1); } }));
    };
    tick();
    const id = window.setInterval(tick, 40);
    return () => clearInterval(id);
  }, []);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-baseline justify-between space-y-0 px-4 py-2.5">
        <CardTitle className="text-sm">Vorschau</CardTitle>
        <CardDescription className="text-xs">{s.enabled ? (s.petType === "bunny" ? "Live, wie auf dem Desktop (Hase)" : "Live, wie auf dem Desktop") : "Tier ist ausgeblendet"}</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div ref={holder} className="flex h-[112px] items-end overflow-hidden rounded-[var(--radius-md,8px)] border border-[var(--border)] bg-[var(--bg-primary)] px-2 pb-0">
          <canvas ref={canvas} width={32} height={24} role="img" aria-label={s.petType === "bunny" ? "Vorschau des Hasen" : "Vorschau der Katze"} style={{ imageRendering: "pixelated", willChange: "transform" }} />
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- kleine Bausteine auf Basis von shadcn ---------- */

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="space-y-0.5 px-4 pb-2 pt-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        {hint && <CardDescription className="text-xs">{hint}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className={`m-0 text-xs ${faint}`}>{hint}</p>}
    </div>
  );
}

function ToggleRow({ id, label, hint, checked, disabled, onChange }: { id: string; label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={id} className="text-sm">{label}</Label>
        {hint && <p className={`m-0 text-xs ${faint}`}>{hint}</p>}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function SliderRow({ label, unit, hint, min, max, step = 1, value, disabled, onChange }: {
  label: string; unit: string; hint?: string; min: number; max: number; step?: number; value: number; disabled?: boolean; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm">{label}</Label>
        <span className={`font-mono text-xs tabular-nums ${muted}`}>{value} {unit}</span>
      </div>
      <Slider aria-label={label} min={min} max={max} step={step} value={[value]} disabled={disabled} onValueChange={([v]) => onChange(v)} />
      {hint && <p className={`m-0 text-xs ${faint}`}>{hint}</p>}
    </div>
  );
}

function Segmented<T extends string>({ value, options, disabled, onChange }: { value: T; options: { value: T; label: string }[]; disabled?: boolean; onChange: (v: T) => void }) {
  return (
    <ToggleGroup type="single" variant="outline" value={value} disabled={disabled} onValueChange={(v) => v && onChange(v as T)} className="grid w-full" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => <ToggleGroupItem key={o.value} value={o.value} className="px-2 text-xs">{o.label}</ToggleGroupItem>)}
    </ToggleGroup>
  );
}

function PlainSelect<T extends string>({ value, options, disabled, onChange }: { value: T; options: { value: T; label: string }[]; disabled?: boolean; onChange: (v: T) => void }) {
  return (
    <Select value={value} disabled={disabled} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
