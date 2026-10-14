/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { gzipSync, gunzipSync } from "zlib";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

/**
 * ".air" (Agent-Interaction-Record) format: a lossy, token-frugal compaction
 * of raw terminal output, meant to be read by an LLM cheaply — not a replay
 * format. Strips ANSI escape codes/control sequences, collapses repeated
 * blank lines and duplicated lines (spinners/progress bars), hard-truncates
 * extremely long lines, and keeps only the tail when the whole thing is
 * still too big. Stored gzip-compressed on disk (small, still plain text
 * once decompressed so it stays greppable/debuggable).
 */

const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const MAX_LINE_CHARS = 400;
const DEFAULT_MAX_CHARS = 20_000;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, "").replace(CONTROL_CHARS, "");
}

/** Compact raw terminal text into a token-frugal summary string. Pure
 * function, no I/O, so it's independently unit-testable. */
export function compactTerminalLog(raw: string, maxChars = DEFAULT_MAX_CHARS): string {
  const cleaned = stripAnsi(raw).replace(/\r/g, "");
  const rawLines = cleaned.split("\n");

  const lines: string[] = [];
  let blankRun = 0;
  let prevLine: string | null = null;
  let repeatCount = 0;

  const flushRepeat = () => {
    if (prevLine !== null && repeatCount > 1) {
      lines.push(`${prevLine}  [x${repeatCount}]`);
    } else if (prevLine !== null) {
      lines.push(prevLine);
    }
  };

  for (const rawLine of rawLines) {
    const line = rawLine.length > MAX_LINE_CHARS ? rawLine.slice(0, MAX_LINE_CHARS) + " …" : rawLine;
    const trimmed = line.trim();

    if (trimmed === "") {
      blankRun++;
      if (blankRun > 1) continue; // collapse runs of blank lines to one
    } else {
      blankRun = 0;
    }

    if (trimmed === prevLine?.trim()) {
      repeatCount++;
      continue;
    }
    flushRepeat();
    prevLine = line;
    repeatCount = 1;
  }
  flushRepeat();

  let result = lines.join("\n").trim();
  if (result.length > maxChars) {
    result = `[... gekürzt, zeige letzte ${maxChars} von ${result.length} Zeichen ...]\n` + result.slice(-maxChars);
  }
  return result;
}

/** Compact prose/instructions text (project-level "memory"), as opposed to
 * `compactTerminalLog`'s ANSI-stripping/tail-biased handling of raw terminal
 * spew. Project instructions usually front-load the important part, so when
 * too long this keeps the HEAD and truncates the tail — the opposite bias
 * from the terminal-log compactor. Pure function, no I/O. */
export function compactProjectContext(raw: string, maxChars = 6000): string {
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  const collapsed = trimmed.replace(/\n{3,}/g, "\n\n");
  if (collapsed.length <= maxChars) return collapsed;
  const head = collapsed.slice(0, maxChars);
  return `${head}\n[... gekürzt, ${maxChars} von ${collapsed.length} Zeichen ...]`;
}

/** Resolves raw backspace/delete bytes (\x7f, \b) a terminal line-editor
 * would have applied, so a buffered line of raw keystrokes reads as what
 * the user actually ended up with, not the literal typed bytes (which
 * include every correction). Used by session auto-titling. */
export function applyBackspaces(input: string): string {
  const out: string[] = [];
  for (const ch of input) {
    if (ch === "\x7f" || ch === "\b") {
      out.pop();
    } else {
      out.push(ch);
    }
  }
  return out.join("");
}

/** Heuristic: does this look like a trivial shell command rather than an
 * agent task? A session's first line is often just `ls`/`cd`/`git status`
 * — titling the session after that produces useless "ls" names. Executed
 * against the ALREADY backspace-resolved line; deliberately conservative
 * (only common builtins/frequently-run dev tools), because a false "task"
 * is worse than no auto-title (the user can always rename manually). */
export function looksLikeShellCommand(resolvedLine: string): boolean {
  const t = resolvedLine.trim();
  if (!t) return false;
  // bare builtin
  if (/^(ls|dir|pwd|cd|clear|cls|exit|history|type|cat|echo|which|where|whoami|date|time|env|set|export|source|mkdir|rmdir|rm|cp|mv|touch|head|tail|less|more|man|help|alias|unalias|fg|bg|jobs|kill|ps|top|df|du|free|uname|hostname|open|start|code|nano|vim|vi|gvim|notepad|tree|findstr|fc|comp|curl|wget|ping|ipconfig|ifconfig|netstat|nslookup|ssh|scp|sftp|apt|apt-get|brew|choco|winget|npm|pnpm|yarn|node|deno|bun|python|python3|pip|pip3|cargo|go|rustc|gcc|make|cmake|git|gh|docker|kubectl|helm|terraform|ansible)\b(\s|$)/i.test(t)) return true;
  // common patterns that say "shell noise", not an agent task
  if (/^(sudo\s+)?(ls|cd|git|npm|node|python|pip|docker|cargo)\b/i.test(t) && t.length < 60) {
    // short one-liner dev command like `git status`, `npm run dev`
    return true;
  }
  return false;
}

/** Turns one line of raw user keystrokes into a short session title, or
 * null if there isn't enough real content yet (empty, whitespace-only, or
 * just a bare Enter) — used to auto-name a pane after its first real
 * message instead of leaving it as a generic "Hermes"/"Shell" label.
 * Umlaute/Gross-/Kleinschreibung bleiben unveraendert (kein downcase, kein
 * Slug-Stripping — das ist ein Anzeigetitel, kein Profilname). A trivial
 * shell command ("ls", "git status") is REJECTED so the capture keeps
 * waiting for the first real task line. */
export function deriveSessionTitle(rawLine: string, maxChars = 60): string | null {
  // Bracketed-paste markers (xterm wraps pasted text in ESC[200~ … ESC[201~)
  // would otherwise leak into the title.
  const noPaste = rawLine.replace(/\x1b\[200~/g, "").replace(/\x1b\[201~/g, "");
  const resolved = stripAnsi(applyBackspaces(noPaste));
  // strip wrapping quotes/backticks users often paste
  const trimmed = resolved.trim().replace(/^[`"'{\[]+/, "").replace(/[`"'}\]]+$/, "").trim();
  if (trimmed.length < 2) return null;
  if (looksLikeShellCommand(trimmed)) return null;
  // TUI-Platzhalter ("Ask anything, or type / for commands…") und Statuszeilen
  // ("msg=interrupt · /queue") sind keine echten Nutzeraufgaben.
  if (/^ask anything/i.test(trimmed) || /^msg=/.test(trimmed)) return null;
  // Slash commands (/model, /clear, …) are controls, not a task.
  if (trimmed.startsWith("/")) return null;
  // ponytail: heuristic "summary" = drop leading politeness, keep the first 8 words; an LLM summary is the upgrade
  const words = trimmed
    .replace(/^((hey|hi|hallo|bitte|please|kannst du( mir)?|könntest du|can you|could you|i need you to|ich möchte( dass du)?)[\s,]+)+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  const short = words.length > 8 ? words.slice(0, 8).join(" ") + "…" : words.join(" ");
  return short.length > maxChars ? short.slice(0, maxChars - 1).trimEnd() + "…" : short;
}

/** Extracts the first meaningful TASK LINE from a chunk of terminal output
 * the Hermes CLI itself echoes — its TUI prints a "hh-<profile> ❯ <text>"
 * status line (or an equivalent "❯ <text>" variant) that mirrors the user's
 * current prompt text. Feeding that OUT of the terminal into captureTitle
 * is the only reliable way to auto-title Hermes TUI sessions: the TUI times
 * keystrokes itself (interpreter mode), so raw stdin writes never carry the
 * final text alone in one chunk. Returns null when nothing looks like a
 * prompt echo (banners, boot log, ANSI noise). Umlaute/case preserved. */
export function deriveTitleFromPromptEcho(chunk: string, maxChars = 60): string | null {
  // Only the LAST prompt line matters — the chunk may contain boot banners.
  const candidates: string[] = [];
  for (const raw of chunk.split(/\r?\n/)) {
    const line = raw.replace(/\x1b\[200~/g, "").replace(/\x1b\[201~/g, "");
    const m = line.match(/(?:^|\s)hh-[a-z0-9-]{1,40}\s*❯\s*(.+?)\s*$/i);
    if (m && m[1]) candidates.push(m[1]);
  }
  if (candidates.length === 0) return null;
  return deriveSessionTitle(candidates[candidates.length - 1], maxChars);
}

export function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function writeAirFile(path: string, content: string): void {
  ensureDir(path);
  writeFileSync(path, gzipSync(Buffer.from(content, "utf-8")));
}

export function readAirFile(path: string): string {
  const buf = readFileSync(path);
  return gunzipSync(buf).toString("utf-8");
}
