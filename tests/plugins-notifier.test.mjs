/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const built = new URL("../dist-electron/plugins/notifier.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

test("notifier: Manifest und Operationen", { skip }, () => {
  const m = load();
  assert.equal(m.manifest.id, "notifier");
  assert.equal(typeof m.operations.send, "function");
});
test("notifier: sendet an alle Ziele und schwärzt Token", { skip }, async () => {
  const m = load();
  const calls = [];
  const cfg = { webhookUrl: "https://h.example/x", discordWebhookUrl: "https://discord.com/api/webhooks/1/abc", telegramBotToken: "123:SECRET", telegramChatId: "9" };
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; };
  const r = await m.sendNotification(cfg, { type: "task_done", title: "Fertig" }, fetchImpl, new m.RateLimiter(5));
  assert.equal(r.ok, true);
  assert.deepEqual(r.sent, ["webhook", "discord", "telegram"]);
  assert.ok(calls[2].url.includes("/bot123:SECRET/sendMessage"));
  assert.equal(calls[2].body.chat_id, "9");
  const bad = await m.sendNotification({ telegramBotToken: "123:SECRET", telegramChatId: "9" }, { type: "custom", title: "x" }, async (u) => { throw new Error("fail " + u); }, new m.RateLimiter(5));
  assert.equal(bad.ok, false);
  assert.ok(!bad.message.includes("SECRET"));
});
test("notifier: Filter und Ratenlimit", { skip }, async () => {
  const m = load();
  const f = async () => ({ ok: true, status: 200 });
  const cfg = { webhookUrl: "https://h.example/x", allowedTypes: ["build_failed"] };
  assert.equal((await m.sendNotification(cfg, { type: "task_done", title: "a" }, f, new m.RateLimiter(5))).ok, false);
  let t = 0;
  const lim = new m.RateLimiter(2, () => t);
  assert.ok(lim.tryAcquire() && lim.tryAcquire());
  assert.equal(lim.tryAcquire(), false);
  t = 61000;
  assert.equal(lim.tryAcquire(), true);
});
