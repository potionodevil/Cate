/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconSquareGlyph,
  IconUndo,
  IconWrapText
} from "@/icons";

type Scope = "working" | "branch" | "lastRound";
type FileStatus = "modified" | "added" | "deleted" | "renamed" | "untracked";

interface DiffLine { type: "add" | "del" | "ctx"; oldNo: number | null; newNo: number | null; text: string }
interface DiffHunk { header: string; oldStart: number; newStart: number; lines: DiffLine[] }
interface DiffFile {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  hunks: DiffHunk[];
  staged?: boolean;
  unstaged?: boolean;
  truncated?: boolean;
}
interface DiffResult {
  ok: boolean;
  message?: string;
  files?: DiffFile[];
  truncated?: boolean;
  hasMark?: boolean;
  base?: string | null;
  totals?: { files: number; additions: number; deletions: number };
}

export interface GitDiffPanelProps {
  projectRoot: string | null;
  call: (op: string, args: any) => Promise<any>;
  /** App-Datenordner fuer die Rundenmarke (wird als args.appDataDir durchgereicht). */
  appDataDir?: string;
  /** Wenn gesetzt, erscheint der Schliessen-Button. */
  onClose?: () => void;
  initialScope?: Scope;
}

const SCOPES: { id: Scope; label: string }[] = [
  { id: "working", label: "Nicht committet" },
  { id: "branch", label: "Branch" },
  { id: "lastRound", label: "Letzte Runde" }
];

const STATUS_META: Record<FileStatus, { letter: string; label: string; cls: string }> = {
  modified: { letter: "M", label: "Geändert", cls: "text-[var(--accent)]" },
  added: { letter: "A", label: "Hinzugefügt", cls: "text-[var(--success)]" },
  untracked: { letter: "N", label: "Neu (nicht verfolgt)", cls: "text-[var(--success)]" },
  deleted: { letter: "D", label: "Gelöscht", cls: "text-[var(--danger)]" },
  renamed: { letter: "R", label: "Umbenannt", cls: "text-[var(--text-secondary)]" }
};

const LINE_LIMIT = 1500;
const POLL_MS = 8000;

const TINT_ADD = "bg-[color-mix(in_srgb,var(--success)_11%,transparent)]";
const TINT_DEL = "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]";

function splitPath(p: string): { dir: string; name: string } {
  const i = p.lastIndexOf("/");
  return i < 0 ? { dir: "", name: p } : { dir: p.slice(0, i + 1), name: p.slice(i + 1) };
}

function ToolButton({
  label,
  onClick,
  disabled,
  active,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          className={`h-[24px] w-[24px] shrink-0 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
            active ? "bg-[var(--bg-active)] text-[var(--text-primary)]" : ""
          }`}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function EmptyState({ children, action }: { children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <IconSquareGlyph size={9} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Keine Diffs</span>
      </div>
      {children ? <p className="max-w-[220px] text-[11px] leading-snug text-[var(--text-muted)]">{children}</p> : null}
      {action}
    </div>
  );
}

const DiffBody = React.memo(function DiffBody({ file, wrap }: { file: DiffFile; wrap: boolean }) {
  const [limit, setLimit] = useState(LINE_LIMIT);
  if (file.binary) {
    return <div className="px-3 py-2 text-[11px] text-[var(--text-muted)]">Binärdatei, keine Textvorschau.</div>;
  }
  if (file.hunks.length === 0) {
    return <div className="px-3 py-2 text-[11px] text-[var(--text-muted)]">Keine Zeilenänderungen (nur Modus oder Umbenennung).</div>;
  }
  let budget = limit;
  let hidden = 0;
  const blocks: React.ReactNode[] = [];
  file.hunks.forEach((h, hi) => {
    const take = Math.max(0, Math.min(h.lines.length, budget));
    budget -= take;
    hidden += h.lines.length - take;
    if (take === 0 && hi > 0) return;
    blocks.push(
      <div key={hi}>
        <div className="truncate border-y border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{h.header}</div>
        {h.lines.slice(0, take).map((l, li) => (
          <div
            key={li}
            className={`flex min-w-full ${wrap ? "" : "w-max"} ${l.type === "add" ? TINT_ADD : l.type === "del" ? TINT_DEL : ""}`}
          >
            <span className="w-9 shrink-0 select-none pr-1.5 text-right tabular-nums text-[var(--text-muted)] opacity-70">{l.oldNo ?? ""}</span>
            <span className="w-9 shrink-0 select-none pr-1.5 text-right tabular-nums text-[var(--text-muted)] opacity-70">{l.newNo ?? ""}</span>
            <span
              className={`w-3 shrink-0 select-none text-center ${
                l.type === "add" ? "text-[var(--success)]" : l.type === "del" ? "text-[var(--danger)]" : "text-transparent"
              }`}
            >
              {l.type === "add" ? "+" : l.type === "del" ? "-" : " "}
            </span>
            <span className={`flex-1 pr-2 ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"} text-[var(--text-primary)]`}>{l.text || " "}</span>
          </div>
        ))}
      </div>
    );
  });
  return (
    <div className={`font-mono text-[11px] leading-[1.55] ${wrap ? "" : "overflow-x-auto"}`} style={{ fontFamily: "var(--font-mono)" }}>
      {blocks}
      {hidden > 0 ? (
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="text-[11px] text-[var(--text-muted)]">{hidden} weitere Zeilen ausgeblendet</span>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setLimit((n) => n + LINE_LIMIT * 2)}>
            Mehr anzeigen
          </Button>
        </div>
      ) : null}
      {file.truncated ? <div className="px-3 py-1.5 text-[11px] text-[var(--text-muted)]">Datei gekürzt dargestellt.</div> : null}
    </div>
  );
});

function FileSection({
  file,
  open,
  onOpenChange,
  wrap,
  canAct,
  busy,
  onStage,
  onUnstage,
  onRevert
}: {
  file: DiffFile;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  wrap: boolean;
  canAct: boolean;
  busy: boolean;
  onStage: (f: DiffFile) => void;
  onUnstage: (f: DiffFile) => void;
  onRevert: (f: DiffFile) => void;
}) {
  const meta = STATUS_META[file.status];
  const { dir, name } = splitPath(file.path);
  const fullyStaged = file.staged && !file.unstaged;
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="border-b border-[var(--border)]">
      <div className="group flex items-center gap-1 pr-1.5 hover:bg-[var(--bg-hover)]">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          >
            <span className="shrink-0 text-[var(--text-muted)]">{open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}</span>
            <span className={`w-3 shrink-0 text-center font-mono text-[10px] font-semibold ${meta.cls}`} title={meta.label} aria-label={meta.label}>
              {meta.letter}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px]" title={file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path}>
              <span className="text-[var(--text-muted)]">{dir}</span>
              <span className="text-[var(--text-primary)]">{name}</span>
            </span>
            {file.staged ? (
              <Badge variant="outline" className="h-4 shrink-0 rounded px-1 text-[9px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                {fullyStaged ? "Stage" : "Teils"}
              </Badge>
            ) : null}
            <span className="shrink-0 font-mono text-[10px] tabular-nums">
              {file.additions > 0 ? <span className="text-[var(--success)]">+{file.additions}</span> : null}
              {file.additions > 0 && file.deletions > 0 ? " " : null}
              {file.deletions > 0 ? <span className="text-[var(--danger)]">-{file.deletions}</span> : null}
            </span>
          </button>
        </CollapsibleTrigger>
        {canAct ? (
          <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {fullyStaged ? (
              <ToolButton label="Aus Stage nehmen" disabled={busy} onClick={() => onUnstage(file)}>
                <IconMinus size={13} />
              </ToolButton>
            ) : (
              <ToolButton label="Stagen" disabled={busy} onClick={() => onStage(file)}>
                <IconPlus size={13} />
              </ToolButton>
            )}
            <ToolButton label="Änderungen verwerfen" disabled={busy} onClick={() => onRevert(file)}>
              <IconUndo size={13} />
            </ToolButton>
          </div>
        ) : null}
      </div>
      <CollapsibleContent>{open ? <DiffBody file={file} wrap={wrap} /> : null}</CollapsibleContent>
    </Collapsible>
  );
}

type Confirm = { kind: "all" } | { kind: "file"; file: DiffFile } | null;

export function GitDiffPanel({ projectRoot, call, appDataDir, onClose, initialScope = "working" }: GitDiffPanelProps) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [result, setResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrap, setWrap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const reqId = useRef(0);
  const lastJson = useRef("");

  const baseArgs = useMemo(() => ({ projectRoot, appDataDir }), [projectRoot, appDataDir]);

  const load = useCallback(
    async (silent: boolean) => {
      if (!projectRoot) {
        setResult(null);
        setError(null);
        return;
      }
      const id = ++reqId.current;
      if (!silent) setLoading(true);
      try {
        const r: DiffResult = await call("diff", { ...baseArgs, scope });
        if (id !== reqId.current) return;
        if (!r || r.ok === false) {
          setError(r?.message || "Diff konnte nicht geladen werden.");
          setResult(null);
          lastJson.current = "";
        } else {
          const j = JSON.stringify(r);
          if (j !== lastJson.current) {
            lastJson.current = j;
            setResult(r);
          }
          setError(null);
        }
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : "Diff konnte nicht geladen werden.");
        setResult(null);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [call, baseArgs, projectRoot, scope]
  );

  useEffect(() => {
    lastJson.current = "";
    setResult(null);
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!projectRoot) return;
    const tick = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const t = window.setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", tick);
    };
  }, [load, projectRoot]);

  const files = result?.files ?? [];
  const totalLines = files.reduce((n, f) => n + f.additions + f.deletions, 0);
  // Viele/grosse Diffs starten eingeklappt; Nutzerwahl hat Vorrang.
  const defaultOpen = (f: DiffFile, idx: number) => f.additions + f.deletions < 400 && (files.length <= 6 || (idx < 3 && totalLines < 600));
  const isOpen = (f: DiffFile, idx: number) => (expanded.has(f.path) ? true : collapsed.has(f.path) ? false : defaultOpen(f, idx));
  const setOpen = (f: DiffFile, v: boolean) => {
    setCollapsed((s) => { const n = new Set(s); if (v) n.delete(f.path); else n.add(f.path); return n; });
    setExpanded((s) => { const n = new Set(s); if (v) n.add(f.path); else n.delete(f.path); return n; });
  };

  const mutate = useCallback(
    async (op: string, extra: Record<string, unknown>) => {
      setBusy(true);
      try {
        const r = await call(op, { ...baseArgs, ...extra });
        if (!r || r.ok === false) setError(r?.message || "Aktion fehlgeschlagen.");
        else setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
      } finally {
        setBusy(false);
        await load(true);
      }
    },
    [call, baseArgs, load]
  );

  const markRound = useCallback(async () => {
    await mutate("markRoundStart", {});
  }, [mutate]);

  const canAct = scope === "working" && !!projectRoot;
  const pathArgs = (f: DiffFile) => ({ path: f.path, oldPath: f.status === "renamed" ? f.oldPath : null });

  const emptyBody = (() => {
    if (!projectRoot) return <EmptyState>Kein Projekt ausgewählt.</EmptyState>;
    if (scope === "lastRound" && result && result.hasMark === false) {
      return (
        <EmptyState
          action={
            <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={busy} onClick={() => void markRound()}>
              Runde jetzt markieren
            </Button>
          }
        >
          Es wurde noch kein Rundenstart gemerkt.
        </EmptyState>
      );
    }
    if (scope === "branch" && result?.base) return <EmptyState>Keine Unterschiede zu {result.base}.</EmptyState>;
    return <EmptyState />;
  })();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-h-0 w-full flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <div className="flex shrink-0 items-start gap-1.5 border-b border-[var(--border)] px-1.5 py-1.5">
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)} className="min-w-0 flex-1">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
              {SCOPES.map((s) => (
                <TabsTrigger
                  key={s.id}
                  value={s.id}
                  className="h-auto min-h-[30px] whitespace-normal rounded-md px-1 py-1 text-center text-[11px] font-medium leading-tight text-[var(--text-secondary)] data-[state=active]:border data-[state=active]:border-[var(--border-strong)] data-[state=active]:bg-[var(--bg-active)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none"
                >
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex shrink-0 items-center gap-0.5 pt-1">
            <ToolButton label={wrap ? "Zeilenumbruch aus" : "Zeilenumbruch an"} active={wrap} onClick={() => setWrap((w) => !w)}>
              <IconWrapText size={14} />
            </ToolButton>
            <ToolButton
              label="Alle stagen"
              disabled={!canAct || busy || files.length === 0}
              onClick={() => void mutate("stageAll", {})}
            >
              <IconPlus size={14} />
            </ToolButton>
            <ToolButton label="Alle Änderungen verwerfen" disabled={!canAct || busy || files.length === 0} onClick={() => setConfirm({ kind: "all" })}>
              <IconUndo size={14} />
            </ToolButton>
            <ToolButton label="Aktualisieren" disabled={!projectRoot || loading} onClick={() => void load(false)}>
              <span className={loading ? "animate-spin" : ""}>
                <IconRefresh size={14} />
              </span>
            </ToolButton>
            {onClose ? (
              <ToolButton label="Schließen" onClick={onClose}>
                <IconClose size={14} />
              </ToolButton>
            ) : null}
          </div>
        </div>

        {error ? (
          <div role="alert" className="shrink-0 border-b border-[var(--border)] bg-[var(--danger-dim)] px-3 py-1.5 text-[11px] leading-snug text-[var(--danger)]">
            {error}
          </div>
        ) : null}
        {result?.truncated ? (
          <div className="shrink-0 border-b border-[var(--border)] px-3 py-1 text-[10px] text-[var(--text-muted)]">
            Sehr großer Diff, Anzeige wurde gekürzt.
          </div>
        ) : null}
        {files.length > 0 && result?.totals ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-1 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
            <span>{result.totals.files} {result.totals.files === 1 ? "Datei" : "Dateien"}</span>
            <span className="text-[var(--success)]">+{result.totals.additions}</span>
            <span className="text-[var(--danger)]">-{result.totals.deletions}</span>
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          {loading && !result ? (
            <div className="flex h-full min-h-[160px] items-center justify-center text-[11px] text-[var(--text-muted)]" role="status">
              Lade Änderungen...
            </div>
          ) : files.length === 0 ? (
            error && !result ? null : emptyBody
          ) : (
            <ScrollArea className="h-full">
              <div className="[&>div]:!block">
                {files.map((f, i) => (
                  <FileSection
                    key={`${f.oldPath ?? ""}>${f.path}`}
                    file={f}
                    open={isOpen(f, i)}
                    onOpenChange={(v) => setOpen(f, v)}
                    wrap={wrap}
                    canAct={canAct}
                    busy={busy}
                    onStage={(file) => void mutate("stageFile", pathArgs(file))}
                    onUnstage={(file) => void mutate("unstageFile", pathArgs(file))}
                    onRevert={(file) => setConfirm({ kind: "file", file })}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "all" ? "Alle Änderungen verwerfen?" : "Änderungen verwerfen?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "all"
                ? "Alle nicht committeten Änderungen werden zurückgesetzt und neue, nicht verfolgte Dateien gelöscht. Das lässt sich nicht rückgängig machen."
                : confirm?.kind === "file"
                  ? `Die Änderungen an ${confirm.file.path} gehen unwiderruflich verloren${confirm.file.status === "untracked" ? "; die neue Datei wird gelöscht" : ""}.`
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--danger)] text-white hover:bg-[var(--danger)]/90"
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                if (!c) return;
                if (c.kind === "all") void mutate("revertAll", {});
                else void mutate("revertFile", pathArgs(c.file));
              }}
            >
              Verwerfen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

export default GitDiffPanel;
