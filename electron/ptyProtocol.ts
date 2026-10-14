/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import type { Socket } from "net";
import { tmpdir, userInfo } from "os";
import { join } from "path";

/** Shared by the PTY daemon (ptyHost.ts) and its client (ptyManager.ts).
 * One JSON object per line over a named pipe (unix socket off Windows). */
const user = userInfo().username.replace(/\W/g, "_");
export const PIPE_PATH =
  process.env.HH_PTY_PIPE || // tests point this at a throwaway pipe so they never touch live sessions
  (process.platform === "win32" ? `\\\\.\\pipe\\hermes-harness-pty-${user}` : join(tmpdir(), `hermes-harness-pty-${user}.sock`));

/** Cap the per-pane backlog so a long-running background pane stays bounded (~300KB). */
export const MAX_BUFFER_BYTES = 300_000;

export function onMessages(sock: Socket, cb: (m: any) => void): void {
  let rest = "";
  sock.setEncoding("utf8");
  sock.on("data", (chunk: string) => {
    rest += chunk;
    let i: number;
    while ((i = rest.indexOf("\n")) >= 0) {
      const line = rest.slice(0, i);
      rest = rest.slice(i + 1);
      if (!line) continue;
      try {
        cb(JSON.parse(line));
      } catch {
        /* skip malformed line */
      }
    }
  });
}

export function send(sock: Socket | null, m: unknown): void {
  if (sock && !sock.destroyed) sock.write(JSON.stringify(m) + "\n");
}

/** Appends to a bounded chunk list (drops oldest chunks past MAX_BUFFER_BYTES). */
export function pushBounded(pane: { buffer: string[]; bufferBytes: number }, data: string): void {
  pane.buffer.push(data);
  pane.bufferBytes += data.length;
  while (pane.bufferBytes > MAX_BUFFER_BYTES && pane.buffer.length > 1) pane.bufferBytes -= pane.buffer.shift()!.length;
}
