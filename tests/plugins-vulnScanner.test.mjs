/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import m from "../dist-electron/plugins/vulnScanner.js";

test("vulnScanner: manifest", () => { assert.strictEqual(m.manifest.id, "vulnScanner"); });

test("vulnScanner: parseNpmAudit v7", () => {
  const f = m.parseNpmAudit({ vulnerabilities: {
    lodash: { severity: "high", via: [{ source: 1, name: "lodash", title: "Prototype Pollution", url: "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz" }], fixAvailable: true },
    mini: { severity: "low", via: ["lodash"], fixAvailable: false },
  } });
  assert.strictEqual(f.length, 2);
  assert.strictEqual(f[0].package, "lodash");
  assert.strictEqual(f[0].fixAvailable, true);
  assert.strictEqual(f[0].cve, "GHSA-xxxx-yyyy-zzzz");
});

test("vulnScanner: parseCargoAudit + pip-audit + snyk", () => {
  const c = m.parseCargoAudit({ vulnerabilities: { list: [{ advisory: { id: "RUSTSEC-2020-0001", aliases: ["CVE-2020-1234"], title: "t" }, package: { name: "foo" }, versions: { patched: [">=1.2"] } }] } });
  assert.deepStrictEqual([c[0].package, c[0].cve, c[0].fixAvailable], ["foo", "CVE-2020-1234", true]);
  const p = m.parsePipAudit({ dependencies: [{ name: "django", version: "1", vulns: [{ id: "PYSEC-1", aliases: ["CVE-2021-0001"], fix_versions: ["2.0"] }] }] });
  assert.deepStrictEqual([p[0].package, p[0].cve, p[0].fixAvailable], ["django", "CVE-2021-0001", true]);
  const s = m.parseSnyk({ vulnerabilities: [{ severity: "critical", packageName: "x", identifiers: { CVE: ["CVE-2022-9999"] }, isUpgradable: false, fixedIn: ["1.0"] }] });
  assert.deepStrictEqual([s[0].severity, s[0].cve, s[0].fixAvailable], ["critical", "CVE-2022-9999", true]);
});

test("vulnScanner: toAlerts only high/critical", () => {
  const mk = (severity) => ({ ecosystem: "npm", severity, package: "p", cve: "", fixAvailable: false });
  const a = m.toAlerts([mk("low"), mk("moderate"), mk("high"), mk("critical"), mk("unknown")]);
  assert.deepStrictEqual(a.map((x) => x.severity), ["high", "critical"]);
});

test("vulnScanner: detectEcosystems", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vs-"));
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
  fs.writeFileSync(path.join(dir, "Cargo.toml"), "");
  assert.deepStrictEqual(m.detectEcosystems(dir), ["npm", "cargo"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("vulnScanner: debounce collapses calls", async () => {
  let n = 0;
  const d = m.debounce(() => { n++; }, 30);
  d(); d(); d();
  await new Promise((r) => setTimeout(r, 90));
  assert.strictEqual(n, 1);
});

test("vulnScanner: scan degrades gracefully on empty/unknown dir and escapes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vs-"));
  const r = await m.operations.scan({ projectRoot: dir });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.alerts, []);
  const bad = await m.operations.scan({});
  assert.strictEqual(bad.ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});
