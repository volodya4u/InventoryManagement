// Unit tests for scripts/dod-checks.mjs. Run: node --test scripts/dod-checks.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  backendVerdict,
  findFiles,
  frontendVerdict,
  nodeTestVerdict,
  runnableTestClasses,
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

test("spec files and Surefire test classes are found on disk", () => {
  const app = join(tmp, "frontend", "src", "app");
  mkdirSync(join(app, "core"), { recursive: true });
  mkdirSync(join(tmp, "frontend", "node_modules", "lib"), { recursive: true });
  for (const file of ["app.spec.ts", "app.ts", "core/decimal.spec.ts"]) writeFileSync(join(app, file), "");
  writeFileSync(join(tmp, "frontend", "node_modules", "lib", "x.spec.ts"), "");
  assert.equal(findFiles(join(tmp, "frontend"), specFilePattern).length, 2);

  const java = join(tmp, "src", "test", "java", "com", "example");
  mkdirSync(java, { recursive: true });
  const tests = "class X { @Test void works() {} }";
  const sources = {
    "FlowTest.java": tests,
    "DecimalsTests.java": "class X { @ParameterizedTest void works(int i) {} }",
    "LegacyTestCase.java": tests,
    "AbstractIntegrationTest.java": "abstract class AbstractIntegrationTest { @Test void shared() {} }",
    "TestClock.java": "class TestClock { }",
    "Fixtures.java": tests,
  };
  for (const [file, source] of Object.entries(sources)) writeFileSync(join(java, file), source);
  const testDir = join(tmp, "src", "test", "java");
  assert.equal(findFiles(testDir, testClassPattern).length, 5);
  assert.deepEqual(
    runnableTestClasses(testDir).map((file) => file.split(/[\\/]/).pop()).sort(),
    ["DecimalsTests.java", "FlowTest.java", "LegacyTestCase.java"],
  );
});

function report(dir, name, tests, failures, mtime) {
  const file = join(dir, `TEST-${name}.xml`);
  writeFileSync(file, `<?xml version="1.0"?>\n<testsuite name="${name}" tests="${tests}" failures="${failures}" errors="0">`);
  if (mtime) utimesSync(file, mtime / 1000, mtime / 1000);
}

test("Surefire reports from this run must cover every test class", () => {
  const reports = join(tmp, "surefire-reports");
  mkdirSync(reports, { recursive: true });
  const since = Date.now() - 1_000;
  report(reports, "com.example.FlowTest", 18, 0);
  report(reports, "com.example.FlowTest$Nested", 2, 0);
  report(reports, "com.example.DecimalsTests", 3, 1);
  report(reports, "com.example.StaleTest", 5, 0, since - 60_000);

  assert.deepEqual(backendVerdict(reports, since, 2), {
    ok: true,
    result: "2 of 2 test classes, 23 tests, 1 failed",
  });
  assert.deepEqual(backendVerdict(reports, since, 3), {
    ok: false,
    result: "only 2 of 3 test classes, 23 tests, 1 failed",
  });
});

test("node --test summaries from both reporters are read", () => {
  assert.deepEqual(nodeTestVerdict("ℹ tests 13\nℹ pass 13\nℹ fail 0\n"), { ok: true, result: "13 passed, 0 failed" });
  assert.deepEqual(nodeTestVerdict("# tests 3\n# pass 2\n# fail 1\n"), { ok: false, result: "2 passed, 1 failed" });
  assert.deepEqual(nodeTestVerdict("node: bad option\n"), { ok: false, result: "no node --test summary" });
});
