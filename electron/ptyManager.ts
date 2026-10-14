/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import { spawn as spawnProcess } from "child_process";
import { randomUUID } from "crypto";
import type { WebContents } from "electron";
import { connect, type Socket } from "net";
import { join } from "path";
import { PIPE_PATH, onMessages, pushBounded, send } from "./ptyProtocol";

export interface PaneSpawnOptions {
  cwd: string;
  shellOverride?: string;
  args?: string[];
  env?: Record<string, string>;
  /** Optional ASCII splash shown (and then cleared) before the agent starts. */
  banner?: string;
}

export interface PaneHooks {
  /** Fired on every output chunk, in addition to the normal IPC push to the
   * renderer — lets SessionManager track activity/backlog without the
   * renderer needing to stay mounted (background sessions, Phase "Sessions"). */
  onData?: (id: string, data: string) => void;
  onExit?: (id: string, code: number) => void;
}

interface ManagedPane {
  id: string;
  launched: boolean;
  /** Local mirror of the daemon's bounded raw-output buffer, so getBacklog()
   * stays synchronous (replay into a re-attached xterm, .air compaction). */
  buffer: string[];
  bufferBytes: number;
}

interface Watcher {
  sender: WebContents | null;
  hooks?: PaneHooks;
}

export const DEFAULT_SHELL = process.platform === "win32" ? "powershell.exe" : (process.env.SHELL || "bash");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A pane counts as "done" (agent finished its answer, waiting for input) once
 * it has been silent for `idleMs` after a real burst of output (not just typing echo). */
const IDLE_MIN_BYTES = 400;

/**
 * Client for the PTY daemon (ptyHost.ts), which owns every terminal process.
 * Panes are NOT tied to this Electron process: quitting or crashing the app
 * leaves them running, and connect() adopts whatever survived. Closing a pane
 * in the UI doesn't kill it either — only an explicit stop, project deletion
 * or "Beenden & alle Sessions stoppen" does (see SessionManager).
 */
export class PtyManager {
  private sock: Socket | null = null;
  private panes = new Map<string, ManagedPane>();
  private watchers = new Map<string, Watcher>();
  private detaching = false;
  private quiet = new Map<string, { bytes: number; timer?: NodeJS.Timeout }>();
  /** Silence needed before a pane counts as done; adjustable from the cat settings. */
  idleMs = 8_000;
  /** Fired when the connection to the PTY daemon drops unexpectedly. */
  onLost?: () => void;
  /** Fired when a pane goes quiet after producing output (see idleMs). */
  onIdle?: (id: string) => void;

  private tryConnect(): Promise<Socket | null> {
    return new Promise((resolve) => {
      const s = connect(PIPE_PATH);
      s.once("connect", () => resolve(s));
      s.once("error", () => resolve(null));
    });
  }

  /** Connects to the daemon (starting it detached if it isn't running) and
   * mirrors the panes that are still alive there. Must finish before spawn(). */
  async connect(): Promise<void> {
    let sock = await this.tryConnect();
    if (!sock) {
      // ELECTRON_RUN_AS_NODE: node-pty is compiled for the Electron ABI, not system node.
      spawnProcess(process.execPath, [join(__dirname, "ptyHost.js")], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
      }).unref();
      for (let i = 0; i < 50 && !sock; i++) {
        await sleep(100);
        sock = await this.tryConnect();
      }
    }
    if (!sock) throw new Error("PTY daemon not reachable");
    this.sock = sock;
    sock.on("error", () => {});
    sock.on("close", () => {
      // The daemon died (not our own detach): its panes are gone, but that is
      // NOT the agents ending on their own, so don't run the per-pane exit
      // path (it would mark every session "exited" and switch off auto-resume).
      if (!this.detaching) this.onLost?.();
    });
    await new Promise<void>((resolve) => {
      onMessages(sock!, (m) => {
        if (m.t === "list") {
          for (const p of m.panes as { id: string; backlog: string }[]) {
            this.panes.set(p.id, { id: p.id, launched: true, buffer: [p.backlog], bufferBytes: p.backlog.length });
            this.watchers.set(p.id, { sender: null });
          }
          resolve();
        } else if (m.t === "data") {
          this.handleData(m.id, m.data);
        } else if (m.t === "exit") {
          this.handleExit(m.id, m.code);
        }
      });
      send(sock, { t: "list" });
    });
  }

  private handleData(id: string, data: string): void {
    const pane = this.panes.get(id);
    if (pane) pushBounded(pane, data);
    const w = this.watchers.get(id);
    if (!w) return;
    if (w.sender && !w.sender.isDestroyed()) w.sender.send(`pty:data:${id}`, data);
    w.hooks?.onData?.(id, data);
    const q = this.quiet.get(id) ?? { bytes: 0 };
    q.bytes += data.length;
    clearTimeout(q.timer);
    q.timer = setTimeout(() => {
      if (q.bytes > IDLE_MIN_BYTES && this.panes.has(id)) this.onIdle?.(id);
      q.bytes = 0;
    }, this.idleMs);
    this.quiet.set(id, q);
  }

  private handleExit(id: string, code: number): void {
    const w = this.watchers.get(id);
    // Drop the pane first so hooks see it as no longer live (SessionManager
    // finalizes a session once none of its panes is live).
    this.panes.delete(id);
    this.watchers.delete(id);
    clearTimeout(this.quiet.get(id)?.timer);
    this.quiet.delete(id);
    if (!w) return;
    if (w.sender && !w.sender.isDestroyed()) w.sender.send(`pty:exit:${id}`, code);
    w.hooks?.onExit?.(id, code);
  }

  /** Re-attaches a pane that survived in the daemon to the current window/hooks. */
  adopt(id: string, sender: WebContents, hooks?: PaneHooks): boolean {
    const w = this.watchers.get(id);
    if (!w || !this.panes.has(id)) return false;
    w.sender = sender;
    w.hooks = hooks;
    return true;
  }

  spawn(opts: PaneSpawnOptions, sender: WebContents, hooks?: PaneHooks): string {
    return this.spawnWithId(randomUUID(), opts, sender, hooks);
  }

  /** Same as spawn(), but lets the caller fix the id up front — used by
   * SessionManager so the SQLite session row and the live pty share one id. */
  spawnWithId(id: string, opts: PaneSpawnOptions, sender: WebContents, hooks?: PaneHooks): string {
    const managed: ManagedPane = { id, launched: false, buffer: [], bufferBytes: 0 };
    this.panes.set(id, managed);
    this.watchers.set(id, { sender, hooks });

    const launch = () => {
      managed.launched = true;
      send(this.sock, {
        t: "spawn",
        id,
        shell: opts.shellOverride || DEFAULT_SHELL,
        args: opts.args || [],
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env }
      });
    };

    if (opts.banner) {
      const show = (d: string) => {
        pushBounded(managed, d);
        if (!sender.isDestroyed()) sender.send(`pty:data:${id}`, d);
      };
      show(opts.banner);
      setTimeout(() => {
        if (this.panes.get(id) !== managed) return; // killed during the splash
        show("\x1b[2J\x1b[3J\x1b[H");
        managed.buffer.length = 0; // splash must not leak into saved context
        managed.bufferBytes = 0;
        launch();
      }, 1500);
    } else {
      launch();
    }
    return id;
  }

  write(id: string, data: string): boolean {
    const pane = this.panes.get(id);
    if (!pane?.launched) return false; // unknown, or still showing the splash
    send(this.sock, { t: "write", id, data });
    return true;
  }

  resize(id: string, cols: number, rows: number): boolean {
    const pane = this.panes.get(id);
    if (!pane) return false;
    if (pane.launched && cols > 0 && rows > 0) send(this.sock, { t: "resize", id, cols, rows });
    return true;
  }

  kill(id: string): boolean {
    const pane = this.panes.get(id);
    if (!pane) return false;
    if (pane.launched) send(this.sock, { t: "kill", id });
    else this.handleExit(id, 0); // still in the splash: nothing to kill remotely
    this.panes.delete(id);
    return true;
  }

  killAll(): void {
    send(this.sock, { t: "killAll" });
    this.panes.clear();
  }

  /** Leaves the daemon (and every pane in it) running; call on app quit. */
  detach(): void {
    this.detaching = true;
    this.sock?.end();
  }

  has(id: string): boolean {
    return this.panes.has(id);
  }

  /** Raw backlog for a still-running pane, e.g. to replay into a freshly
   * (re)mounted xterm instance, or to compact into an .air file. */
  getBacklog(id: string): string | null {
    const pane = this.panes.get(id);
    if (!pane) return null;
    return pane.buffer.join("");
  }

  /** Every currently-live pane id. */
  liveIds(): string[] {
    return Array.from(this.panes.keys());
  }
}
