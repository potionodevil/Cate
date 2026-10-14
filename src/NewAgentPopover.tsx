/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useMemo, useState } from "react";
import type { AgentPreset, Project, SessionRecord } from "./types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ModelInput } from "@/components/ModelInput";
import { cn } from "@/lib/utils";

/** Compact popover for starting a brand-new agent session: pick an installed
 * CLI tool, a model, and a label, then hand the resulting SessionRecord-like
 * summary back to the caller so it can open a session node.
 *
 * Also doubles as the picker for the "+" pane-add button inside an already
 * open session (pass sessionId/paneId/onPaneStarted instead of onStart) —
 * that's the right-click target users reach for far more often than the
 * initial "Neue Session starten" button, since it only shows once per
 * project before any session exists. Model/profile pickers are hidden in
 * that mode since splitSessionPane only takes a presetId. */
export function NewAgentPopover({
  project,
  presets,
  onClose,
  onStart,
  sessionId,
  paneId,
  onPaneStarted
}: {
  project: Project;
  presets: AgentPreset[];
  onClose: () => void;
  onStart?: (session: SessionRecord) => void;
  /** When set together with paneId + onPaneStarted, the popover adds a new
   * pane to this existing session instead of spawning a whole new one. */
  sessionId?: string;
  paneId?: string;
  onPaneStarted?: (result: { paneId: string; presetId: string }) => void;
}) {
  const paneMode = !!(sessionId && paneId && onPaneStarted);
  const [detected, setDetected] = useState<{ id: string; label: string; installed: boolean }[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [label, setLabel] = useState("");
  const [cachedModelGroups, setCachedModelGroups] = useState<{ provider: string; models: string[] }[]>([]);
  const [paneError, setPaneError] = useState<string | null>(null);

  useEffect(() => {
    window.harness.detectInstalledAgents().then(setDetected);
    window.harness.listCachedModels().then(setCachedModelGroups);
  }, []);

  // Presets besides "shell" (that one always has its own split-button
  // affordance already — this popover is specifically for CLI agents).
  const agentPresets = useMemo(() => presets.filter((p) => p.id !== "shell"), [presets]);
  const selectedPreset = useMemo(() => agentPresets.find((p) => p.id === selectedId) ?? null, [agentPresets, selectedId]);

  function statusFor(presetId: string): boolean {
    if (!detected) return true; // optimistic while the probe is still running
    const match = detected.find((d) => d.id === presetId);
    return match ? match.installed : false;
  }

  function selectPreset(preset: AgentPreset) {
    if (!statusFor(preset.id)) return;
    setSelectedId(preset.id);
    if (!label.trim()) setLabel(preset.label);
  }

  async function start() {
    const preset = agentPresets.find((p) => p.id === selectedId);
    if (!preset) return;
    if (paneMode && sessionId && paneId && onPaneStarted) {
      setPaneError(null);
      const result = await window.harness.splitSessionPane(sessionId, paneId, "horizontal", preset.id);
      if (!result.ok) {
        setPaneError(`${result.error.code}: ${result.error.message}`);
        return;
      }
      onPaneStarted({ paneId: result.paneId, presetId: preset.id });
      return;
    }
    // Leerer Name: Server generiert "<Preset-Label> · <Projektname>" —
    // nie vier identische "Hermes"-Zeilen in der Sidebar.
    const { sessionId: newSessionId, paneId: newPaneId, name: serverName } = await window.harness.spawnSession({
      projectId: project.id,
      cwd: project.folder,
      name: label.trim(),
      presetId: preset.id,
      profile: preset.supportsHermesFlags ? project.hermesProfile : undefined,
      model: model.trim() || undefined
    });
    const finalName = label.trim() || serverName || preset.label;
    const session: SessionRecord = {
      id: newSessionId,
      projectId: project.id,
      name: finalName,
      cwd: project.folder,
      status: "running",
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      endedAt: null,
      paneIds: [newPaneId],
      presetId: preset.id,
      profile: preset.supportsHermesFlags ? project.hermesProfile : null,
      model: model.trim() || null
    };
    onStart?.(session);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[360px]" aria-label={paneMode ? "Shell mit anderem Agent öffnen" : "Neuen Agent starten"}>
        <DialogHeader>
          <DialogTitle className="text-base">{paneMode ? "Shell mit anderem Agent öffnen" : "Neuen Agent starten"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {paneError && (
            <p role="alert" className="text-[11px] text-[var(--danger)]">
              {paneError}
            </p>
          )}
          <div className="flex flex-col gap-1">
            <Label>CLI-Tool</Label>
            <div className="flex flex-col gap-1">
              {agentPresets.map((preset) => {
                const installed = statusFor(preset.id);
                const active = selectedId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={!installed}
                    onClick={() => selectPreset(preset)}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-3 py-1.5 text-sm transition-colors",
                      installed ? "cursor-pointer hover:bg-[var(--bg-hover)]" : "cursor-not-allowed opacity-45",
                      active ? "border-[var(--accent)]" : "border-[var(--border)]"
                    )}
                    title={installed ? preset.label : `${preset.label} nicht gefunden`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-[7px] w-[7px] rounded-full shrink-0"
                        style={{ background: installed ? "var(--accent)" : "var(--border)" }}
                      />
                      {preset.label}
                    </span>
                    {!installed && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        nicht gefunden
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {!paneMode && (
            <>
              <div className="flex flex-col gap-1">
                <Label>Modell {selectedPreset && !selectedPreset.supportsHermesFlags ? "(wird von diesem CLI-Tool ignoriert)" : ""}</Label>
                <ModelInput
                  placeholder="Profil-Standard verwenden"
                  value={model}
                  onChange={setModel}
                  groups={cachedModelGroups}
                  disabled={!!selectedPreset && !selectedPreset.supportsHermesFlags}
                />
                {selectedId === "hermes" && (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Codex, Claude &amp; Co. laufen über Hermes selbst — einfach hier das passende Modell wählen, kein eigenes CLI-Tool nötig.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <Label>Bezeichnung</Label>
                <Input
                  placeholder="Session-Name (optional — leere Felder bekommen einen sinnvollen Default)"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="secondary" onClick={onClose}>
              Abbrechen
            </Button>
            <Button size="sm" disabled={!selectedId} onClick={start}>
              Starten
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
