/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { TerminalPane } from "./TerminalPane";
import { IconClose, IconChevronDown } from "./icons";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// @ts-expect-error - plain untyped .mjs helper (real ESM so Vite dev + build + node:test all resolve it identically)
import { splitPaneLayout, removePaneLayout, collectPaneLeaves, gridArrangeLayout } from "./layoutLogic.mjs";
import type { PaneLayoutNode, WorkspaceNode, SessionCallbacks } from "./types";
import { ApprovalControls } from "./panels/PipelineVisual";

export function LayoutRenderer({ node, callbacks }: { node: WorkspaceNode; callbacks: SessionCallbacks }) {
  if (node.type === "session") {
    return (
      <SessionFrame
        session={node}
        onClose={() => callbacks.onCloseSession(node.sessionId)}
        onAddPane={() => callbacks.onAddPane(node.sessionId, firstPaneId(node.paneLayout))}
        onAddPanePicker={
          callbacks.onRequestPanePicker
            ? () => callbacks.onRequestPanePicker!(node.sessionId, firstPaneId(node.paneLayout))
            : undefined
        }
      >
        <PaneLayoutRenderer
          sessionId={node.sessionId}
          node={node.paneLayout}
          onSplit={(paneId, direction) => callbacks.onSplit(node.sessionId, paneId, direction)}
          onClosePane={callbacks.onClosePane ? (paneId) => callbacks.onClosePane!(node.sessionId, paneId) : undefined}
        />
      </SessionFrame>
    );
  }
  return (
    <PanelGroup direction={node.direction} style={{ display: "flex", flexDirection: node.direction === "horizontal" ? "row" : "column", width: "100%", height: "100%" }}>
      {node.children.map((child, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && (
            <PanelResizeHandle
              className={node.direction === "horizontal" ? "hh-resize-handle hh-resize-handle-horizontal" : "hh-resize-handle hh-resize-handle-vertical"}
            />
          )}
          <Panel minSize={10}>
            <LayoutRenderer node={child} callbacks={callbacks} />
          </Panel>
        </React.Fragment>
      ))}
    </PanelGroup>
  );
}

function SessionFrame({
  session,
  onClose,
  onAddPane,
  onAddPanePicker,
  children
}: {
  session: { sessionId: string; name: string };
  onClose: () => void;
  onAddPane: () => void;
  onAddPanePicker?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      <div className="hh-session-header">
        <Badge variant="outline" className="h-4 rounded-full border-[var(--border)] px-1.5 text-[9px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Session</Badge>
        <span className="hh-session-name">{session.name}</span>
        <span className="ml-auto" />
        <ApprovalControls />
        <Button
          variant="ghost"
          size="icon"
          className="hh-session-add h-[24px] w-[24px] !ml-0 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Neue Shell hinzufügen"
          aria-label="Neue Shell hinzufügen"
          onClick={onAddPane}
        >
          <Plus size={13} />
        </Button>
        {onAddPanePicker && (
          <Button
            variant="ghost"
            size="icon"
            className="h-[24px] w-[24px] !ml-0 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title="Anderen Agent wählen"
            aria-label="Anderen Agent wählen"
            onClick={onAddPanePicker}
          >
            <IconChevronDown size={12} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-[24px] w-[24px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Session schließen"
          aria-label="Session schließen"
          onClick={onClose}
        >
          <IconClose size={12} />
        </Button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

function firstPaneId(node: PaneLayoutNode): string {
  return node.type === "leaf" ? node.paneId : firstPaneId(node.children[0]);
}

export function PaneLayoutRenderer({
  sessionId,
  node,
  onSplit,
  onClosePane
}: {
  sessionId: string;
  node: PaneLayoutNode;
  onSplit: (paneId: string, direction: "horizontal" | "vertical") => void;
  onClosePane?: (paneId: string) => void;
}) {
  if (node.type === "leaf") {
    return (
      <TerminalPane
        paneId={node.paneId}
        sessionId={sessionId}
        label={node.label}
        presetId={node.presetId}
        profile={node.profile}
        model={node.model}
        onSplit={(direction) => onSplit(node.paneId, direction)}
        onClose={onClosePane ? () => onClosePane(node.paneId) : undefined}
      />
    );
  }
  return (
    <PanelGroup direction={node.direction} style={{ display: "flex", flexDirection: node.direction === "horizontal" ? "row" : "column", width: "100%", height: "100%" }}>
      {node.children.map((child, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && (
            <PanelResizeHandle
              className={node.direction === "horizontal" ? "hh-resize-handle hh-resize-handle-horizontal" : "hh-resize-handle hh-resize-handle-vertical"}
            />
          )}
          <Panel minSize={10}>
            <PaneLayoutRenderer sessionId={sessionId} node={child} onSplit={onSplit} onClosePane={onClosePane} />
          </Panel>
        </React.Fragment>
      ))}
    </PanelGroup>
  );
}

/** Replace the leaf with id `paneId` inside a pane layout by a split
 * containing the old leaf plus a new sibling paneId. */
export function splitPaneNode(
  node: PaneLayoutNode,
  paneId: string,
  direction: "horizontal" | "vertical",
  newPaneId: string
): PaneLayoutNode {
  return splitPaneLayout(node, paneId, direction, newPaneId);
}

/** Appends a new pane as a flat sibling (side by side), growing one
 * PanelGroup row instead of nesting a new PanelGroup inside a Panel on
 * every "+" click. */
export function appendPaneNode(node: PaneLayoutNode, _direction: "horizontal" | "vertical", newPaneId: string): PaneLayoutNode {
  return gridArrangeLayout([...collectPaneLeaves(node), { type: "leaf", paneId: newPaneId, presetId: "shell", label: "Shell" }]) ?? node;
}

/** Remove a pane leaf from a pane layout, collapsing single-child splits. */
export function removePaneNode(node: PaneLayoutNode, paneId: string): PaneLayoutNode | null {
  return removePaneLayout(node, paneId);
}
