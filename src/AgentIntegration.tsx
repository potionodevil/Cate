/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Row = { agent: string; label: string; total: number; installed: number; foreign: number };

/** Settings > Verbindungen: /agentloop, /validate und /cate in den installierten Agents anlegen.
 * Passiert nur auf Klick; fremde Dateien ohne Cate-Markierung werden nie überschrieben. */
export function AgentIntegration() {
  const [rows, setRows] = useState<Row[]>([]);
  const [detected, setDetected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function refresh() {
    setRows(await window.harness.integrationStatus());
    const d = await window.harness.detectInstalledAgents().catch(() => []);
    setDetected(Object.fromEntries(d.map((a) => [a.id, a.installed])));
  }
  useEffect(() => { void refresh(); }, []);

  async function install(agents: string[]) {
    setBusy(true);
    setMsg("");
    try {
      const res = await window.harness.integrationInstall(agents);
      setMsg(`${res.written.length} Datei(en) geschrieben${res.skipped.length ? `, ${res.skipped.length} übersprungen (${res.skipped[0].reason})` : ""}.`);
      await refresh();
    } catch {
      setMsg("Installation fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const missing = rows.filter((r) => r.installed < r.total - r.foreign).map((r) => r.agent);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium">Agent-Befehle</div>
      <p className="hh-muted text-sm">
        Legt <code>/agentloop</code>, <code>/validate</code> und <code>/cate</code> direkt in den Agents an (Claude Code, Codex, OpenCode: Befehlsordner; Hermes: Skills je Projektprofil).
        Eigene Dateien gleichen Namens bleiben unberührt.
      </p>
      {rows.map((r) => {
        const ok = r.installed >= r.total - r.foreign && r.total > 0;
        return (
          <div key={r.agent} className="hh-loop-q" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{r.label}{detected[r.agent] === false ? " (nicht gefunden)" : ""}</span>
              <span className="hh-muted text-[12px]">
                {r.installed}/{r.total} Befehle installiert{r.foreign ? `, ${r.foreign} eigene Datei(en)` : ""}
              </span>
            </div>
            <Button type="button" size="sm" variant={ok ? "ghost" : "default"} disabled={busy} onClick={() => void install([r.agent])}>
              {ok ? "Aktualisieren" : "Installieren"}
            </Button>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={busy || missing.length === 0} onClick={() => void install(missing)}>Alle installieren</Button>
        {msg && <span className="hh-muted text-[12px]">{msg}</span>}
      </div>
    </div>
  );
}
