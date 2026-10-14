/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
export type ContextKind = "file" | "clipboard" | "text";
export interface ContextMetadata { [key: string]: string | number | boolean | undefined; }
export interface ContextPayload { kind: ContextKind; metadata: ContextMetadata; raw: string; }
export type ContextResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

const DEFAULT_TOKEN_LIMIT = 32_000;
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_SESSIONS = 256;

interface StoredContext {
  payload: ContextPayload;
  updatedAt: number;
}

const sessions = new Map<string, StoredContext[]>();

function error(code: string, message: string): ContextResult<never> {
  return { ok: false, error: { code, message } };
}

export function injectContext(
  sessionId: string,
  payload: ContextPayload,
  tokenLimit = DEFAULT_TOKEN_LIMIT
): ContextResult<{ sessionId: string; context: ContextPayload; tokenCount: number }> {
  if (!sessionId.trim()) return error("INVALID_SESSION", "A session ID is required.");
  if (!payload?.kind || typeof payload.raw !== "string") return error("INVALID_PAYLOAD", "Context kind and raw content are required.");
  if (payload.raw.length > tokenLimit * APPROX_CHARS_PER_TOKEN) return error("TOKEN_LIMIT_EXCEEDED", "Context exceeds the session token limit.");

  const list = sessions.get(sessionId) ?? [];
  list.push({ payload: { ...payload, metadata: { ...payload.metadata } }, updatedAt: Date.now() });
  sessions.set(sessionId, list);
  while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value as string);
  return { ok: true, value: { sessionId, context: payload, tokenCount: Math.ceil(payload.raw.length / APPROX_CHARS_PER_TOKEN) } };
}

export function getSessionContext(sessionId: string): ContextPayload[] {
  return (sessions.get(sessionId) ?? []).map(({ payload }) => ({ ...payload, metadata: { ...payload.metadata } }));
}

export function clearSessionContext(sessionId: string): void {
  sessions.delete(sessionId);
}

export function makeContextPayload(kind: ContextPayload["kind"], raw: string, metadata: ContextMetadata = {}): ContextPayload {
  return { kind, metadata, raw };
}
