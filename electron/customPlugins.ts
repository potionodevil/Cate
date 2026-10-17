/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
// Eigene Plugins: einzelne .js-Dateien (CommonJS, `module.exports = { manifest, operations }`,
// exakt dieselbe Form wie electron/plugins/*.ts), die Nutzer ueber die Einstellungen hochladen.
// Sie landen unveraendert in <appDataDir>/custom-plugins/<id>.js und werden beim Start sowie
// nach jedem Hoch-/Runterladen frisch requiret (Cache wird dafuer gezielt geleert).
//
// Sicherheitshinweis: eine hochgeladene Datei laeuft mit vollen Node-Rechten im Hauptprozess,
// genau wie die eingebauten Plugins. Das ist bei einem Plugin-System, das eigenen Code laedt,
// unvermeidlich (vergleichbar mit VS-Code- oder Obsidian-Plugins) — nur Dateien verwenden, denen
// vertraut wird. Der Upload-Dialog weist in der Oberflaeche darauf hin.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "fs";
import { extname, join, resolve } from "path";
import { createRequire } from "module";

export interface RawPluginModule {
  manifest: {
    id: string;
    name: string;
    version: string;
    description?: string;
    category?: string;
    configFields?: ReadonlyArray<Record<string, any>>;
  };
  operations: Record<string, (args: any) => Promise<unknown>>;
}

export interface CustomPluginIssue {
  fileName: string;
  message: string;
}

const ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const req = createRequire(__filename);

function isInside(root: string, target: string): boolean {
  const r = resolve(root);
  const t = resolve(target);
  if (process.platform === "win32") return t.toLowerCase() === r.toLowerCase() || t.toLowerCase().startsWith(r.toLowerCase() + "\\");
  return t === r || t.startsWith(r + "/");
}

/** Wirft mit einer verstaendlichen deutschen Meldung statt einer rohen require()-Exception. */
export function validateModule(mod: unknown, fileLabel: string): RawPluginModule {
  if (!mod || typeof mod !== "object") throw new Error(`${fileLabel}: Datei exportiert kein Objekt (module.exports = { manifest, operations }).`);
  const m = mod as any;
  const manifest = m.manifest;
  if (!manifest || typeof manifest !== "object") throw new Error(`${fileLabel}: „manifest“ fehlt.`);
  for (const key of ["id", "name", "version"] as const) {
    if (typeof manifest[key] !== "string" || !manifest[key].trim()) throw new Error(`${fileLabel}: manifest.${key} fehlt oder ist leer.`);
  }
  if (!ID_RE.test(manifest.id)) throw new Error(`${fileLabel}: manifest.id „${manifest.id}“ ist ungültig (nur Buchstaben, Ziffern, „-“/„_“, beginnt mit einem Buchstaben).`);
  if (manifest.configFields !== undefined && !Array.isArray(manifest.configFields)) throw new Error(`${fileLabel}: manifest.configFields muss ein Array sein.`);
  const operations = m.operations;
  if (!operations || typeof operations !== "object" || Array.isArray(operations)) throw new Error(`${fileLabel}: „operations“ fehlt oder ist kein Objekt.`);
  const opNames = Object.keys(operations);
  if (opNames.length === 0) throw new Error(`${fileLabel}: „operations“ braucht mindestens eine Funktion.`);
  for (const name of opNames) {
    if (typeof operations[name] !== "function") throw new Error(`${fileLabel}: operations.${name} ist keine Funktion.`);
  }
  return { manifest, operations };
}

/** Frisches require(): Cache wird vorher geleert, damit ein erneuter Upload/Reload die neue Version sieht. */
export function loadCustomPluginFile(filePath: string): RawPluginModule {
  const abs = resolve(filePath);
  delete req.cache[abs];
  let mod: unknown;
  try {
    mod = req(abs);
  } catch (e) {
    throw new Error(`Datei lässt sich nicht laden: ${e instanceof Error ? e.message : String(e)}`);
  }
  return validateModule(mod, filePath);
}

function customDirFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => extname(f).toLowerCase() === ".js" && statSync(join(dir, f)).isFile())
    .sort();
}

export interface InstallResult {
  ok: boolean;
  message?: string;
  manifest?: { id: string; name: string; version: string };
}

/**
 * Prueft die hochgeladene Datei (frisches require, volle Validierung) und kopiert sie erst bei
 * Erfolg unveraendert nach <dir>/<id>.js. Lehnt IDs ab, die mit eingebauten Plugins kollidieren.
 */
export function installCustomPlugin(dir: string, sourceFilePath: string, builtinIds: ReadonlySet<string>): InstallResult {
  try {
    if (!existsSync(sourceFilePath) || !statSync(sourceFilePath).isFile()) return { ok: false, message: "Datei nicht gefunden." };
    if (extname(sourceFilePath).toLowerCase() !== ".js") return { ok: false, message: "Nur .js-Dateien werden unterstützt." };
    const size = statSync(sourceFilePath).size;
    if (size > MAX_SOURCE_BYTES) return { ok: false, message: `Datei ist zu groß (${Math.round(size / 1024)} KB, Limit 2048 KB).` };

    const loaded = loadCustomPluginFile(sourceFilePath);
    const id = loaded.manifest.id;
    if (builtinIds.has(id)) return { ok: false, message: `„${id}“ ist bereits der Name eines eingebauten Plugins.` };

    mkdirSync(dir, { recursive: true });
    const dest = join(dir, `${id}.js`);
    if (!isInside(dir, dest)) return { ok: false, message: "Ungültige Plugin-ID." };
    const src = readFileSync(sourceFilePath);
    writeFileSync(dest, src);
    // Cache der Zieldatei ebenfalls leeren, falls dort zuvor schon eine andere Version lag.
    delete req.cache[resolve(dest)];
    return { ok: true, manifest: { id: loaded.manifest.id, name: loaded.manifest.name, version: loaded.manifest.version } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export function removeCustomPlugin(dir: string, id: string): { ok: boolean; message?: string } {
  if (!ID_RE.test(id)) return { ok: false, message: "Ungültige Plugin-ID." };
  const file = join(dir, `${id}.js`);
  if (!isInside(dir, file)) return { ok: false, message: "Ungültige Plugin-ID." };
  if (!existsSync(file)) return { ok: false, message: "Plugin-Datei nicht gefunden." };
  try {
    delete req.cache[resolve(file)];
    unlinkSync(file);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export interface LoadAllResult {
  modules: Array<RawPluginModule & { fileName: string }>;
  issues: CustomPluginIssue[];
}

/** Laedt alle *.js aus <dir> frisch; ungueltige/kollidierende Dateien werden uebersprungen und als Issue gemeldet statt den Start zu blockieren. */
export function loadAllCustomPlugins(dir: string, builtinIds: ReadonlySet<string>): LoadAllResult {
  const modules: Array<RawPluginModule & { fileName: string }> = [];
  const issues: CustomPluginIssue[] = [];
  const seen = new Set<string>();
  for (const fileName of customDirFiles(dir)) {
    try {
      const mod = loadCustomPluginFile(join(dir, fileName));
      if (builtinIds.has(mod.manifest.id)) {
        issues.push({ fileName, message: `ID „${mod.manifest.id}“ kollidiert mit einem eingebauten Plugin.` });
        continue;
      }
      if (seen.has(mod.manifest.id)) {
        issues.push({ fileName, message: `ID „${mod.manifest.id}“ ist bereits durch eine andere Datei belegt.` });
        continue;
      }
      seen.add(mod.manifest.id);
      modules.push({ ...mod, fileName });
    } catch (e) {
      issues.push({ fileName, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { modules, issues };
}

export { ID_RE as CUSTOM_PLUGIN_ID_RE, MAX_SOURCE_BYTES as CUSTOM_PLUGIN_MAX_BYTES };
