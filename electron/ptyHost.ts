/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/**
 * PTY daemon: owns every terminal process so they outlive the Electron app
 * (closing/crashing/updating Hermes Harness no longer kills them). Electron
 * starts it detached with ELECTRON_RUN_AS_NODE=1 (node-pty is built for the
 * Electron ABI) and talks to it over a named pipe — see ptyManager.ts.
 * A PC reboot still kills it; the app then respawns sessions via agent resume.
 */
import { spawn as spawnProcess } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { createServer, type Socket } from "net";
import { PIPE_PATH, onMessages, pushBounded, send } from "./ptyProtocol";

let ptyModule: typeof import("@homebridge/node-pty-prebuilt-multiarch") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ptyModule = require("@homebridge/node-pty-prebuilt-multiarch");
} catch {
  /* degraded pipe mode below */
}

interface Pane {
  kind: "pty" | "pipe";
  proc: any;
  buffer: string[];
  bufferBytes: number;
}

const panes = new Map<string, Pane>();
const clients = new Set<Socket>();
const broadcast = (m: unknown) => clients.forEach((c) => send(c, m));

// ponytail: exit after 30s with no panes and no client; no keep-alive config.
function exitWhenIdle(): void {
  if (panes.size || clients.size) return;
  setTimeout(() => {
    if (!panes.size && !clients.size) process.exit(0);
  }, 30_000);
}

function spawnPane(id: string, shell: string, args: string[], cwd: string, env: Record<string, string>): void {
  const pane: Pane = { kind: "pty", proc: null, buffer: [], bufferBytes: 0 };
  const onData = (data: string) => {
    pushBounded(pane, data);
    broadcast({ t: "data", id, data });
  };
  const onExit = (code: number) => {
    panes.delete(id);
    broadcast({ t: "exit", id, code });
    exitWhenIdle();
  };
  try {
    if (ptyModule) {
      pane.proc = ptyModule.spawn(shell, args, { name: "xterm-color", cols: 80, rows: 24, cwd, env });
      pane.proc.onData(onData);
      pane.proc.onExit(({ exitCode }: { exitCode: number }) => onExit(exitCode));
    } else {
      pane.kind = "pipe";
      pane.proc = spawnProcess(shell, args, { cwd, env, shell: false });
      pane.proc.stdout.on("data", (c: Buffer) => onData(c.toString("utf-8")));
      pane.proc.stderr.on("data", (c: Buffer) => onData(c.toString("utf-8")));
      pane.proc.on("exit", (code: number | null) => onExit(code ?? 0));
      pane.proc.on("error", (e: Error) => {
        onData(`spawn failed: ${e.message}\r\n`);
        onExit(127);
      });
    }
    panes.set(id, pane);
  } catch (e) {
    broadcast({ t: "data", id, data: `spawn failed: ${e instanceof Error ? e.message : String(e)}\r\n` });
    broadcast({ t: "exit", id, code: 127 });
  }
}

function killPane(id: string): void {
  try {
    panes.get(id)?.proc?.kill();
  } catch {
    /* already dead */
  }
}

function handle(sock: Socket, m: any): void {
  const pane = panes.get(m.id);
  switch (m.t) {
    case "spawn":
      spawnPane(m.id, m.shell, m.args ?? [], m.cwd, m.env ?? {});
      break;
    case "write":
      if (pane?.kind === "pty") pane.proc.write(m.data);
      else pane?.proc.stdin.write(m.data);
      break;
    case "resize":
      if (pane?.kind === "pty" && m.cols > 0 && m.rows > 0) pane.proc.resize(m.cols, m.rows);
      break;
    case "kill":
      killPane(m.id);
      break;
    case "killAll":
      for (const id of [...panes.keys()]) killPane(id);
      break;
    case "list":
      send(sock, { t: "list", panes: [...panes].map(([id, p]) => ({ id, backlog: p.buffer.join("") })) });
      break;
  }
}

// ponytail: swallow stray errors so one bad pane can't take every terminal down.
process.on("uncaughtException", () => {});

if (process.platform !== "win32" && existsSync(PIPE_PATH)) unlinkSync(PIPE_PATH);
const server = createServer((sock) => {
  clients.add(sock);
  onMessages(sock, (m) => {
    try {
      handle(sock, m);
    } catch {
      /* bad message for a dead pane */
    }
  });
  sock.on("error", () => {});
  sock.on("close", () => {
    clients.delete(sock);
    exitWhenIdle();
  });
});
server.on("error", () => process.exit(1)); // pipe already served by another daemon
server.listen(PIPE_PATH);
