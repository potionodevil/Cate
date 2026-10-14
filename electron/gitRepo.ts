/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { join } from "path";

const execFileAsync = promisify(execFile);

/** Derive a sensible local folder name from a git remote URL, e.g.
 * "https://github.com/foo/bar.git" -> "bar", "git@host:foo/bar" -> "bar". */
export function repoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/[/\\]+$/, "");
  const last = trimmed.split(/[/\\:]/).pop() || "repo";
  const cleaned = last.replace(/\.git$/i, "").trim();
  return cleaned || "repo";
}

export async function isGitAvailable(): Promise<boolean> {
  try {
    await execFileAsync("git", ["--version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/** Clones a remote repo into <parentFolder>/<repo-name> and returns the
 * resulting path on success. Never hand-rolls git plumbing beyond `clone`. */
export async function cloneRepository(
  url: string,
  parentFolder: string
): Promise<{ ok: boolean; path?: string; message: string }> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return { ok: false, message: "Keine Repository-URL angegeben." };
  }
  if (!parentFolder.trim() || !existsSync(parentFolder)) {
    return { ok: false, message: "Zielordner existiert nicht." };
  }
  const name = repoNameFromUrl(trimmedUrl);
  const dest = join(parentFolder, name);
  if (existsSync(dest)) {
    return { ok: false, message: `Ordner "${name}" existiert bereits in ${parentFolder}.` };
  }
  try {
    await execFileAsync("git", ["clone", trimmedUrl, dest], { timeout: 180_000 });
    return { ok: true, path: dest, message: `Repository nach ${dest} geklont.` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
