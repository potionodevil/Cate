/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** First-run onboarding: ask for the user's name so the app can greet them.
 * Persisted via window.harness.setUserName -> electron/projectStore.ts.
 * Same unboxed scanline + HARNESS wordmark language as the post-login
 * Greeting (Greeting.tsx), so both screens read as one brand. */
const AGENT_CHOICES: { id: string; label: string; hint: string }[] = [
  { id: "hermes", label: "Hermes", hint: "Nous Research Agent" },
  { id: "claude-code", label: "Claude Code", hint: "Anthropic" },
  { id: "codex", label: "Codex CLI", hint: "OpenAI" },
  { id: "opencode", label: "OpenCode", hint: "Open Source, viele Provider" }
];

export function Onboarding({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"name" | "agent">("name");
  const [agent, setAgent] = useState("hermes");
  const [installed, setInstalled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (step !== "agent") return;
    void window.harness.detectInstalledAgents().then((list) =>
      setInstalled(Object.fromEntries(list.map((a) => [a.id, a.installed])))
    );
  }, [step]);

  async function submitName() {
    if (!name.trim()) return;
    setStep("agent");
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await window.harness.setUserName(trimmed);
      await window.harness.setOnboardingAgent(agent);
      onDone(trimmed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* scanline/grid background, identical recipe to Greeting */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 2px, color-mix(in srgb, var(--accent) 3%, transparent) 2px 3px), repeating-linear-gradient(90deg, transparent 0 2px, color-mix(in srgb, var(--border) 35%, transparent) 2px 3px)",
          maskImage: "radial-gradient(ellipse 60% 55% at 50% 45%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 45%, black 0%, transparent 75%)",
          opacity: 0.7
        }}
      />
      <div
        className="hh-slide-in"
        style={{
          width: 420,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
          textAlign: "center",
          alignItems: "center",
          padding: "var(--space-6)"
        }}
      >
        <div
          style={{
            fontFamily: "'JetBrains Mono', 'Cascadia Mono', Consolas, monospace",
            fontWeight: 700,
            textTransform: "uppercase",
            fontSize: "clamp(1.6rem, 4vw, 2.6rem)",
            lineHeight: 0.9,
            letterSpacing: "0.28em",
            marginRight: "-0.28em",
            color: "var(--text-primary)",
            textShadow: "0 0 24px color-mix(in srgb, var(--accent) 45%, transparent)"
          }}
        >
          HARNESS
        </div>
        <div
          className="hh-faint"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.2em"
          }}
        >
          cate
        </div>
        {step === "name" ? (
          <>
            <p className="hh-muted" style={{ margin: 0, fontSize: "var(--text-sm)", lineHeight: 1.5 }}>
              Wie sollen wir dich nennen? (für die Begrüßung — kannst du später in den Settings ändern)
            </p>
            <Input
              autoFocus
              placeholder="Dein Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submitName()}
              className="text-center"
              style={{ fontSize: "var(--text-md)", maxWidth: 280 }}
            />
            <Button disabled={!name.trim()} onClick={() => void submitName()} className="justify-center" style={{ fontSize: "var(--text-md)" }}>
              Weiter
            </Button>
          </>
        ) : (
          <>
            <p className="hh-muted" style={{ margin: 0, fontSize: "var(--text-sm)", lineHeight: 1.5 }}>
              Mit welchem Agent arbeitest du am liebsten? Das ist dein Standard für neue Sessions — jederzeit in den Settings änderbar.
              Lokale Modelle (Ollama) richtest du dort unter „Verbindungen“ ein.
            </p>
            <div role="radiogroup" aria-label="Standard-Agent" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)", width: "100%" }}>
              {AGENT_CHOICES.map((a) => {
                const selected = agent === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAgent(a.id)}
                    style={{
                      textAlign: "left",
                      padding: "var(--space-3)",
                      borderRadius: "var(--radius-md)",
                      border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                      background: selected ? "var(--accent-dim)" : "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{a.label}</span>
                    <span className="hh-faint" style={{ fontSize: "var(--text-xs)" }}>
                      {a.hint}
                      {installed[a.id] === false ? " · nicht installiert" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            <Button disabled={saving} onClick={() => void submit()} className="justify-center" style={{ fontSize: "var(--text-md)" }}>
              {saving ? "Speichere..." : "Los geht's"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

