/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert";
import { splitLeaf, foldPanesIntoLayout, gridArrangeLayout, collectPaneLeaves } from "../src/layoutLogic.mjs";

test("Phase 1: splitLeaf turns a leaf into a split containing both panes", () => {
  const leaf = { type: "leaf", pane: { id: "a", cwd: "/x", presetId: "shell", label: "Shell" } };
  const newPane = { id: "b", cwd: "/x", presetId: "shell", label: "Shell 2" };
  const result = splitLeaf(leaf, "a", "vertical", newPane);
  assert.strictEqual(result.type, "split");
  assert.strictEqual(result.direction, "vertical");
  assert.strictEqual(result.children.length, 2);
  assert.strictEqual(result.children[0].pane.id, "a");
  assert.strictEqual(result.children[1].pane.id, "b");
});

test("Phase 1: splitLeaf on a non-matching id leaves the tree untouched", () => {
  const leaf = { type: "leaf", pane: { id: "a", cwd: "/x", presetId: "shell", label: "Shell" } };
  const result = splitLeaf(leaf, "zzz", "horizontal", { id: "c", cwd: "/x", presetId: "shell", label: "x" });
  assert.strictEqual(result, leaf);
});

test("Phase 1: splitLeaf recurses into nested splits", () => {
  const tree = {
    type: "split",
    direction: "horizontal",
    children: [
      { type: "leaf", pane: { id: "a", cwd: "/x", presetId: "shell", label: "A" } },
      { type: "leaf", pane: { id: "b", cwd: "/x", presetId: "shell", label: "B" } }
    ]
  };
  const result = splitLeaf(tree, "b", "vertical", { id: "c", cwd: "/x", presetId: "shell", label: "C" });
  assert.strictEqual(result.children[0].pane.id, "a");
  assert.strictEqual(result.children[1].type, "split");
  assert.strictEqual(result.children[1].children[1].pane.id, "c");
});

test("Feature C: foldPanesIntoLayout returns null for an empty list", () => {
  assert.strictEqual(foldPanesIntoLayout([]), null);
});

test("Feature C: foldPanesIntoLayout wraps a single pane as a bare leaf", () => {
  const pane = { id: "a", cwd: "/x", presetId: "hermes", label: "Hermes" };
  assert.deepStrictEqual(foldPanesIntoLayout([pane]), { type: "leaf", pane });
});

test("Feature C: foldPanesIntoLayout chains N panes left-to-right as horizontal splits", () => {
  const panes = [
    { id: "a", cwd: "/x", presetId: "hermes", label: "Hermes" },
    { id: "b", cwd: "/x", presetId: "shell", label: "Shell 1" },
    { id: "c", cwd: "/x", presetId: "shell", label: "Shell 2" }
  ];
  const result = foldPanesIntoLayout(panes);
  assert.strictEqual(result.type, "split");
  assert.strictEqual(result.direction, "horizontal");
  assert.strictEqual(result.children[1].pane.id, "c");
  assert.strictEqual(result.children[0].type, "split");
  assert.strictEqual(result.children[0].children[0].pane.id, "a");
  assert.strictEqual(result.children[0].children[1].pane.id, "b");
});

function leaf(paneId) {
  return { type: "leaf", paneId, presetId: "shell", label: "Shell" };
}

test("Shell self-arrange: gridArrangeLayout returns null for an empty list", () => {
  assert.strictEqual(gridArrangeLayout([]), null);
});

test("Shell self-arrange: gridArrangeLayout unwraps a single pane", () => {
  const a = leaf("a");
  assert.strictEqual(gridArrangeLayout([a]), a);
});

test("Shell self-arrange: 2 and 3 panes stay a single horizontal row (no regression for the common case)", () => {
  const two = gridArrangeLayout([leaf("a"), leaf("b")]);
  assert.strictEqual(two.type, "split");
  assert.strictEqual(two.direction, "horizontal");
  assert.strictEqual(two.children.length, 2);

  const three = gridArrangeLayout([leaf("a"), leaf("b"), leaf("c")]);
  assert.strictEqual(three.type, "split");
  assert.strictEqual(three.direction, "horizontal");
  assert.strictEqual(three.children.length, 3);
});

test("Shell self-arrange: 4 panes form a 2x2 grid (rows stacked AND columns side by side)", () => {
  const result = gridArrangeLayout([leaf("a"), leaf("b"), leaf("c"), leaf("d")]);
  assert.strictEqual(result.type, "split");
  assert.strictEqual(result.direction, "vertical");
  assert.strictEqual(result.children.length, 2);
  for (const row of result.children) {
    assert.strictEqual(row.type, "split");
    assert.strictEqual(row.direction, "horizontal");
    assert.strictEqual(row.children.length, 2);
  }
  assert.deepStrictEqual(
    collectPaneLeaves(result).map((l) => l.paneId),
    ["a", "b", "c", "d"]
  );
});

test("Shell self-arrange: 8 panes (the max) form two rows of 4, never one endless row", () => {
  const panes = ["a", "b", "c", "d", "e", "f", "g", "h"].map(leaf);
  const result = gridArrangeLayout(panes);
  assert.strictEqual(result.type, "split");
  assert.strictEqual(result.direction, "vertical");
  assert.strictEqual(result.children.length, 2);
  assert.strictEqual(result.children[0].children.length, 4);
  assert.strictEqual(result.children[1].children.length, 4);
  assert.deepStrictEqual(
    collectPaneLeaves(result).map((l) => l.paneId),
    panes.map((p) => p.paneId)
  );
});

test("Shell self-arrange: collectPaneLeaves flattens a nested tree in order", () => {
  const tree = {
    type: "split",
    direction: "vertical",
    children: [
      { type: "split", direction: "horizontal", children: [leaf("a"), leaf("b")] },
      leaf("c")
    ]
  };
  assert.deepStrictEqual(
    collectPaneLeaves(tree).map((l) => l.paneId),
    ["a", "b", "c"]
  );
});
