// Unit tests for the parsers in scripts/test-run.mjs. Run: node --test scripts/test-run.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSelector, structuredVerdict, summarize } from "./test-run.mjs";

const mavenRed = `[INFO] Running com.flowershop.inventory.InventoryFlowIntegrationTest
[ERROR] Tests run: 1, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 3.2 s <<< FAILURE! -- in com.flowershop.inventory.InventoryFlowIntegrationTest
java.lang.AssertionError: No value at JSON path "$.reorderLevel"
[INFO] Results:
[INFO]
[ERROR] Failures:
[ERROR]   InventoryFlowIntegrationTest.recordsRawMaterialReorderLevelAndLowStockFlag:412 No value at JSON path "$.reorderLevel"
[INFO]
[ERROR] Tests run: 1, Failures: 1, Errors: 0, Skipped: 0
[INFO] BUILD FAILURE`;

const mavenGreen = `[INFO] Tests run: 2, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 3.1 s -- in com.flowershop.inventory.X
[INFO] Results:
[INFO]
[INFO] Tests run: 2, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS`;

const mavenCompile = `[ERROR] COMPILATION ERROR :
[INFO] -------------------------------------------------------------
[ERROR] /C:/repo/src/test/java/com/flowershop/inventory/inventory/RawMaterialServiceTest.java:[45,25] constructor RawMaterialDto in record RawMaterialDto cannot be applied to given types;
[INFO] 1 error
[INFO] BUILD FAILURE`;

const mavenNoTests = `[ERROR] Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:3.5.2:test (default-test) on project inventory: No tests matching pattern "Nope" were executed! (Set -Dsurefire.failIfNoSpecifiedTests=false to ignore this error.)`;

const vitestRed = ` ❯ src/app/dashboard/dashboard.component.spec.ts (5 tests | 1 failed) 120ms
   × DashboardComponent > shows the low-stock raw material count 30ms
 FAIL  src/app/dashboard/dashboard.component.spec.ts > DashboardComponent > shows the low-stock raw material count
AssertionError: expected 'Raw Material Types 3' to contain 'Low Stock'
 \u001b[2m Test Files \u001b[22m 1 failed (1)
      Tests  1 failed | 4 passed (5)`;

const vitestGreen = ` ✓ src/app/dashboard/dashboard.component.spec.ts (5 tests) 100ms
 Test Files  1 passed (1)
      Tests  5 passed (5)`;

const vitestCompile = `✘ [ERROR] TS2322: Type '{ id: number; }' is not assignable to type 'RawMaterial'. [plugin angular-compiler]
    src/app/products/products.component.spec.ts:40:4:`;

const nodeRed = `✖ the repository's own specs are consistent with their tests (3.1ms)
  AssertionError [ERR_ASSERTION]: docs/specs/x.md: AC5 quotes "Low stock", which the named test does not contain
ℹ tests 12
ℹ pass 11
ℹ fail 1`;

const nodeGreen = `ℹ tests 12
ℹ pass 12
ℹ fail 0`;

const nodeSyntax = `file:///repo/scripts/check-specs.test.mjs:7
SyntaxError: The requested module './check-specs.mjs' does not provide an export named 'validateSpecs'
ℹ tests 1
ℹ pass 0
ℹ fail 1`;

test("backend: an assertion failure is red for the right reason, with the failing test's message", () => {
  assert.deepEqual(summarize("backend", mavenRed, 1), {
    tests: 1,
    failed: 1,
    kind: "assertion",
    firstFailure: 'InventoryFlowIntegrationTest.recordsRawMaterialReorderLevelAndLowStockFlag:412 No value at JSON path "$.reorderLevel"',
  });
});

test("backend: a green run, a compile error and a selector that matched nothing", () => {
  assert.deepEqual(summarize("backend", mavenGreen, 0), { tests: 2, failed: 0, kind: "pass", firstFailure: "" });
  const compile = summarize("backend", mavenCompile, 1);
  assert.equal(compile.kind, "compile");
  assert.match(compile.firstFailure, /RawMaterialServiceTest\.java:\[45,25\] constructor RawMaterialDto/);
  assert.equal(summarize("backend", mavenNoTests, 1).kind, "no-tests");
});

test("frontend: Vitest red with its assertion, green, and a TypeScript error before any test ran", () => {
  assert.deepEqual(summarize("frontend", vitestRed, 1), {
    tests: 5,
    failed: 1,
    kind: "assertion",
    firstFailure: "AssertionError: expected 'Raw Material Types 3' to contain 'Low Stock'",
  });
  assert.deepEqual(summarize("frontend", vitestGreen, 0), { tests: 5, failed: 0, kind: "pass", firstFailure: "" });
  const compile = summarize("frontend", vitestCompile, 1);
  assert.equal(compile.kind, "compile");
  assert.match(compile.firstFailure, /^TS2322: Type/);
});

test("harness: node --test red, green, and a module that does not load", () => {
  const red = summarize("harness", nodeRed, 1);
  assert.equal(red.kind, "assertion");
  assert.deepEqual([red.tests, red.failed], [12, 1]);
  assert.match(red.firstFailure, /^AssertionError \[ERR_ASSERTION\]: docs\/specs\/x\.md: AC5 quotes "Low stock"/);
  assert.deepEqual(summarize("harness", nodeGreen, 0), { tests: 12, failed: 0, kind: "pass", firstFailure: "" });
  assert.equal(summarize("harness", nodeSyntax, 1).kind, "compile");
});

test("an exit code of 0 with no test at all is not a pass", () => {
  assert.equal(summarize("harness", "ℹ tests 0\nℹ pass 0\nℹ fail 0", 0).kind, "no-tests");
});

test("selectors are recorded the way specs name tests", () => {
  assert.equal(normalizeSelector("frontend", "src/app/x/x.component.spec.ts"), "frontend/src/app/x/x.component.spec.ts");
  assert.equal(normalizeSelector("frontend", "frontend\\src\\app\\x\\x.component.spec.ts"), "frontend/src/app/x/x.component.spec.ts");
  assert.equal(normalizeSelector("backend", "InventoryFlowIntegrationTest#recordsX"), "InventoryFlowIntegrationTest#recordsX");
  assert.equal(normalizeSelector("harness", ".\\scripts\\check-specs.test.mjs"), "scripts/check-specs.test.mjs");
});

const t = (id, status) => ({ id, status });
const consoleRed = { tests: 3, failed: 1, kind: "assertion", firstFailure: "AssertionError: x" };

test("structured: a run's kind comes from its test results, and a run with no results is unstructured", () => {
  // Another test's assertion and this test's error: the run is red on an assertion, and each test keeps its own status.
  const mixed = structuredVerdict([t("A#a", "pass"), t("A#b", "assertion"), t("A#c", "error"), t("A#d", "skipped")], 1, consoleRed);
  assert.equal(mixed.structured, true);
  assert.equal(mixed.kind, "assertion");
  assert.deepEqual([mixed.tests, mixed.failed], [3, 2]);
  assert.deepEqual(mixed.results.map((r) => r.status), ["pass", "assertion", "error", "skipped"]);
  assert.equal(structuredVerdict([t("A#a", "pass"), t("A#c", "error")], 1, consoleRed).kind, "error");
  assert.equal(structuredVerdict([t("A#a", "pass")], 0, consoleRed).kind, "pass");
  // Every test passed but the runner failed (a context that did not close, a reporter error): not a pass.
  assert.equal(structuredVerdict([t("A#a", "pass")], 1, consoleRed).kind, "error");
  // Only skipped tests, or none: nothing ran.
  assert.equal(structuredVerdict([t("A#d", "skipped")], 0, consoleRed).kind, "no-tests");
  // A compile error stands when the report lists no test that ran.
  assert.equal(structuredVerdict([], 1, { ...consoleRed, kind: "compile" }).kind, "compile");
  assert.equal(structuredVerdict([t("A#d", "skipped")], 1, { ...consoleRed, kind: "compile" }).kind, "compile");
  // No report: the console summary, marked unstructured, with no per-test results.
  const none = structuredVerdict(null, 1, consoleRed);
  assert.deepEqual(none, { ...consoleRed, structured: false, results: [] });
});

test("structured: a report that lists tests wins over a compile error the console mentions", () => {
  // A test that spawns a child process can print "SyntaxError" while every test of the file passes or fails on its own.
  const stray = { tests: 2, failed: 0, kind: "compile", firstFailure: "SyntaxError: Unexpected token in the child's output" };
  const passing = structuredVerdict([t("scripts/x.test.mjs › a", "pass"), t("scripts/x.test.mjs › b", "pass")], 0, stray);
  assert.deepEqual([passing.kind, passing.structured, passing.results.length], ["pass", true, 2]);
  const red = structuredVerdict([t("scripts/x.test.mjs › a", "pass"), t("scripts/x.test.mjs › b", "assertion")], 1, stray);
  assert.deepEqual([red.kind, red.results.map((r) => r.status)], ["assertion", ["pass", "assertion"]]);
  // The stray line is not the run's first failure either: the recorded text must not blame a compile error.
  assert.doesNotMatch(red.firstFailure, /SyntaxError/);
  // A file that really fails to import shows up in the report as a failing case: an error, not a pass.
  assert.equal(structuredVerdict([t("scripts/x.test.mjs › C:/repo/scripts/x.test.mjs", "error")], 1, stray).kind, "error");
});
