/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const built = new URL("../dist-electron/plugins/contractGuard.js", import.meta.url);
const skip = !existsSync(built) && "dist-electron not built";
const load = () => createRequire(import.meta.url)(built.pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const VULN = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Bank {
  mapping(address => uint256) public balances;
  address public owner;
  function withdraw(uint256 amt) public {
    msg.sender.call{value: amt}("");
    balances[msg.sender] -= amt;
  }
  function auth() public view returns (bool) { return tx.origin == owner; }
  function kill() public { selfdestruct(payable(owner)); }
  function run(address target, bytes memory data) public { target.delegatecall(data); }
  function all() public { for (uint i = 0; i < users.length; i++) { total += i; } }
}`;

test("contractGuard: Manifest und Operationen", { skip }, () => {
  const m = load();
  assert.equal(m.manifest.id, "contractGuard");
  assert.equal(m.manifest.category, "web3");
  for (const k of ["scan", "gasHints", "simulate"]) assert.equal(typeof m.operations[k], "function");
});

test("contractGuard: Solidity-Funde", { skip }, async () => {
  const m = load();
  const r = await m.operations.scan({ text: VULN });
  assert.equal(r.ok, true);
  const ids = new Set(r.findings.map((f) => f.id));
  for (const id of ["SOL-PRAGMA", "SOL-TXORIGIN", "SOL-SELFDESTRUCT", "SOL-DELEGATECALL", "SOL-REENTRANCY", "SOL-UNCHECKED-CALL", "SOL-UNBOUNDED-LOOP"]) assert.ok(ids.has(id), id);
  const tx = r.findings.find((f) => f.id === "SOL-TXORIGIN");
  assert.equal(tx.line, 10);
  assert.ok(tx.advice.length > 0);
});

test("contractGuard: sicherer Code ohne Reentrancy", { skip }, () => {
  const m = load();
  const safe = `pragma solidity 0.8.24;
contract S is ReentrancyGuard { mapping(address=>uint) b;
 function w(uint a) external nonReentrant { b[msg.sender] -= a; (bool ok,) = msg.sender.call{value:a}(""); require(ok); } }`;
  const f = m.scanSolidity(safe);
  assert.ok(!f.some((x) => x.id === "SOL-REENTRANCY" || x.id === "SOL-PRAGMA" || x.id === "SOL-UNCHECKED-CALL"), JSON.stringify(f));
});

test("contractGuard: Rust/Anchor-Funde", { skip }, () => {
  const m = load();
  const rs = `
#[derive(Accounts)]
pub struct Pay<'info> {
    pub authority: AccountInfo<'info>,
    pub token_program: UncheckedAccount<'info>,
}
pub fn pay(ctx: Context<Pay>, amount: u64) -> Result<()> {
    let st = State::try_from_slice(&ctx.accounts.authority.data.borrow())?;
    ctx.accounts.vault.balance = ctx.accounts.vault.balance + amount;
    invoke(&ix, &[ctx.accounts.token_program.clone()])?;
    Ok(())
}`;
  const ids = new Set(m.scanRust(rs).map((f) => f.id));
  for (const id of ["RS-MISSING-SIGNER", "RS-UNCHECKED-ACCOUNT", "RS-UNCHECKED-DESER", "RS-OVERFLOW", "RS-CPI-UNVALIDATED"]) assert.ok(ids.has(id), id);
  const ok = m.scanRust(`let x = a.checked_add(amount).ok_or(E)?;`);
  assert.ok(!ok.some((f) => f.id === "RS-OVERFLOW"));
});

test("contractGuard: Gas-Hinweise", { skip }, () => {
  const m = load();
  const src = `pragma solidity 0.8.24;
contract G {
  address public admin;
  uint256 public fee = 5;
  uint8 a;
  uint256 big;
  uint8 c;
  uint256[] public items;
  uint256 total;
  constructor() { admin = msg.sender; }
  function sum() public { for (uint i = 0; i < items.length; i++) { total += items[i]; } }
  function name(string memory s) external pure returns (uint) { return bytes(s).length; }
}`;
  const ids = new Set(m.gasHints(src).map((h) => h.id));
  for (const id of ["GAS-STORAGE-LOOP", "GAS-PUBLIC-EXTERNAL", "GAS-CALLDATA", "GAS-CONSTANT", "GAS-IMMUTABLE", "GAS-PACKING"]) assert.ok(ids.has(id), id + " fehlt: " + [...ids]);
});

test("contractGuard: forge Gas-Report parsen", { skip }, () => {
  const m = load();
  const out = `
| src/Counter.sol:Counter contract |                 |       |        |       |         |
|----------------------------------|-----------------|-------|--------|-------|---------|
| Deployment Cost                  | Deployment Size |       |        |       |         |
| 156000                           | 700             |       |        |       |         |
| Function Name                    | min             | avg   | median | max   | # calls |
| increment                        | 43100           | 43500 | 43300  | 44000 | 3       |
| number                           | 281             | 281   | 281    | 281   | 1       |
`;
  const rows = m.parseForgeGasReport(out);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { contract: "Counter", function: "increment", min: 43100, avg: 43500, median: 43300, max: 44000, calls: 3 });
});

test("contractGuard: Deploy/Broadcast wird verweigert", { skip }, async () => {
  const m = load();
  for (const bad of [["--broadcast"], ["deploy"], ["--private-key=0xabc"], ["--rpc-url", "x", "--broadcast"]]) {
    const r = await m.simulate({ projectRoot: process.cwd(), extraArgs: bad }, async () => { throw new Error("darf nicht laufen"); });
    assert.equal(r.ok, false, bad.join(" "));
    assert.match(r.message, /Verweigert/);
  }
});

test("contractGuard: simulate überspringt ohne Tool und nutzt Runner", { skip }, async () => {
  const m = load();
  const none = await m.simulate({ projectRoot: process.cwd(), tool: "forge" }, async () => ({ code: -1, stdout: "", stderr: "" }));
  assert.equal(none.ok, true);
  assert.equal(none.skipped, true);
  const calls = [];
  const runner = async (cmd, args) => { calls.push([cmd, ...args]); return { code: 0, stdout: args[0] === "--version" ? "forge 1" : "| A contract |\n| increment | 1 | 2 | 3 | 4 | 5 |", stderr: "" }; };
  const r = await m.simulate({ projectRoot: process.cwd(), tool: "forge", mode: "gas" }, runner);
  assert.equal(r.ok, true);
  assert.deepEqual(calls[1], ["forge", "test", "--gas-report"]);
  assert.equal(r.gasReport.length, 1);
});

test("contractGuard: scan ohne Eingabe liefert Fehler", { skip }, async () => {
  const m = load();
  const r = await m.operations.scan({});
  assert.equal(r.ok, false);
});
