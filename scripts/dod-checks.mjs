// Checks that scripts/dod.mjs runs after each test command: did every test file on disk actually run?
// A test runner can exit 0 while running only part of the suite (in #41, 7 of 8 Vitest spec files never started),
// so dod.mjs compares what ran with what exists. Pure functions, unit-tested in scripts/dod-checks.test.mjs.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

// Files under dir whose name matches pattern, skipping node_modules and dot folders.
export function findFiles(dir, pattern) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findFiles(path, pattern);
    return pattern.test(entry.name) ? [path] : [];
  });
}

// The test files the Angular unit-test builder includes by default (**/*.spec.ts, **/*.test.ts), and the test classes
// Maven Surefire picks up by default (Test*, *Test, *Tests, *TestCase).
export const specFilePattern = /\.(spec|test)\.ts$/;
export const testClassPattern = /^(Test\w*|\w*Tests?|\w*TestCase)\.java$/;

// Fully qualified names of the test classes expected to report. Surefire writes no report for an abstract base class
// or a helper named like a test, so only classes that are not abstract themselves and hold JUnit test methods count.
export function expectedTestClasses(testDir) {
  return findFiles(testDir, testClassPattern)
    .flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const name = basename(file, ".java");
      const isAbstract = new RegExp(`\\babstract\\s+(?:\\w+\\s+)*class\\s+${name}\\b`).test(source);
      const hasTests = /@(Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b/.test(source);
      const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(source)?.[1];
      return !isAbstract && hasTests ? [pkg ? `${pkg}.${name}` : name] : [];
    })
    .sort();
}

// The Vitest summary: " Test Files  1 failed | 7 passed (8)" -> 8 files ran; " Tests  91 passed (91)".
export function vitestSummary(output) {
  const files = /^\s*Test Files\s+.*\((\d+)\)\s*$/m.exec(output);
  const tests = /^\s*Tests\s+(.+?)\s*$/m.exec(output);
  return files && tests ? { files: Number(files[1]), tests: tests[1] } : null;
}

export function frontendVerdict(output, specFiles) {
  const summary = vitestSummary(output);
  if (!summary) return { ok: false, result: "no Vitest summary: the tests did not run" };
  const result = `${summary.files} of ${specFiles} spec files, ${summary.tests}`;
  return summary.files < specFiles ? { ok: false, result: `only ${result}` } : { ok: true, result };
}

// Surefire writes TEST-<class>.xml per test class (nested classes get TEST-Outer$Inner.xml); only reports written
// since the run started count, so a stale report from an earlier run cannot hide a class that did not run now.
export function surefireSummary(reportDir, since) {
  const classes = new Set();
  let tests = 0;
  let failed = 0;
  for (const file of findFiles(reportDir, /^TEST-.*\.xml$/)) {
    if (statSync(file).mtimeMs < since) continue;
    classes.add(basename(file).replace(/^TEST-/, "").replace(/(\$.*)?\.xml$/, ""));
    const suite = /<testsuite\b[^>]*>/.exec(readFileSync(file, "utf8"))?.[0] ?? "";
    const attr = (key) => Number(new RegExp(`\\b${key}="(\\d+)"`).exec(suite)?.[1] ?? 0);
    tests += attr("tests");
    failed += attr("failures") + attr("errors");
  }
  return { classes, tests, failed };
}

// Compares names, so a report from a class nobody expected (one that inherits all its tests) cannot hide a missing one.
// A run without a single test is red too.
export function backendVerdict(reportDir, since, expectedClasses) {
  const summary = surefireSummary(reportDir, since);
  const missing = expectedClasses.filter((name) => !summary.classes.has(name));
  const ran = expectedClasses.length - missing.length;
  const counts = `${summary.tests} tests, ${summary.failed} failed`;
  if (!missing.length) return { ok: summary.tests > 0, result: `${ran} of ${expectedClasses.length} test classes, ${counts}` };
  const names = missing.map((name) => name.split(".").pop()).join(", ");
  return { ok: false, result: `only ${ran} of ${expectedClasses.length} test classes (missing ${names}), ${counts}` };
}

// scripts/hooks-selftest.mjs prints one "PASS <check>" or "FAIL <check>" line per check.
export function selfTestVerdict(output) {
  const passed = (output.match(/^PASS /gm) ?? []).length;
  const failed = (output.match(/^FAIL /gm) ?? []).length;
  return { ok: passed > 0 && failed === 0, result: `${passed} checks passed, ${failed} failed` };
}

// node --test prints "ℹ pass 8" (spec reporter) or "# pass 8" (TAP reporter, older Node without a TTY).
export function nodeTestVerdict(output) {
  const count = (key) => Number(new RegExp(`^(?:ℹ|#) ${key} (\\d+)$`, "m").exec(output)?.[1] ?? NaN);
  const pass = count("pass");
  const fail = count("fail");
  if (Number.isNaN(pass) || Number.isNaN(fail)) return { ok: false, result: "no node --test summary" };
  return { ok: pass > 0 && fail === 0, result: `${pass} passed, ${fail} failed` };
}

// A check fails on its runner's exit code, and also when the runner exited 0 but the verdict found the run incomplete.
// spawnSync reports a null status when the runner could not start or was killed.
export function checkExitCode(status, ok) {
  if (status !== 0) return status ?? 1;
  return ok ? 0 : 1;
}

// What the evidence table shows: the check's code, plus the runner's own exit code when the verdict overrode it.
export function exitColumn(status, code) {
  if (status === code) return `${code}`;
  return status === null || status === undefined ? `${code} (no exit code)` : `${code} (runner exited ${status})`;
}
