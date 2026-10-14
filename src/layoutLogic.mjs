/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/** Pure layout-tree logic, kept dependency-free (no React/JSX) so it can be
 * unit-tested directly with node:test and shared by the renderer bundle.
 *
 * Real ESM (not .cjs): Vite's DEV server serves local relative imports as
 * native ES modules without applying any CommonJS interop (that interop only
 * runs for bare node_modules imports it pre-bundles). A `module.exports =`
 * file has zero ESM exports under Vite dev and any `import {x} from` of it
 * fails to link ("does not provide an export named ..."), even though the
 * production `vite build` (Rollup) handles it fine - so the bug only shows
 * up in `npm run dev`, not `npm run build`. Plain `export function` avoids
 * the dev/build inconsistency entirely. */

export function splitLeaf(node, leafId, direction, newPane) {
  if (node.type === "leaf") {
    if (node.pane.id !== leafId) return node;
    return {
      type: "split",
      direction,
      children: [node, { type: "leaf", pane: newPane }]
    };
  }
  return { ...node, children: node.children.map((c) => splitLeaf(c, leafId, direction, newPane)) };
}

/** Folds a flat list of leaf panes into a left-to-right chain of horizontal
 * splits — generalizes a fixed 2-pane layout to N panes without changing
 * LayoutNode's shape. Used by App.tsx's buildWorkspaceLayout. Returns null
 * for an empty list. */
export function foldPanesIntoLayout(panes) {
  if (!panes || panes.length === 0) return null;
  return panes.slice(1).reduce(
    (acc, pane) => ({ type: "split", direction: "horizontal", children: [acc, { type: "leaf", pane }] }),
    { type: "leaf", pane: panes[0] }
  );
}

/** Returns a fresh pane layout containing a single leaf. */
export function initialPaneLayout(paneId, presetId = "shell", label = "Shell", profile, model) {
  return { type: "leaf", paneId, presetId, label, profile, model };
}

/** Splits a pane layout (PaneLayoutNode) at the leaf with `paneId`, inserting
 * `newPaneId` as a sibling in the requested direction. Returns a new
 * PaneLayoutNode. If `paneId` is not found, returns the tree unchanged.
 * `presetId`/`label` default to "shell" for backward compatibility, but the
 * caller should pass the session's own inherited agent preset so the new
 * pane's displayed label matches what actually got spawned for it. */
export function splitPaneLayout(node, paneId, direction, newPaneId, presetId = "shell", label = presetId === "shell" ? "Shell" : presetId) {
  if (node.type === "leaf") {
    if (node.paneId !== paneId) return node;
    return {
      type: "split",
      direction,
      children: [node, { type: "leaf", paneId: newPaneId, presetId, label }]
    };
  }
  return { ...node, children: node.children.map((c) => splitPaneLayout(c, paneId, direction, newPaneId, presetId, label)) };
}

/** Appends `newPaneId` as a new sibling in a FLAT row/column: if `node` is
 * already a split in the requested direction, the new leaf is pushed onto
 * its existing children array (so repeated "+" clicks grow one wide
 * PanelGroup side by side instead of nesting a PanelGroup inside a Panel on
 * every click, which is what used to collapse every pane to zero width).
 * If `node` is a leaf or a split in the other direction, it is wrapped into
 * a fresh 2-child split. */
export function appendPaneLayout(node, direction, newPaneId) {
  const leaf = { type: "leaf", paneId: newPaneId, presetId: "shell", label: "Shell" };
  if (node.type === "split" && node.direction === direction) {
    return { ...node, children: [...node.children, leaf] };
  }
  return { type: "split", direction, children: [node, leaf] };
}

/** Flattens a pane layout tree into its leaves, in the order they currently
 * appear (left-to-right, top-to-bottom). Used to re-derive a flat pane list
 * before re-arranging it into a grid. */
export function collectPaneLeaves(node) {
  if (!node) return [];
  if (node.type === "leaf") return [node];
  return node.children.flatMap((c) => collectPaneLeaves(c));
}

/** How many columns a self-arranging grid should use for `n` panes — stays
 * a single row for up to 3 (matches the previous side-by-side-only
 * behavior for the common case), then switches to genuine rows+columns so
 * panes don't just keep getting narrower in one endless row. Caps at 4
 * columns since MAX_PANES_PER_SESSION is 8, keeping at most 2 rows. */
function gridColumnsFor(n) {
  if (n <= 3) return n;
  if (n === 4) return 2;
  if (n <= 6) return 3;
  return 4;
}

/** Rebuilds a sensible 2D grid (rows of horizontal splits stacked in a
 * vertical split) from a flat list of leaves, so shells arrange themselves
 * both side by side AND stacked once there are enough of them, instead of
 * always growing one endless horizontal row. Returns null for an empty
 * list, the single leaf unwrapped for one pane, a single horizontal row
 * unwrapped for <= 3 panes. */
export function gridArrangeLayout(leaves) {
  if (!leaves || leaves.length === 0) return null;
  if (leaves.length === 1) return leaves[0];
  const cols = gridColumnsFor(leaves.length);
  const rows = [];
  for (let i = 0; i < leaves.length; i += cols) {
    rows.push(leaves.slice(i, i + cols));
  }
  const rowNodes = rows.map((row) => (row.length === 1 ? row[0] : { type: "split", direction: "horizontal", children: row }));
  return rowNodes.length === 1 ? rowNodes[0] : { type: "split", direction: "vertical", children: rowNodes };
}

/** Removes the leaf with `paneId` from a pane layout, collapsing single-child
 * splits. Returns a new PaneLayoutNode or null if the tree becomes empty. */
export function removePaneLayout(node, paneId) {
  if (node.type === "leaf") {
    return node.paneId === paneId ? null : node;
  }
  const filtered = node.children
    .map((c) => removePaneLayout(c, paneId))
    .filter(Boolean);
  if (filtered.length === 0) return null;
  if (filtered.length === 1) return filtered[0];
  return { ...node, children: filtered };
}
