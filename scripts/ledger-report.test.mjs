// Tests for scripts/ledger-report.mjs: how it decides that a project has product code (PD-1).
// Run: node --test scripts/ledger-report.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

const scripts = join(process.cwd(), "scripts");
const tmp = mkdtempSync(join(tmpdir(), "ledger-report-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const DEEP_JAVA = "src/main/java/com/example/app/feature/Thing.java";

// A throwaway project with the given files; returns its root.
function project(name, files) {
  const root = join(tmp, name);
  mkdirSync(root, { recursive: true });
  for (const path of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), "class X {}\n");
  }
  return root;
}

function run(script, root) {
  const env = { ...process.env };
  delete env.FACTORY_TELEMETRY; // the git hooks set it to "off", which writes no ledger event
  const r = spawnSync(process.execPath, [join(scripts, script)], { cwd: root, encoding: "utf8", env });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const digest = (root) => JSON.parse(readFileSync(join(root, "trace", "process-health.json"), "utf8"));

test("reports NOT-EARNED for an empty ledger over Java sources deep under src", () => {
  const root = project("deep-result", [DEEP_JAVA]);
  const { status, out } = run("ledger-report.mjs", root);
  assert.match(out, /Result: NOT-EARNED/);
  assert.equal(status, 1, out);
});

test("records product code present for Java sources deep under src", () => {
  const root = project("deep-field", [DEEP_JAVA]);
  run("ledger-report.mjs", root);
  assert.equal(digest(root).productCodePresent, true);
});

test("agrees with gate-status on product-code presence", () => {
  const trees = {
    deep: [DEEP_JAVA],
    "tests-only": ["src/app/thing.spec.ts"],
    empty: [],
  };
  for (const [name, files] of Object.entries(trees)) {
    const root = project(`agree-${name}`, files);
    // gate-status loads its ledger emitter from the project's own scripts/
    mkdirSync(join(root, "scripts"), { recursive: true });
    copyFileSync(join(scripts, "ledger.mjs"), join(root, "scripts", "ledger.mjs"));
    run("gate-status.mjs", root);
    const events = readFileSync(join(root, "trace", "ledger.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    const gate = events.find((e) => e.check === "gate-status")?.meta?.productCode;
    assert.equal(typeof gate, "boolean", `${name}: gate-status recorded no productCode`);
    run("ledger-report.mjs", root);
    assert.equal(digest(root).productCodePresent, gate, `${name}: ledger-report disagrees with gate-status`);
  }
});

test("keeps SKIP-pending for an empty ledger when src holds only tests", () => {
  const root = project("tests-only", ["src/app/thing.spec.ts"]);
  const { status, out } = run("ledger-report.mjs", root);
  assert.match(out, /Result: SKIP-pending/);
  assert.equal(status, 0, out);
});

// --- PD-2: NOT-EARNED gates inside gate-status events --------------------------------------------------------------

// A gate-status event as gate-status.mjs writes it: each gate's verdict is in meta.gates.
const gateRun = (gates, ts = "2026-10-28T10:00:00.000Z") =>
  JSON.stringify({ ts, event: "gate-status-run", check: "gate-status", exitCode: 1, scope_n: 9, meta: { gates, productCode: true } });

// A project with a ledger (and any other files), the digest generated, and its parsed process-health.json.
function digestFor(name, { ledger = [], files = {} } = {}) {
  const root = project(name, []);
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put("trace/ledger.jsonl", ledger.map((l) => `${l}\n`).join(""));
  for (const [path, text] of Object.entries(files)) put(path, text);
  run("ledger-report.mjs", root);
  return digest(root);
}

test("counts a per-gate NOT-EARNED inside a gate-status event", () => {
  const d = digestFor("ne-one", { ledger: [gateRun({ G5: "PASS", G6: "NOT-EARNED" })] });
  assert.equal(d.metrics.notEarned.count, 1);
  assert.equal(d.metrics.notEarned.byGate.G6, 1);
});

test("counts NOT-EARNED per run", () => {
  const d = digestFor("ne-two", {
    ledger: [gateRun({ G6: "NOT-EARNED" }, "2026-10-28T10:00:00.000Z"), gateRun({ G6: "NOT-EARNED" }, "2026-10-28T11:00:00.000Z")],
  });
  assert.equal(d.metrics.notEarned.count, 2);
});

test("reports zero NOT-EARNED when every gate is earned", () => {
  const d = digestFor("ne-none", { ledger: [gateRun({ G5: "PASS", G6: "PASS" })] });
  assert.equal(d.metrics.notEarned.count, 0);
});
