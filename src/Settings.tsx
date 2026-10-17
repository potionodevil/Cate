/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useState } from "react";
import { AgentConnections } from "./AgentConnections";
import { AgentIntegration } from "./AgentIntegration";
import { PetSettingsTab } from "./PetSettings";
import type { AuthCredentialRow } from "./types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ModelInput } from "@/components/ModelInput";
import { cn } from "@/lib/utils";
import { setSubagentMode, useSubagents } from "./subagentStore";

// Providers supported by `hermes auth add --type api-key`. OAuth-type providers
// (nous, openai-codex, qwen-oauth, minimax-oauth, copilot) are deliberately left
// out of this first pass — they need an interactive browser/device-code login
// flow, not a pasted key, so they get a terminal hint instead of a key field.
const API_KEY_PROVIDERS = [
  "anthropic",
  "openrouter",
  "gemini",
  "xai",
  "deepseek",
  "zai",
  "minimax",
  "minimax-cn",
  "kimi-coding",
  "kimi-cn",
  "alibaba",
  "xiaomi",
  "huggingface",
  "fireworks",
  "novita",
  "nvidia",
  "deepinfra",
  "custom"
];

const OAUTH_PROVIDERS = ["nous", "openai-codex", "qwen-oauth", "minimax-oauth", "copilot"];

/** Settings overlay: hosts the sidebar-position preference and, per active
 * project, API-key credential management via the `hermes auth` CLI.
 * Theme and Plugins moved out to header popovers (HeaderThemePopover /
 * HeaderPluginsPopover) — those are reached for constantly during normal
 * use, so they get one-click top-right access instead of being buried three
 * clicks deep in this modal.
 * Closes on Escape or backdrop click, following standard dialog UX. */
export function Settings({
  onClose,
  sidebarPosition,
  onSidebarPositionChange,
  activeProfile,
  motionEnabled,
  onMotionChange
}: {
  onClose: () => void;
  sidebarPosition: "left" | "right";
  onSidebarPositionChange: (pos: "left" | "right") => void;
  activeProfile?: string;
  motionEnabled: boolean;
  onMotionChange: (enabled: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  const [retentionDays, setRetentionDaysState] = useState<number | null>(null);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [agentDefaults, setAgentDefaults] = useState<{ defaultPresetId: string; defaultModel: string | null } | null>(null);
  const [agentDefaultsSaving, setAgentDefaultsSaving] = useState(false);
  const [agentDefaultsError, setAgentDefaultsError] = useState<string | null>(null);
  const [agentPresets, setAgentPresets] = useState<{ id: string; label: string }[]>([]);
  const [modelGroups, setModelGroups] = useState<{ provider: string; models: string[] }[]>([]);

  const [provider, setProvider] = useState(API_KEY_PROVIDERS[0]);
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [credentials, setCredentials] = useState<AuthCredentialRow[]>([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    void window.harness.getAutostart().then(setAutostartState);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!activeProfile) return;
    void refreshCredentials(activeProfile);
  }, [activeProfile]);

  useEffect(() => {
    window.harness.getRetentionDays().then(setRetentionDaysState);
    window.harness.getAgentDefaults().then(setAgentDefaults);
    window.harness.listAgentPresets().then((presets) => setAgentPresets(presets.map((p) => ({ id: p.id, label: p.label }))));
    window.harness.listCachedModels().then(setModelGroups);
  }, []);

  async function refreshCredentials(profile: string) {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const result = await window.harness.listApiKeys(profile);
      if (result.ok) {
        setCredentials(result.rows);
      } else {
        setAuthError(result.message);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthLoading(false);
    }
  }

  async function choose(pos: "left" | "right") {
    if (pos === sidebarPosition) return;
    setSaving(true);
    try {
      await window.harness.setSidebarPosition(pos);
      onSidebarPositionChange(pos);
    } finally {
      setSaving(false);
    }
  }

  async function chooseMotion(next: boolean) {
    if (next === motionEnabled) return;
    try {
      await window.harness.setMotionEnabled(next);
      onMotionChange(next);
    } catch {
      // leave the switch at its previous state on failure
    }
  }

  async function saveDefaultPreset(presetId: string) {
    if (!agentDefaults || presetId === agentDefaults.defaultPresetId) return;
    setAgentDefaultsSaving(true);
    setAgentDefaultsError(null);
    try {
      const res = await window.harness.setDefaultPreset(presetId);
      if (res.ok) setAgentDefaults({ ...agentDefaults, defaultPresetId: presetId });
      else setAgentDefaultsError(res.message || "Konnte Standard-CLI nicht speichern.");
    } catch (err) {
      setAgentDefaultsError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentDefaultsSaving(false);
    }
  }

  async function saveDefaultModel(model: string | null) {
    if (!agentDefaults) return;
    setAgentDefaultsSaving(true);
    setAgentDefaultsError(null);
    try {
      const res = await window.harness.setDefaultModel(model);
      if (res.ok) setAgentDefaults({ ...agentDefaults, defaultModel: model });
      else setAgentDefaultsError("Konnte Standardmodell nicht speichern.");
    } catch (err) {
      setAgentDefaultsError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentDefaultsSaving(false);
    }
  }

  async function saveRetentionDays(days: number) {
    if (!Number.isFinite(days) || days < 1) return;
    setRetentionSaving(true);
    try {
      await window.harness.setRetentionDays(days);
      setRetentionDaysState(days);
    } finally {
      setRetentionSaving(false);
    }
  }

  async function handleAddKey() {
    if (!activeProfile || !apiKey.trim()) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const result = await window.harness.addApiKey(activeProfile, provider, apiKey.trim(), label.trim() || undefined);
      if (result.ok) {
        setApiKey("");
        setLabel("");
        await refreshCredentials(activeProfile);
      } else {
        setAuthError(result.message);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleRemoveKey(row: AuthCredentialRow) {
    if (!activeProfile) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const result = await window.harness.removeApiKey(activeProfile, row.provider, String(row.index));
      if (result.ok) {
        await refreshCredentials(activeProfile);
      } else {
        setAuthError(result.message);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthBusy(false);
    }
  }

  const isOAuthProvider = OAUTH_PROVIDERS.includes(provider);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent onClick={(event) => event.stopPropagation()} className="hh-settings-dialog max-w-[min(900px,calc(100vw-24px))] max-h-[min(760px,calc(100dvh-24px))] min-w-0 overflow-hidden p-4 sm:p-5" aria-label="Einstellungen">
        <DialogHeader>
          <DialogTitle>Einstellungen</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" orientation="vertical" className="hh-settings-layout flex min-h-0 flex-1 flex-row gap-6">
          <TabsList className="hh-settings-nav shrink-0">
            <TabsTrigger value="general">Allgemein</TabsTrigger>
            <TabsTrigger value="connections">Verbindungen</TabsTrigger>
            <TabsTrigger value="context">Kontext</TabsTrigger>
            <TabsTrigger value="pet">Tier</TabsTrigger>
            <TabsTrigger value="credentials">Zugangsdaten</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="hh-settings-scroll flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <Label htmlFor="autostart">Mit Windows starten</Label>
                <span className="hh-faint text-xs">Startet Cate versteckt im Tray; Sessions kommen nach einem Neustart von selbst zurück.</span>
              </div>
              <Switch
                id="autostart"
                checked={autostart ?? true}
                disabled={autostart === null}
                onCheckedChange={(on) => void window.harness.setAutostart(on).then(setAutostartState)}
              />
            </div>
            <div className="hh-section-header">Agent-Standards</div>
            <p className="hh-muted m-0 text-sm">
              Standard-CLI und Standardmodell für neue Sessions. Ein Projekt kann beides in seinen Projekteinstellungen
              überschreiben.
            </p>
            {!agentDefaults ? (
              <p className="hh-faint m-0 text-sm">Lade…</p>
            ) : (
              <div className="flex flex-col gap-3 mt-1">
                <div className="flex flex-col gap-1">
                  <Label>Standard-CLI</Label>
                  <Select value={agentDefaults.defaultPresetId} onValueChange={saveDefaultPreset} disabled={agentDefaultsSaving}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {agentPresets.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Standardmodell</Label>
                  <ModelInput
                    placeholder="Projekt-Standardmodell verwenden (leer = kein Modell erzwingen)"
                    value={agentDefaults.defaultModel ?? ""}
                    onChange={(v) => saveDefaultModel(v.trim() || null)}
                    groups={modelGroups}
                  />
                  <span className="hh-faint text-xs">Wirkt nur auf CLIs, die das -m-Flag verstehen (Hermes).</span>
                </div>
                {agentDefaultsError && (
                  <p className="m-0 text-sm" style={{ color: "var(--danger)" }}>{agentDefaultsError}</p>
                )}
              </div>
            )}

            <Separator className="my-4" />

            <div className="hh-section-header">Sidebar-Position</div>
            <p className="hh-muted m-0 text-sm">Lege fest, auf welcher Seite die Projektliste angezeigt wird.</p>
            <Tabs value={sidebarPosition} onValueChange={(v) => choose(v as "left" | "right")} className="mt-1">
              <TabsList>
                <TabsTrigger value="left" disabled={saving}>
                  Links
                </TabsTrigger>
                <TabsTrigger value="right" disabled={saving}>
                  Rechts
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Separator className="my-4" />

            <div className="hh-section-header">Animationen</div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="text-sm font-medium">Oberfläche animieren</span>
                <span className="hh-muted text-sm">Elemente fliegen beim Öffnen sanft ein. Deaktivieren für sofortige Übergänge.</span>
              </div>
              <Switch checked={motionEnabled} onCheckedChange={chooseMotion} aria-label="Animationen umschalten" />
            </div>

            <Separator className="my-4" />

            <SubagentModeSetting />
          </TabsContent>

          <TabsContent value="connections" className="hh-settings-scroll flex flex-col gap-2">
            <AgentConnections />
            <Separator className="my-4" />
            <AgentIntegration />
          </TabsContent>

          <TabsContent value="pet" className="hh-settings-scroll flex flex-col gap-2">
            <PetSettingsTab />
          </TabsContent>

          <TabsContent value="context" className="hh-settings-scroll flex flex-col gap-2">
            <div className="hh-section-header">Kontext-Aufbewahrung</div>
            <p className="hh-muted m-0 text-sm">
              Komprimierter Session-Kontext (.air-Dateien) wird so lange aufbewahrt, bis er abgelaufen ist, geprüft beim
              nächsten Öffnen der Sessions-Ansicht — oder sofort gelöscht, sobald das zugehörige Projekt gelöscht wird.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                className="w-24"
                value={retentionDays ?? 30}
                onChange={(e) => setRetentionDaysState(Number(e.target.value))}
              />
              <span className="hh-muted text-sm">Tage</span>
              <Button
                size="sm"
                disabled={retentionSaving || retentionDays == null}
                onClick={() => retentionDays != null && saveRetentionDays(retentionDays)}
              >
                Speichern
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="credentials" className="hh-settings-scroll flex flex-col gap-2">
            <div className="hh-section-header">API-Schlüssel</div>
            {!activeProfile && (
              <p className="hh-faint m-0 text-sm">Wähle zuerst ein Projekt aus, um dessen API-Schlüssel zu verwalten.</p>
            )}

            {activeProfile && (
              <>
                <p className="hh-muted m-0 text-sm">
                  Verwalte Provider-Anmeldedaten für Profil „{activeProfile}“. Schlüssel werden ausschließlich über die
                  hermes-CLI gespeichert, nie direkt in Konfigurationsdateien geschrieben.
                </p>

                <div className="flex gap-2 flex-wrap mt-1 items-start">
                  <Select value={provider} onValueChange={setProvider}>
                    <SelectTrigger className="flex-[1_1_160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>API-Schlüssel</SelectLabel>
                        {API_KEY_PROVIDERS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>OAuth (Terminal-Login erforderlich)</SelectLabel>
                        {OAUTH_PROVIDERS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  {isOAuthProvider ? (
                    <p className="hh-faint m-0 text-sm basis-full">
                      Dieser Provider nutzt OAuth. Bitte Login im Terminal starten: hermes auth add {provider} --profile{" "}
                      {activeProfile}
                    </p>
                  ) : (
                    <>
                      <Input
                        type="password"
                        placeholder="API-Schlüssel"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="flex-[2_1_200px]"
                        autoComplete="off"
                      />
                      <Input
                        type="text"
                        placeholder="Label (optional)"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        className="flex-[1_1_140px]"
                      />
                      <Button disabled={authBusy || !apiKey.trim()} onClick={handleAddKey}>
                        Hinzufügen
                      </Button>
                    </>
                  )}
                </div>

                {authError && <p className="m-0 text-sm" style={{ color: "var(--danger)" }}>{authError}</p>}

                <div className="mt-2">
                  {authLoading && <p className="hh-faint m-0 text-sm">Lade...</p>}
                  {!authLoading && credentials.length === 0 && (
                    <p className="hh-faint m-0 text-sm">Keine Anmeldedaten für dieses Profil hinterlegt.</p>
                  )}
                  {!authLoading &&
                    credentials.map((row) => (
                      <div
                        key={`${row.provider}-${row.index}`}
                        className={cn("flex items-center gap-2 py-1 border-b", "border-[var(--border)]")}
                      >
                        <span className="text-sm">{row.provider}</span>
                        <span className="hh-faint text-sm">
                          {row.label} ({row.type})
                        </span>
                        <Button size="sm" className="ml-auto" disabled={authBusy} onClick={() => handleRemoveKey(row)}>
                          Entfernen
                        </Button>
                      </div>
                    ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Wahl, wie Subagent-Terminals aufgehen: sofort neben der Session, sobald ein Agent einen Subagenten startet,
 * oder erst, wenn man im Terminal über die Subagent-Zeile fährt und klickt. */
function SubagentModeSetting() {
  const { mode } = useSubagents();
  return (
    <>
      <div className="hh-section-header">Subagenten</div>
      <p className="hh-muted m-0 text-sm">Startet Claude Code oder Hermes einen Subagenten, zeigt Cate ihn in einem eigenen Mitlese-Terminal.</p>
      <Tabs value={mode} onValueChange={(v) => setSubagentMode(v as "auto" | "hover")} className="mt-1">
        <TabsList>
          <TabsTrigger value="auto">Direkt in der Session öffnen</TabsTrigger>
          <TabsTrigger value="hover">Erst bei Hover &amp; Klick</TabsTrigger>
        </TabsList>
      </Tabs>
    </>
  );
}
