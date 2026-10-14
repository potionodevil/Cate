/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import React from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { TerminalPane } from "./TerminalPane";
import { IconClose } from "./icons";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// @ts-expect-error - plain untyped .mjs helper (real ESM so Vite dev + build + node:test all resolve it identically)
import { splitPaneLayout, removePaneLayout, collectPaneLeaves, gridArrangeLayout } from "./layoutLogic.mjs";
import type { PaneLayoutNode, WorkspaceNode, SessionCallbacks } from "./types";
import { ApprovalControls, ExecutionGraph } from "./panels/PipelineVisual";

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
        <Badge variant="outline" className="text-[9px] font-normal h-4 px-1">Session</Badge>
        <span className="hh-session-name">{session.name}</span>
        <ExecutionGraph
          className="hh-session-graph"
          steps={[
            { label: "Kontext", detail: "bereit", state: "done" },
            { label: "Agent", detail: "aktiv", state: "active" },
            { label: "Ausgabe", detail: "wartet", state: "queued" }
          ]}
        />
        <ApprovalControls />
        <Button
          variant="ghost"
          size="icon"
          className="hh-session-add h-6 w-6"
          title="Neue Shell hinzufügen (Rechtsklick: anderen Agent wählen)"
          aria-label="Neue Shell hinzufügen"
          onClick={onAddPane}
          onContextMenu={
            onAddPanePicker
              ? (e) => {
                  e.preventDefault();
                  onAddPanePicker();
                }
              : undefined
          }
        >
          <Plus size={13} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-6 w-6"
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
