/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
export const manifest = {
  id: "agentRouter",
  name: "Specialized Agent Router",
  version: "1.0.0",
  description: "Klassifiziert Aufgaben und leitet sie an das passende Modell (Cloud oder lokal) mit Fallback-Kette weiter.",
  category: "multiagent" as const,
  configFields: [
    { key: "maxCostTier", label: "Maximale Kostenstufe", type: "select" as const, default: "high", options: ["free", "low", "medium", "high"] },
    { key: "preferLocal", label: "Lokale Modelle bevorzugen", type: "boolean" as const, default: false },
    { key: "routes", label: "Routen-Tabelle (JSON)", type: "list" as const, default: [], help: "Überschreibt die Standardrouten." },
  ],
};

export type TaskClass = "architecture" | "refactor" | "syntax" | "debugging" | "docs" | "tests" | "general";
export type CostTier = "free" | "low" | "medium" | "high";
export interface Route { taskClass: TaskClass; provider: string; model: string; maxContextTokens: number; costTier: CostTier; }
export interface TaskInput { text: string; codeSize?: number; fileCount?: number; }
export interface Classification { taskClass: TaskClass; scores: Record<string, number>; confidence: number; estimatedTokens: number; }
export type Result<T = {}> = ({ ok: true } & T) | { ok: false; message: string };
export type AvailabilityFn = (route: Route) => boolean | Promise<boolean>;

export const TASK_CLASSES: TaskClass[] = ["architecture", "refactor", "syntax", "debugging", "docs", "tests", "general"];
const COST_RANK: Record<CostTier, number> = { free: 0, low: 1, medium: 2, high: 3 };

export const DEFAULT_ROUTES: Route[] = [
  { taskClass: "architecture", provider: "anthropic", model: "claude-opus", maxContextTokens: 200000, costTier: "high" },
  { taskClass: "architecture", provider: "anthropic", model: "claude-sonnet", maxContextTokens: 200000, costTier: "medium" },
  { taskClass: "architecture", provider: "ollama", model: "qwen2.5-coder:32b", maxContextTokens: 32000, costTier: "free" },
  { taskClass: "refactor", provider: "ollama", model: "qwen2.5-coder:14b", maxContextTokens: 32000, costTier: "free" },
  { taskClass: "refactor", provider: "anthropic", model: "claude-sonnet", maxContextTokens: 200000, costTier: "medium" },
  { taskClass: "syntax", provider: "ollama", model: "gemma3:4b", maxContextTokens: 8000, costTier: "free" },
  { taskClass: "syntax", provider: "ollama", model: "qwen2.5-coder:14b", maxContextTokens: 32000, costTier: "free" },
  { taskClass: "syntax", provider: "anthropic", model: "claude-haiku", maxContextTokens: 200000, costTier: "low" },
  { taskClass: "debugging", provider: "anthropic", model: "claude-sonnet", maxContextTokens: 200000, costTier: "medium" },
  { taskClass: "debugging", provider: "ollama", model: "qwen2.5-coder:14b", maxContextTokens: 32000, costTier: "free" },
  { taskClass: "docs", provider: "ollama", model: "gemma3:12b", maxContextTokens: 16000, costTier: "free" },
  { taskClass: "docs", provider: "anthropic", model: "claude-haiku", maxContextTokens: 200000, costTier: "low" },
  { taskClass: "tests", provider: "ollama", model: "qwen2.5-coder:14b", maxContextTokens: 32000, costTier: "free" },
  { taskClass: "tests", provider: "anthropic", model: "claude-sonnet", maxContextTokens: 200000, costTier: "medium" },
  { taskClass: "general", provider: "anthropic", model: "claude-sonnet", maxContextTokens: 200000, costTier: "medium" },
  { taskClass: "general", provider: "ollama", model: "qwen2.5-coder:14b", maxContextTokens: 32000, costTier: "free" },
];

const KEYWORDS: Record<Exclude<TaskClass, "general">, Array<[RegExp, number]>> = {
  architecture: [[/\b(architektur|architecture|design|entwurf|konzept|system ?design|modulstruktur|trade-?offs?|skalier\w*|scalab\w*|schnittstelle|api design|migration plan|roadmap)\b/i, 3], [/\b(plan\w*|struktur|pattern|microservice\w*)\b/i, 1]],
  refactor: [[/\b(refactor\w*|umbauen|aufräumen|restructur\w*|umstrukturier\w*|extract (method|function)|rename|umbenennen|vereinfach\w*|simplif\w*|clean ?up|deduplic\w*)\b/i, 3], [/\b(modular\w*|split|aufteilen)\b/i, 1]],
  syntax: [[/\b(syntax\w*|lint\w*|eslint|prettier|tsc|typo|tippfehler|format\w*|compile error|kompilierfehler|missing (semicolon|bracket)|klammer\w*|semikolon)\b/i, 3], [/\b(style|einrückung|indent\w*)\b/i, 1]],
  debugging: [[/\b(bug|debug\w*|fehler|error|exception|crash\w*|stack ?trace|traceback|fehlersuche|regression|funktioniert nicht|doesn'?t work|fails?|failing|race condition|deadlock|null ?pointer|undefined)\b/i, 3], [/\b(warum|why|reproduc\w*|reproduzier\w*)\b/i, 1]],
  docs: [[/\b(docs?|dokumentation|documentation|readme|docstring|jsdoc|kommentar\w*|comment\w*|changelog|erkläre?\w*|explain|beschreib\w*)\b/i, 3]],
  tests: [[/\b(tests?|unit ?tests?|testfälle|test ?cases?|spec|coverage|testabdeckung|jest|vitest|pytest|mocha|mock\w*|assert\w*)\b/i, 3], [/\b(schreibe? tests?|write tests?)\b/i, 2]],
};

export const estimateTokens = (chars: number) => Math.ceil(Math.max(0, chars) / 4);

export function classify(task: TaskInput | string): Classification {
  const t: TaskInput = typeof task === "string" ? { text: task } : task ?? { text: "" };
  const text = String(t.text ?? "");
  const scores: Record<string, number> = {};
  for (const c of TASK_CLASSES) scores[c] = 0;
  for (const [cls, list] of Object.entries(KEYWORDS)) {
    for (const [re, w] of list) {
      const g = new RegExp(re.source, "gi");
      const n = (text.match(g) ?? []).length;
      scores[cls] += Math.min(n, 3) * w;
    }
  }
  const size = (t.codeSize ?? 0) + text.length;
  const files = t.fileCount ?? 0;
  // Größen-Gewichtung: viele Dateien -> Architektur/Refactor, kleine Schnipsel -> Syntax
  if (files >= 8) { scores.architecture += 2; scores.refactor += 1; }
  else if (files >= 3) scores.refactor += 1;
  if (size > 40000) scores.architecture += 1;
  if ((t.codeSize ?? 0) > 0 && (t.codeSize ?? 0) < 600 && scores.syntax > 0) scores.syntax += 1;
  if (/```/.test(text) && scores.debugging > 0) scores.debugging += 1;
  let best: TaskClass = "general";
  let top = 0;
  for (const c of TASK_CLASSES) if (c !== "general" && scores[c] > top) { top = scores[c]; best = c; }
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  return { taskClass: top > 0 ? best : "general", scores, confidence: top > 0 && total > 0 ? Math.round((top / total) * 100) / 100 : 0, estimatedTokens: estimateTokens(size) };
}

export function validateRoute(r: any): r is Route {
  return !!r && TASK_CLASSES.includes(r.taskClass) && typeof r.provider === "string" && !!r.provider && typeof r.model === "string" && !!r.model
    && Number.isFinite(r.maxContextTokens) && r.maxContextTokens > 0 && r.costTier in COST_RANK;
}

export interface RouteOptions { routes?: Route[]; isAvailable?: AvailabilityFn; maxCostTier?: CostTier; preferLocal?: boolean; unavailableProviders?: string[]; }
export interface RouteDecision { taskClass: TaskClass; selected: Route; chain: Route[]; skipped: Array<{ route: Route; reason: string }>; classification: Classification; }

const isLocal = (r: Route) => /^(ollama|lmstudio|llamacpp|local)/i.test(r.provider);

export async function route(task: TaskInput | string, opts: RouteOptions = {}): Promise<Result<RouteDecision>> {
  try {
    const cl = classify(task);
    const table = (opts.routes && opts.routes.length ? opts.routes : DEFAULT_ROUTES).filter(validateRoute);
    let chain = table.filter((r) => r.taskClass === cl.taskClass);
    if (!chain.length && cl.taskClass !== "general") chain = table.filter((r) => r.taskClass === "general");
    if (opts.preferLocal) chain = [...chain.filter(isLocal), ...chain.filter((r) => !isLocal(r))];
    if (!chain.length) return { ok: false, message: "Keine Route für diese Aufgabenklasse konfiguriert." };
    const maxTier = COST_RANK[opts.maxCostTier ?? "high"] ?? 3;
    const down = new Set((opts.unavailableProviders ?? []).map((p) => p.toLowerCase()));
    const skipped: RouteDecision["skipped"] = [];
    for (const r of chain) {
      if (COST_RANK[r.costTier] > maxTier) { skipped.push({ route: r, reason: "Kostenstufe zu hoch" }); continue; }
      if (r.maxContextTokens < cl.estimatedTokens) { skipped.push({ route: r, reason: "Kontextfenster zu klein" }); continue; }
      if (down.has(r.provider.toLowerCase())) { skipped.push({ route: r, reason: "Anbieter nicht verfügbar" }); continue; }
      if (opts.isAvailable) {
        let ok = false;
        try { ok = await opts.isAvailable(r); } catch { ok = false; }
        if (!ok) { skipped.push({ route: r, reason: "Modell nicht verfügbar" }); continue; }
      }
      return { ok: true, taskClass: cl.taskClass, selected: r, chain, skipped, classification: cl };
    }
    return { ok: false, message: `Kein verfügbares Modell für '${cl.taskClass}' (${skipped.length} Routen übersprungen).` };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
}

/** Fügt eine Route hinzu bzw. ersetzt (taskClass+provider+model). Mit position wird die Priorität gesetzt. Gibt neue Tabelle zurück. */
export function setRoute(routes: Route[] | undefined, r: Route, position?: "first" | "last"): Result<{ routes: Route[] }> {
  if (!validateRoute(r)) return { ok: false, message: "Ungültige Route (taskClass, provider, model, maxContextTokens, costTier erforderlich)." };
  const base = (routes && routes.length ? routes : DEFAULT_ROUTES).filter((x) => !(x.taskClass === r.taskClass && x.provider === r.provider && x.model === r.model));
  const entry = { taskClass: r.taskClass, provider: r.provider, model: r.model, maxContextTokens: r.maxContextTokens, costTier: r.costTier };
  if (position === "first") {
    const i = base.findIndex((x) => x.taskClass === r.taskClass);
    base.splice(i < 0 ? base.length : i, 0, entry);
  } else base.push(entry);
  return { ok: true, routes: base };
}

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  classify: async (a) => { try { return { ok: true, ...classify(a?.task ?? a?.text ?? "") }; } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; } },
  route: async (a) => route(a?.task ?? a?.text ?? "", { routes: a?.routes, maxCostTier: a?.maxCostTier, preferLocal: a?.preferLocal, unavailableProviders: a?.unavailableProviders }),
  getRoutes: async (a) => ({ ok: true, routes: a?.routes && a.routes.length ? a.routes : DEFAULT_ROUTES, taskClasses: TASK_CLASSES }),
  setRoute: async (a) => setRoute(a?.routes, a?.route, a?.position),
};
