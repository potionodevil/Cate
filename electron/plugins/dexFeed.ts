/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 *
 * DEX Live-Feed Connector: Dexscreener (öffentliche API), Solana-RPC (nur öffentliche
 * Adressen, lesend), AlertEngine und Markt-Kontextblock. Keine privaten Schlüssel.
 */
export const manifest = {
  id: "dexFeed",
  name: "DEX Live-Feed Connector",
  version: "1.0.0",
  description: "Preis- und Pair-Daten (Dexscreener), Solana-Wallet-Salden, Alerts und Marktkontext.",
  category: "web3" as const,
  configFields: [
    { key: "provider", label: "Provider", type: "select" as const, default: "dexscreener", options: ["dexscreener", "axiom"] },
    { key: "rpcUrl", label: "Solana RPC-URL", type: "string" as const, default: "https://api.mainnet-beta.solana.com" },
    { key: "axiomBaseUrl", label: "Axiom Basis-URL (selbst konfiguriert)", type: "string" as const, help: "Nur eine vom Nutzer lizenzierte/dokumentierte API. Kein Scraping privater Endpunkte." },
    { key: "axiomApiKey", label: "Axiom API-Key", type: "secret" as const },
    { key: "axiomHeader", label: "Axiom Header-Name", type: "string" as const, default: "x-api-key" },
    { key: "timeoutMs", label: "Timeout (ms)", type: "number" as const, default: 8000 },
  ],
};

export type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;
export interface FeedConfig {
  rpcUrl?: string;
  timeoutMs?: number;
  baseUrl?: string; // Dexscreener-Basis (Tests)
  axiomBaseUrl?: string;
  axiomApiKey?: string;
  axiomHeader?: string;
  provider?: "dexscreener" | "axiom";
}
export interface Quote {
  symbol: string; priceUsd: number | null; change5m: number | null; change1h: number | null; change24h: number | null;
  liquidityUsd: number | null; volume24h: number | null; pairAddress: string; chain: string; ts: number;
  address?: string; name?: string;
}

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const DEX_BASE = "https://api.dexscreener.com";

export function redact(text: string, config: FeedConfig = {}): string {
  let out = String(text);
  if (config.axiomApiKey) out = out.split(config.axiomApiKey).join("[geschwärzt]");
  out = out.replace(/(api[-_]?key|token|authorization)(["'\s:=]+)[A-Za-z0-9._~+/-]{8,}/gi, "$1$2[geschwärzt]");
  // API-Keys in RPC-URLs (z. B. ?api-key=... oder Pfad)
  out = out.replace(/([?&](?:api-?key|key|token)=)[^&\s]+/gi, "$1[geschwärzt]");
  return out;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export function normalizePair(p: any, now = Date.now()): Quote {
  return {
    symbol: String(p?.baseToken?.symbol ?? "?"),
    priceUsd: num(p?.priceUsd),
    change5m: num(p?.priceChange?.m5),
    change1h: num(p?.priceChange?.h1),
    change24h: num(p?.priceChange?.h24),
    liquidityUsd: num(p?.liquidity?.usd),
    volume24h: num(p?.volume?.h24),
    pairAddress: String(p?.pairAddress ?? ""),
    chain: String(p?.chainId ?? ""),
    ts: now,
    address: p?.baseToken?.address ? String(p.baseToken.address) : undefined,
    name: p?.baseToken?.name ? String(p.baseToken.name) : undefined,
  };
}

export function normalizePairs(json: any, now = Date.now()): Quote[] {
  const pairs: any[] = Array.isArray(json?.pairs) ? json.pairs : [];
  return pairs.map((p) => normalizePair(p, now)).sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
}

function isAddress(a: unknown): a is string {
  return typeof a === "string" && /^[A-Za-z0-9]{20,64}$/.test(a);
}

async function getJson(url: string, init: any, config: FeedConfig, fetchImpl: FetchLike): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeoutMs ?? 8000);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const gf = (): FetchLike => (globalThis as any).fetch;
const errMsg = (e: unknown, c: FeedConfig) => redact(e instanceof Error ? e.message : String(e), c);

/** Optionaler Axiom-Provider: nur vom Nutzer konfigurierte, dokumentierte Basis-URL. */
export function axiomRequest(config: FeedConfig, pathAndQuery: string): { url: string; init: any } | { error: string } {
  if (!config.axiomBaseUrl) return { error: "Axiom ist nicht konfiguriert (axiomBaseUrl fehlt)." };
  let u: URL;
  try { u = new URL(config.axiomBaseUrl); } catch { return { error: "Ungültige Axiom-URL." }; }
  if (u.protocol !== "https:") return { error: "Axiom-URL muss https verwenden." };
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.axiomApiKey) headers[config.axiomHeader || "x-api-key"] = config.axiomApiKey;
  return { url: config.axiomBaseUrl.replace(/\/+$/, "") + pathAndQuery, init: { method: "GET", headers } };
}

export async function quote(config: FeedConfig, address: string, fetchImpl: FetchLike = gf(), now = Date.now()): Promise<{ ok: true; quote: Quote | null; pairs: Quote[] } | { ok: false; message: string }> {
  try {
    if (!isAddress(address)) return { ok: false, message: "Ungültige Token-Adresse." };
    let url: string; let init: any = { headers: { Accept: "application/json" } };
    if (config.provider === "axiom") {
      const r = axiomRequest(config, `/tokens/${address}`);
      if ("error" in r) return { ok: false, message: r.error };
      url = r.url; init = r.init;
    } else url = `${config.baseUrl ?? DEX_BASE}/latest/dex/tokens/${address}`;
    const pairs = normalizePairs(await getJson(url, init, config, fetchImpl), now);
    return { ok: true, quote: pairs[0] ?? null, pairs };
  } catch (e) { return { ok: false, message: `Abfrage fehlgeschlagen: ${errMsg(e, config)}` }; }
}

export async function search(config: FeedConfig, query: string, fetchImpl: FetchLike = gf(), now = Date.now()): Promise<{ ok: true; results: Quote[] } | { ok: false; message: string }> {
  try {
    const q = String(query ?? "").trim();
    if (!q || q.length > 100) return { ok: false, message: "Suchbegriff fehlt oder ist zu lang." };
    let url: string; let init: any = { headers: { Accept: "application/json" } };
    if (config.provider === "axiom") {
      const r = axiomRequest(config, `/search?q=${encodeURIComponent(q)}`);
      if ("error" in r) return { ok: false, message: r.error };
      url = r.url; init = r.init;
    } else url = `${config.baseUrl ?? DEX_BASE}/latest/dex/search?q=${encodeURIComponent(q)}`;
    return { ok: true, results: normalizePairs(await getJson(url, init, config, fetchImpl), now).slice(0, 20) };
  } catch (e) { return { ok: false, message: `Suche fehlgeschlagen: ${errMsg(e, config)}` }; }
}

async function rpc(config: FeedConfig, method: string, params: unknown[], fetchImpl: FetchLike): Promise<any> {
  const url = config.rpcUrl || DEFAULT_RPC;
  if (!/^https?:\/\//.test(url)) throw new Error("Ungültige RPC-URL.");
  const j = await getJson(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }, config, fetchImpl);
  if (j?.error) throw new Error(`RPC-Fehler: ${j.error.message ?? "unbekannt"}`);
  return j?.result;
}

export interface WalletBalance { address: string; sol: number; lamports: number; tokens: Array<{ mint: string; amount: number; decimals: number }>; ts: number }

export async function walletBalance(config: FeedConfig, address: string, fetchImpl: FetchLike = gf(), now = Date.now()): Promise<{ ok: true; balance: WalletBalance } | { ok: false; message: string }> {
  try {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(address ?? ""))) return { ok: false, message: "Ungültige öffentliche Solana-Adresse." };
    const bal = await rpc(config, "getBalance", [address], fetchImpl);
    const lamports = Number(bal?.value ?? 0);
    const tk = await rpc(config, "getTokenAccountsByOwner", [address, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }], fetchImpl);
    const tokens = (Array.isArray(tk?.value) ? tk.value : []).map((v: any) => {
      const info = v?.account?.data?.parsed?.info;
      return { mint: String(info?.mint ?? ""), amount: Number(info?.tokenAmount?.uiAmount ?? 0), decimals: Number(info?.tokenAmount?.decimals ?? 0) };
    }).filter((t: any) => t.mint);
    return { ok: true, balance: { address, lamports, sol: lamports / 1e9, tokens, ts: now } };
  } catch (e) { return { ok: false, message: `RPC fehlgeschlagen: ${errMsg(e, config)}` }; }
}

// ---------- Alerts ----------
export type AlertRule =
  | { id?: string; type: "priceAbove"; symbol: string; value: number; cooldownMs?: number }
  | { id?: string; type: "priceBelow"; symbol: string; value: number; cooldownMs?: number }
  | { id?: string; type: "pctChange"; symbol: string; value: number; window?: "5m" | "1h" | "24h"; cooldownMs?: number }
  | { id?: string; type: "newPair"; chain?: string; minLiquidityUsd?: number; cooldownMs?: number }
  | { id?: string; type: "balanceChange"; address?: string; minDelta?: number; cooldownMs?: number };

export interface Snapshot { quotes?: Quote[]; balances?: WalletBalance[] }
export interface TriggeredAlert { ruleId: string; type: string; message: string; ts: number }

export class AlertEngine {
  private lastFired = new Map<string, number>();
  private seenPairs = new Set<string>();
  private lastBalances = new Map<string, number>();
  private primed = false;
  private rules: Array<AlertRule & { id: string }> = [];
  constructor(rules: AlertRule[] = [], private now: () => number = Date.now, private defaultCooldownMs = 60_000) { this.setRules(rules); }
  setRules(rules: AlertRule[]) {
    this.rules = (rules ?? []).map((r, i) => ({ ...r, id: r.id ?? `${r.type}-${i}` }) as any);
  }
  private cooled(id: string, ms: number): boolean {
    const t = this.now();
    const last = this.lastFired.get(id);
    if (last !== undefined && t - last < ms) return false;
    this.lastFired.set(id, t);
    return true;
  }
  evaluate(snap: Snapshot): TriggeredAlert[] {
    const out: TriggeredAlert[] = [];
    const t = this.now();
    const quotes = snap?.quotes ?? [];
    const fire = (r: AlertRule & { id: string }, key: string, message: string) => {
      if (this.cooled(key, r.cooldownMs ?? this.defaultCooldownMs)) out.push({ ruleId: r.id, type: r.type, message, ts: t });
    };
    for (const r of this.rules) {
      if (r.type === "priceAbove" || r.type === "priceBelow" || r.type === "pctChange") {
        for (const q of quotes) {
          if (q.symbol.toLowerCase() !== r.symbol.toLowerCase()) continue;
          if (r.type === "priceAbove" && q.priceUsd !== null && q.priceUsd > r.value) fire(r, r.id, `${q.symbol} über ${r.value} USD (aktuell ${q.priceUsd}).`);
          else if (r.type === "priceBelow" && q.priceUsd !== null && q.priceUsd < r.value) fire(r, r.id, `${q.symbol} unter ${r.value} USD (aktuell ${q.priceUsd}).`);
          else if (r.type === "pctChange") {
            const w = r.window ?? "1h";
            const c = w === "5m" ? q.change5m : w === "24h" ? q.change24h : q.change1h;
            if (c !== null && Math.abs(c) >= Math.abs(r.value)) fire(r, r.id, `${q.symbol} ${c > 0 ? "+" : ""}${c}% in ${w}.`);
          }
        }
      } else if (r.type === "newPair") {
        for (const q of quotes) {
          if (r.chain && q.chain !== r.chain) continue;
          if (r.minLiquidityUsd && (q.liquidityUsd ?? 0) < r.minLiquidityUsd) continue;
          const k = `${q.chain}:${q.pairAddress}`;
          if (!q.pairAddress) continue;
          if (this.primed && !this.seenPairs.has(k)) fire(r, `${r.id}:${k}`, `Neues Pair ${q.symbol} (${q.chain}) ${q.pairAddress}.`);
        }
      } else if (r.type === "balanceChange") {
        for (const b of snap?.balances ?? []) {
          if (r.address && r.address !== b.address) continue;
          const prev = this.lastBalances.get(b.address);
          if (prev !== undefined && Math.abs(b.sol - prev) >= (r.minDelta ?? 0.000001)) {
            fire(r, `${r.id}:${b.address}`, `Saldo ${b.address.slice(0, 4)}…${b.address.slice(-4)}: ${prev} → ${b.sol} SOL.`);
          }
        }
      }
    }
    for (const q of quotes) if (q.pairAddress) this.seenPairs.add(`${q.chain}:${q.pairAddress}`);
    for (const b of snap?.balances ?? []) this.lastBalances.set(b.address, b.sol);
    this.primed = true;
    return out;
  }
}

const fmt = (n: number | null, d = 4) => n === null ? "–" : n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : String(+n.toFixed(d));
const pct = (n: number | null) => n === null ? "–" : `${n > 0 ? "+" : ""}${n}%`;

export function buildContextBlock(snap: Snapshot, alerts: TriggeredAlert[] = [], now = Date.now()): string {
  const lines = [`### Marktkontext (${new Date(now).toISOString()})`];
  const qs = (snap?.quotes ?? []).slice(0, 10);
  if (qs.length) {
    lines.push("", "| Symbol | Preis USD | 5m | 1h | 24h | Liquidität | Vol 24h | Chain |", "|---|---|---|---|---|---|---|---|");
    for (const q of qs) lines.push(`| ${q.symbol} | ${fmt(q.priceUsd, 8)} | ${pct(q.change5m)} | ${pct(q.change1h)} | ${pct(q.change24h)} | ${fmt(q.liquidityUsd)} | ${fmt(q.volume24h)} | ${q.chain} |`);
  }
  for (const b of snap?.balances ?? []) lines.push("", `Wallet ${b.address.slice(0, 4)}…${b.address.slice(-4)}: ${fmt(b.sol, 4)} SOL, ${b.tokens.length} Token-Konten.`);
  if (alerts.length) { lines.push("", "Alerts:"); for (const a of alerts) lines.push(`- ${a.message}`); }
  if (lines.length === 1) lines.push("", "Keine Daten.");
  lines.push("", "_Nur Information, keine Anlageberatung._");
  return lines.join("\n");
}

const engines = new Map<string, AlertEngine>();

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  quote: async (a) => quote(a?.config ?? {}, a?.address),
  search: async (a) => search(a?.config ?? {}, a?.query),
  walletBalance: async (a) => walletBalance(a?.config ?? {}, a?.address),
  evaluateAlerts: async (a) => {
    try {
      const key = String(a?.engineId ?? "default");
      let e = engines.get(key);
      if (!e || a?.rules) { const old = e; e = new AlertEngine(a?.rules ?? [], Date.now, a?.cooldownMs); if (old && !a?.reset) { /* neue Regeln, frischer Zustand */ } engines.set(key, e); }
      return { ok: true, alerts: e.evaluate(a?.snapshot ?? {}) };
    } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
  },
  contextBlock: async (a) => {
    try { return { ok: true, markdown: buildContextBlock(a?.snapshot ?? {}, a?.alerts ?? []) }; }
    catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
  },
};
