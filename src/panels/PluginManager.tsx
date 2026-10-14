/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  IconAlertCircle,
  IconCheckCircle,
  IconChevronLeft,
  IconEye,
  IconEyeOff,
  IconPlay,
  IconPlugin,
  IconSearch,
  PluginGlyph
} from "@/icons";
import {
  PLUGIN_CATEGORIES,
  categoryLabel,
  resolveCategory,
  resolveDisplay,
  resolveIcon,
  resolveStatus,
  statusLabel,
  type PluginConfigField,
  type PluginInfo,
  type PluginStatus
} from "@/pluginCatalog";

export type { PluginInfo } from "@/pluginCatalog";

export interface PluginManagerProps {
  plugins: PluginInfo[];
  onToggle: (id: string, enabled: boolean) => void;
  onConfigChange: (id: string, key: string, value: unknown) => void;
  onInvoke: (id: string, op: string, args?: unknown) => Promise<unknown>;
  /** Gespeicherte Konfiguration je Plugin-ID. Geheimnisse werden nie angezeigt. */
  config: Record<string, Record<string, unknown>>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional: Plugin beim Oeffnen direkt in der Detailansicht zeigen. */
  initialPluginId?: string | null;
}

const STATUS_DOT: Record<PluginStatus, string> = {
  active: "bg-amber-400",
  inactive: "bg-muted-foreground/40",
  error: "bg-red-500"
};

function StatusDot({ status, withLabel }: { status: PluginStatus; withLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground" title={statusLabel(status)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[status])} aria-hidden />
      {withLabel ? statusLabel(status) : <span className="sr-only">{statusLabel(status)}</span>}
    </span>
  );
}

function PluginCard({ plugin, onOpen, onToggle }: { plugin: PluginInfo; onOpen: () => void; onToggle: (v: boolean) => void }) {
  const { name, description } = resolveDisplay(plugin);
  const status = resolveStatus(plugin);
  return (
    <Card
      className={cn(
        "hh-plugin-row group flex cursor-pointer flex-row items-center gap-3 border-transparent bg-transparent px-3 py-2.5 shadow-none transition-colors hover:bg-[var(--bg-hover)]",
        !plugin.enabled && "opacity-80"
      )}
      role="button"
      tabIndex={0}
      aria-label={`${name} öffnen`}
      onClick={(e) => {
        if (e.button !== 0) return;
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="hh-plugin-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
        <PluginGlyph name={resolveIcon(plugin)} size={16} />
      </span>
      <div className="min-w-0 flex-[1.1]">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">v{plugin.version}</span>
          <StatusDot status={status} withLabel />
        </div>
      </div>
      <p className="m-0 hidden min-w-0 flex-[2] truncate text-xs text-muted-foreground md:block" title={description}>{description}</p>
      <span className="hidden shrink-0 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground lg:inline">{categoryLabel(resolveCategory(plugin))}</span>
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Switch checked={plugin.enabled} onCheckedChange={onToggle} aria-label={`${name} aktivieren`} />
      </div>
    </Card>
  );
}

/* ----------------------------- Konfigurationsformular ----------------------------- */

type Draft = Record<string, unknown>;

function listToText(v: unknown): string {
  return Array.isArray(v) ? v.join("\n") : typeof v === "string" ? v : "";
}

function ConfigFieldRow({
  field,
  value,
  secretSet,
  onChange
}: {
  field: PluginConfigField;
  value: unknown;
  secretSet: boolean;
  onChange: (v: unknown) => void;
}) {
  const [reveal, setReveal] = React.useState(false);
  const id = `pm-field-${field.key}`;
  const label = (
    <Label htmlFor={id} className="text-xs font-medium">
      {field.label}
      {field.required && <span className="ml-1 text-muted-foreground">(erforderlich)</span>}
    </Label>
  );
  const help = field.description ? <p className="m-0 text-[11px] leading-4 text-muted-foreground">{field.description}</p> : null;

  if (field.type === "boolean") {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          {label}
          {help}
        </div>
        <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />
      </div>
    );
  }

  let control: React.ReactNode;
  switch (field.type) {
    case "number":
      control = (
        <Input
          id={id}
          type="number"
          className="h-8 font-mono text-xs"
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
          value={typeof value === "number" || typeof value === "string" ? String(value) : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      );
      break;
    case "select":
      control = (
        <Select value={typeof value === "string" ? value : undefined} onValueChange={onChange}>
          <SelectTrigger id={id} className="h-8 text-xs">
            <SelectValue placeholder={field.placeholder ?? "Auswählen"} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    case "secret":
      control = (
        <div className="flex items-center gap-1.5">
          <Input
            id={id}
            type={reveal ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            className="h-8 font-mono text-xs"
            placeholder={secretSet ? "Gespeichert - zum Ändern neu eingeben" : field.placeholder ?? "Wert eingeben"}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={reveal ? "Wert verbergen" : "Wert anzeigen"}
            aria-pressed={reveal}
            onClick={() => setReveal((r) => !r)}
          >
            {reveal ? <IconEyeOff size={14} /> : <IconEye size={14} />}
          </Button>
        </div>
      );
      break;
    case "list":
      control = (
        <Textarea
          id={id}
          rows={3}
          className="min-h-[64px] font-mono text-xs"
          placeholder={field.placeholder ?? "Ein Eintrag pro Zeile"}
          value={listToText(value)}
          onChange={(e) =>
            onChange(
              e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
        />
      );
      break;
    default:
      control = (
        <Input
          id={id}
          className="h-8 text-xs"
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
  return (
    <div className="space-y-1.5">
      {label}
      {control}
      {help}
    </div>
  );
}

function ConfigForm({
  plugin,
  stored,
  onConfigChange
}: {
  plugin: PluginInfo;
  stored: Record<string, unknown>;
  onConfigChange: PluginManagerProps["onConfigChange"];
}) {
  const fields = plugin.configFields ?? [];
  // Geheimnisse werden bewusst nie aus dem gespeicherten Zustand vorbefuellt.
  const initial = React.useCallback(() => {
    const d: Draft = {};
    for (const f of fields) {
      if (f.type === "secret") continue;
      d[f.key] = stored[f.key] ?? f.default;
    }
    return d;
  }, [fields, stored]);
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [touched, setTouched] = React.useState<Set<string>>(new Set());
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setDraft(initial());
    setTouched(new Set());
    setSaved(false);
    // nur beim Plugin-Wechsel zuruecksetzen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin.id]);

  if (fields.length === 0) {
    return <p className="m-0 text-xs text-muted-foreground">Dieses Plugin hat keine Einstellungen.</p>;
  }

  const missing = fields.filter(
    (f) => f.required && f.type !== "secret" && (draft[f.key] === undefined || draft[f.key] === "" || (Array.isArray(draft[f.key]) && (draft[f.key] as unknown[]).length === 0))
  );

  function save() {
    for (const key of touched) {
      const f = fields.find((x) => x.key === key);
      const v = draft[key];
      if (f?.type === "secret" && (v === undefined || v === "")) continue;
      onConfigChange(plugin.id, key, v);
    }
    // Geheimnisse nach dem Speichern aus dem lokalen Entwurf entfernen.
    setDraft((d) => {
      const next = { ...d };
      for (const f of fields) if (f.type === "secret") delete next[f.key];
      return next;
    });
    setTouched(new Set());
    setSaved(true);
  }

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <ConfigFieldRow
          key={f.key}
          field={f}
          value={draft[f.key]}
          secretSet={f.type === "secret" && stored[f.key] !== undefined && stored[f.key] !== ""}
          onChange={(v) => {
            setDraft((d) => ({ ...d, [f.key]: v }));
            setTouched((t) => new Set(t).add(f.key));
            setSaved(false);
          }}
        />
      ))}
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" disabled={touched.size === 0 || missing.length > 0} onClick={save}>
          Speichern
        </Button>
        {missing.length > 0 && <span className="text-[11px] text-muted-foreground">Erforderlich: {missing.map((m) => m.label).join(", ")}</span>}
        {saved && touched.size === 0 && <span className="text-[11px] text-muted-foreground">Gespeichert.</span>}
      </div>
    </div>
  );
}

/* ----------------------------------- Test-Bereich ----------------------------------- */

interface TestResult {
  ok: boolean;
  op: string;
  text: string;
  at: Date;
}

function stringify(v: unknown): string {
  if (v === undefined) return "Keine Rückgabe.";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function TestPanel({ plugin, onInvoke }: { plugin: PluginInfo; onInvoke: PluginManagerProps["onInvoke"] }) {
  const ops = plugin.operations ?? [];
  const [op, setOp] = React.useState<string>(ops[0] ?? "");
  const [args, setArgs] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<TestResult | null>(null);

  React.useEffect(() => {
    setOp(plugin.operations?.[0] ?? "");
    setArgs("");
    setResult(null);
  }, [plugin.id, plugin.operations]);

  if (ops.length === 0) {
    return <p className="m-0 text-xs text-muted-foreground">Dieses Plugin stellt keine testbaren Operationen bereit.</p>;
  }

  async function run() {
    let parsed: unknown = undefined;
    if (args.trim()) {
      try {
        parsed = JSON.parse(args);
      } catch {
        setResult({ ok: false, op, text: "Argumente sind kein gültiges JSON.", at: new Date() });
        return;
      }
    }
    setBusy(true);
    try {
      const out = await onInvoke(plugin.id, op, parsed);
      setResult({ ok: true, op, text: stringify(out), at: new Date() });
    } catch (err) {
      setResult({ ok: false, op, text: err instanceof Error ? err.message : "Operation fehlgeschlagen.", at: new Date() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Operation</Label>
          <Select value={op} onValueChange={setOp}>
            <SelectTrigger className="h-8 font-mono text-xs">
              <SelectValue placeholder="Operation wählen" />
            </SelectTrigger>
            <SelectContent>
              {ops.map((o) => (
                <SelectItem key={o} value={o} className="font-mono text-xs">
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pm-test-args" className="text-xs font-medium">
            Argumente (JSON, optional)
          </Label>
          <Input id="pm-test-args" className="h-8 font-mono text-xs" placeholder='{"pfad": "src"}' value={args} onChange={(e) => setArgs(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" className="gap-1.5" disabled={busy || !op || !plugin.enabled} onClick={run}>
          <IconPlay size={12} />
          {busy ? "Läuft" : "Testen"}
        </Button>
        {!plugin.enabled && <span className="text-[11px] text-muted-foreground">Plugin zuerst aktivieren.</span>}
      </div>
      {result ? (
        <Alert variant={result.ok ? "default" : "destructive"} className="py-2.5">
          <span className="absolute left-4 top-3.5">{result.ok ? <IconCheckCircle size={14} /> : <IconAlertCircle size={14} />}</span>
          <AlertTitle className="text-xs">
            {result.ok ? "Letztes Ergebnis" : "Fehler"} - <span className="font-mono">{result.op}</span>
            <span className="ml-2 font-normal text-muted-foreground">{result.at.toLocaleTimeString("de-DE")}</span>
          </AlertTitle>
          <AlertDescription>
            <pre className="m-0 mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4">{result.text}</pre>
          </AlertDescription>
        </Alert>
      ) : (
        <p className="m-0 text-[11px] text-muted-foreground">Noch kein Test ausgeführt.</p>
      )}
    </div>
  );
}

/* ------------------------------------- Detailansicht ------------------------------------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="m-0 mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{children}</h3>;
}

function PluginDetail({
  plugin,
  stored,
  onBack,
  onToggle,
  onConfigChange,
  onInvoke
}: {
  plugin: PluginInfo;
  stored: Record<string, unknown>;
  onBack: () => void;
  onToggle: PluginManagerProps["onToggle"];
  onConfigChange: PluginManagerProps["onConfigChange"];
  onInvoke: PluginManagerProps["onInvoke"];
}) {
  const { name, description } = resolveDisplay(plugin);
  const status = resolveStatus(plugin);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border/70 px-5 py-3">
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onBack}>
          <IconChevronLeft size={13} />
          Übersicht
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-background/60 text-muted-foreground">
          <PluginGlyph name={resolveIcon(plugin)} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">v{plugin.version}</span>
            <StatusDot status={status} withLabel />
          </div>
        </div>
        <Badge variant="outline" className="rounded-sm px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
          {categoryLabel(resolveCategory(plugin))}
        </Badge>
        <Switch checked={plugin.enabled} onCheckedChange={(v) => onToggle(plugin.id, v)} aria-label={`${name} aktivieren`} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 px-5 py-4">
          {status === "error" && (
            <Alert variant="destructive" className="py-2.5">
              <span className="absolute left-4 top-3.5">
                <IconAlertCircle size={14} />
              </span>
              <AlertTitle className="text-xs">Plugin meldet einen Fehler</AlertTitle>
              <AlertDescription className="text-xs">{plugin.statusMessage ?? "Details sind nicht verfügbar."}</AlertDescription>
            </Alert>
          )}
          <section>
            <SectionTitle>Beschreibung</SectionTitle>
            <p className="m-0 text-sm leading-5 text-foreground/90">{description || "Keine Beschreibung vorhanden."}</p>
          </section>
          <section>
            <SectionTitle>Operationen</SectionTitle>
            {(plugin.operations ?? []).length === 0 ? (
              <p className="m-0 text-xs text-muted-foreground">Keine Operationen.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {plugin.operations!.map((o) => (
                  <Badge key={o} variant="secondary" className="rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-normal">
                    {o}
                  </Badge>
                ))}
              </div>
            )}
          </section>
          <Separator />
          <section>
            <SectionTitle>Konfiguration</SectionTitle>
            <ConfigForm plugin={plugin} stored={stored} onConfigChange={onConfigChange} />
          </section>
          <Separator />
          <section>
            <SectionTitle>Testen</SectionTitle>
            <TestPanel plugin={plugin} onInvoke={onInvoke} />
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

/* ------------------------------------------ Dialog ------------------------------------------ */

export function PluginManager({ plugins, onToggle, onConfigChange, onInvoke, config, open, onOpenChange, initialPluginId }: PluginManagerProps) {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) setSelectedId(initialPluginId ?? null);
  }, [open, initialPluginId]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return plugins.filter((p) => {
      if (category !== "all" && resolveCategory(p) !== category) return false;
      if (!q) return true;
      const { name, description } = resolveDisplay(p);
      return `${name} ${description} ${p.id}`.toLowerCase().includes(q);
    });
  }, [plugins, query, category]);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: plugins.length };
    for (const p of plugins) {
      const k = resolveCategory(p);
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [plugins]);

  const selected = selectedId ? plugins.find((p) => p.id === selectedId) ?? null : null;
  const activeCount = plugins.filter((p) => p.enabled).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(80vh,720px)] max-w-4xl flex-col gap-0 overflow-hidden border-border/70 bg-background p-0 sm:rounded-lg">
        <DialogHeader className="space-y-1 border-b border-border/70 px-5 py-4 pr-12">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              <IconPlugin size={16} />
            </span>
            <DialogTitle className="text-sm font-medium">Plugins verwalten</DialogTitle>
            <span className="font-mono text-[11px] text-muted-foreground">
              {activeCount} von {plugins.length} aktiv
            </span>
          </div>
          <DialogDescription className="text-xs">Plugins aktivieren, konfigurieren und testen.</DialogDescription>
        </DialogHeader>

        {selected ? (
          <PluginDetail
            plugin={selected}
            stored={config[selected.id] ?? {}}
            onBack={() => setSelectedId(null)}
            onToggle={onToggle}
            onConfigChange={onConfigChange}
            onInvoke={onInvoke}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-3 border-b border-border/70 px-5 py-3">
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <IconSearch size={14} />
                </span>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Plugins durchsuchen"
                  aria-label="Plugins durchsuchen"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Tabs value={category} onValueChange={setCategory}>
                <ScrollArea className="w-full">
                  <TabsList className="h-8 w-max justify-start bg-transparent p-0">
                    {[{ id: "all", label: "Alle" }, ...PLUGIN_CATEGORIES].map((c) => (
                      <TabsTrigger
                        key={c.id}
                        value={c.id}
                        className="h-7 gap-1.5 px-2.5 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        {c.label}
                        <span className="font-mono text-[10px] text-muted-foreground">{counts[c.id] ?? 0}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </ScrollArea>
              </Tabs>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-1 px-5 py-16 text-center">
                  <span className="text-muted-foreground">
                    <IconPlugin size={20} />
                  </span>
                  <p className="m-0 text-sm">Keine Plugins gefunden</p>
                  <p className="m-0 text-xs text-muted-foreground">Suchbegriff oder Kategorie anpassen.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5 p-3">
                  {filtered.map((p) => (
                    <PluginCard key={p.id} plugin={p} onOpen={() => setSelectedId(p.id)} onToggle={(v) => onToggle(p.id, v)} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PluginManager;
