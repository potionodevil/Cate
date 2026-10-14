/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { IconAlertCircle, IconChevronRight, IconRefresh, IconSkills } from "@/icons";
import type { ProviderConfigRow, ProviderPluginRow, ProviderSkillRow, ProviderSkillsResult } from "./types";
import type { Project } from "./types";

export interface ProviderSkillsPageProps {
  /** Aktives Projekt (liefert Hermes-Profil und Projektordner für die Collector-Abfragen). */
  project: Project;
}

interface ProviderTab {
  id: string;
  label: string;
  /** Hinweistext, wenn die CLI nicht installiert ist. */
  notInstalledHint: string;
}

const TABS: ProviderTab[] = [
  { id: "hermes", label: "Hermes", notInstalledHint: "Hermes ist nicht installiert." },
  { id: "claude-code", label: "Claude Code", notInstalledHint: "Claude Code ist nicht installiert." },
  { id: "codex", label: "Codex CLI", notInstalledHint: "Codex CLI ist nicht installiert." },
  { id: "opencode", label: "OpenCode", notInstalledHint: "OpenCode ist nicht installiert." }
];

function statusLabel(status: string | undefined): string {
  switch (status) {
    case "enabled":
      return "Aktiv";
    case "disabled":
      return "Inaktiv";
    default:
      return "Unbekannt";
  }
}

/** Quelle/Trust als Kurzform-Badge, nur wenn überhaupt etwas vorliegt. */
function sourceBadgeLabel(source: string | undefined, trust: string | undefined): string | null {
  const s = (source ?? "").trim();
  const t = (trust ?? "").trim();
  if (!s && !t) return null;
  if (s && t) return `${s} · ${t}`;
  return s || t;
}

function StatusDot({ status }: { status: string | undefined }) {
  const cls =
    status === "enabled"
      ? "bg-amber-400"
      : status === "disabled"
        ? "bg-muted-foreground/40"
        : "bg-red-500";
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", cls)} aria-hidden />;
}

function SkillRow({ skill }: { skill: ProviderSkillRow }) {
  const badge = sourceBadgeLabel(skill.source, skill.trust);
  return (
    <Card className="flex items-center gap-2.5 border-border/70 bg-card/60 p-2.5 shadow-none">
      <StatusDot status={skill.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{skill.name}</div>
        {skill.category && <div className="text-[11px] text-muted-foreground">{skill.category}</div>}
      </div>
      {badge && (
        <Badge variant="outline" className="shrink-0 rounded-sm px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
          {badge}
        </Badge>
      )}
      <Badge variant="secondary" className="shrink-0 rounded-sm px-1.5 py-0 text-[10px] font-normal">
        {statusLabel(skill.status)}
      </Badge>
    </Card>
  );
}

/** Plugin-Zeile: der Schalter ist bewusst deaktiviert — die Quelle wird
 * vom CLI selbst gepflegt; der Hinweis nennt den bearbeitbaren Pfad. */
function PluginRow({ plugin, editPath }: { plugin: ProviderPluginRow; editPath?: string }) {
  return (
    <Card className="flex items-center gap-2.5 border-border/70 bg-card/60 p-2.5 shadow-none">
      <StatusDot status={plugin.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{plugin.name}</div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {plugin.version && <span className="font-mono">v{plugin.version}</span>}
          {plugin.marketplace && <span className="truncate">{plugin.marketplace}</span>}
        </div>
      </div>
      {plugin.source && (
        <Badge variant="outline" className="shrink-0 rounded-sm px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
          {plugin.source}
        </Badge>
      )}
      <div className="flex shrink-0 items-center gap-2">
        <Switch
          checked={plugin.status === "enabled"}
          disabled
          aria-label={`${plugin.name} ist ${statusLabel(plugin.status)}`}
        />
        <Badge variant="secondary" className="rounded-sm px-1.5 py-0 text-[10px] font-normal">
          {statusLabel(plugin.status)}
        </Badge>
      </div>
      {editPath && <span className="sr-only">in {editPath} bearbeiten</span>}
    </Card>
  );
}

function ConfigRow({ row }: { row: ProviderConfigRow }) {
  return (
    <Card className="flex items-center gap-2.5 border-border/70 bg-card/60 p-2.5 shadow-none">
      <div className="min-w-0 flex-1 truncate text-sm">{row.name}</div>
      {row.value && (
        <Badge variant="outline" className="shrink-0 rounded-sm px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
          {row.value}
        </Badge>
      )}
    </Card>
  );
}

/** Ein einklappbarer Gruppenblock (Titel + Zähl-Badge + Liste). */
function Group({
  title,
  count,
  defaultOpen,
  children
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen ?? true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-sm text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={open}
          >
            <span className={cn("inline-flex transition-transform duration-fast", open && "rotate-90")}>
              <IconChevronRight size={10} />
            </span>
            {title}
          </button>
        </CollapsibleTrigger>
        <Badge variant="outline" className="h-4 rounded-full px-1.5 font-mono text-[10px] font-normal tabular-nums text-muted-foreground">
          {count}
        </Badge>
      </div>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-[hh-collapsible-down_var(--duration-normal)_var(--ease-standard)] data-[state=closed]:animate-[hh-collapsible-up_var(--duration-normal)_var(--ease-standard)]">
        <div className="flex flex-col gap-2 pt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProviderTabContent({
  presetId,
  notInstalledHint,
  request
}: {
  presetId: string;
  notInstalledHint: string;
  request: (presetId: string) => Promise<ProviderSkillsResult>;
}) {
  const [state, setState] = React.useState<ProviderSkillsResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [installed, setInstalled] = React.useState<boolean | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await request(presetId);
      setState(result);
    } catch {
      setState({ ok: false, message: "Abfrage fehlgeschlagen.", skills: [], plugins: [], configs: [], paths: {} });
    } finally {
      setLoading(false);
    }
  }, [presetId, request]);

  React.useEffect(() => {
    void load();
    void window.harness
      .detectInstalledAgents()
      .then((list) => {
        const entry = list.find((d) => d.id === presetId);
        setInstalled(entry ? entry.installed : true);
      })
      .catch(() => setInstalled(null));
  }, [load]);

  if (loading && !state) {
    return <p className="m-0 px-0.5 text-xs text-muted-foreground">Wird geladen …</p>;
  }
  if (installed === false) {
    return <p className="m-0 px-0.5 text-xs text-muted-foreground">{notInstalledHint}</p>;
  }
  if (!state) {
    return <p className="m-0 px-0.5 text-xs text-muted-foreground">Keine Daten.</p>;
  }
  const empty = state.skills.length === 0 && state.plugins.length === 0 && state.configs.length === 0;
  return (
    <div className="space-y-4">
      {(!state.ok || empty) && (
        <div className="flex items-start gap-2 rounded-md border border-border/70 bg-background/60 px-3 py-2">
          <span className="mt-0.5 text-muted-foreground">
            <IconAlertCircle size={14} />
          </span>
          <p className="m-0 text-xs text-muted-foreground">
            {state.ok ? "Keine Skills, Plugins oder Konfigurationen gefunden." : state.message ?? "Quelle nicht lesbar."}
          </p>
        </div>
      )}
      {state.skills.length > 0 && (
        <Group title="Skills" count={state.skills.length} defaultOpen>
          {state.skills.map((s) => (
            <SkillRow key={`${s.name}-${s.source ?? ""}`} skill={s} />
          ))}
        </Group>
      )}
      {state.plugins.length > 0 && (
        <>
          {state.skills.length > 0 && <Separator className="bg-border/70" />}
          <Group title="Plugins" count={state.plugins.length} defaultOpen>
            {state.plugins.map((p) => (
              <PluginRow key={`${p.name}-${p.marketplace ?? ""}`} plugin={p} editPath={state.paths.plugins} />
            ))}
          </Group>
        </>
      )}
      {state.configs.length > 0 && (
        <>
          {(state.skills.length > 0 || state.plugins.length > 0) && <Separator className="bg-border/70" />}
          <Group title="Konfigurationen" count={state.configs.length} defaultOpen={false}>
            {state.configs.map((c) => (
              <ConfigRow key={c.name} row={c} />
            ))}
          </Group>
        </>
      )}

      {state.ok && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
          {state.paths.skills && (
            <span className="text-[11px] text-muted-foreground">Skills: in {state.paths.skills} bearbeiten</span>
          )}
          {state.paths.plugins && (
            <span className="text-[11px] text-muted-foreground">Plugins: in {state.paths.plugins} bearbeiten</span>
          )}
          {state.paths.configs && (
            <span className="text-[11px] text-muted-foreground">Konfiguration: in {state.paths.configs} bearbeiten</span>
          )}
          {state.countLine && <span className="text-[11px] text-muted-foreground">{state.countLine}</span>}
        </div>
      )}
    </div>
  );
}

export function ProviderSkillsPage({ project }: ProviderSkillsPageProps) {
  const [providerFilter, setProviderFilter] = React.useState("hermes");
  const [refreshKey, setRefreshKey] = React.useState(0);
  const projectFolder = project.folder;

  const request = React.useCallback(
    async (presetId: string): Promise<ProviderSkillsResult> => {
      // Hermes-Profil vom aktiven Projekt ableiten, sonst globaler Collector.
      const profile = presetId === "hermes" ? project.hermesProfile : undefined;
      return window.harness.providerSkills(presetId, { profile, projectFolder });
    },
    [projectFolder, project.hermesProfile]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            <IconSkills size={16} />
          </span>
          <h2 className="m-0 text-sm font-medium">Skills &amp; Plugins je Provider</h2>
          <span className="font-mono text-[11px] text-muted-foreground">{project.name}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">Schreibgeschützt: Verwaltung im jeweiligen CLI bzw. Verzeichnis.</span>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setRefreshKey((k) => k + 1)}>
          <IconRefresh size={13} />
          Neu laden
        </Button>
      </div>
      <Tabs value={providerFilter} onValueChange={setProviderFilter} aria-label="Provider auswählen">
        <div className="px-6">
          <TabsList className="h-8 w-max justify-start bg-transparent p-0">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="h-7 gap-1.5 px-2.5 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <Separator className="mt-2 bg-border/70" />
      </Tabs>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-6 pb-6 pt-4" key={`${providerFilter}-${refreshKey}`}>
          <ProviderTabContent
            presetId={providerFilter}
            notInstalledHint={TABS.find((t) => t.id === providerFilter)?.notInstalledHint ?? "Nicht installiert."}
            request={request}
          />
        </div>
      </ScrollArea>
    </div>
  );
}

export default ProviderSkillsPage;
