// Unit tests for scripts/dod-checks.mjs. Run: node --test scripts/dod-checks.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  backendVerdict,
  checkExitCode,
  exitColumn,
  expectedTestClasses,
  findFiles,
  frontendVerdict,
  generatedReportsVerdict,
  mcpSmokeVerdict,
  nodeTestVerdict,
  selfTestVerdict,
  specFilePattern,
  testClassPattern,
} from "./dod-checks.mjs";

const tmp = mkdtempSync(join(tmpdir(), "dod-checks-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const vitest = (files, tests) => ` Test Files  ${files}\n      Tests  ${tests}\n   Start at  17:28:41\n`;

test("a full Vitest run is green", () => {
  assert.deepEqual(frontendVerdict(vitest("8 passed (8)", "91 passed (91)"), 8), {
    ok: true,
    result: "8 of 8 spec files, 91 passed (91)",
  });
});

test("Vitest exiting 0 after running 1 of 8 spec files is red, as in #41", () => {
  assert.deepEqual(frontendVerdict(vitest("1 passed (1)", "12 passed (12)"), 8), {
    ok: false,
    result: "only 1 of 8 spec files, 12 passed (12)",
  });
});

test("a failed spec file still counts as run; the exit code reports the failure", () => {
  assert.equal(frontendVerdict(vitest("1 failed | 7 passed (8)", "1 failed | 90 passed (91)"), 8).ok, true);
});

test("no Vitest summary is red", () => {
  assert.deepEqual(frontendVerdict("Error: Timeout starting test processes\n", 8), {
    ok: false,
    result: "no Vitest summary: the tests did not run",
  });
});

test("the ANSI-coloured summary Vitest prints in CI is parsed, not mistaken for no run", () => {
  // The exact escape sequences captured from the Actions log: colour on, "13 passed", colour reset, dim "(13)".
  const e = "\x1b";
  const colored =
    `${e}[2m Test Files ${e}[22m ${e}[1m${e}[32m13 passed${e}[39m${e}[22m${e}[90m (13)${e}[39m\n` +
    `${e}[2m      Tests ${e}[22m ${e}[1m${e}[32m114 passed${e}[39m${e}[22m${e}[90m (114)${e}[39m\n`;
  assert.deepEqual(frontendVerdict(colored, 13), {
    ok: true,
    result: "13 of 13 spec files, 114 passed (114)",
  });
});

test("spec files and Surefire test classes are found on disk", () => {
  const app = join(tmp, "frontend", "src", "app");
  mkdirSync(join(app, "core"), { recursive: true });
  mkdirSync(join(tmp, "frontend", "node_modules", "lib"), { recursive: true });
  // The Angular unit-test builder includes **/*.spec.ts and **/*.test.ts by default.
  for (const file of ["app.spec.ts", "app.ts", "core/decimal.spec.ts", "core/money.test.ts"]) {
    writeFileSync(join(app, file), "");
  }
  writeFileSync(join(tmp, "frontend", "node_modules", "lib", "x.spec.ts"), "");
  assert.equal(findFiles(join(tmp, "frontend"), specFilePattern).length, 3);

  const java = join(tmp, "src", "test", "java", "com", "example");
  mkdirSync(java, { recursive: true });
  const tests = (name) => `package com.example;\n\nclass ${name} { @Test void works() {} }`;
  const sources = {
    "FlowTest.java": tests("FlowTest"),
    "DecimalsTests.java": "package com.example;\nclass DecimalsTests { @ParameterizedTest void works(int i) {} }",
    "LegacyTestCase.java": tests("LegacyTestCase"),
    // A nested abstract helper does not make the test class itself abstract.
    "HelperTest.java": "package com.example;\nclass HelperTest { abstract static class Base {} @Test void works() {} }",
    "AbstractIntegrationTest.java": "package com.example;\nabstract class AbstractIntegrationTest { @Test void shared() {} }",
    "TestClock.java": "package com.example;\nclass TestClock { }",
    "Fixtures.java": tests("Fixtures"),
  };
  for (const [file, source] of Object.entries(sources)) writeFileSync(join(java, file), source);
  const testDir = join(tmp, "src", "test", "java");
  assert.equal(findFiles(testDir, testClassPattern).length, 6);
  assert.deepEqual(expectedTestClasses(testDir), [
    "com.example.DecimalsTests",
    "com.example.FlowTest",
    "com.example.HelperTest",
    "com.example.LegacyTestCase",
  ]);
});

function report(dir, name, tests, failures, mtime) {
  const file = join(dir, `TEST-${name}.xml`);
  writeFileSync(file, `<?xml version="1.0"?>\n<testsuite name="${name}" tests="${tests}" failures="${failures}" errors="0">`);
  if (mtime) utimesSync(file, mtime / 1000, mtime / 1000);
}

test("Surefire reports from this run must cover every test class by name", () => {
  const reports = join(tmp, "surefire-reports");
  mkdirSync(reports, { recursive: true });
  const since = Date.now() - 1_000;
  report(reports, "com.example.FlowTest", 18, 0);
  report(reports, "com.example.FlowTest$Nested", 2, 0);
  report(reports, "com.example.DecimalsTests", 3, 1);
  report(reports, "com.example.StaleTest", 5, 0, since - 60_000);
  // A class that inherits all its tests reports too, but cannot stand in for a class that did not run.
  report(reports, "com.example.InheritedTest", 4, 0);

  assert.deepEqual(backendVerdict(reports, since, ["com.example.FlowTest", "com.example.DecimalsTests"]), {
    ok: true,
    result: "2 of 2 test classes, 27 tests, 1 failed",
  });
  assert.deepEqual(
    backendVerdict(reports, since, ["com.example.FlowTest", "com.example.DecimalsTests", "com.example.StaleTest"]),
    { ok: false, result: "only 2 of 3 test classes (missing StaleTest), 27 tests, 1 failed" },
  );
  // A class whose tests all sit in nested classes reports only as TEST-Outer$Inner.xml.
  const nested = join(tmp, "nested-reports");
  mkdirSync(nested);
  report(nested, "com.example.OuterTest$Inner", 2, 0);
  assert.deepEqual(backendVerdict(nested, since, ["com.example.OuterTest"]), {
    ok: true,
    result: "1 of 1 test classes, 2 tests, 0 failed",
  });
  // With no test class on disk and no report, nothing ran: red, not "0 of 0".
  assert.deepEqual(backendVerdict(join(tmp, "no-reports"), since, []), {
    ok: false,
    result: "0 of 0 test classes, 0 tests, 0 failed",
  });
});

test("node --test summaries from both reporters are read", () => {
  assert.deepEqual(nodeTestVerdict("ℹ tests 13\nℹ pass 13\nℹ fail 0\n"), { ok: true, result: "13 passed, 0 failed" });
  assert.deepEqual(nodeTestVerdict("# tests 3\n# pass 2\n# fail 1\n"), { ok: false, result: "2 passed, 1 failed" });
  assert.deepEqual(nodeTestVerdict("node: bad option\n"), { ok: false, result: "no node --test summary" });
});

test("the MCP smoke check needs the server's list_projects answer", () => {
  const out = "## Dynamic context: angular-cli MCP\n\nMCP smoke: angular-cli-server 22.2.1 answered list_projects in 3.3 s (frontend, Angular 22)\n";
  assert.deepEqual(mcpSmokeVerdict(out), { ok: true, result: "angular-cli-server 22.2.1 answered list_projects in 3.3 s (frontend, Angular 22)" });
  assert.equal(mcpSmokeVerdict("MCP smoke failed: the angular-cli MCP server (scripts/ng-mcp.mjs) no answer within 120 s").ok, false);
});

test("the self-test needs at least one PASS line and no FAIL line", () => {
  assert.deepEqual(selfTestVerdict("PASS a\nPASS b\n"), { ok: true, result: "2 checks passed, 0 failed" });
  assert.deepEqual(selfTestVerdict("PASS a\nFAIL b\n"), { ok: false, result: "1 checks passed, 1 failed" });
  assert.deepEqual(selfTestVerdict(""), { ok: false, result: "0 checks passed, 0 failed" });
});

test("a check fails on a non-zero exit, and on exit 0 with an incomplete run", () => {
  assert.equal(checkExitCode(0, true), 0);
  assert.equal(checkExitCode(0, false), 1);
  assert.equal(checkExitCode(2, true), 2);
  assert.equal(checkExitCode(2, false), 2);
  // spawnSync reports null when the runner could not start or was killed.
  assert.equal(checkExitCode(null, true), 1);
});

test("the Exit column keeps the runner's own exit code when the verdict overrides it", () => {
  assert.equal(exitColumn(0, 0), "0");
  assert.equal(exitColumn(2, 2), "2");
  assert.equal(exitColumn(0, 1), "1 (runner exited 0)");
  assert.equal(exitColumn(null, 1), "1 (no exit code)");
});

test("regenerating the hook-owned reports is green when every generator exits 0", () => {
  assert.deepEqual(
    generatedReportsVerdict([
      { script: "scripts/check-traceability.mjs", status: 0 },
      { script: "scripts/check-trajectory.mjs", status: 0 },
    ]),
    { ok: true, result: "regenerated: traceability, trajectory" },
  );
});

test("regenerating the reports fails when a generator fails, naming it and its exit code", () => {
  assert.deepEqual(
    generatedReportsVerdict([
      { script: "scripts/check-traceability.mjs", status: 0 },
      { script: "scripts/check-trajectory.mjs", status: 1 },
    ]),
    { ok: false, result: "trajectory failed (exit 1)" },
  );
  assert.deepEqual(generatedReportsVerdict([{ script: "scripts/check-traceability.mjs", status: 2 }]), {
    ok: false,
    result: "traceability failed (exit 2)",
  });
});

test("a generator that could not start, or no generator at all, is a failure", () => {
  // spawnSync reports a null status when the script could not start or was killed.
  assert.deepEqual(generatedReportsVerdict([{ script: "scripts/check-traceability.mjs", status: null }]), {
    ok: false,
    result: "traceability failed (no exit code)",
  });
  assert.deepEqual(generatedReportsVerdict([]), { ok: false, result: "no report generator ran" });
});

test("coverage verdict needs both sides to pass", async () => {
  // The ratchet labels its findings, not its Scope and Result lines, which gate-status.mjs reads.
  // Imported here, not above, so the other tests of this file still run when the export is missing.
  const { coverageVerdict } = await import("./dod-checks.mjs");
  assert.equal(typeof coverageVerdict, "function", "dod-checks.mjs exports coverageVerdict");
  const side = (label, result, lines = "OK    lines 81.5% (baseline 81.5%)") =>
    `Scope: 4 coverage metric(s)\n${label}: ${lines}\nResult: ${result}\n`;
  assert.deepEqual(coverageVerdict(side("backend", "PASS") + side("frontend", "PASS")), {
    ok: true,
    result: "backend lines 81.5%, frontend lines 81.5%",
  });
  assert.equal(coverageVerdict(side("backend", "PASS") + side("frontend", "FAIL")).ok, false);
  assert.equal(coverageVerdict(side("backend", "PASS")).ok, false, "a side that did not report fails");
  assert.equal(coverageVerdict("").ok, false);
  assert.match(
    coverageVerdict(side("backend", "PASS") + side("frontend", "FAIL", "FAIL  coverage ratchet: lines dropped 80% -> 70%")).result,
    /frontend: lines dropped 80% -> 70%/,
  );
});

test("eval ratchet verdict needs a PASS on at least one case", async () => {
  // Imported here, not above, so the other tests of this file still run when the export is missing.
  const { evalRatchetVerdict } = await import("./dod-checks.mjs");
  assert.equal(typeof evalRatchetVerdict, "function", "dod-checks.mjs exports evalRatchetVerdict");
  const run = (result, scope = 27, lines = "OK    reviewer 100 (baseline 100)\n") => `Scope: ${scope} eval case(s)\n${lines}Result: ${result}\n`;
  assert.deepEqual(evalRatchetVerdict(run("PASS")), { ok: true, result: "27 eval cases, none below its baseline" });
  assert.equal(evalRatchetVerdict(run("SKIP-pending", 0, "")).ok, false, "a skipped ratchet is not a pass");
  assert.equal(evalRatchetVerdict(run("PASS", 0)).ok, false, "a pass on no case is not evidence");
  assert.equal(evalRatchetVerdict("").ok, false);
  assert.match(evalRatchetVerdict(run("FAIL", 27, "FAIL  eval ratchet: reviewer dropped 100 -> 83.3\n")).result, /reviewer dropped 100 -> 83.3/);
});
