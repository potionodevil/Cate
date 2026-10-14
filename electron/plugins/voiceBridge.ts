/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 *
 * Voice-First Command Bridge: Transkription über externe lokale Tools (whisper.cpp,
 * faster-whisper, whisper), Sprachausgabe über piper (nur execFile) und ein reiner
 * Befehlsinterpreter. runCommand wird nur markiert (requiresApproval), nie ausgeführt.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const manifest = {
  id: "voiceBridge",
  name: "Voice-First Command Bridge",
  version: "1.0.0",
  description: "Lokale Spracherkennung (whisper) und Sprachausgabe (piper) plus Sprachbefehl-Interpreter.",
  category: "ui" as const,
  configFields: [
    { key: "tool", label: "Transkriptions-Tool", type: "select" as const, default: "auto", options: ["auto", "whisper-cli", "main", "faster-whisper", "whisper"] },
    { key: "whisperModelPath", label: "Whisper.cpp-Modell (.bin)", type: "string" as const },
    { key: "model", label: "Modellname (faster-whisper/whisper)", type: "string" as const, default: "base" },
    { key: "piperModelPath", label: "Piper-Modell (.onnx)", type: "string" as const },
    { key: "language", label: "Sprache", type: "select" as const, default: "de", options: ["de", "en"] },
    { key: "wakeWord", label: "Aktivierungswort (leer = aus)", type: "string" as const, default: "" },
    { key: "tempDir", label: "Temp-Verzeichnis", type: "string" as const },
    { key: "timeoutMs", label: "Timeout (ms)", type: "number" as const, default: 120000 },
  ],
};

export type Lang = "de" | "en";
export type IntentName = "sendPrompt" | "newSession" | "stopSession" | "splitPane" | "approve" | "reject" | "runCommand" | "openProject" | "focusPane";
export interface Intent { intent: IntentName; args: Record<string, unknown>; requiresApproval?: boolean; confidence: number; fallback?: boolean }

// ---------- Interpreter ----------
const norm = (s: string) => s.toLowerCase().replace(/[.,;:!?"„“”]/g, " ").replace(/\s+/g, " ").trim();

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
export function similarity(a: string, b: string): number {
  const L = Math.max(a.length, b.length);
  return L === 0 ? 1 : 1 - levenshtein(a, b) / L;
}

interface Rule { intent: IntentName; phrases: Record<Lang, string[]>; takesRest?: "text" | "command" | "name" | "none"; shortOnly?: boolean }
const RULES: Rule[] = [
  { intent: "newSession", phrases: { de: ["neue sitzung", "neue session", "starte neue sitzung", "sitzung neu starten"], en: ["new session", "start new session", "start a new session"] } },
  { intent: "stopSession", phrases: { de: ["stoppe sitzung", "sitzung stoppen", "stopp", "stoppe", "abbrechen", "halt"], en: ["stop session", "stop", "cancel", "abort"] }, shortOnly: true },
  { intent: "splitPane", phrases: { de: ["teile fenster", "teile ansicht", "teile pane", "fenster teilen", "ansicht teilen", "teilen"], en: ["split pane", "split window", "split view", "split"] }, takesRest: "none" },
  { intent: "focusPane", phrases: { de: ["fokus auf", "fokussiere", "gehe zu fenster", "gehe zu pane", "wechsle zu fenster", "wechsle zu"], en: ["focus pane", "focus on", "focus", "go to pane", "switch to pane", "switch to"] }, takesRest: "none" },
  { intent: "openProject", phrases: { de: ["öffne projekt", "projekt öffnen", "öffne das projekt"], en: ["open project", "open the project"] }, takesRest: "name" },
  { intent: "runCommand", phrases: { de: ["führe befehl aus", "führe aus", "befehl ausführen", "befehl", "terminal"], en: ["run command", "execute command", "execute", "run"] }, takesRest: "command" },
  { intent: "approve", phrases: { de: ["genehmigen", "genehmige", "bestätigen", "bestätige", "freigeben", "gib frei", "erlaube", "ja", "okay", "ok"], en: ["approve", "confirm", "allow", "yes", "okay", "ok"] }, shortOnly: true },
  { intent: "reject", phrases: { de: ["ablehnen", "lehne ab", "verweigern", "verweigere", "verbiete", "nein"], en: ["reject", "deny", "decline", "no", "refuse"] }, shortOnly: true },
  { intent: "sendPrompt", phrases: { de: ["sende prompt", "schicke prompt", "schreibe", "frage", "sage", "sende", "schicke", "prompt"], en: ["send prompt", "send", "write", "ask", "tell", "prompt"] }, takesRest: "text" },
];

const NUM: Record<string, number> = { eins: 1, ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, one: 1, two: 2, three: 3, four: 4, five: 5 };
const DIRS: Record<string, string> = { links: "left", rechts: "right", oben: "up", unten: "down", left: "left", right: "right", up: "up", down: "down", horizontal: "horizontal", vertikal: "vertical", vertical: "vertical", waagerecht: "horizontal", senkrecht: "vertical" };

function matchPrefix(words: string[], phrase: string): number {
  const pw = phrase.split(" ");
  if (words.length < pw.length) return 0;
  const cand = words.slice(0, pw.length).join(" ");
  if (cand === phrase) return 1;
  if (phrase.length <= 5) return 0; // kurze Wörter nur exakt
  const s = similarity(cand, phrase);
  return s >= 0.8 ? s : 0;
}

function extractPaneArgs(rest: string[]): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const w of rest) {
    if (DIRS[w]) args.direction = DIRS[w];
    else if (/^\d+$/.test(w)) args.index = parseInt(w, 10);
    else if (NUM[w]) args.index = NUM[w];
  }
  return args;
}

export interface InterpretOptions { lang?: Lang; wakeWord?: string; fallbackToPrompt?: boolean }

function interpretOne(text: string, lang: Lang, fallbackToPrompt: boolean): Intent | null {
  const words = norm(text).split(" ").filter(Boolean);
  if (!words.length) return null;
  let best: { rule: Rule; len: number; score: number } | null = null;
  const langs: Lang[] = [lang, lang === "de" ? "en" : "de"];
  for (const [li, l] of langs.entries()) {
    for (const rule of RULES) {
      for (const ph of rule.phrases[l]) {
        const sc = matchPrefix(words, ph);
        if (!sc) continue;
        const len = ph.split(" ").length;
        const score = sc * (li === 0 ? 1 : 0.95);
        if (!best || len > best.len || (len === best.len && score > best.score)) best = { rule, len, score };
      }
    }
  }
  if (best) {
    const rest = words.slice(best.len);
    const r = best.rule;
    if (r.shortOnly && rest.length > 2) best = null;
    else {
      const restText = rest.join(" ").replace(/^(dass|that|to|zu|an|den|die|das|the|bitte|please|:)\s+/, "");
      switch (r.intent) {
        case "sendPrompt": if (!restText) return null; return { intent: "sendPrompt", args: { text: originalRest(text, best.len) || restText }, confidence: best.score };
        case "runCommand": if (!restText) return null; return { intent: "runCommand", args: { command: originalRest(text, best.len) || restText }, requiresApproval: true, confidence: best.score };
        case "openProject": if (!restText) return null; return { intent: "openProject", args: { name: originalRest(text, best.len) || restText }, confidence: best.score };
        case "splitPane": return { intent: "splitPane", args: extractPaneArgs(rest), confidence: best.score };
        case "focusPane": { const a = extractPaneArgs(rest); if (!Object.keys(a).length) return null; return { intent: "focusPane", args: a, confidence: best.score }; }
        default: return { intent: r.intent, args: {}, confidence: best.score };
      }
    }
  }
  return fallbackToPrompt ? { intent: "sendPrompt", args: { text: text.trim() }, confidence: 0.3, fallback: true } : null;
}

/** Rest des Originaltexts (mit Groß-/Kleinschreibung) nach den ersten n Wörtern. */
function originalRest(text: string, n: number): string {
  const toks = text.trim().split(/\s+/);
  return toks.slice(n).join(" ").replace(/^(dass|that|to|zu|an|bitte|please)\s+/i, "").trim();
}

export function interpretUtterance(text: string, opts: InterpretOptions = {}): Intent[] {
  const lang: Lang = opts.lang === "en" ? "en" : "de";
  let t = String(text ?? "").trim();
  if (!t) return [];
  if (opts.wakeWord && opts.wakeWord.trim()) {
    const ww = norm(opts.wakeWord);
    const toks = t.split(/\s+/);
    const wn = ww.split(" ").length;
    const head = norm(toks.slice(0, wn).join(" "));
    if (head === ww || (ww.length > 4 && similarity(head, ww) >= 0.8)) t = toks.slice(wn).join(" ").replace(/^[,:\s]+/, "");
    else return [];
  }
  // Mehrere Befehle: "…, und dann …" / "danach" / "and then"
  // runCommand/sendPrompt schlucken den Rest, daher nur bei Nicht-Rest-Intents trennen.
  const parts = t.split(/\s*(?:,?\s+(?:und dann|und danach|danach|anschließend|and then|then|afterwards))\s+/i);
  const out: Intent[] = [];
  for (const p of parts) {
    const i = interpretOne(p, lang, opts.fallbackToPrompt !== false);
    if (i) out.push(i);
  }
  return out;
}

// ---------- Externe Tools ----------
export interface RunOpts { cwd?: string; timeout: number; input?: string }
export type Runner = (cmd: string, args: string[], opts: RunOpts) => Promise<{ code: number; stdout: string; stderr: string }>;
export const defaultRunner: Runner = (cmd, args, opts) =>
  new Promise((resolve) => {
    const child = execFile(cmd, args, { cwd: opts.cwd, timeout: opts.timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as any).code === "number" ? (err as any).code : -1) : 0;
      resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
    if (opts.input !== undefined && child.stdin) { child.stdin.on("error", () => {}); child.stdin.end(opts.input); }
  });

export interface ToolInfo { name: string; available: boolean; note?: string }

export async function detectTools(cfg: { whisperModelPath?: string; piperModelPath?: string } = {}, runner: Runner = defaultRunner): Promise<{ ok: true; tools: ToolInfo[]; transcriber: string | null; tts: boolean }> {
  const probe = async (cmd: string, a: string[] = ["--help"]) => (await runner(cmd, a, { timeout: 8000 })).code !== -1 && true;
  const exists = async (cmd: string, a: string[]) => {
    const r = await runner(cmd, a, { timeout: 8000 });
    return r.code === 0 || (r.code > 0 && r.code < 128 && (r.stdout + r.stderr).length > 0);
  };
  void probe;
  const tools: ToolInfo[] = [];
  const cli = await exists("whisper-cli", ["--help"]);
  tools.push({ name: "whisper-cli", available: cli && !!cfg.whisperModelPath, note: cli ? (cfg.whisperModelPath ? undefined : "Modellpfad fehlt") : "nicht gefunden" });
  const main = !cli && (await exists("main", ["--help"]));
  tools.push({ name: "main", available: main && !!cfg.whisperModelPath, note: main ? (cfg.whisperModelPath ? undefined : "Modellpfad fehlt") : "nicht gefunden" });
  const fw = await exists("faster-whisper", ["--help"]);
  tools.push({ name: "faster-whisper", available: fw, note: fw ? undefined : "nicht gefunden" });
  const wh = await exists("whisper", ["--help"]);
  tools.push({ name: "whisper", available: wh, note: wh ? undefined : "nicht gefunden" });
  const pip = await exists("piper", ["--help"]);
  tools.push({ name: "piper", available: pip && !!cfg.piperModelPath, note: pip ? (cfg.piperModelPath ? undefined : "Modellpfad fehlt") : "nicht gefunden" });
  const transcriber = tools.find((t) => t.name !== "piper" && t.available)?.name ?? null;
  return { ok: true, tools, transcriber, tts: tools.find((t) => t.name === "piper")!.available };
}

export interface TranscribeArgs {
  audioPath?: string; base64?: string; ext?: "wav" | "webm" | "ogg" | "mp3"; tool?: string; language?: Lang;
  whisperModelPath?: string; model?: string; tempDir?: string; timeoutMs?: number;
}
const MAX_AUDIO = 50 * 1024 * 1024;

export function allowedTempDir(dir?: string): string {
  return path.resolve(dir || path.join(os.tmpdir(), "hermes-voice"));
}
function inside(root: string, p: string): boolean {
  const rel = path.relative(root, path.resolve(p));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function buildTranscribeCommand(tool: string, file: string, a: { language: Lang; whisperModelPath?: string; model?: string; outDir: string }): { cmd: string; args: string[]; outFile?: string } | null {
  const lang = a.language;
  switch (tool) {
    case "whisper-cli": case "main":
      if (!a.whisperModelPath) return null;
      return { cmd: tool, args: ["-m", a.whisperModelPath, "-f", file, "-l", lang, "-nt"] };
    case "faster-whisper":
      return { cmd: "faster-whisper", args: [file, "--language", lang, "--model", a.model || "base", "--output_format", "txt", "--output_dir", a.outDir], outFile: path.join(a.outDir, path.basename(file, path.extname(file)) + ".txt") };
    case "whisper":
      return { cmd: "whisper", args: [file, "--language", lang, "--model", a.model || "base", "--output_format", "txt", "--output_dir", a.outDir], outFile: path.join(a.outDir, path.basename(file, path.extname(file)) + ".txt") };
  }
  return null;
}

export function cleanTranscript(s: string): string {
  return String(s ?? "").split(/\r?\n/).map((l) => l.replace(/^\[[^\]]*-->[^\]]*\]\s*/, "").trim()).filter((l) => l && !/^(whisper_|ggml_|main:|system_info|output_|\[BLANK_AUDIO\])/i.test(l)).join(" ").trim();
}

export async function transcribe(a: TranscribeArgs, runner: Runner = defaultRunner): Promise<unknown> {
  let created: string | null = null;
  try {
    const root = allowedTempDir(a?.tempDir);
    fs.mkdirSync(root, { recursive: true });
    let file: string;
    if (typeof a?.base64 === "string" && a.base64) {
      const buf = Buffer.from(a.base64.replace(/^data:[^,]*,/, ""), "base64");
      if (!buf.length) return { ok: false, message: "Leere Audiodaten." };
      if (buf.length > MAX_AUDIO) return { ok: false, message: "Audiodatei zu groß." };
      const ext = ["wav", "webm", "ogg", "mp3"].includes(a.ext ?? "") ? a.ext : "wav";
      file = path.join(root, `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
      fs.writeFileSync(file, buf);
      created = file;
    } else if (a?.audioPath) {
      file = path.resolve(a.audioPath);
      if (!inside(root, file)) return { ok: false, message: "Audiodatei liegt außerhalb des erlaubten Temp-Verzeichnisses." };
      if (!fs.existsSync(file)) return { ok: false, message: "Audiodatei nicht gefunden." };
      if (fs.statSync(file).size > MAX_AUDIO) return { ok: false, message: "Audiodatei zu groß." };
    } else return { ok: false, message: "audioPath oder base64 erforderlich." };
    const det = await detectTools({ whisperModelPath: a.whisperModelPath }, runner);
    const tool = a.tool && a.tool !== "auto" ? a.tool : det.transcriber;
    if (!tool) return { ok: true, skipped: true, message: "Kein Transkriptions-Tool gefunden (whisper-cli/faster-whisper/whisper)." };
    const info = det.tools.find((t) => t.name === tool);
    if (!info || !info.available) return { ok: false, message: `Tool '${tool}' ist nicht verfügbar${info?.note ? ` (${info.note})` : ""}.` };
    const outDir = path.join(root, "out");
    fs.mkdirSync(outDir, { recursive: true });
    const cmd = buildTranscribeCommand(tool, file, { language: a.language === "en" ? "en" : "de", whisperModelPath: a.whisperModelPath, model: a.model, outDir });
    if (!cmd) return { ok: false, message: "Tool nicht unterstützt oder Modellpfad fehlt." };
    const r = await runner(cmd.cmd, cmd.args, { timeout: a.timeoutMs ?? 120000 });
    if (r.code !== 0) return { ok: false, message: `Transkription fehlgeschlagen (Code ${r.code}): ${r.stderr.slice(-300)}` };
    let text = cmd.outFile && fs.existsSync(cmd.outFile) ? fs.readFileSync(cmd.outFile, "utf8") : r.stdout;
    if (cmd.outFile) try { fs.unlinkSync(cmd.outFile); } catch { /* ignorieren */ }
    return { ok: true, tool, text: cleanTranscript(text) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    if (created) try { fs.unlinkSync(created); } catch { /* ignorieren */ }
  }
}

export async function speak(a: { text?: string; piperModelPath?: string; outputPath?: string; tempDir?: string; timeoutMs?: number }, runner: Runner = defaultRunner): Promise<unknown> {
  try {
    const text = String(a?.text ?? "").trim();
    if (!text) return { ok: false, message: "Text fehlt." };
    if (text.length > 4000) return { ok: false, message: "Text zu lang." };
    if (!a.piperModelPath) return { ok: false, message: "piperModelPath fehlt." };
    const root = allowedTempDir(a.tempDir);
    fs.mkdirSync(root, { recursive: true });
    const out = a.outputPath ? path.resolve(a.outputPath) : path.join(root, `tts-${Date.now()}.wav`);
    if (!inside(root, out) || !out.toLowerCase().endsWith(".wav")) return { ok: false, message: "Ausgabe muss eine .wav-Datei im erlaubten Temp-Verzeichnis sein." };
    const probe = await runner("piper", ["--help"], { timeout: 8000 });
    if (probe.code === -1) return { ok: true, skipped: true, message: "piper ist nicht installiert – Sprachausgabe übersprungen." };
    const r = await runner("piper", ["--model", a.piperModelPath, "--output_file", out], { timeout: a.timeoutMs ?? 60000, input: text });
    if (r.code !== 0) return { ok: false, message: `piper fehlgeschlagen (Code ${r.code}): ${r.stderr.slice(-300)}` };
    return { ok: true, file: out };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  detectTools: async (a) => detectTools(a ?? {}),
  transcribe: async (a) => transcribe(a ?? {}),
  interpret: async (a) => {
    try { return { ok: true, intents: interpretUtterance(String(a?.text ?? ""), { lang: a?.lang, wakeWord: a?.wakeWord, fallbackToPrompt: a?.fallbackToPrompt }) }; }
    catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
  },
  speak: async (a) => speak(a ?? {}),
};
