/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */

/**
 * Agent-Loop: schickt ein Ziel in eine laufende Session und, sobald deren
 * Ausgabe ruhig geworden ist, wiederholt „Weiter“, bis maxIterations erreicht
 * ist oder der Loop gestoppt wird. Reine Logik: Uhr, Schreiben und
 * Aktivitätsabfrage sind injiziert, tick() wird von außen getaktet.
 */
export type LoopState = "running" | "stopped" | "done";

export interface LoopInfo {
  sessionId: string;
  goal: string;
  maxIterations: number;
  /** Anzahl bereits gesendeter Prompts (Ziel = 1). */
  iteration: number;
  state: LoopState;
  startedAt: number;
  message?: string;
  /** Optionaler Prüfbefehl: Exit 0 = Ziel erreicht, Loop endet. */
  check?: string;
  /** "checking" solange der Prüfbefehl läuft. */
  phase: "working" | "checking";
  lastCheck?: { code: number | null; at: number; tail: string };
}

export interface AgentLoopDeps {
  /** Tippt Text + Enter in die Session; false = Session nicht erreichbar. */
  write: (sessionId: string, text: string) => boolean;
  /** Zeitpunkt der letzten Terminalausgabe; null = Session läuft nicht mehr. */
  lastActive: (sessionId: string) => number | null;
  now: () => number;
  emit: (info: LoopInfo) => void;
  /** Führt den Prüfbefehl im Arbeitsordner der Session aus. Ohne diese Funktion wird `check` ignoriert. */
  runCheck?: (command: string, sessionId: string) => Promise<{ code: number | null; output: string }>;
  /** Agent-spezifisches Verhalten (Ruhezeit, Unterstützung) je Session; Vorrang vor quietMs/maxWaitMs. */
  profileFor?: (sessionId: string) => { supported: boolean; quietMs: number; maxWaitMs: number; reason?: string };
  /** Ruhezeit ohne Ausgabe, ab der ein Schritt als beendet gilt. */
  quietMs?: number;
  /** Fallback, falls nach dem Senden nie Ausgabe kam. */
  maxWaitMs?: number;
  continuePrompt?: string;
}

export const MAX_ITERATIONS_LIMIT = 100;

export class AgentLoopManager {
  private loops = new Map<string, LoopInfo & { sentAt: number; quietMs?: number; maxWaitMs?: number }>();
  private readonly quietMs: number;
  private readonly maxWaitMs: number;
  private readonly continuePrompt: string;

  constructor(private deps: AgentLoopDeps) {
    this.quietMs = deps.quietMs ?? 10_000;
    this.maxWaitMs = deps.maxWaitMs ?? 120_000;
    this.continuePrompt = deps.continuePrompt ?? "Weiter";
  }

  start(opts: { sessionId: string; goal: string; maxIterations: number; check?: string }): { ok: true; loop: LoopInfo } | { ok: false; message: string } {
    const goal = (opts.goal || "").trim();
    if (!goal) return { ok: false, message: "Bitte ein Ziel angeben." };
    const max = Math.min(MAX_ITERATIONS_LIMIT, Math.max(1, Math.floor(Number(opts.maxIterations)) || 1));
    if (this.loops.get(opts.sessionId)?.state === "running") return { ok: false, message: "Für diese Session läuft bereits ein Loop." };
    const profile = this.deps.profileFor?.(opts.sessionId);
    if (profile && !profile.supported) return { ok: false, message: profile.reason ?? "Dieser Agent unterstützt keinen Loop." };
    if (!this.deps.write(opts.sessionId, goal)) return { ok: false, message: "Session ist nicht aktiv." };
    const now = this.deps.now();
    const check = (opts.check || "").trim() || undefined;
    const loop: LoopInfo & { sentAt: number; quietMs?: number; maxWaitMs?: number } = {
      ...(profile ? { quietMs: profile.quietMs, maxWaitMs: profile.maxWaitMs } : {}),
      sessionId: opts.sessionId, goal, maxIterations: max, iteration: 1, state: "running", startedAt: now, sentAt: now,
      phase: "working", ...(check ? { check } : {})
    };
    this.loops.set(opts.sessionId, loop);
    this.emit(loop);
    return { ok: true, loop: this.view(loop) };
  }

  stop(sessionId: string): boolean {
    const loop = this.loops.get(sessionId);
    if (!loop || loop.state !== "running") return false;
    this.finish(loop, "stopped", "Vom Nutzer gestoppt.");
    return true;
  }

  list(): LoopInfo[] {
    return [...this.loops.values()].map((l) => this.view(l));
  }

  /** Periodisch aufrufen (z. B. jede Sekunde). */
  tick(): void {
    const now = this.deps.now();
    for (const loop of this.loops.values()) {
      if (loop.state !== "running") continue;
      const last = this.deps.lastActive(loop.sessionId);
      if (last === null) {
        this.finish(loop, "stopped", "Session beendet.");
        continue;
      }
      const sawOutput = last >= loop.sentAt;
      const quietFor = now - Math.max(last, loop.sentAt);
      const idle = sawOutput ? quietFor >= (loop.quietMs ?? this.quietMs) : now - loop.sentAt >= (loop.maxWaitMs ?? this.maxWaitMs);
      if (!idle || loop.phase === "checking") continue;
      if (loop.check && this.deps.runCheck) {
        this.runCheck(loop);
        continue;
      }
      this.advance(loop);
    }
  }

  private runCheck(loop: LoopInfo & { sentAt: number }): void {
    loop.phase = "checking";
    this.emit(loop);
    const done = (res: { code: number | null; output: string }) => {
      loop.phase = "working";
      if (loop.state !== "running") return;
      const tail = res.output.replace(/\s+/g, " ").trim().slice(-300);
      loop.lastCheck = { code: res.code, at: this.deps.now(), tail };
      if (res.code === 0) this.finish(loop, "done", "Prüfung bestanden.");
      else this.advance(loop, `Prüfung „${loop.check}“ fehlgeschlagen (Exit ${res.code ?? "?"}): ${tail}`);
    };
    this.deps.runCheck!(loop.check!, loop.sessionId).then(done, (e) => done({ code: null, output: String(e) }));
  }

  /** Nächsten Durchlauf anstoßen oder beim Limit beenden. */
  private advance(loop: LoopInfo & { sentAt: number }, prefix = ""): void {
    if (loop.iteration >= loop.maxIterations) {
      this.finish(loop, "done", loop.check ? "Limit erreicht, Prüfung nicht bestanden." : "Alle Durchläufe abgeschlossen.");
      return;
    }
    const text = prefix ? `${prefix}. ${this.continuePrompt}` : this.continuePrompt;
    if (!this.deps.write(loop.sessionId, text)) {
      this.finish(loop, "stopped", "Session nicht erreichbar.");
      return;
    }
    loop.iteration++;
    loop.sentAt = this.deps.now();
    this.emit(loop);
  }

  private finish(loop: LoopInfo & { sentAt: number }, state: LoopState, message: string): void {
    loop.state = state;
    loop.message = message;
    this.emit(loop);
  }

  private view(l: LoopInfo & { sentAt?: number; quietMs?: number; maxWaitMs?: number }): LoopInfo {
    const { sentAt: _s, quietMs: _q, maxWaitMs: _m, ...info } = l;
    return info;
  }

  private emit(l: LoopInfo & { sentAt?: number }): void {
    this.deps.emit(this.view(l));
  }
}
