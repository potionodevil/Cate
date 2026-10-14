/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const built = new URL("../dist-electron/plugins/dexFeed.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const DEX = { pairs: [
  { chainId: "solana", pairAddress: "PAIR1", baseToken: { symbol: "BONK", address: "So11111111111111111111111111111111111111112" }, priceUsd: "0.00002", priceChange: { m5: 1.5, h1: -3, h24: 12 }, liquidity: { usd: 1000 }, volume: { h24: 5000 } },
  { chainId: "solana", pairAddress: "PAIR2", baseToken: { symbol: "BONK" }, priceUsd: "0.00003", priceChange: { h1: 2 }, liquidity: { usd: 90000 }, volume: { h24: 7 } },
] };
const okFetch = (payload, log = []) => async (url, init) => { log.push({ url, init }); return { ok: true, status: 200, json: async () => payload }; };
const ADDR = "So11111111111111111111111111111111111111112";

test("dexFeed: Manifest und Operationen", { skip }, () => {
  const m = load();
  assert.equal(m.manifest.id, "dexFeed");
  assert.equal(m.manifest.category, "web3");
  for (const k of ["quote", "search", "walletBalance", "evaluateAlerts", "contextBlock"]) assert.equal(typeof m.operations[k], "function");
});

test("dexFeed: quote normalisiert und sortiert nach Liquidität", { skip }, async () => {
  const m = load();
  const log = [];
  const r = await m.quote({}, ADDR, okFetch(DEX, log), 123);
  assert.equal(r.ok, true);
  assert.equal(log[0].url, `https://api.dexscreener.com/latest/dex/tokens/${ADDR}`);
  assert.equal(r.quote.pairAddress, "PAIR2");
  assert.equal(r.quote.priceUsd, 0.00003);
  assert.equal(r.quote.change5m, null);
  assert.equal(r.quote.ts, 123);
  assert.equal(r.pairs[1].change24h, 12);
});

test("dexFeed: search + Fehler ohne Wurf", { skip }, async () => {
  const m = load();
  const log = [];
  const s = await m.search({}, "bonk sol", okFetch(DEX, log));
  assert.equal(s.ok, true);
  assert.ok(log[0].url.endsWith("/latest/dex/search?q=bonk%20sol"));
  const bad = await m.quote({}, ADDR, async () => { throw new Error("netz kaputt"); });
  assert.equal(bad.ok, false);
  assert.equal((await m.quote({}, "../x", okFetch(DEX))).ok, false);
  assert.equal((await m.search({}, "", okFetch(DEX))).ok, false);
});

test("dexFeed: walletBalance per JSON-RPC", { skip }, async () => {
  const m = load();
  const calls = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, method: body.method });
    const result = body.method === "getBalance" ? { value: 2_500_000_000 }
      : { value: [{ account: { data: { parsed: { info: { mint: "MINT1", tokenAmount: { uiAmount: 5, decimals: 6 } } } } } }] };
    return { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, result }) };
  };
  const r = await m.walletBalance({ rpcUrl: "https://rpc.example/x" }, ADDR, f, 1);
  assert.equal(r.ok, true);
  assert.equal(r.balance.sol, 2.5);
  assert.deepEqual(r.balance.tokens, [{ mint: "MINT1", amount: 5, decimals: 6 }]);
  assert.deepEqual(calls.map((c) => c.method), ["getBalance", "getTokenAccountsByOwner"]);
  assert.equal(calls[0].url, "https://rpc.example/x");
  assert.equal((await m.walletBalance({}, "kein!", f)).ok, false);
});

test("dexFeed: AlertEngine mit Cooldown und Dedup", { skip }, () => {
  const m = load();
  let t = 0;
  const e = new m.AlertEngine([
    { id: "a", type: "priceAbove", symbol: "BONK", value: 1, cooldownMs: 1000 },
    { id: "b", type: "pctChange", symbol: "BONK", value: 10, window: "24h", cooldownMs: 1000 },
    { id: "c", type: "newPair", chain: "solana" },
    { id: "d", type: "balanceChange", minDelta: 0.1 },
  ], () => t);
  const q = (price, pair = "P1") => ({ symbol: "BONK", priceUsd: price, change5m: null, change1h: null, change24h: 15, liquidityUsd: 1, volume24h: 1, pairAddress: pair, chain: "solana", ts: t });
  const bal = (sol) => ({ address: "ADDR", sol, lamports: sol * 1e9, tokens: [], ts: t });
  let r = e.evaluate({ quotes: [q(2)], balances: [bal(1)] });
  assert.deepEqual(r.map((x) => x.ruleId).sort(), ["a", "b"]); // newPair beim ersten Lauf nur Baseline
  t = 500;
  assert.equal(e.evaluate({ quotes: [q(2)] }).length, 0); // Cooldown
  t = 1500;
  r = e.evaluate({ quotes: [q(2), q(2, "P2")], balances: [bal(1.5)] });
  assert.deepEqual(r.map((x) => x.ruleId).sort(), ["a", "b", "c", "d"]);
  t = 1600;
  assert.equal(e.evaluate({ quotes: [q(0.5, "P2")] }).length, 0); // priceBelow nicht konfiguriert, Dedup newPair
});

test("dexFeed: Operation evaluateAlerts + contextBlock", { skip }, async () => {
  const m = load();
  const q = { symbol: "SOL", priceUsd: 150, change5m: 1, change1h: 2, change24h: 3, liquidityUsd: 1e6, volume24h: 2e6, pairAddress: "p", chain: "solana", ts: 0 };
  const r = await m.operations.evaluateAlerts({ engineId: "t1", rules: [{ type: "priceBelow", symbol: "SOL", value: 200 }], snapshot: { quotes: [q] } });
  assert.equal(r.ok, true);
  assert.equal(r.alerts.length, 1);
  const c = await m.operations.contextBlock({ snapshot: { quotes: [q] }, alerts: r.alerts });
  assert.match(c.markdown, /Marktkontext/);
  assert.match(c.markdown, /\| SOL \| 150 \|/);
  assert.match(c.markdown, /Alerts:/);
});

test("dexFeed: Axiom-Provider nutzt Header und schwärzt Key", { skip }, async () => {
  const m = load();
  const log = [];
  const cfg = { provider: "axiom", axiomBaseUrl: "https://api.axiom.example/v1/", axiomApiKey: "SUPERSECRETKEY123", axiomHeader: "x-axiom-key" };
  const ok = await m.quote(cfg, ADDR, okFetch(DEX, log));
  assert.equal(ok.ok, true);
  assert.equal(log[0].url, `https://api.axiom.example/v1/tokens/${ADDR}`);
  assert.equal(log[0].init.headers["x-axiom-key"], "SUPERSECRETKEY123");
  const bad = await m.quote(cfg, ADDR, async () => { throw new Error("401 key=SUPERSECRETKEY123"); });
  assert.equal(bad.ok, false);
  assert.ok(!bad.message.includes("SUPERSECRETKEY123"));
  assert.equal((await m.quote({ provider: "axiom" }, ADDR, okFetch(DEX))).ok, false);
  assert.equal((await m.quote({ provider: "axiom", axiomBaseUrl: "http://x" }, ADDR, okFetch(DEX))).ok, false);
});

test("dexFeed: HTTP-Fehler und Timeout-Signal", { skip }, async () => {
  const m = load();
  let sig;
  const r = await m.quote({ timeoutMs: 50 }, ADDR, async (u, init) => { sig = init.signal; return { ok: false, status: 429, json: async () => ({}) }; });
  assert.equal(r.ok, false);
  assert.match(r.message, /429/);
  assert.ok(sig);
});
