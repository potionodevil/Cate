/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
export const manifest = {
  id: "peerReview",
  name: "Peer Review Loop",
  version: "1.0.0",
  description: "Lässt ein zweites Modell Code/Diffs prüfen; Ausgabe wird gehalten, bis sie freigegeben ist oder die Runden erschöpft sind.",
  category: "multiagent" as const,
  configFields: [
    { key: "maxRounds", label: "Maximale Runden", type: "number" as const, default: 3 },
    { key: "blockingSeverity", label: "Blockierende Schwere ab", type: "select" as const, default: "high", options: ["low", "medium", "high", "critical"] },
    { key: "reviewerModel", label: "Reviewer-Modell", type: "string" as const, default: "" },
    { key: "focus", label: "Prüfschwerpunkte", type: "list" as const, default: ["Fehler", "Sicherheit", "Randfälle"] },
  ],
};

export type Severity = "none" | "low" | "medium" | "high" | "critical";
export interface Issue { severity: Severity; message: string; file?: string; line?: number; }
export interface ReviewVerdict { approved: boolean; severity: Severity; issues: Issue[]; parseError?: boolean; }
export type Result<T = {}> = ({ ok: true } & T) | { ok: false; message: string };

const SEV: Severity[] = ["none", "low", "medium", "high", "critical"];
const sevRank = (s: Severity) => SEV.indexOf(s);

export interface PromptInput { diff?: string; code?: string; language?: string; context?: string; focus?: string[]; maxChars?: number; }

export function buildPrompt(input: PromptInput): string {
  const body = String(input?.diff ?? input?.code ?? "");
  const max = input?.maxChars ?? 24000;
  const clipped = body.length > max ? body.slice(0, max) + "\n… [gekürzt]" : body;
  const kind = input?.diff ? "Diff" : "Code";
  const focus = (input?.focus?.length ? input.focus : ["Fehler", "Sicherheit", "Randfälle"]).join(", ");
  return [
    "Du bist ein strenger Code-Reviewer. Prüfe den folgenden " + kind + (input?.language ? ` (${input.language})` : "") + ".",
    `Schwerpunkte: ${focus}.`,
    input?.context ? `Kontext: ${input.context}` : "",
    "",
    "Antworte ausschließlich mit JSON im Format:",
    '{"approved": boolean, "severity": "none|low|medium|high|critical", "issues": [{"severity": "low|medium|high|critical", "message": "...", "file": "optional", "line": 0}]}',
    "Setze approved nur dann auf true, wenn keine Probleme der Schwere high oder critical vorliegen.",
    "",
    "```" + (input?.diff ? "diff" : input?.language ?? ""),
    clipped,
    "```",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

function normSev(v: any): Severity {
  const s = String(v ?? "").toLowerCase();
  if (s === "blocker" || s === "severe") return "critical";
  if (s === "major") return "high";
  if (s === "minor" || s === "info" || s === "nit") return "low";
  return (SEV as string[]).includes(s) ? (s as Severity) : "medium";
}

function maxSeverity(issues: Issue[]): Severity {
  return issues.reduce<Severity>((m, i) => (sevRank(i.severity) > sevRank(m) ? i.severity : m), "none");
}

function finalize(declaredApproved: boolean | undefined, declaredSeverity: Severity | undefined, issues: Issue[]): ReviewVerdict {
  const sev = maxSeverity(issues);
  const severity = sevRank(declaredSeverity ?? "none") > sevRank(sev) ? (declaredSeverity as Severity) : sev;
  const blocking = sevRank(severity) >= sevRank("high");
  const approved = (declaredApproved ?? issues.length === 0) && !blocking;
  return { approved, severity: approved && !issues.length ? "none" : severity, issues };
}

export function parseVerdict(output: string): ReviewVerdict {
  const text = String(output ?? "");
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) candidates.push(fence[1]);
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) candidates.push(text.slice(a, b + 1));
  for (const c of candidates) {
    try {
      const j = JSON.parse(c);
      if (j && typeof j === "object") {
        const issues: Issue[] = (Array.isArray(j.issues) ? j.issues : []).map((i: any) =>
          typeof i === "string" ? { severity: "medium" as Severity, message: i } : { severity: normSev(i?.severity), message: String(i?.message ?? i?.text ?? ""), ...(i?.file ? { file: String(i.file) } : {}), ...(Number.isFinite(i?.line) ? { line: Number(i.line) } : {}) });
        return finalize(typeof j.approved === "boolean" ? j.approved : undefined, j.severity ? normSev(j.severity) : undefined, issues.filter((i) => i.message));
      }
    } catch { /* weiter mit Textheuristik */ }
  }
  // Textheuristik
  const issues: Issue[] = [];
  for (const ln of text.split("\n")) {
    const m = /^\s*(?:[-*•]|\d+[.)])\s*(?:\[(\w+)\]|(critical|high|medium|low)\s*[:\-])\s*(.+)$/i.exec(ln);
    if (m) issues.push({ severity: normSev(m[1] ?? m[2]), message: m[3].trim() });
  }
  const approve = /\b(approved|lgtm|looks good|freigegeben|keine (?:probleme|beanstandungen))\b/i.test(text) && !/\b(not approved|nicht freigegeben|rejected|abgelehnt)\b/i.test(text);
  const reject = /\b(not approved|nicht freigegeben|rejected|abgelehnt|changes requested)\b/i.test(text);
  if (!issues.length && !approve && !reject) return { approved: false, severity: "medium", issues: [], parseError: true };
  return finalize(reject ? false : approve ? true : undefined, undefined, issues);
}

export function summarize(v: ReviewVerdict | { rounds: RoundRecord[] }): string {
  if ("rounds" in v) {
    const last = v.rounds[v.rounds.length - 1];
    if (!last) return "Keine Review-Runden.";
    return `${v.rounds.length} Runde(n); ${last.verdict.approved ? "freigegeben" : "nicht freigegeben"}; ${last.verdict.issues.length} offene(s) Problem(e).`;
  }
  if (v.parseError) return "Reviewer-Antwort nicht lesbar.";
  const counts = v.issues.reduce<Record<string, number>>((m, i) => ((m[i.severity] = (m[i.severity] ?? 0) + 1), m), {});
  const parts = Object.entries(counts).map(([k, n]) => `${n}× ${k}`).join(", ");
  return `${v.approved ? "Freigegeben" : "Nicht freigegeben"} (Schwere: ${v.severity})${parts ? " – " + parts : ""}.`;
}

export interface RoundRecord { round: number; verdict: ReviewVerdict; }
export interface LoopResult { ok: true; status: "approved" | "exhausted"; released: boolean; unresolved: boolean; output: string; rounds: RoundRecord[]; }

export class PeerReviewLoop {
  private maxRounds: number;
  constructor(private opts: { review: (prompt: string) => Promise<string>; revise: (issues: Issue[], current: string) => Promise<string>; maxRounds?: number; language?: string; focus?: string[]; isDiff?: boolean }) {
    this.maxRounds = Math.max(1, Math.floor(opts.maxRounds ?? 3));
  }
  /** Hält die Ausgabe zurück, bis ein Review sie freigibt oder alle Runden verbraucht sind (dann unresolved=true). */
  async run(initial: string): Promise<LoopResult | { ok: false; message: string }> {
    try {
      let current = String(initial ?? "");
      const rounds: RoundRecord[] = [];
      for (let r = 1; r <= this.maxRounds; r++) {
        const prompt = buildPrompt({ [this.opts.isDiff ? "diff" : "code"]: current, language: this.opts.language, focus: this.opts.focus });
        const verdict = parseVerdict(await this.opts.review(prompt));
        rounds.push({ round: r, verdict });
        if (verdict.approved) return { ok: true, status: "approved", released: true, unresolved: false, output: current, rounds };
        if (r < this.maxRounds) current = String(await this.opts.revise(verdict.issues, current));
      }
      return { ok: true, status: "exhausted", released: true, unresolved: true, output: current, rounds };
    } catch (e) { return { ok: false, message: `Peer-Review fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` }; }
  }
}

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  buildPrompt: async (a) => { try { return { ok: true, prompt: buildPrompt(a ?? {}) }; } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; } },
  parseVerdict: async (a) => { try { return { ok: true, verdict: parseVerdict(a?.output ?? "") }; } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; } },
  summarize: async (a) => {
    try {
      if (a?.rounds) return { ok: true, summary: summarize({ rounds: a.rounds }) };
      if (a?.verdict) return { ok: true, summary: summarize(a.verdict) };
      return { ok: false, message: "Verdict oder Runden fehlen." };
    } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
  },
};
