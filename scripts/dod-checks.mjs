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

// Vitest spec files, and the test classes Maven Surefire picks up by default (Test*, *Test, *Tests, *TestCase).
export const specFilePattern = /\.spec\.ts$/;
export const testClassPattern = /^(Test\w*|\w*Tests?|\w*TestCase)\.java$/;

// Surefire writes no report for an abstract base class or a helper named like a test, so only classes that are not
// abstract and hold JUnit test methods are expected to report.
export function runnableTestClasses(testDir) {
  return findFiles(testDir, testClassPattern).filter((file) => {
    const source = readFileSync(file, "utf8");
    return !/\babstract\s+class\b/.test(source) && /@(Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b/.test(source);
  });
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
  return { classes: classes.size, tests, failed };
}

export function backendVerdict(reportDir, since, testClasses) {
  const summary = surefireSummary(reportDir, since);
  const result = `${summary.classes} of ${testClasses} test classes, ${summary.tests} tests, ${summary.failed} failed`;
  return summary.classes < testClasses ? { ok: false, result: `only ${result}` } : { ok: true, result };
}

// node --test prints "ℹ pass 8" (spec reporter) or "# pass 8" (TAP reporter, older Node without a TTY).
export function nodeTestVerdict(output) {
  const count = (key) => Number(new RegExp(`^(?:ℹ|#) ${key} (\\d+)$`, "m").exec(output)?.[1] ?? NaN);
  const pass = count("pass");
  const fail = count("fail");
  if (Number.isNaN(pass) || Number.isNaN(fail)) return { ok: false, result: "no node --test summary" };
  return { ok: pass > 0 && fail === 0, result: `${pass} passed, ${fail} failed` };
}
