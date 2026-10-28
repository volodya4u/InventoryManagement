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
