/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { execFile } from "node:child_process";

export const manifest = {
  id: "vramThrottle",
  name: "VRAM/Token-Drosselung",
  version: "1.0.0",
  description: "Überwacht GPU-Speicher und drosselt parallele Agenten bei Druck.",
};

export type Pressure = "ok" | "warn" | "critical";
export interface GpuSample { memUsedMb: number; memTotalMb: number; utilPct: number; ollamaModels?: number }
export interface Thresholds { warn: number; critical: number; hysteresis: number }
export interface ThrottleDecision { level: Pressure; maxParallel: number; shouldUnloadCachedEmbeddings: boolean }
export const DEFAULT_THRESHOLDS: Thresholds = { warn: 0.75, critical: 0.9, hysteresis: 0.05 };

export function parseNvidiaSmi(out: string): GpuSample | null {
  const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  let used = 0, total = 0, util = 0;
  for (const l of lines) {
    const [u, t, g] = l.split(",").map((x) => Number(x.trim()));
    if (![u, t].every(Number.isFinite) || t <= 0) return null;
    used += u; total += t; util = Math.max(util, Number.isFinite(g) ? g : 0);
  }
  return { memUsedMb: used, memTotalMb: total, utilPct: util };
}

export function readNvidiaSmi(timeoutMs = 4000): Promise<GpuSample | null> {
  return new Promise((resolve) => {
    execFile("nvidia-smi", ["--query-gpu=memory.used,memory.total,utilization.gpu", "--format=csv,noheader,nounits"], { timeout: timeoutMs, windowsHide: true }, (err, stdout) => resolve(err ? null : parseNvidiaSmi(String(stdout))));
  });
}

export async function readOllamaModels(fetchImpl: (url: string, init?: any) => Promise<any> = (globalThis as any).fetch, timeoutMs = 2000): Promise<number | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl("http://localhost:11434/api/ps", { signal: ctrl.signal });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data?.models) ? data.models.length : 0;
    } finally { clearTimeout(timer); }
  } catch { return null; }
}

export async function sampleGpu(opts: { ollama?: boolean; fetchImpl?: any } = {}): Promise<GpuSample | null> {
  const s = await readNvidiaSmi();
  if (!s) return null;
  if (opts.ollama) { const n = await readOllamaModels(opts.fetchImpl); if (n !== null) s.ollamaModels = n; }
  return s;
}

export function computeLevel(ratio: number, prev: Pressure, t: Thresholds = DEFAULT_THRESHOLDS): Pressure {
  const raw: Pressure = ratio >= t.critical ? "critical" : ratio >= t.warn ? "warn" : "ok";
  const rank = { ok: 0, warn: 1, critical: 2 };
  if (rank[raw] >= rank[prev]) return raw;
  const floor = prev === "critical" ? t.critical : t.warn;
  return ratio > floor - t.hysteresis ? prev : raw;
}

export function decide(level: Pressure, baseParallel = 4): ThrottleDecision {
  if (level === "critical") return { level, maxParallel: 1, shouldUnloadCachedEmbeddings: true };
  if (level === "warn") return { level, maxParallel: Math.max(1, Math.ceil(baseParallel / 2)), shouldUnloadCachedEmbeddings: true };
  return { level, maxParallel: baseParallel, shouldUnloadCachedEmbeddings: false };
}

export class ThrottleController {
  private level: Pressure = "ok";
  private last: { at: number; sample: GpuSample | null; decision: ThrottleDecision } | null = null;
  constructor(
    private sampler: () => Promise<GpuSample | null>,
    private opts: { thresholds?: Thresholds; baseParallel?: number; minIntervalMs?: number; now?: () => number } = {},
  ) {}
  async update(): Promise<ThrottleDecision> {
    const now = (this.opts.now ?? Date.now)();
    if (this.last && now - this.last.at < (this.opts.minIntervalMs ?? 0)) return this.last.decision;
    let sample: GpuSample | null = null;
    try { sample = await this.sampler(); } catch { sample = null; }
    if (sample && sample.memTotalMb > 0) this.level = computeLevel(sample.memUsedMb / sample.memTotalMb, this.level, this.opts.thresholds);
    else this.level = "ok";
    const decision = decide(this.level, this.opts.baseParallel ?? 4);
    this.last = { at: now, sample, decision };
    return decision;
  }
  get current(): ThrottleDecision { return this.last?.decision ?? decide("ok", this.opts.baseParallel ?? 4); }
  get lastSample(): GpuSample | null { return this.last?.sample ?? null; }
}

export class Limiter {
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(private max: number) {}
  setMax(n: number) { this.max = Math.max(1, Math.floor(n)); this.drain(); }
  get inFlight() { return this.active; }
  get queued() { return this.waiters.length; }
  acquire(): Promise<void> {
    if (this.active < this.max) { this.active++; return Promise.resolve(); }
    return new Promise((res) => this.waiters.push(res));
  }
  release(): void {
    if (this.active > 0) this.active--;
    this.drain();
  }
  private drain() {
    while (this.active < this.max && this.waiters.length) { this.active++; this.waiters.shift()!(); }
  }
}

const controller = new ThrottleController(() => sampleGpu({ ollama: true }), { minIntervalMs: 2000 });
export const limiter = new Limiter(4);

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  status: async () => {
    const decision = await controller.update();
    limiter.setMax(decision.maxParallel);
    return { ok: true, available: controller.lastSample !== null, sample: controller.lastSample, decision, inFlight: limiter.inFlight, queued: limiter.queued };
  },
  evaluate: async (a) => {
    const used = Number(a?.memUsedMb), total = Number(a?.memTotalMb);
    if (!Number.isFinite(used) || !(total > 0)) return { ok: false, message: "Ungültige Speicherwerte." };
    const level = computeLevel(used / total, a?.previous ?? "ok", a?.thresholds);
    return { ok: true, decision: decide(level, a?.baseParallel ?? 4) };
  },
};
