// Tests for scripts/jacoco-summary.mjs. Run: node --test scripts/jacoco-summary.test.mjs
// Each test runs the real script in a throwaway directory, which it reads its default paths from.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "jacoco-summary-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const REPORT = "target/site/jacoco/jacoco.xml";
const SUMMARY = "target/site/jacoco/coverage-summary.json";

function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [join(scripts, "jacoco-summary.mjs"), ...args], { cwd, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

// A JaCoCo report as the Maven plugin writes it: package, class and method counters nested inside, the totals last.
const report = (totals) =>
  [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">',
    '<report name="inventory"><sessioninfo id="s" start="1" dump="2"/>',
    '<package name="com/flowershop/inventory"><class name="com/flowershop/inventory/A" sourcefilename="A.java">',
    '<method name="run" desc="()V" line="3"><counter type="INSTRUCTION" missed="9" covered="1"/><counter type="LINE" missed="9" covered="1"/></method>',
    '<counter type="INSTRUCTION" missed="9" covered="1"/><counter type="LINE" missed="9" covered="1"/></class>',
    '<counter type="INSTRUCTION" missed="9" covered="1"/><counter type="LINE" missed="9" covered="1"/></package>',
    ...totals.map(([type, missed, covered]) => `<counter type="${type}" missed="${missed}" covered="${covered}"/>`),
    "</report>",
  ].join("");

test("converts JaCoCo report counters to a coverage summary", () => {
  const cwd = join(tmp, "converts");
  mkdirSync(join(cwd, dirname(REPORT)), { recursive: true });
  writeFileSync(
    join(cwd, REPORT),
    report([
      ["INSTRUCTION", 250, 750],
      ["BRANCH", 1, 2],
      ["LINE", 20, 180],
      ["COMPLEXITY", 30, 70],
      ["METHOD", 0, 0],
      ["CLASS", 1, 9],
    ]),
  );
  const { status, out } = run(cwd);
  assert.equal(status, 0, out);
  const { total } = JSON.parse(readFileSync(join(cwd, SUMMARY), "utf8"));
  assert.deepEqual(total, {
    lines: { total: 200, covered: 180, skipped: 0, pct: 90 },
    statements: { total: 1000, covered: 750, skipped: 0, pct: 75 },
    // A counter with nothing to cover reads 100, as istanbul's json-summary does.
    functions: { total: 0, covered: 0, skipped: 0, pct: 100 },
    branches: { total: 3, covered: 2, skipped: 0, pct: 66.67 },
  });
});

test("fails when the JaCoCo report is missing", () => {
  const cwd = join(tmp, "missing");
  mkdirSync(cwd, { recursive: true });
  const { status, out } = run(cwd);
  assert.notEqual(status, 0);
  assert.match(out, /jacoco\.xml not found/);
  assert.equal(existsSync(join(cwd, SUMMARY)), false, "no summary is written");
});

test("fails on a report without report-level counters", () => {
  const cwd = join(tmp, "no-totals");
  mkdirSync(join(cwd, dirname(REPORT)), { recursive: true });
  writeFileSync(join(cwd, REPORT), report([]));
  const { status, out } = run(cwd);
  assert.notEqual(status, 0);
  assert.match(out, /no report-level LINE counter/);
  assert.equal(existsSync(join(cwd, SUMMARY)), false, "no summary is written");
});

test("reads and writes the paths it is given", () => {
  const cwd = join(tmp, "paths");
  mkdirSync(join(cwd, "in"), { recursive: true });
  writeFileSync(
    join(cwd, "in", "r.xml"),
    report([
      ["INSTRUCTION", 1, 3],
      ["BRANCH", 0, 4],
      ["LINE", 1, 1],
      ["METHOD", 1, 1],
    ]),
  );
  const { status, out } = run(cwd, "in/r.xml", "out/s.json");
  assert.equal(status, 0, out);
  assert.equal(JSON.parse(readFileSync(join(cwd, "out", "s.json"), "utf8")).total.lines.pct, 50);
});
