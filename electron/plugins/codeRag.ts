/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export type PluginOp = (args: any) => Promise<unknown>;
export interface PluginFail { ok: false; message: string }

function resolveInside(root: string, p: string): string {
  if (!root || typeof root !== "string") throw new Error("projectRoot fehlt.");
  const base = path.resolve(root);
  const full = path.resolve(base, String(p ?? ""));
  const rel = path.relative(base, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Pfad liegt außerhalb des Projektordners.");
  return full;
}

function wrap(fn: (args: any) => Promise<unknown>): PluginOp {
  return async (args: any) => {
    try { return await fn(args ?? {}); }
    catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) } as PluginFail; }
  };
}

export const manifest = { id: "codeRag", name: "Vector Code-RAG", version: "1.0.0", description: "Lokaler Code-Index mit Hashing-Embeddings und Cosinus-Suche; optional Chroma/Qdrant." };

export const DIM = 256;
const CHUNK_LINES = 40;
const OVERLAP = 10;
const MAX_FILE_BYTES = 512 * 1024;
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "dist-electron", "build", "out", "target", ".next", ".venv", "venv", "__pycache__", "coverage", ".idea", ".vscode"]);
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rs", ".go", ".java", ".c", ".h", ".cpp", ".hpp", ".cs", ".rb", ".php", ".md", ".json", ".css", ".scss", ".html", ".yml", ".yaml", ".toml", ".sh", ".sql"]);

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.match(/[A-Za-z_][A-Za-z0-9_]*|\d+/g) ?? []) {
    const parts = raw.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[_\s]+/).filter(Boolean).map((p) => p.toLowerCase());
    if (parts.length > 1) out.push(raw.toLowerCase());
    out.push(...parts);
  }
  return out.filter((t) => t.length > 1);
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function embed(text: string, dim = DIM): Float32Array {
  const v = new Float32Array(dim);
  const toks = tokenize(text);
  const add = (t: string, w: number) => {
    const h = fnv(t);
    v[h % dim] += (fnv("s" + t) & 1 ? 1 : -1) * w;
  };
  for (let i = 0; i < toks.length; i++) {
    add(toks[i], 1);
    if (i + 1 < toks.length) add(toks[i] + " " + toks[i + 1], 0.5);
  }
  let n = 0;
  for (let i = 0; i < dim; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < dim; i++) v[i] /= n;
  return v;
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>, offB = 0): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[offB + i];
  return s;
}

export interface Chunk { start: number; end: number; text: string }
export function chunkText(text: string, size = CHUNK_LINES, overlap = OVERLAP): Chunk[] {
  const lines = text.split(/\r?\n/);
  const res: Chunk[] = [];
  const step = Math.max(1, size - overlap);
  for (let s = 0; s < lines.length; s += step) {
    const e = Math.min(lines.length, s + size);
    const t = lines.slice(s, e).join("\n");
    if (t.trim()) res.push({ start: s + 1, end: e, text: t });
    if (e >= lines.length) break;
  }
  return res;
}

export interface RemoteStoreConfig { kind: "qdrant" | "chroma"; url: string; collection?: string; apiKey?: string }
export interface RemotePoint { id: string; vector: number[]; payload: { file: string; start: number; end: number } }
export interface RemoteHit { file: string; start: number; end: number; score: number }
export interface VectorStoreAdapter {
  upsert(points: RemotePoint[]): Promise<void>;
  query(vector: number[], k: number): Promise<RemoteHit[]>;
}

async function http(url: string, method: string, body: unknown, apiKey?: string): Promise<any> {
  const res = await fetch(url, {
    method, signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/json", ...(apiKey ? { "api-key": apiKey, authorization: `Bearer ${apiKey}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} von ${url}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : {};
}

export function createRemoteAdapter(cfg: RemoteStoreConfig): VectorStoreAdapter {
  const base = cfg.url.replace(/\/+$/, "");
  const coll = cfg.collection || "hermes-code";
  if (cfg.kind === "qdrant") {
    let ready = false;
    const ensure = async () => {
      if (ready) return;
      await http(`${base}/collections/${encodeURIComponent(coll)}`, "PUT", { vectors: { size: DIM, distance: "Cosine" } }, cfg.apiKey).catch(() => {});
      ready = true;
    };
    return {
      async upsert(points) {
        await ensure();
        for (let i = 0; i < points.length; i += 200) {
          await http(`${base}/collections/${encodeURIComponent(coll)}/points?wait=true`, "PUT",
            { points: points.slice(i, i + 200).map((p) => ({ id: fnv(p.id), vector: p.vector, payload: p.payload })) }, cfg.apiKey);
        }
      },
      async query(vector, k) {
        const r = await http(`${base}/collections/${encodeURIComponent(coll)}/points/search`, "POST", { vector, limit: k, with_payload: true }, cfg.apiKey);
        return (r.result ?? []).map((h: any) => ({ ...h.payload, score: h.score }));
      },
    };
  }
  let idPromise: Promise<string> | undefined;
  const collId = () => (idPromise ??= http(`${base}/api/v1/collections`, "POST", { name: coll, get_or_create: true, metadata: { "hnsw:space": "cosine" } }, cfg.apiKey).then((r) => String(r.id)));
  return {
    async upsert(points) {
      const id = await collId();
      for (let i = 0; i < points.length; i += 200) {
        const part = points.slice(i, i + 200);
        await http(`${base}/api/v1/collections/${id}/upsert`, "POST",
          { ids: part.map((p) => p.id), embeddings: part.map((p) => p.vector), metadatas: part.map((p) => p.payload) }, cfg.apiKey);
      }
    },
    async query(vector, k) {
      const id = await collId();
      const r = await http(`${base}/api/v1/collections/${id}/query`, "POST", { query_embeddings: [vector], n_results: k }, cfg.apiKey);
      const metas: any[] = r.metadatas?.[0] ?? [];
      const dist: number[] = r.distances?.[0] ?? [];
      return metas.map((m, i) => ({ file: m.file, start: m.start, end: m.end, score: 1 - (dist[i] ?? 1) }));
    },
  };
}

/* ---------- lokaler Index ---------- */

interface IndexMeta {
  version: 1;
  dim: number;
  files: Record<string, { mtimeMs: number; size: number; chunks: Array<{ start: number; end: number }> }>;
}
interface LoadedIndex { meta: IndexMeta; vectors: Float32Array }

const META = "meta.json";
const VEC = "vectors.bin";

function loadIndex(indexDir: string): LoadedIndex {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(indexDir, META), "utf8")) as IndexMeta;
    const buf = fs.readFileSync(path.join(indexDir, VEC));
    const vectors = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
    const total = Object.values(meta.files).reduce((n, f) => n + f.chunks.length, 0);
    if (meta.dim !== DIM || vectors.length !== total * DIM) throw new Error("inkonsistent");
    return { meta, vectors: Float32Array.from(vectors) };
  } catch {
    return { meta: { version: 1, dim: DIM, files: {} }, vectors: new Float32Array(0) };
  }
}

function saveIndex(indexDir: string, idx: LoadedIndex) {
  fs.mkdirSync(indexDir, { recursive: true });
  fs.writeFileSync(path.join(indexDir, VEC), Buffer.from(idx.vectors.buffer, idx.vectors.byteOffset, idx.vectors.byteLength));
  fs.writeFileSync(path.join(indexDir, META), JSON.stringify(idx.meta));
}

function walk(root: string, dir: string, out: string[], skip: string) {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name) && path.resolve(full) !== skip) walk(root, full, out, skip); }
    else if (e.isFile() && TEXT_EXT.has(path.extname(e.name).toLowerCase())) out.push(path.relative(root, full).split(path.sep).join("/"));
  }
}

export interface IndexStats { ok: true; files: number; chunks: number; reindexed: number; removed: number; unchanged: number }

export async function indexProject(projectRoot: string, indexDir: string, remote?: VectorStoreAdapter): Promise<IndexStats> {
  const root = resolveInside(projectRoot, ".");
  const old = loadIndex(indexDir);
  const oldOffsets: Record<string, number> = {};
  let o = 0;
  for (const [f, m] of Object.entries(old.meta.files)) { oldOffsets[f] = o; o += m.chunks.length; }

  const rels: string[] = [];
  walk(root, root, rels, path.resolve(indexDir));
  rels.sort();

  const files: IndexMeta["files"] = {};
  const parts: Float32Array[] = [];
  const remotePoints: RemotePoint[] = [];
  let reindexed = 0, unchanged = 0;
  for (const rel of rels) {
    let st: fs.Stats;
    try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
    if (st.size > MAX_FILE_BYTES) continue;
    const prev = old.meta.files[rel];
    if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) {
      files[rel] = prev;
      parts.push(old.vectors.subarray(oldOffsets[rel] * DIM, (oldOffsets[rel] + prev.chunks.length) * DIM));
      unchanged++;
      continue;
    }
    let text: string;
    try { text = fs.readFileSync(path.join(root, rel), "utf8"); } catch { continue; }
    if (text.includes("\u0000")) continue;
    const chunks = chunkText(text);
    const vec = new Float32Array(chunks.length * DIM);
    chunks.forEach((c, i) => {
      const e = embed(rel + "\n" + c.text);
      vec.set(e, i * DIM);
      if (remote) remotePoints.push({ id: `${rel}:${c.start}`, vector: Array.from(e), payload: { file: rel, start: c.start, end: c.end } });
    });
    files[rel] = { mtimeMs: st.mtimeMs, size: st.size, chunks: chunks.map((c) => ({ start: c.start, end: c.end })) };
    parts.push(vec);
    reindexed++;
  }
  const removed = Object.keys(old.meta.files).filter((f) => !(f in files)).length;
  const total = parts.reduce((n, p) => n + p.length, 0);
  const vectors = new Float32Array(total);
  let off = 0;
  for (const p of parts) { vectors.set(p, off); off += p.length; }
  saveIndex(indexDir, { meta: { version: 1, dim: DIM, files }, vectors });
  if (remote && remotePoints.length) await remote.upsert(remotePoints);
  return { ok: true, files: Object.keys(files).length, chunks: total / DIM, reindexed, removed, unchanged };
}

export interface SearchHit { file: string; startLine: number; endLine: number; score: number; snippet: string }

function snippetOf(root: string, file: string, start: number, end: number): string {
  try {
    return fs.readFileSync(path.join(root, file), "utf8").split(/\r?\n/).slice(start - 1, end).join("\n");
  } catch { return ""; }
}

export async function searchIndex(projectRoot: string, indexDir: string, query: string, k = 5, remote?: VectorStoreAdapter): Promise<SearchHit[]> {
  const root = resolveInside(projectRoot, ".");
  const q = embed(query);
  if (remote) {
    const hits = await remote.query(Array.from(q), k);
    return hits.map((h) => ({ file: h.file, startLine: h.start, endLine: h.end, score: h.score, snippet: snippetOf(root, h.file, h.start, h.end) }));
  }
  const idx = loadIndex(indexDir);
  const scored: Array<{ file: string; start: number; end: number; score: number }> = [];
  let i = 0;
  for (const [file, m] of Object.entries(idx.meta.files)) {
    for (const c of m.chunks) {
      scored.push({ file, start: c.start, end: c.end, score: cosine(q, idx.vectors, i * DIM) });
      i++;
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, Math.min(k, 50))).filter((s) => s.score > 0).map((s) => ({
    file: s.file, startLine: s.start, endLine: s.end, score: Number(s.score.toFixed(4)), snippet: snippetOf(root, s.file, s.start, s.end),
  }));
}

function adapterFrom(a: any): VectorStoreAdapter | undefined {
  const r = a?.remote;
  if (!r || !r.url) return undefined;
  if (r.kind !== "qdrant" && r.kind !== "chroma") throw new Error("Unbekannter Remote-Typ (qdrant|chroma).");
  if (!/^https?:\/\//i.test(r.url)) throw new Error("Remote-URL muss mit http(s):// beginnen.");
  return createRemoteAdapter(r);
}

export const operations: Record<string, PluginOp> = {
  index: wrap(async (a) => indexProject(a.projectRoot, a.indexDir, adapterFrom(a))),
  search: wrap(async (a) => {
    if (!String(a.query ?? "").trim()) return { ok: false, message: "Suchanfrage ist leer." };
    return { ok: true, hits: await searchIndex(a.projectRoot, a.indexDir, String(a.query), a.k ?? 5, adapterFrom(a)) };
  }),
};
