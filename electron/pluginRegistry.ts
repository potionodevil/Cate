/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
export interface BackendPluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  slots?: ("action" | "sidebar" | "context" | "notification")[];
}

const manifests = new Map<string, BackendPluginManifest>();

export function registerPluginManifest(manifest: BackendPluginManifest): () => void {
  if (!manifest.id.trim() || !manifest.name.trim()) throw new Error("Plugin benötigt ID und Namen.");
  manifests.set(manifest.id, { ...manifest, slots: manifest.slots ? [...manifest.slots] : undefined });
  return () => manifests.delete(manifest.id);
}

export function unregisterPluginManifest(id: string): boolean {
  return manifests.delete(id);
}

export function listPluginManifests(): BackendPluginManifest[] {
  return Array.from(manifests.values()).map((manifest) => ({ ...manifest, slots: manifest.slots ? [...manifest.slots] : undefined }));
}
