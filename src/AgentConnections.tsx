/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Mcp = { id: string; name: string; enabled: boolean; command?: string; args?: string[]; env?: Record<string, string>; url?: string };
type Connector = { name: string; command?: string; args?: string[]; url?: string };

/** Settings > Verbindungen: local model + MCP servers / connectors that are
 * injected into the agent CLIs (Claude Code, Codex, OpenCode, Hermes) at spawn. */
export function AgentConnections() {
  const [endpoint, setEndpoint] = useState("http://localhost:11434");
  const [model, setModel] = useState("");
  const [localOn, setLocalOn] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [probe, setProbe] = useState<string | null>(null);
  const [servers, setServers] = useState<Mcp[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [draft, setDraft] = useState({ name: "", target: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void window.harness.getAgentConfig().then((cfg) => {
      if (cfg.localModel) {
        setEndpoint(cfg.localModel.endpoint || "http://localhost:11434");
        setModel(cfg.localModel.model);
        setLocalOn(cfg.localModel.enabled);
      }
      setServers(cfg.mcpServers);
      setConnectors(cfg.connectors);
    });
  }, []);

  function flashSaved() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  async function saveLocal(next: { enabled: boolean; endpoint: string; model: string }) {
    await window.harness.setLocalModel(next);
    flashSaved();
  }

  async function detect() {
    setProbe("Suche…");
    const res = await window.harness.listLocalModels(endpoint);
    setModels(res.models);
    setProbe(res.ok ? (res.models.length ? `${res.models.length} Modell(e) gefunden` : "Server erreichbar, aber keine Modelle installiert") : `Nicht erreichbar (${res.message ?? "?"})`);
  }

  async function saveServers(next: Mcp[]) {
    setServers(next);
    await window.harness.setMcpServers(next);
    flashSaved();
  }

  function addServer(name: string, target: string, base?: Connector) {
    const n = name.trim();
    const t = target.trim();
    if (!n || (!t && !base)) return;
    const isUrl = /^https?:\/\//i.test(t);
    const entry: Mcp = base
      ? { id: crypto.randomUUID(), name: base.name, enabled: true, command: base.command, args: base.args, url: base.url }
      : isUrl
        ? { id: crypto.randomUUID(), name: n, enabled: true, url: t }
        : { id: crypto.randomUUID(), name: n, enabled: true, command: t.split(/\s+/)[0], args: t.split(/\s+/).slice(1) };
    void saveServers([...servers.filter((s) => s.name !== entry.name), entry]);
    setDraft({ name: "", target: "" });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="hh-section-header">Lokales Modell</div>
      <p className="hh-muted m-0 text-sm">
        Alle Agents nutzen dein lokales Modell (z. B. Ollama) statt der Cloud. Gilt für neue und neu gestartete Sessions.
      </p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">Lokales Modell verwenden</span>
        <Switch
          checked={localOn}
          aria-label="Lokales Modell verwenden"
          onCheckedChange={(v) => {
            setLocalOn(v);
            void saveLocal({ enabled: v, endpoint, model });
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="hh-local-endpoint">Server</Label>
        <div className="flex gap-2">
          <Input id="hh-local-endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} onBlur={() => void saveLocal({ enabled: localOn, endpoint, model })} />
          <Button variant="secondary" size="sm" onClick={() => void detect()}>
            Modelle suchen
          </Button>
        </div>
        {probe && <span className="hh-faint text-xs">{probe}</span>}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="hh-local-model">Modell</Label>
        <Input
          id="hh-local-model"
          list="hh-local-models"
          placeholder="z. B. qwen2.5-coder:14b"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => void saveLocal({ enabled: localOn, endpoint, model })}
        />
        <datalist id="hh-local-models">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <span className="hh-faint text-xs">Claude Code, Codex, OpenCode und Hermes werden beim Start automatisch darauf umgestellt.</span>
      </div>

      <div className="hh-section-header" style={{ marginTop: "var(--space-3)" }}>MCP-Server &amp; Konnektoren</div>
      <p className="hh-muted m-0 text-sm">Werden beim Start in Claude Code, Codex und OpenCode eingehängt (Hermes verwaltet MCP selbst).</p>
      <div className="flex flex-wrap gap-1">
        {connectors.map((c) => (
          <Button key={c.name} size="sm" variant="secondary" disabled={servers.some((s) => s.name === c.name)} onClick={() => addServer(c.name, "", c)}>
            + {c.name}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {servers.length === 0 && <span className="hh-faint text-sm">Noch keine Server verbunden.</span>}
        {servers.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <Switch checked={s.enabled} aria-label={`${s.name} aktivieren`} onCheckedChange={(v) => void saveServers(servers.map((x) => (x.id === s.id ? { ...x, enabled: v } : x)))} />
            <span className="text-sm font-medium">{s.name}</span>
            <span className="hh-faint text-xs truncate flex-1">{s.url ?? [s.command, ...(s.args ?? [])].join(" ")}</span>
            <Button size="sm" variant="ghost" onClick={() => void saveServers(servers.filter((x) => x.id !== s.id))}>
              Entfernen
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ maxWidth: 140 }} />
        <Input placeholder="Befehl (npx -y paket) oder https://…-URL" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
        <Button size="sm" onClick={() => addServer(draft.name, draft.target)} disabled={!draft.name.trim() || !draft.target.trim()}>
          Hinzufügen
        </Button>
      </div>
      <span className="hh-faint text-xs" aria-live="polite">{saved ? "Gespeichert" : " "}</span>
    </div>
  );
}
