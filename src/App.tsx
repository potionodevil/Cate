/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React, { useEffect, useRef, useState } from "react";

import { ProjectSidebar } from "./ProjectSidebar";
import { UsageDashboard } from "./UsageDashboard";
import { ProviderSkillsPage } from "./ProviderSkillsPage";
import { SessionsView } from "./SessionsView";
import { LoadingScreen } from "./LoadingScreen";
import { Onboarding } from "./Onboarding";
import { Settings } from "./Settings";
import { LayoutRenderer } from "./Layout";
import { Greeting } from "./Greeting";
import { LogoMark } from "./icons";
import type { SessionCallbacks, Project, SessionRecord, PaneLayoutNode, AgentPreset } from "./types";
// @ts-expect-error - plain untyped .mjs helper, see layoutLogic.mjs for why
import { initialPaneLayout, splitPaneLayout, collectPaneLeaves, gridArrangeLayout } from "./layoutLogic.mjs";
import { Button } from "@/components/ui/button";
import { ChevronRight, Copy, Minus, PanelLeftClose, PanelLeftOpen, Square, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommandPalette } from "./CommandPalette";
import { PixelBackdrop } from "./PixelScene";
import { SubagentDock } from "./SubagentDock";
import { LiveMetrics } from "./LiveMetrics";
import { RaycastOverlay } from "./RaycastOverlay";
import { NewAgentPopover } from "./NewAgentPopover";
import { HeaderThemePopover } from "./HeaderThemePopover";
import { HeaderPluginsPopover } from "./HeaderPluginsPopover";
import type { ThemeName } from "./themes";
import { PluginManager } from "./panels/PluginManager";
import { GitDiffPanel } from "./panels/GitDiffPanel";
import { pluginRegistry, registerPlugin } from "./pluginRegistry";
import type { PluginInfo } from "./pluginCatalog";
import { IconGit, IconLoop } from "./icons";

interface SessionNode {
  type: "session";
  sessionId: string;
  projectId: string;
  cwd: string;
  name: string;
  paneLayout: PaneLayoutNode;
}

/** Finds the open tab for a session id, or undefined if it isn't open. */
function findTab(tabs: SessionNode[], sessionId: string): SessionNode | undefined {
  return tabs.find((t) => t.sessionId === sessionId);
}

/** Opens a session as its own tab, or is a no-op if it's already open (see
 * findTab) — used to make tab-opening idempotent against the
 * "sessions:spawned" broadcast (the backend fires it for every spawn,
 * including ones the renderer ALSO just appended directly from its own IPC
 * response, e.g. openWorkspace/handleReattach; without this check the same
 * session could get a second tab, showing a confusing duplicate).
 *
 * Each open session is its own switchable TAB, never merged side-by-side
 * into a resizable split — "unterschiedliche Sessions, unterschiedliche
 * Fenster": opening/reattaching a session must not visually cram it next to
 * whatever tab is already active. */
function openOrFocusTab(tabs: SessionNode[], session: SessionNode): SessionNode[] {
  if (findTab(tabs, session.sessionId)) return tabs;
  return [...tabs, session];
}

/** Applies `fn` to the paneLayout of the tab matching `sessionId`. */
function updateTabPaneLayout(tabs: SessionNode[], sessionId: string, fn: (node: PaneLayoutNode) => PaneLayoutNode): SessionNode[] {
  return tabs.map((t) => (t.sessionId === sessionId ? { ...t, paneLayout: fn(t.paneLayout) } : t));
}

/** The preset a newly-added pane in this session should inherit — the
 * session's own first/original pane's preset, so "+" starts another
 * instance of whatever agent is already running in that session instead of
 * a bare shell. This is an agentic CLI harness, not a shell multiplexer. */
function inheritedPresetFor(tabs: SessionNode[], sessionId: string): string {
  const tab = findTab(tabs, sessionId);
  if (!tab) return "hermes";
  const leaves: PaneLayoutNode[] = collectPaneLeaves(tab.paneLayout);
  const first = leaves.find((l) => l.type === "leaf") as { presetId?: string } | undefined;
  return first?.presetId || "hermes";
}

type BootPhase = "loading" | "onboarding" | "ready";
type MainView = "workspace" | "sessions" | "skills";

export function App() {
  const [bootPhase, setBootPhase] = useState<BootPhase>("loading");
  const [userName, setUserName] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  // Every currently-open session is its own tab; only one is rendered at a
  // time (activeTabId). Replaces the old single-tree `layout` state, which
  // used to graft additional sessions as resizable SPLITS next to whatever
  // was already open — that's exactly the "opens next to it instead of in
  // a new tab" behavior the user reported as broken.
  const [tabs, setTabs] = useState<SessionNode[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // Always-current mirror of `tabs` for use inside handlers that must read
  // the latest list synchronously (state updates are async/batched, so
  // reading `tabs` directly inside handleReattach could see a stale list
  // from before a just-started append finished committing).
  const tabsRef = useRef<SessionNode[]>([]);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  // Session ids with a `session:reattach` IPC call currently in flight — guards
  // against the same session being reattached twice from a rapid double-click
  // or two UI entry points (sidebar + command palette) firing concurrently.
  const reattachInFlightRef = useRef<Set<string>>(new Set());
  const [mainView, setMainView] = useState<MainView>("workspace");
  const [showDashboard, setShowDashboard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarPosition, setSidebarPosition] = useState<"left" | "right">("left");
  // Sidebar ausblenden (Strg+\ oder Knopf in der Kopfzeile) — gibt dem Terminal die volle Breite; Wahl bleibt erhalten.
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    try { return localStorage.getItem("cate.sidebarHidden") === "1"; } catch { return false; }
  });
  const [maximized, setMaximized] = useState(false);
  useEffect(() => window.harness.onWindowMaximized?.(setMaximized), []);
  const [theme, setTheme] = useState<ThemeName>("nous");
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [startupReveal, setStartupReveal] = useState(false);
  const [agentPresets, setAgentPresets] = useState<AgentPreset[]>([]);
  const [showNewAgentPopover, setShowNewAgentPopover] = useState(false);
  /** Right-click target for the "+" pane-add button: which session/pane the
   * NewAgentPopover should add the new pane to, in "pane" mode. */
  const [panePickerTarget, setPanePickerTarget] = useState<{ sessionId: string; paneId: string } | null>(null);

  useEffect(() => {
    window.harness.listAgentPresets().then(setAgentPresets).catch(() => {});
  }, []);

  // Plugin-Host (Hauptprozess) <-> Renderer-Registry: Liste/Konfiguration laden,
  // Schalter im Header-Popover und im Plugin-Manager bleiben synchron.
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [pluginConfig, setPluginConfig] = useState<Record<string, Record<string, unknown>>>({});
  const [pluginManagerOpen, setPluginManagerOpen] = useState(false);
  const [showGitDiff, setShowGitDiff] = useState(false);
  const [appDataDir, setAppDataDir] = useState<string | undefined>(undefined);
  const pluginsRef = useRef<PluginInfo[]>([]);
  pluginsRef.current = plugins;

  // Host (plugins-state.json) ist die einzige Quelle der Wahrheit. Veraltete Antworten und
  // Antworten waehrend eines laufenden Schalters duerfen den lokalen Zustand nicht ueberschreiben.
  const reloadSeq = useRef(0);
  const pendingToggles = useRef(0);

  async function reloadPlugins() {
    const seq = ++reloadSeq.current;
    try {
      const [list, cfg] = await Promise.all([window.harness.pluginsList(), window.harness.pluginsGetConfig()]);
      if (seq !== reloadSeq.current || pendingToggles.current > 0) return;
      setPlugins(list);
      setPluginConfig(cfg);
      for (const p of list) {
        pluginRegistry.registerManifest({ id: p.id, name: p.name, version: p.version, description: p.description, category: p.category });
        if (pluginRegistry.isEnabled(p.id) !== p.enabled) pluginRegistry.setEnabled(p.id, p.enabled);
      }
    } catch {
      /* Host nicht erreichbar: Manager bleibt leer */
    }
  }

  async function handlePluginToggle(id: string, enabled: boolean) {
    pendingToggles.current++;
    setPlugins((prev) => prev.map((p) => (p.id === id ? { ...p, enabled, status: enabled ? "active" : "inactive" } : p)));
    if (pluginRegistry.isEnabled(id) !== enabled) pluginRegistry.setEnabled(id, enabled);
    try {
      await window.harness.pluginsSetEnabled(id, enabled);
    } catch {
      /* Host nicht erreichbar: das anschliessende Neuladen stellt den echten Zustand wieder her */
    } finally {
      pendingToggles.current--;
    }
    void reloadPlugins();
  }
  const toggleRef = useRef(handlePluginToggle);
  toggleRef.current = handlePluginToggle;

  async function handlePluginConfig(id: string, key: string, value: unknown) {
    await window.harness.pluginsSetConfig(id, key, value).catch(() => undefined);
    void reloadPlugins();
  }

  async function handleUploadPlugin() {
    const res = await window.harness.uploadCustomPlugin();
    if (res.ok) void reloadPlugins();
    return res;
  }

  async function handleRemoveCustomPlugin(id: string) {
    const res = await window.harness.removeCustomPlugin(id);
    if (res.ok) void reloadPlugins();
    return res;
  }

  useEffect(() => {
    void reloadPlugins();
    void window.harness.pluginsGetAppDataDir().then(setAppDataDir).catch(() => {});
    // Aktion "Git-Diff" (Header-Popover > Aktionen) schaltet das rechte Panel um.
    const unregister = registerPlugin({
      id: "gitDiff",
      name: "Git-Diff",
      version: "1.0.0",
      slots: ["action"],
      actions: [{ id: "gitDiff.toggle", label: "Git-Diff anzeigen", icon: IconGit, contextKinds: ["project"], run: () => setShowGitDiff((v) => !v) }]
    });
    // Rechtsklick auf eine Session: "Agent-Loop starten" oeffnet denselben Dialog wie der Linksklick-Button.
    const unregisterLoop = registerPlugin({
      id: "agentLoop",
      name: "Agent-Loop",
      version: "1.0.0",
      slots: ["action"],
      actions: [{ id: "agentLoop.start", label: "Agent-Loop starten …", icon: IconLoop, contextKinds: ["session"], run: (ctx) => { window.dispatchEvent(new CustomEvent("cate:loop-open", { detail: ctx?.targetId })); } }]
    });
    // Schalter im Header-Popover/Dock laufen ueber den Host (kein Rueckspiegeln von Registry-Aenderungen).
    pluginRegistry.setToggleHandler((id, enabled) => void toggleRef.current(id, enabled));
    return () => {
      pluginRegistry.setToggleHandler(null);
      unregister();
      unregisterLoop();
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem("cate.sidebarHidden", sidebarHidden ? "1" : "0"); } catch { /* privater Modus: egal */ }
  }, [sidebarHidden]);

  /** Öffnet das Git-Diff-Panel; ist das Plugin noch aus, führt der Knopf stattdessen zur Plugin-Verwaltung, damit er nie wirkungslos bleibt. */
  const toggleGitDiff = () => {
    if (plugins.find((p) => p.id === "gitDiff")?.enabled) setShowGitDiff((v) => !v);
    else setPluginManagerOpen(true);
  };
  const toggleGitDiffRef = useRef(toggleGitDiff);
  toggleGitDiffRef.current = toggleGitDiff;

  // Strg+\: Sidebar ein-/ausblenden.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        toggleGitDiffRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
        e.preventDefault();
        setSidebarHidden((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Ctrl+K / Cmd+K: toggle the command palette.
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  // Startup: load the saved name (if any) and decide whether to onboard.
  useEffect(() => {
    let cancelled = false;
    const minLoadingMs = 900; // let the race animation actually play once
    const start = Date.now();
    Promise.all([
      window.harness.getUserName(),
      window.harness.getSidebarPosition(),
      window.harness.getTheme(),
      window.harness.getMotionEnabled()
    ]).then(([name, position, savedTheme, motion]) => {
      if (cancelled) return;
      const elapsed = Date.now() - start;
      const wait = Math.max(0, minLoadingMs - elapsed);
      setTimeout(() => {
        if (cancelled) return;
        setUserName(name);
        setSidebarPosition(position);
        setTheme(savedTheme);
        setMotionEnabled(motion);
        setBootPhase(name ? "ready" : "onboarding");
        if (name) window.setTimeout(() => setStartupReveal(true), motion ? 80 : 0);
      }, wait);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply the active theme to the document root so every component's CSS
  // variables repaint immediately when the user switches it in Settings.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Global entrance-animation kill switch (Settings: "Animationen
  // deaktivieren"). Toggling flips one attribute on <html>; theme.css does
  // the rest via html[data-hh-motion="off"] rules.
  useEffect(() => {
    document.documentElement.dataset.hhMotion = motionEnabled ? "on" : "off";
  }, [motionEnabled]);

  // Re-open a tab for every live session of the project (e.g. after an app or
  // PC restart auto-respawned them), so the workspace looks as it was left.
  useEffect(() => {
    if (!activeProject) return;
    const project = activeProject;
    let cancelled = false;
    void window.harness.listSessions(project.id).then((list) => {
      if (cancelled) return;
      const live = list.filter((s) => s.status === "running" && !s.archivedAt && s.paneIds.length > 0);
      if (live.length === 0) return;
      setTabs((prev) =>
        live.reduce((acc, s) => {
          if (findTab(acc, s.id)) return acc;
          const leaves: PaneLayoutNode[] = s.paneIds.map((paneId, i) => ({
            type: "leaf",
            paneId,
            presetId: s.presetId || "shell",
            label: i === 0 ? s.name : `${s.name} #${i + 1}`,
            profile: s.profile ?? undefined,
            model: s.model ?? undefined
          }));
          return openOrFocusTab(acc, {
            type: "session",
            sessionId: s.id,
            projectId: project.id,
            cwd: s.cwd,
            name: s.name,
            paneLayout: gridArrangeLayout(leaves) ?? leaves[0]
          });
        }, prev)
      );
      setActiveTabId((cur) => cur ?? live[0].id);
    });
    return () => {
      cancelled = true;
    };
  }, [activeProject?.id]);

  // Beim Start das Projekt der zuletzt aktiven, noch laufenden bzw. wiederherstellbaren Session oeffnen.
  useEffect(() => {
    if (bootPhase !== "ready" || activeProject) return;
    let cancelled = false;
    void (async () => {
      try {
        const projects: Project[] = await window.harness.listProjects();
        let best: { p: Project; at: number } | null = null;
        for (const p of projects) {
          const list = await window.harness.listSessions(p.id);
          for (const s of list) {
            if (s.archivedAt || (s.status !== "running" && !s.resume)) continue;
            if (!best || s.lastActiveAt > best.at) best = { p, at: s.lastActiveAt };
          }
        }
        if (cancelled || !best) return;
        const chosen = best.p;
        setActiveProject((cur) => cur ?? chosen);
      } catch {
        /* kein Auto-Open */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootPhase, activeProject?.id]);

  // The desktop cat asks to show a session (bubble click / double-click on the
  // cat): switch to its project if needed, then focus its tab. Refs keep the
  // handler current without re-subscribing on every render.
  const latestRef = useRef({ activeProject, handleReattach, selectProject });
  latestRef.current = { activeProject, handleReattach, selectProject };
  const pendingTabRef = useRef<string | null>(null);
  useEffect(() => {
    return window.harness.onPetOpenSession(async ({ sessionId, projectId }) => {
      const { activeProject: current, handleReattach: reattach, selectProject: select } = latestRef.current;
      setShowDashboard(false);
      setMainView("workspace");
      if (current?.id !== projectId) {
        const project = (await window.harness.listProjects()).find((p: Project) => p.id === projectId);
        if (!project) return;
        pendingTabRef.current = sessionId; // focused by the effect below once the project's tabs are restored
        select(project);
      } else if (findTab(tabsRef.current, sessionId)) {
        setActiveTabId(sessionId);
      } else {
        const record = (await window.harness.listSessions(projectId)).find((s: SessionRecord) => s.id === sessionId);
        if (record) await reattach(record);
      }
    });
  }, []);
  useEffect(() => {
    const id = pendingTabRef.current;
    if (id && findTab(tabs, id)) {
      pendingTabRef.current = null;
      setActiveTabId(id);
    }
  }, [tabs]);

  // An agent can open its own tracked sub-terminal. When that happens for the
  // project currently open, append a new Session node for it.
  useEffect(() => {
    const dispose = window.harness.onSessionSpawned((info) => {
      setActiveProject((current) => {
        if (!current || current.id !== info.projectId) return current;
        const sessionNode: SessionNode = {
          type: "session",
          sessionId: info.sessionId,
          projectId: info.projectId,
          cwd: info.cwd,
          name: info.label || info.name,
          paneLayout: initialPaneLayout(info.paneId, info.presetId, info.label || info.name, info.profile)
        };
        setTabs((prev) => openOrFocusTab(prev, sessionNode));
        setActiveTabId(sessionNode.sessionId);
        setMainView("workspace");
        setShowDashboard(false);
        return current;
      });
    });
    return dispose;
  }, []);

  function handleOnboardingDone(name: string) {
    setUserName(name);
    setBootPhase("ready");
  }

  function selectProject(p: Project) {
    setActiveProject(p);
    setTabs([]);
    setActiveTabId(null);
    setShowDashboard(false);
    setMainView("workspace");
  }

  async function openWorkspace(p: Project) {
    // Preset/model resolve server-side (precedence: project override >
    // global settings default > hermes); the response returns the effective
    // values so the local pane layout matches what actually spawned.
    const { sessionId, paneId, presetId, name: serverName } = await window.harness.spawnSession({
      projectId: p.id,
      cwd: p.folder,
      name: "",
      presetId: undefined
    });
    const name = serverName || p.name;
    const sessionNode: SessionNode = {
      type: "session",
      sessionId,
      projectId: p.id,
      cwd: p.folder,
      name,
      paneLayout: { type: "leaf", paneId, presetId: presetId || "hermes", label: name }
    };
    setActiveProject(p);
    setTabs([sessionNode]);
    setActiveTabId(sessionNode.sessionId);
    setShowDashboard(false);
    setMainView("workspace");
  }

  /** Linksklick auf "Anderen Agent wählen": statt direkt den Standard-CLI
   * (Hermes bzw. das Projekt-Default) zu starten, zeigt dies den
   * NewAgentPopover zur Auswahl eines beliebigen installierten/verbundenen
   * Agenten (Claude Code, Codex, OpenCode, ...). Der Standard-Start läuft
   * über openWorkspace(). Kein Kontextmenü: Menüs öffnen nur per Linksklick. */
  function openNewAgentPicker() {
    setShowNewAgentPopover(true);
  }

  function handleNewAgentStarted(session: SessionRecord) {
    const p = activeProject;
    if (!p) return;
    const sessionNode: SessionNode = {
      type: "session",
      sessionId: session.id,
      projectId: p.id,
      cwd: p.folder,
      name: session.name,
      paneLayout: {
        type: "leaf",
        paneId: session.paneIds[0],
        presetId: session.presetId || "shell",
        label: session.name,
        profile: session.profile ?? undefined,
        model: session.model ?? undefined
      }
    };
    setActiveProject(p);
    setTabs([sessionNode]);
    setActiveTabId(sessionNode.sessionId);
    setShowDashboard(false);
    setMainView("workspace");
    setShowNewAgentPopover(false);
  }

  async function handleSplit(sessionId: string, paneId: string, direction: "horizontal" | "vertical") {
    setSplitError(null);
    // New panes inherit the session's own already-running agent preset
    // instead of a hardcoded "shell" — "Agentic CLI Harness kein
    // Shell-Distributor": splitting a pane should start another instance
    // of the same agent, not drop you into a bare shell.
    const presetId = inheritedPresetFor(tabsRef.current, sessionId);
    const result = await window.harness.splitSessionPane(sessionId, paneId, direction, presetId);
    if (!result.ok) {
      setSplitError(`${result.error.code}: ${result.error.message}`);
      return;
    }
    const newPaneId = result.paneId;
    setTabs((prev) => updateTabPaneLayout(prev, sessionId, (node) => splitPaneLayout(node, paneId, direction, newPaneId, presetId)));
  }

  /** Grafts a freshly-spawned pane leaf into a session's layout, re-arranged
   * into a sensible grid (see gridArrangeLayout in layoutLogic.mjs) — shared
   * by the plain "+" click (inherits the session's own agent preset) and
   * the right-click agent picker (any installed/connected CLI tool). */
  function insertPaneIntoSession(sessionId: string, newPaneId: string, presetId: string) {
    setTabs((prev) =>
      updateTabPaneLayout(prev, sessionId, (node) => {
        const leaves = collectPaneLeaves(node);
        const newLeaf: PaneLayoutNode = { type: "leaf", paneId: newPaneId, presetId, label: presetId };
        return gridArrangeLayout([...leaves, newLeaf]) ?? newLeaf;
      })
    );
  }

  async function handleAddPane(sessionId: string, paneId: string) {
    setSplitError(null);
    const presetId = inheritedPresetFor(tabsRef.current, sessionId);
    const result = await window.harness.splitSessionPane(sessionId, paneId, "horizontal", presetId);
    if (!result.ok) {
      setSplitError(`${result.error.code}: ${result.error.message}`);
      return;
    }
    insertPaneIntoSession(sessionId, result.paneId, presetId);
  }

  /** Right-click on the "+" pane-add button: opens the agent picker instead
   * of immediately adding a plain shell. */
  function handleRequestPanePicker(sessionId: string, paneId: string) {
    setPanePickerTarget({ sessionId, paneId });
  }

  function handlePaneStarted(result: { paneId: string; presetId: string }) {
    if (!panePickerTarget) return;
    insertPaneIntoSession(panePickerTarget.sessionId, result.paneId, result.presetId);
    setPanePickerTarget(null);
  }

  /** Closes a session's TAB and STOPS the session: the backend saves the
   * context (.air + snapshot) and keeps the row listed in the project; only
   * a manual delete removes it. Reopening restores context (handleReattach). */
  function handleCloseSession(sessionId: string, _opts?: { deleted?: boolean }) {
    // Terminals are persistent: closing a tab only detaches the view; the pty
    // keeps running and the session stays listed. Stop/Delete are explicit.
    const current = tabsRef.current;
    const idx = current.findIndex((t) => t.sessionId === sessionId);
    const next = current.filter((t) => t.sessionId !== sessionId);
    setTabs(next);
    setActiveTabId((prevActive) => {
      if (prevActive !== sessionId) return prevActive;
      const fallback = next[idx] ?? next[idx - 1] ?? next[0];
      return fallback ? fallback.sessionId : null;
    });
  }

  /** Removes one pane from a session's layout (the underlying PTY keeps
   * running — only the local layout removes it) and re-arranges the
   * remaining panes into a sensible grid so closing a pane in the middle
   * of a 2D arrangement doesn't leave an awkward gap. */
  function handleClosePane(sessionId: string, paneId: string) {
    setTabs((prev) =>
      updateTabPaneLayout(prev, sessionId, (node) => {
        const remaining = collectPaneLeaves(node).filter((leaf: PaneLayoutNode) => leaf.type === "leaf" && leaf.paneId !== paneId);
        return gridArrangeLayout(remaining) ?? node;
      })
    );
  }

  // Strict idempotency for opening an existing session: a session already
  // open as a tab is simply focused (no CREATE_SESSION-equivalent IPC
  // round-trip at all), and a reattach already in flight for this id is
  // never started a second time. Without this, rapid double/triple clicks
  // on "Öffnen" (or the sidebar + command palette firing for the same row)
  // could each race their own `session:reattach` IPC call before the
  // first one's result lands, producing the "3 neue Sessions" bug.
  async function handleReattach(session: SessionRecord) {
    if (!activeProject) return;
    if (findTab(tabsRef.current, session.id)) {
      setActiveTabId(session.id);
      setMainView("workspace");
      setShowDashboard(false);
      return;
    }
    if (reattachInFlightRef.current.has(session.id)) return;
    reattachInFlightRef.current.add(session.id);
    try {
      // If the app wasn't restarted, the session's pty may still be alive
      // in the backend (its tab was just closed, or it's reachable from
      // the sidebar/sessions list without ever having been closed in this
      // run) — reconnect to the EXISTING process instead of asking the
      // backend to spawn a brand-new agent. "Beim Schließen keine neue
      // Session... die alte Terminal-Session einfach weiterführen."
      if (session.status === "running" && session.paneIds.length > 0) {
        const probe = await window.harness.attachSessionPane(session.paneIds[0]);
        if (probe) {
          const leaves: PaneLayoutNode[] = session.paneIds.map((paneId, i) => ({
            type: "leaf",
            paneId,
            presetId: session.presetId || "shell",
            label: i === 0 ? session.name : `${session.name} #${i + 1}`,
            profile: session.profile ?? undefined,
            model: session.model ?? undefined
          }));
          const sessionNode: SessionNode = {
            type: "session",
            sessionId: session.id,
            projectId: activeProject.id,
            cwd: session.cwd,
            name: session.name,
            paneLayout: gridArrangeLayout(leaves) ?? leaves[0]
          };
          setTabs((prev) => openOrFocusTab(prev, sessionNode));
          setActiveTabId(sessionNode.sessionId);
          setMainView("workspace");
          setShowDashboard(false);
          return;
        }
        // probe === null: the DB still says "running" but the process is
        // actually gone (e.g. the app itself was restarted) — fall through
        // to the normal respawn-with-restored-context path below.
      }
      const result = await window.harness.reattachSession(session.id, activeProject.id);
      if (!result.ok) return;
      const sessionNode: SessionNode = {
        type: "session",
        sessionId: result.sessionId,
        projectId: activeProject.id,
        cwd: session.cwd,
        name: session.name,
        paneLayout: initialPaneLayout(
          result.paneId,
          session.presetId || "shell",
          session.name,
          session.profile ?? undefined,
          session.model ?? undefined
        )
      };
      setTabs((prev) => openOrFocusTab(prev, sessionNode));
      setActiveTabId(sessionNode.sessionId);
      setMainView("workspace");
      setShowDashboard(false);
    } finally {
      reattachInFlightRef.current.delete(session.id);
    }
  }

  /** Sidebar/Sessions-view delete: if the deleted session has an open tab,
   * close it too so the workspace doesn't keep showing a tab for a session
   * record (and pty) that no longer exists. */
  function handleSessionDeleted(sessionId: string) {
    if (findTab(tabsRef.current, sessionId)) handleCloseSession(sessionId, { deleted: true });
  }

  const sessionCallbacks: SessionCallbacks = {
    onSplit: handleSplit,
    onAddPane: handleAddPane,
    onCloseSession: handleCloseSession,
    onClosePane: handleClosePane,
    onRequestPanePicker: handleRequestPanePicker
  };

  if (bootPhase === "loading") {
    return <LoadingScreen />;
  }
  if (bootPhase === "onboarding") {
    return <Onboarding onDone={handleOnboardingDone} />;
  }

  const activeTab = tabs.find((t) => t.sessionId === activeTabId) ?? null;

  return (
    <div className={startupReveal ? "hh-startup-shell hh-startup-shell-ready" : "hh-startup-shell"} style={{ display: "flex", flex: 1, minHeight: 0, height: "100vh", flexDirection: sidebarPosition === "right" ? "row-reverse" : "row" }}>
      <PixelBackdrop />
      <div style={{ display: sidebarHidden ? "none" : "contents" }}>
      <ProjectSidebar
        activeProjectId={activeProject?.id ?? null}
        onSelect={selectProject}
        onOpenWorkspace={openWorkspace}
        onCreated={selectProject}
        position={sidebarPosition}
        showDashboard={showDashboard}
        onToggleDashboard={() => setShowDashboard((v) => !v)}
        showProviderSkills={mainView === "skills"}
        onToggleProviderSkills={() => setMainView(mainView === "skills" ? "workspace" : "skills")}
        onOpenSettings={() => setShowSettings(true)}
        onOpenSession={handleReattach}
        onSessionDeleted={handleSessionDeleted}
        onOpenSessionsView={() => setMainView("sessions")}
        onOpenPalette={() => setShowPalette(true)}
      />
      </div>
      <div className="hh-workstation-shell" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="hh-workstation-content">
        <header className="hh-topbar hh-entrance-topbar">
          <div className="hh-topbar-drag" aria-label="Fensterleiste" onDoubleClick={(e) => { if (e.target === e.currentTarget) void window.harness.toggleMaximizeWindow().then(setMaximized); }}>
            <button
              type="button"
              className="hh-topbar-sidebar-toggle"
              onClick={() => setSidebarHidden((v) => !v)}
              aria-label={sidebarHidden ? "Sidebar einblenden" : "Sidebar ausblenden"}
              aria-pressed={sidebarHidden}
              title={sidebarHidden ? "Sidebar einblenden (Strg+\)" : "Sidebar ausblenden (Strg+\)"}
            >
              {sidebarHidden ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>
            <span className="hh-topbar-brand"><LogoMark size={18} />Cate</span>
            <ChevronRight size={13} aria-hidden="true" />
            <strong>{activeProject ? activeProject.name : <span className="hh-faint">Kein Projekt gewählt</span>}</strong>
          </div>
          {activeProject && !showDashboard && mainView !== "skills" && (
            <Tabs className="hh-topbar-tabs" value={mainView} onValueChange={(v) => setMainView(v as typeof mainView)} aria-label="Hauptansicht">
              <TabsList className="h-[28px] gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-0.5">
                <TabsTrigger value="workspace" className="h-full min-w-0 rounded-md px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors duration-fast hover:text-[var(--text-primary)] data-[state=active]:bg-[var(--bg-active)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none">Workspace</TabsTrigger>
                <TabsTrigger value="sessions" className="h-full min-w-0 rounded-md px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors duration-fast hover:text-[var(--text-primary)] data-[state=active]:bg-[var(--bg-active)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none">Sessions</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <div className="hh-window-controls" aria-label="Fenstersteuerung">
            {activeProject && (
              <button
                type="button"
                className="hh-topbar-git"
                aria-pressed={showGitDiff}
                aria-label="Git-Diff ein- oder ausblenden"
                title={plugins.find((p) => p.id === "gitDiff")?.enabled ? "Git-Diff (Strg+Umschalt+G)" : "Git-Diff: Plugin zuerst aktivieren"}
                onClick={toggleGitDiff}
              >
                <IconGit size={14} />
                <span>Diff</span>
              </button>
            )}
            <LiveMetrics compact />
            <HeaderThemePopover theme={theme} onThemeChange={setTheme} />
            <HeaderPluginsPopover activeProjectId={activeProject?.id ?? null} onManage={() => setPluginManagerOpen(true)} />
            <button className="hh-window-control" type="button" title="Minimieren" aria-label="Fenster minimieren" onClick={() => void window.harness.minimizeWindow()}>
              <Minus size={15} aria-hidden="true" />
            </button>
            <button className="hh-window-control" type="button" title={maximized ? "Wiederherstellen" : "Maximieren"} aria-label={maximized ? "Fenster wiederherstellen" : "Fenster maximieren"} onClick={() => void window.harness.toggleMaximizeWindow().then(setMaximized)}>
              {maximized ? <Copy size={13} aria-hidden="true" /> : <Square size={13} aria-hidden="true" />}
            </button>
            <button className="hh-window-control hh-window-control-close" type="button" title="Schließen" aria-label="Fenster schließen" onClick={() => void window.harness.closeWindow()}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </header>
        {activeProject && !showDashboard && mainView === "workspace" && tabs.length > 0 && (
          <div className="hh-session-tabbar" role="tablist" aria-label="Offene Sessions">
            {tabs.map((t) => (
              <button
                key={t.sessionId}
                role="tab"
                aria-selected={t.sessionId === activeTabId}
                className={t.sessionId === activeTabId ? "hh-session-tab active" : "hh-session-tab"}
                onClick={() => setActiveTabId(t.sessionId)}
                title={t.name}
              >
                <span className="hh-session-tab-dot hh-status-dot-live" role="img" aria-label="Läuft" title="Läuft" />
                <span className="hh-session-tab-label">{t.name}</span>
                <span
                  className="hh-session-tab-close"
                  role="button"
                  aria-label={`${t.name} schließen`}
                  title="Session stoppen und schließen – bleibt im Projekt"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseSession(t.sessionId);
                  }}
                >
                  <X size={11} aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="hh-workspace-main" style={{ flex: 1, minHeight: 0, position: "relative" }}>
          {splitError && (
            <div role="alert" className="hh-error-banner" onClick={() => setSplitError(null)}>
              {splitError}
            </div>
          )}
          {!activeProject && <Greeting name={userName} />}
          {activeProject && <SubagentDock projectId={activeProject.id} />}
          {activeProject && showDashboard && (
            <div className="hh-slide-in" style={{ height: "100%" }}>
              <UsageDashboard profile={activeProject.hermesProfile} />
            </div>
          )}
          {activeProject && !showDashboard && mainView === "sessions" && (
            <div className="hh-slide-in" style={{ height: "100%" }}>
              <SessionsView projectId={activeProject.id} onReattach={handleReattach} />
            </div>
          )}
          {activeProject && !showDashboard && mainView === "skills" && (
            <div className="hh-slide-in" style={{ height: "100%" }}>
              <ProviderSkillsPage project={activeProject} />
            </div>
          )}
          {activeProject && !showDashboard && mainView === "workspace" && !activeTab && (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <div className="hh-muted">Noch keine Session für dieses Projekt geöffnet.</div>
                <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "center" }}>
                  <Button onClick={() => openWorkspace(activeProject)}>Neue Session starten</Button>
                  <Button variant="outline" onClick={openNewAgentPicker}>Anderen Agent wählen</Button>
                </div>
              </div>
            </div>
          )}
          {activeProject && !showDashboard && mainView === "workspace" && activeTab && (
            <div className="hh-slide-in" style={{ height: "100%" }}>
              <LayoutRenderer node={activeTab} callbacks={sessionCallbacks} />
            </div>
          )}
          {activeProject && showGitDiff && plugins.find((p) => p.id === "gitDiff")?.enabled && (
            <aside
              className="hh-gitdiff-aside"
              aria-label="Git-Diff"
              data-testid="git-diff-panel"
              style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(560px, 60%)", zIndex: 30, display: "flex", flexDirection: "column", borderLeft: "1px solid var(--border)", background: "var(--bg-primary)" }}
            >
              <GitDiffPanel
                projectRoot={activeProject.folder}
                appDataDir={appDataDir}
                call={(op, args) => window.harness.pluginsInvoke("gitDiff", op, args)}
                onClose={() => setShowGitDiff(false)}
              />
            </aside>
          )}
        </div>
        </div>
      </div>
      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          sidebarPosition={sidebarPosition}
          onSidebarPositionChange={setSidebarPosition}
          activeProfile={activeProject?.hermesProfile}
          motionEnabled={motionEnabled}
          onMotionChange={setMotionEnabled}
        />
      )}
      {showPalette && (
        <CommandPalette
          open={showPalette}
          onClose={() => setShowPalette(false)}
          onOpenProject={selectProject}
          onOpenSessionsView={() => setMainView("sessions")}
          onOpenSession={handleReattach}
          activeProjectId={activeProject?.id ?? null}
        />
      )}
      {showNewAgentPopover && activeProject && (
        <NewAgentPopover
          project={activeProject}
          presets={agentPresets}
          onClose={() => setShowNewAgentPopover(false)}
          onStart={handleNewAgentStarted}
        />
      )}
      {panePickerTarget && activeProject && (
        <NewAgentPopover
          project={activeProject}
          presets={agentPresets}
          onClose={() => setPanePickerTarget(null)}
          sessionId={panePickerTarget.sessionId}
          paneId={panePickerTarget.paneId}
          onPaneStarted={handlePaneStarted}
        />
      )}
      <PluginManager
        plugins={plugins}
        config={pluginConfig}
        open={pluginManagerOpen}
        onOpenChange={setPluginManagerOpen}
        onToggle={(id, enabled) => void handlePluginToggle(id, enabled)}
        onConfigChange={(id, key, value) => void handlePluginConfig(id, key, value)}
        onInvoke={(id, op, args) => window.harness.pluginsInvoke(id, op, args, activeProject?.folder)}
        onUpload={handleUploadPlugin}
        onRemoveCustom={handleRemoveCustomPlugin}
      />
      <RaycastOverlay />
    </div>
  );
}

