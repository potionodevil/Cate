/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const built = new URL("../dist-electron/plugins/taskSync.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

test("taskSync: Notion-Payload", { skip }, () => {
  const m = load();
  const p = m.buildNotionPayload({ databaseId: "db1" }, { title: "T", summary: "S", status: "Done" });
  assert.equal(p.parent.database_id, "db1");
  assert.equal(p.properties.Name.title[0].text.content, "T");
  assert.equal(p.properties.Status.select.name, "Done");
});
test("taskSync: Jira-Payload mit ADF und Auth", { skip }, () => {
  const m = load();
  const p = m.buildJiraPayload({ projectKey: "AB" }, { title: "T", summary: "a\n\nb" });
  assert.equal(p.fields.project.key, "AB");
  assert.equal(p.fields.description.type, "doc");
  assert.equal(p.fields.description.content.length, 2);
  assert.equal(m.jiraAuthHeader("a@b.c", "tok"), "Basic " + Buffer.from("a@b.c:tok").toString("base64"));
});
test("taskSync: Netzwerk mit Fake-Fetch, Fehler ohne Token", { skip }, async () => {
  const m = load();
  let seen;
  const ok = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ id: "1", key: "AB-1" }) }; };
  const n = await m.createNotionTask({ token: "ntn_SECRET", databaseId: "d" }, { title: "t", summary: "s" }, ok);
  assert.equal(n.ok, true);
  assert.equal(seen.url, "https://api.notion.com/v1/pages");
  assert.equal(seen.init.headers["Notion-Version"], "2022-06-28");
  const j = await m.createJiraIssue({ baseUrl: "https://x.atlassian.net/", email: "e@x", apiToken: "T0K", projectKey: "AB" }, { title: "t", summary: "s" }, ok);
  assert.equal(j.key, "AB-1");
  assert.equal(seen.url, "https://x.atlassian.net/rest/api/3/issue");
  const bad = await m.createNotionTask({ token: "ntn_SECRET", databaseId: "d" }, { title: "t", summary: "s" }, async () => { throw new Error("boom ntn_SECRET"); });
  assert.equal(bad.ok, false);
  assert.ok(!bad.message.includes("ntn_SECRET"));
});
