/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
export const manifest = {
  id: "taskSync",
  name: "Notion & Jira Sync",
  version: "1.0.0",
  description: "Legt am Sitzungsende Task-Karten in Notion oder Jira an.",
};

export interface SessionSummary {
  title: string;
  status?: string;
  summary: string;
}
export interface NotionConfig { token: string; databaseId: string; titleProperty?: string; statusProperty?: string; summaryProperty?: string }
export interface JiraConfig { baseUrl: string; email: string; apiToken: string; projectKey: string; issueType?: string }
export type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function buildNotionPayload(cfg: Pick<NotionConfig, "databaseId" | "titleProperty" | "statusProperty" | "summaryProperty">, s: SessionSummary) {
  return {
    parent: { database_id: cfg.databaseId },
    properties: {
      [cfg.titleProperty ?? "Name"]: { title: [{ text: { content: clip(s.title, 200) } }] },
      [cfg.statusProperty ?? "Status"]: { select: { name: s.status ?? "Done" } },
      [cfg.summaryProperty ?? "Summary"]: { rich_text: [{ text: { content: clip(s.summary, 1900) } }] },
    },
  };
}

export function buildAdf(text: string) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return {
    type: "doc",
    version: 1,
    content: (paragraphs.length ? paragraphs : [""]).map((p) => (p ? { type: "paragraph", content: [{ type: "text", text: clip(p, 8000) }] } : { type: "paragraph", content: [] })),
  };
}

export function buildJiraPayload(cfg: Pick<JiraConfig, "projectKey" | "issueType">, s: SessionSummary) {
  return {
    fields: {
      project: { key: cfg.projectKey },
      summary: clip(s.title.replace(/\s+/g, " "), 250),
      issuetype: { name: cfg.issueType ?? "Task" },
      description: buildAdf(s.summary),
    },
  };
}

export function jiraAuthHeader(email: string, apiToken: string): string {
  return "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
}

function scrub(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("[geschwärzt]");
  return out;
}

async function post(url: string, headers: Record<string, string>, body: unknown, fetchImpl: FetchLike, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    let data: any = null;
    try { data = await res.json(); } catch { /* leer */ }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function createNotionTask(cfg: NotionConfig, s: SessionSummary, fetchImpl: FetchLike = (globalThis as any).fetch) {
  try {
    if (!cfg?.token || !cfg.databaseId) return { ok: false as const, message: "Notion-Token und Datenbank-ID erforderlich." };
    const r = await post("https://api.notion.com/v1/pages", { Authorization: `Bearer ${cfg.token}`, "Notion-Version": "2022-06-28" }, buildNotionPayload(cfg, s), fetchImpl);
    if (!r.ok) return { ok: false as const, message: `Notion-Fehler (HTTP ${r.status}).` };
    return { ok: true as const, id: r.data?.id as string | undefined, url: r.data?.url as string | undefined };
  } catch (e) {
    return { ok: false as const, message: scrub(e instanceof Error ? e.message : String(e), [cfg?.token]) };
  }
}

export async function createJiraIssue(cfg: JiraConfig, s: SessionSummary, fetchImpl: FetchLike = (globalThis as any).fetch) {
  try {
    if (!cfg?.baseUrl || !cfg.email || !cfg.apiToken || !cfg.projectKey) return { ok: false as const, message: "Jira-Konfiguration unvollständig." };
    let base: URL;
    try { base = new URL(cfg.baseUrl); } catch { return { ok: false as const, message: "Ungültige Jira-URL." }; }
    if (base.protocol !== "https:" && base.protocol !== "http:") return { ok: false as const, message: "Ungültige Jira-URL." };
    const url = base.origin + base.pathname.replace(/\/+$/, "") + "/rest/api/3/issue";
    const r = await post(url, { Authorization: jiraAuthHeader(cfg.email, cfg.apiToken), Accept: "application/json" }, buildJiraPayload(cfg, s), fetchImpl);
    if (!r.ok) return { ok: false as const, message: `Jira-Fehler (HTTP ${r.status}).` };
    return { ok: true as const, key: r.data?.key as string | undefined, id: r.data?.id as string | undefined };
  } catch (e) {
    return { ok: false as const, message: scrub(e instanceof Error ? e.message : String(e), [cfg?.apiToken, cfg?.email]) };
  }
}

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  notion: async (a) => createNotionTask(a?.config, a?.session),
  jira: async (a) => createJiraIssue(a?.config, a?.session),
  previewNotion: async (a) => ({ ok: true, payload: buildNotionPayload(a?.config ?? { databaseId: "" }, a?.session) }),
  previewJira: async (a) => ({ ok: true, payload: buildJiraPayload(a?.config ?? { projectKey: "" }, a?.session) }),
};
