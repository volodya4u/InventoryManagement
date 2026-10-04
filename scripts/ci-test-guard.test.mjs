// Unit tests for scripts/ci-test-guard.mjs. Run: node --test scripts/ci-test-guard.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { backendGuard, frontendGuard } from "./ci-test-guard.mjs";

const tmp = mkdtempSync(join(tmpdir(), "ci-test-guard-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function javaClass(dir, name, body = "@Test void works() {}") {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.java`), `package com.example;\nclass ${name} { ${body} }`);
}
function report(dir, fqcn, tests, failures) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `TEST-${fqcn}.xml`), `<testsuite name="${fqcn}" tests="${tests}" failures="${failures}" errors="0">`);
}

test("backend guard is green when every runnable class reported", () => {
  const base = join(tmp, "be-green");
  const testDir = join(base, "src", "test", "java", "com", "example");
  javaClass(testDir, "FlowTest");
  javaClass(testDir, "DecimalsTests");
  const reports = join(base, "surefire");
  report(reports, "com.example.FlowTest", 10, 0);
  report(reports, "com.example.DecimalsTests", 5, 0);
  const r = backendGuard(reports, join(base, "src", "test", "java"));
  assert.equal(r.ok, true);
  assert.match(r.result, /2 of 2 test classes/);
});

test("backend guard is red when a class has no report (silent skip)", () => {
  const base = join(tmp, "be-partial");
  const testDir = join(base, "src", "test", "java", "com", "example");
  javaClass(testDir, "FlowTest");
  javaClass(testDir, "DecimalsTests");
  const reports = join(base, "surefire");
  report(reports, "com.example.FlowTest", 10, 0); // DecimalsTests never ran
  const r = backendGuard(reports, join(base, "src", "test", "java"));
  assert.equal(r.ok, false);
  assert.match(r.result, /only 1 of 2 test classes \(missing DecimalsTests\)/);
});

test("frontend guard is green when Vitest ran every spec file", () => {
  const src = join(tmp, "fe-green", "src", "app");
  mkdirSync(src, { recursive: true });
  for (const f of ["a.spec.ts", "b.spec.ts"]) writeFileSync(join(src, f), "");
  const output = " Test Files  2 passed (2)\n      Tests  20 passed (20)\n";
  const r = frontendGuard(output, join(tmp, "fe-green", "src"));
  assert.equal(r.ok, true);
  assert.match(r.result, /2 of 2 spec files/);
});

test("frontend guard is red on a #41-shaped partial run", () => {
  const src = join(tmp, "fe-partial", "src", "app");
  mkdirSync(src, { recursive: true });
  for (const f of ["a.spec.ts", "b.spec.ts", "c.spec.ts"]) writeFileSync(join(src, f), "");
  const output = " Test Files  1 passed (1)\n      Tests  12 passed (12)\n"; // only 1 of 3 ran
  const r = frontendGuard(output, join(tmp, "fe-partial", "src"));
  assert.equal(r.ok, false);
  assert.match(r.result, /only 1 of 3 spec files/);
});
