/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useState } from "react";
import type { PetSettings } from "./types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const COLOR_PRESETS: { name: string; fur: string; outline: string; eyes: string }[] = [
  { name: "Grau", fur: "#8d96aa", outline: "#262a36", eyes: "#101218" },
  { name: "Schwarz", fur: "#3a3d46", outline: "#0b0c10", eyes: "#ffd36b" },
  { name: "Weiß", fur: "#e8ebf2", outline: "#4a5060", eyes: "#2a5db0" },
  { name: "Orange", fur: "#e0913c", outline: "#7a3d0c", eyes: "#101218" },
  { name: "Creme", fur: "#d8c3a0", outline: "#4b3a28", eyes: "#2b6f9c" }
];

const AREAS: { value: PetSettings["area"]; label: string }[] = [
  { value: "screen", label: "Ganzer Bildschirm (auch Mitte)" },
  { value: "floor", label: "Nur unterer Rand" },
  { value: "sit", label: "Sitzt still" }
];
const ANCHORS: { value: PetSettings["anchor"]; label: string }[] = [
  { value: "left", label: "Links" },
  { value: "center", label: "Mitte" },
  { value: "right", label: "Rechts" }
];

const COMPANIONS: { value: PetSettings["companion"]; label: string }[] = [
  { value: "bunny", label: "Hase" },
  { value: "mouse", label: "Maus" },
  { value: "bird", label: "Vogel" },
  { value: "butterfly", label: "Schmetterling" },
  { value: "none", label: "Keins" }
];

/** "Katze" tab of the settings dialog: every change is saved and applied to the live cat immediately. */
export function PetSettingsTab() {
  const [s, setS] = useState<PetSettings | null>(null);

  useEffect(() => {
    void window.harness.getPetSettings().then(setS);
  }, []);

  async function change(patch: Partial<PetSettings>) {
    setS((cur) => (cur ? { ...cur, ...patch } : cur)); // optimistic: sliders and color pickers stay smooth
    setS(await window.harness.setPetSettings(patch));
  }

  if (!s) return <p className="hh-faint m-0 text-sm">Lade…</p>;

  const dis = !s.enabled;
  return (
    <div className="flex flex-col gap-3">
      <div className="hh-section-header">Desktop-Katze</div>
      <p className="hh-muted m-0 text-sm">
        Klick auf die Katze öffnet ein Textfeld für einen neuen Prompt, Doppelklick öffnet das Projekt. Sie meldet sich, wenn eine
        Session fertig ist.
      </p>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="pet-enabled">Katze anzeigen</Label>
        <Switch id="pet-enabled" checked={s.enabled} onCheckedChange={(enabled) => void change({ enabled })} />
      </div>

      <fieldset disabled={dis} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0 disabled:opacity-50">
        <div className="flex flex-col gap-1">
          <Label>Farbe</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Farbvorlagen">
            {COLOR_PRESETS.map((p) => {
              const active = p.fur === s.fur && p.outline === s.outline && p.eyes === s.eyes;
              return (
                <button
                  key={p.name}
                  type="button"
                  className="hh-pet-swatch"
                  data-active={active}
                  aria-pressed={active}
                  onClick={() => void change({ fur: p.fur, outline: p.outline, eyes: p.eyes })}
                >
                  <span className="hh-pet-chip" style={{ background: p.fur, borderColor: p.outline }} aria-hidden />
                  {p.name}
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex flex-wrap gap-4">
            {([["fur", "Fell"], ["outline", "Umriss"], ["eyes", "Augen"]] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input type="color" className="hh-pet-color" value={s[key]} onChange={(e) => void change({ [key]: e.target.value })} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <Range label="Größe" unit="×" min={3} max={8} value={s.scale} onChange={(scale) => void change({ scale })} />
        <Range label="Tempo" unit="px/s" min={15} max={160} step={5} value={s.speed} onChange={(speed) => void change({ speed })} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label>Bewegungsbereich</Label>
            <Select value={s.area} onValueChange={(area) => void change({ area: area as PetSettings["area"] })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AREAS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Position (Start / Ruheplatz)</Label>
            <Select value={s.anchor} onValueChange={(anchor) => void change({ anchor: anchor as PetSettings["anchor"] })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ANCHORS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label>Besuch (nur ein Tier)</Label>
          <Select value={s.companion} onValueChange={(companion) => void change({ companion: companion as PetSettings["companion"] })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMPANIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="pet-follow">Bei Meldung zum Monitor springen, an dem ich arbeite</Label>
          <Switch id="pet-follow" checked={s.followOnNotify} onCheckedChange={(followOnNotify) => void change({ followOnNotify })} />
        </div>

        <Range label="Fertig nach" unit="s Stille" min={3} max={60} value={s.idleSeconds} onChange={(idleSeconds) => void change({ idleSeconds })} />
        <Range label="Sprechblase bleibt" unit="s" min={3} max={30} value={s.bubbleSeconds} onChange={(bubbleSeconds) => void change({ bubbleSeconds })} />

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => void window.harness.testPet()}>
            Test-Meldung
          </Button>
          <Button size="sm" variant="ghost" onClick={async () => setS(await window.harness.resetPetSettings())}>
            Zurücksetzen
          </Button>
        </div>
      </fieldset>
    </div>
  );
}

function Range({ label, unit, min, max, step = 1, value, onChange }: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const id = `pet-${label}`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="hh-muted text-sm tabular-nums">{value} {unit}</span>
      </div>
      <input id={id} type="range" className="hh-pet-range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
