import test from "node:test";
import assert from "node:assert";
import { classifyTerminalKey, shouldOpenImproveMenu } from "../src/terminalKeys.mjs";

const k = (key, o = {}) => ({ type: "keydown", key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });

test("Ctrl+V and Ctrl+Shift+V and Shift+Insert paste", () => {
  assert.strictEqual(classifyTerminalKey(k("v", { ctrlKey: true }), false), "paste");
  assert.strictEqual(classifyTerminalKey(k("V", { ctrlKey: true, shiftKey: true }), false), "paste");
  assert.strictEqual(classifyTerminalKey(k("Insert", { shiftKey: true }), false), "paste");
});

test("Ctrl+C copies with selection, otherwise passes through as SIGINT", () => {
  assert.strictEqual(classifyTerminalKey(k("c", { ctrlKey: true }), true), "copy");
  assert.strictEqual(classifyTerminalKey(k("c", { ctrlKey: true }), false), "pass");
});

test("plain keys and keyup pass", () => {
  assert.strictEqual(classifyTerminalKey(k("a"), true), "pass");
  assert.strictEqual(classifyTerminalKey({ ...k("v", { ctrlKey: true }), type: "keyup" }, false), "pass");
});

test("improve menu opens only on left button with a selection after drag or multi-click", () => {
  assert.strictEqual(shouldOpenImproveMenu({ button: 0, moved: true, detail: 1, selection: "x" }), true);
  assert.strictEqual(shouldOpenImproveMenu({ button: 0, moved: false, detail: 2, selection: "x" }), true);
  assert.strictEqual(shouldOpenImproveMenu({ button: 0, moved: false, detail: 1, selection: "x" }), false);
  assert.strictEqual(shouldOpenImproveMenu({ button: 2, moved: true, detail: 1, selection: "x" }), false);
  assert.strictEqual(shouldOpenImproveMenu({ button: 0, moved: true, detail: 1, selection: "  " }), false);
});
