/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
export const manifest = {
  id: "notifier",
  name: "Webhook & Chat Notifier",
  version: "1.0.0",
  description: "Sendet Agent-Statusereignisse an Webhook, Discord oder Telegram.",
};

export type NotifyEventType = "build_failed" | "task_done" | "custom";
export interface NotifyEvent {
  type: NotifyEventType | string;
  title: string;
  message?: string;
}
export interface NotifierConfig {
  webhookUrl?: string;
  discordWebhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  allowedTypes?: string[];
  maxPerMinute?: number;
  timeoutMs?: number;
}
export type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number }>;
export type Result<T = {}> = ({ ok: true } & T) | { ok: false; message: string };

export function redactSecrets(text: string, config: NotifierConfig): string {
  let out = String(text);
  const secrets = [config.telegramBotToken, config.discordWebhookUrl, config.webhookUrl].filter((s): s is string => !!s);
  for (const s of secrets) out = out.split(s).join("[geschwärzt]");
  out = out.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[geschwärzt]");
  out = out.replace(/(discord(?:app)?\.com\/api\/webhooks\/\d+\/)[\w-]+/g, "$1[geschwärzt]");
  return out;
}

export function eventAllowed(event: NotifyEvent, allowedTypes?: string[]): boolean {
  if (!allowedTypes || allowedTypes.length === 0) return true;
  return allowedTypes.includes(event.type);
}

export function formatEventText(event: NotifyEvent): string {
  const label = event.type === "build_failed" ? "Build fehlgeschlagen" : event.type === "task_done" ? "Aufgabe erledigt" : "Hinweis";
  return `[${label}] ${event.title}${event.message ? `\n${event.message}` : ""}`.slice(0, 1900);
}

export function buildWebhookPayload(event: NotifyEvent, now = Date.now()) {
  return { type: event.type, title: event.title, message: event.message ?? "", text: formatEventText(event), timestamp: new Date(now).toISOString() };
}
export function buildDiscordPayload(event: NotifyEvent) {
  return { content: formatEventText(event), allowed_mentions: { parse: [] as string[] } };
}
export function buildTelegramRequest(config: NotifierConfig, event: NotifyEvent) {
  return {
    url: `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
    body: { chat_id: config.telegramChatId, text: formatEventText(event), disable_web_page_preview: true },
  };
}

export class RateLimiter {
  private stamps: number[] = [];
  constructor(private max: number, private now: () => number = Date.now) {}
  tryAcquire(): boolean {
    const t = this.now();
    this.stamps = this.stamps.filter((s) => t - s < 60_000);
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(t);
    return true;
  }
}

function isHttpUrl(u: string): boolean {
  try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; }
}

async function postJson(url: string, body: unknown, config: NotifierConfig, fetchImpl: FetchLike): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeoutMs ?? 8000);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

const limiters = new Map<string, RateLimiter>();

export async function sendNotification(
  config: NotifierConfig,
  event: NotifyEvent,
  fetchImpl: FetchLike = (globalThis as any).fetch,
  limiter?: RateLimiter,
): Promise<Result<{ sent: string[]; errors: string[] }> | { ok: false; message: string }> {
  try {
    if (!event || !event.title) return { ok: false, message: "Ereignis benötigt einen Titel." };
    if (!eventAllowed(event, config.allowedTypes)) return { ok: false, message: "Ereignistyp ist gefiltert." };
    const lim = limiter ?? (limiters.get("default") ?? (limiters.set("default", new RateLimiter(config.maxPerMinute ?? 10)), limiters.get("default")!));
    if (!lim.tryAcquire()) return { ok: false, message: "Ratenlimit erreicht." };
    const jobs: Array<[string, string, unknown]> = [];
    if (config.webhookUrl) {
      if (!isHttpUrl(config.webhookUrl)) return { ok: false, message: "Ungültige Webhook-URL." };
      jobs.push(["webhook", config.webhookUrl, buildWebhookPayload(event)]);
    }
    if (config.discordWebhookUrl) {
      if (!isHttpUrl(config.discordWebhookUrl)) return { ok: false, message: "Ungültige Discord-URL." };
      jobs.push(["discord", config.discordWebhookUrl, buildDiscordPayload(event)]);
    }
    if (config.telegramBotToken && config.telegramChatId) {
      const r = buildTelegramRequest(config, event);
      jobs.push(["telegram", r.url, r.body]);
    }
    if (jobs.length === 0) return { ok: false, message: "Kein Ziel konfiguriert." };
    const sent: string[] = [];
    const errors: string[] = [];
    for (const [name, url, body] of jobs) {
      try {
        await postJson(url, body, config, fetchImpl);
        sent.push(name);
      } catch (e) {
        errors.push(`${name}: ${redactSecrets(e instanceof Error ? e.message : String(e), config)}`);
      }
    }
    if (sent.length === 0) return { ok: false, message: errors.join("; ") };
    return { ok: true, sent, errors };
  } catch (e) {
    return { ok: false, message: redactSecrets(e instanceof Error ? e.message : String(e), config) };
  }
}

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  send: async (a) => sendNotification(a?.config ?? {}, a?.event),
  preview: async (a) => ({ ok: true, text: formatEventText(a?.event ?? { type: "custom", title: "" }) }),
};
