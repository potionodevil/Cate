/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 *
 * Visual Diff Previewer: erzeugt abgeschottete Vorher/Nachher-Vorschauen (HTML/JSX/TSX/Vue/
 * Tailwind/SVG/CSS), eine Vergleichsseite (nebeneinander + Slider), ein Chat-Widget für
 * ::preview{file=...} und eine Klassen-Zusammenfassung.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export const manifest = {
  id: "visualDiff",
  name: "Visual Diff Previewer",
  version: "1.0.0",
  description: "Vorher/Nachher-Vorschau für UI-Snippets mit Sandbox, Slider-Vergleich und Tailwind-Klassenzusammenfassung.",
  category: "ui" as const,
  configFields: [
    { key: "allowNetwork", label: "Netzwerk-Ressourcen erlauben (Tailwind-CDN, esm.sh)", type: "boolean" as const, default: false },
    { key: "allowScripts", label: "Skripte in untrusted HTML erlauben", type: "boolean" as const, default: false },
    { key: "tailwindScript", label: "Tailwind-Play-Script-URL", type: "string" as const, default: "https://cdn.tailwindcss.com" },
    { key: "esmHost", label: "ESM-Host für React", type: "string" as const, default: "https://esm.sh" },
  ],
};

export type Kind = "html" | "svg" | "css" | "jsx" | "tsx" | "vue" | "tailwind";
export interface RenderArgs {
  before: string; after: string; kind?: Kind; outDir: string;
  allowNetwork?: boolean; allowScripts?: boolean; tailwindScript?: string; esmHost?: string; title?: string; name?: string;
}

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Entfernt Skripte, Inline-Handler und javascript:-URLs. */
export function sanitizeHtml(html: string, allowScripts = false): string {
  let out = String(html ?? "");
  if (allowScripts) return out;
  out = out.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "").replace(/<script\b[^>]*>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/(href|src|xlink:href|action|formaction)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2');
  out = out.replace(/<(iframe|object|embed|meta\s+http-equiv)\b[^>]*>(?:[\s\S]*?<\/\1>)?/gi, "");
  return out;
}

/** Skript-sichere JSON-Einbettung. */
const jsonForScript = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

// ---------- Klassen ----------
export function extractClassLists(src: string): string[] {
  const lists: string[] = [];
  for (const m of String(src ?? "").matchAll(/\b(?:class|className|:class)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\}|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\})/g)) {
    const v = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5];
    if (v) lists.push(v.replace(/\$\{[^}]*\}/g, " "));
  }
  for (const m of String(src ?? "").matchAll(/@apply\s+([^;}]+)/g)) lists.push(m[1]);
  return lists;
}
const splitClasses = (s: string) => s.split(/\s+/).map((x) => x.trim()).filter(Boolean);

export interface ClassDiff { added: string[]; removed: string[]; unchanged: string[]; summary: string }
export function classifyClassChange(before: string, after: string): ClassDiff {
  const b = new Set(splitClasses(before));
  const a = new Set(splitClasses(after));
  const added = [...a].filter((c) => !b.has(c));
  const removed = [...b].filter((c) => !a.has(c));
  const unchanged = [...a].filter((c) => b.has(c));
  return { added, removed, unchanged, summary: describeClassDiff(added, removed) };
}
export function describeClassDiff(added: string[], removed: string[]): string {
  if (!added.length && !removed.length) return "Keine Klassenänderungen.";
  const parts: string[] = [];
  if (added.length) parts.push(`Hinzugefügt (${added.length}): ${added.join(" ")}`);
  if (removed.length) parts.push(`Entfernt (${removed.length}): ${removed.join(" ")}`);
  // Ersetzungen in derselben Utility-Gruppe erkennen (z. B. p-2 -> p-4)
  const grp = (c: string) => { const base = c.split(":").pop()!; const pre = c.slice(0, c.length - base.length); return pre + base.replace(/-?[\w./[\]#%]+$/, "").replace(/^-/, ""); };
  const repl: string[] = [];
  for (const r of removed) { const g = grp(r); if (!g) continue; const x = added.find((n) => grp(n) === g && n !== r); if (x) repl.push(`${r} → ${x}`); }
  if (repl.length) parts.push(`Ersetzt: ${repl.join(", ")}`);
  return parts.join(". ") + ".";
}
export function summarizeClasses(beforeSrc: string, afterSrc: string): ClassDiff {
  const bs = extractClassLists(beforeSrc).join(" ");
  const as = extractClassLists(afterSrc).join(" ");
  // Falls reine Klassenliste übergeben wurde
  const looksRaw = !/[<{]/.test(beforeSrc + afterSrc) && !bs && !as;
  return looksRaw ? classifyClassChange(beforeSrc, afterSrc) : classifyClassChange(bs, as);
}

// ---------- Vorschau ----------
const BASE_CSS = "html,body{margin:0;padding:12px;font-family:system-ui,sans-serif;box-sizing:border-box}*,*:before,*:after{box-sizing:inherit}";

function detectKind(src: string, hint?: string): Kind {
  if (hint && ["html", "svg", "css", "jsx", "tsx", "vue", "tailwind"].includes(hint)) return hint as Kind;
  if (/<template[\s>]/.test(src) && /<script/.test(src)) return "vue";
  if (/^\s*<svg[\s>]/i.test(src)) return "svg";
  if (/\bexport\s+default\b|\bimport\s.+from\b|=>\s*\(?\s*</.test(src)) return "tsx";
  if (/^\s*[.#\w][^{<]*\{[^}]*\}/.test(src) && !/</.test(src)) return "css";
  return "html";
}

/** Best-Effort: JSX offline zu statischem HTML. */
export function jsxToStaticHtml(src: string): string {
  const ret = /return\s*\(?\s*(<[\s\S]*?>[\s\S]*?)\)?\s*;?\s*\}\s*(?:;|\n|$)/.exec(src) ?? /=>\s*\(?\s*(<[\s\S]*>)\s*\)?\s*;?\s*$/m.exec(src);
  let html = ret ? ret[1] : src;
  html = html.replace(/\bclassName=/g, "class=").replace(/\bhtmlFor=/g, "for=")
    .replace(/=\{\s*(["'`])([\s\S]*?)\1\s*\}/g, '="$2"')
    .replace(/\s[\w:-]+=\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\{[^{}]*\}/g, "")
    .replace(/<>|<\/>/g, "");
  return html.trim();
}

export function vueTemplate(src: string): string {
  const m = /<template[^>]*>([\s\S]*)<\/template>/i.exec(src);
  return (m ? m[1] : src).replace(/\s(?::|@|v-)[\w:.-]+(?:="[^"]*")?/g, (x) => (/^\s:class=/.test(x) ? x.replace(":class", "class") : "")).trim();
}

function head(opts: { title: string; tailwind: string | null; csp: boolean; allowScripts: boolean }): string {
  const csp = opts.allowScripts
    ? ""
    : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${opts.tailwind ? "https:" : ""}; style-src 'unsafe-inline' ${opts.tailwind ? "https:" : ""}; font-src data:;">`;
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${csp}<title>${escapeHtml(opts.title)}</title>`;
}

export interface BuiltPreview { html: string; mode: "static" | "react" | "notice" }

export function buildPreviewHtml(src: string, o: RenderArgs & { side: "before" | "after" }): BuiltPreview {
  const kind = detectKind(src, o.kind);
  const net = !!o.allowNetwork;
  const scripts = !!o.allowScripts;
  const tw = net ? (o.tailwindScript || "https://cdn.tailwindcss.com") : null;
  const twTag = tw ? `<script src="${escapeHtml(tw)}"></script>` : "";
  const title = `${o.title ?? "Vorschau"} – ${o.side === "before" ? "Vorher" : "Nachher"}`;
  const wrap = (body: string, extraHead = "", extraCss = "", allowScr = scripts) =>
    `<!doctype html><html><head>${head({ title, tailwind: tw, csp: true, allowScripts: allowScr || net })}<style>${BASE_CSS}${extraCss}</style>${extraHead}</head><body>${body}</body></html>`;

  if (kind === "html" || kind === "tailwind") return { mode: "static", html: wrap(sanitizeHtml(src, scripts), twTag) };
  if (kind === "svg") return { mode: "static", html: wrap(sanitizeHtml(src, scripts)) };
  if (kind === "css") return { mode: "static", html: wrap(`<div class="demo"><h1>Heading</h1><p>Beispieltext <a href="#">Link</a></p><button>Button</button></div>`, "", src.replace(/<\/style/gi, "")) };
  if (kind === "vue") return { mode: "static", html: wrap(sanitizeHtml(vueTemplate(src), scripts), twTag) };
  // jsx / tsx
  if (net) {
    const host = (o.esmHost || "https://esm.sh").replace(/\/+$/, "");
    const map = { imports: { react: `${host}/react@18`, "react/jsx-runtime": `${host}/react@18/jsx-runtime`, "react-dom/client": `${host}/react-dom@18/client` } };
    const loader = `import * as Babel from "${host}/@babel/standalone";
const code = ${jsonForScript(src)};
const out = Babel.transform(code, { filename: "x.${kind === "jsx" ? "jsx" : "tsx"}", presets: [["react", { runtime: "automatic" }], "typescript"] }).code;
const url = URL.createObjectURL(new Blob([out], { type: "text/javascript" }));
try {
  const mod = await import(url);
  const React = await import("react"); const { createRoot } = await import("react-dom/client");
  const C = mod.default || mod.App || Object.values(mod).find((v) => typeof v === "function");
  createRoot(document.getElementById("root")).render(C ? React.createElement(C) : null);
} catch (e) { document.getElementById("root").textContent = "Renderfehler: " + (e && e.message || e); }`;
    return { mode: "react", html: wrap(`<div id="root"></div>`, `${twTag}<script type="importmap">${jsonForScript(map)}</script><script type="module">${loader.replace(/<\/script/gi, "<\\/script")}</script>`, "", true) };
  }
  const staticHtml = jsxToStaticHtml(src);
  const notice = `<p style="font:12px system-ui;opacity:.6;margin:0 0 8px">Statische Näherung (allowNetwork=false): JSX-Ausdrücke wurden entfernt.</p>`;
  return { mode: "notice", html: wrap(notice + sanitizeHtml(staticHtml, false)) };
}

function sandboxAttr(allowScripts: boolean): string {
  return allowScripts ? 'sandbox="allow-scripts"' : 'sandbox=""';
}

export function buildCompareHtml(o: { title: string; beforeFile: string; afterFile: string; sandbox: string; summary: string }): string {
  const t = escapeHtml(o.title);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${t}</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#fff;color:#111}header{padding:8px 12px;border-bottom:1px solid #ddd;display:flex;gap:12px;align-items:center;font-size:13px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px}.grid div span{font-size:12px;opacity:.7}iframe{width:100%;height:420px;border:1px solid #ddd;background:#fff}
.slider{position:relative;margin:8px;height:440px}.slider iframe{position:absolute;inset:0;height:100%}#top{clip-path:inset(0 50% 0 0)}
input[type=range]{width:calc(100% - 16px);margin:0 8px}.hide{display:none}pre{margin:8px;font-size:12px;white-space:pre-wrap}
</style></head><body><header><strong>${t}</strong><label><input type="radio" name="m" value="side" checked> Nebeneinander</label><label><input type="radio" name="m" value="slider"> Slider</label></header>
<section id="side" class="grid"><div><span>Vorher</span><iframe ${o.sandbox} src="${escapeHtml(o.beforeFile)}"></iframe></div><div><span>Nachher</span><iframe ${o.sandbox} src="${escapeHtml(o.afterFile)}"></iframe></div></section>
<section id="sl" class="hide"><div class="slider"><iframe ${o.sandbox} src="${escapeHtml(o.afterFile)}"></iframe><iframe id="top" ${o.sandbox} src="${escapeHtml(o.beforeFile)}"></iframe></div><input id="rng" type="range" min="0" max="100" value="50" aria-label="Vergleichsposition"></section>
<pre>${escapeHtml(o.summary)}</pre>
<script>
var r=document.getElementById('rng'),top_=document.getElementById('top');r.oninput=function(){top_.style.clipPath='inset(0 '+(100-r.value)+'% 0 0)'};
document.querySelectorAll('input[name=m]').forEach(function(i){i.onchange=function(){document.getElementById('side').className=i.value==='side'?'grid':'hide';document.getElementById('sl').className=i.value==='slider'?'':'hide'}});
</script></body></html>`;
}

/** Widget für ::preview{file=...}: nur CSS-Variablen des Hosts, kein eigener Hintergrund/Margin. */
export function buildWidgetHtml(beforeHtml: string, afterHtml: string, sandbox: string, summary: string): string {
  const fr = (h: string) => `<iframe ${sandbox} srcdoc="${escapeHtml(h)}" style="width:100%;height:240px;border:1px solid var(--border);border-radius:6px;background:#fff"></iframe>`;
  return `<div style="color:var(--foreground);font:13px system-ui,sans-serif">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
<div style="border:1px solid var(--border);background:var(--card);border-radius:8px;padding:6px"><div style="opacity:.7;margin-bottom:4px">Vorher</div>${fr(beforeHtml)}</div>
<div style="border:1px solid var(--border);background:var(--card);border-radius:8px;padding:6px"><div style="opacity:.7;margin-bottom:4px">Nachher</div>${fr(afterHtml)}</div>
</div><div style="opacity:.8;padding-top:6px">${escapeHtml(summary)}</div></div>`;
}

export async function render(args: RenderArgs): Promise<unknown> {
  try {
    if (!args || typeof args.before !== "string" || typeof args.after !== "string") return { ok: false, message: "before und after (Quelltext) erforderlich." };
    if (!args.outDir || !path.isAbsolute(args.outDir)) return { ok: false, message: "outDir muss ein absoluter Pfad sein." };
    if (args.before.length > 500_000 || args.after.length > 500_000) return { ok: false, message: "Quelltext zu groß." };
    const out = path.resolve(args.outDir);
    if (path.dirname(out) === out) return { ok: false, message: "outDir darf kein Wurzelverzeichnis sein." };
    fs.mkdirSync(out, { recursive: true });
    const b = buildPreviewHtml(args.before, { ...args, side: "before" });
    const a = buildPreviewHtml(args.after, { ...args, side: "after" });
    const needScripts = !!args.allowScripts || !!args.allowNetwork;
    const sb = sandboxAttr(needScripts);
    const diff = summarizeClasses(args.before, args.after);
    const title = args.title ?? "Visual Diff";
    const base = (args.name ?? "").replace(/[^\w-]/g, "") || "diff";
    const files = { before: path.join(out, `${base}-before.html`), after: path.join(out, `${base}-after.html`), compare: path.join(out, `${base}-compare.html`), widget: path.join(out, `${base}-widget.html`) };
    fs.writeFileSync(files.before, b.html, "utf8");
    fs.writeFileSync(files.after, a.html, "utf8");
    fs.writeFileSync(files.compare, buildCompareHtml({ title, beforeFile: path.basename(files.before), afterFile: path.basename(files.after), sandbox: sb, summary: diff.summary }), "utf8");
    fs.writeFileSync(files.widget, buildWidgetHtml(b.html, a.html, sb, diff.summary), "utf8");
    return { ok: true, files, modes: { before: b.mode, after: a.mode }, classes: diff, directive: `::preview{file="${files.widget.replace(/\\/g, "/")}"}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export const operations: Record<string, (args: any) => Promise<unknown>> = {
  render: async (a) => render(a),
  summarizeClasses: async (a) => {
    try { return { ok: true, ...summarizeClasses(String(a?.before ?? ""), String(a?.after ?? "")) }; }
    catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
  },
};
