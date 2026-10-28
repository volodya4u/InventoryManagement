// Checks that scripts/dod.mjs runs after each test command: did every test file on disk actually run?
// A test runner can exit 0 while running only part of the suite (in #41, 7 of 8 Vitest spec files never started),
// so dod.mjs compares what ran with what exists. Pure functions, unit-tested in scripts/dod-checks.test.mjs.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

// The Node that Maven pins into target/frontend-tooling (the Angular CLI refuses older releases), when it is installed.
export const pinnedNodePath = (root) =>
  join(root, "target", "frontend-tooling", "node", process.platform === "win32" ? "node.exe" : "node");
export const frontendNode = (root) => (existsSync(pinnedNodePath(root)) ? pinnedNodePath(root) : process.execPath);

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

// Vitest forces colour when it detects CI (even piped through tee), so the summary lines arrive wrapped in ANSI
// escape sequences: strip them first, or the anchors below never match and a green run looks like it never ran.
const ansiEscape = /\x1b\[[0-9;]*m/g;

// The Vitest summary: " Test Files  1 failed | 7 passed (8)" -> 8 files ran; " Tests  91 passed (91)".
export function vitestSummary(output) {
  const plain = output.replace(ansiEscape, "");
  const files = /^\s*Test Files\s+.*\((\d+)\)\s*$/m.exec(plain);
  const tests = /^\s*Tests\s+(.+?)\s*$/m.exec(plain);
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

// scripts/mcp-smoke.mjs ends with "MCP smoke: <server> answered list_projects in <n> s (<project>, Angular <v>)".
export function mcpSmokeVerdict(output) {
  const line = /^MCP smoke: (.+)$/m.exec(output)?.[1];
  return line ? { ok: true, result: line } : { ok: false, result: "the angular-cli MCP server gave no list_projects answer" };
}

// The coverage ratchet's backend and frontend runs (ADR-0006), one after the other, each run's stderr before its stdout
// so its FAIL lines precede its "Result:" line; its findings carry its --label. Done only when both sides ran and passed.
export const COVERAGE_SIDES = ["backend", "frontend"];
export function coverageVerdict(output) {
  const runs = [...String(output).matchAll(/([\s\S]*?)^Result: (\S+)/gm)].map(([, text, result]) => ({
    side: /^(?!Scope:)(\w+): /m.exec(text)?.[1],
    result,
    text,
  }));
  const bySide = Object.fromEntries(runs.map((run) => [run.side, run]));
  // A failed side first: the DoD stops after it, so the other side never reports.
  const failed = COVERAGE_SIDES.filter((side) => bySide[side] && bySide[side].result !== "PASS");
  if (failed.length) {
    const why = (side) => /^\w+: FAIL\s+(?:coverage ratchet: )?(.+)$/m.exec(bySide[side].text)?.[1] ?? bySide[side].result;
    return { ok: false, result: failed.map((side) => `${side}: ${why(side)}`).join("; ") };
  }
  const missing = COVERAGE_SIDES.filter((side) => !bySide[side]);
  if (missing.length) return { ok: false, result: `no ${missing.join(" or ")} ratchet result` };
  // "OK    lines 81.5% (baseline 81.5%)" or "INFO  lines improved 80% -> 81.5% — ..."
  const lines = (side) => /^\w+: (?:OK\s+lines|INFO\s+lines improved [\d.]+% ->) ([\d.]+)%/m.exec(bySide[side].text)?.[1];
  return { ok: true, result: COVERAGE_SIDES.map((side) => `${side} lines ${lines(side)}%`).join(", ") };
}

// The eval ratchet (scripts/check-eval-ratchet.mjs), run after `eval-summary.mjs --check` as in CI. Its stderr comes
// before its stdout, so a FAIL line precedes the "Result:" line. Only a PASS on at least one case counts: the ratchet
// itself exits 0 on "SKIP-pending", and a pass on no case is not evidence.
export function evalRatchetVerdict(output) {
  const text = String(output);
  const result = /^Result: (\S+)/m.exec(text)?.[1];
  const cases = Number(/^Scope: (\d+) eval case/m.exec(text)?.[1] ?? 0);
  if (result === "FAIL") return { ok: false, result: /^FAIL\s+(?:eval ratchet: )?(.+)$/m.exec(text)?.[1] ?? "the eval ratchet failed" };
  if (result !== "PASS") {
    // No "Result:" line means a script stopped before the ratchet ran (a stale summary, a missing baseline): quote why.
    const reason = result ? "" : text.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 160);
    return { ok: false, result: `the eval ratchet gave ${result ?? "no result"}, not PASS${reason ? `: ${reason}` : ""}` };
  }
  if (cases === 0) return { ok: false, result: "the eval ratchet passed on no case" };
  return { ok: true, result: `${cases} eval cases, none below its baseline` };
}

// The generated reports the pre-commit hook rewrites (scripts/hooks-pre-commit.mjs), regenerated before the code is
// fingerprinted. Each run is { script, status } as spawnSync reports it.
export function generatedReportsVerdict(runs) {
  if (!runs.length) return { ok: false, result: "no report generator ran" };
  // scripts/check-traceability.mjs -> "traceability"
  const nameOf = ({ script }) => script.replace(/^.*[\\/]/, "").replace(/^check-/, "").replace(/\.mjs$/, "");
  const failed = runs.find(({ status }) => status !== 0);
  if (failed) {
    const how = failed.status === null || failed.status === undefined ? "no exit code" : `exit ${failed.status}`;
    return { ok: false, result: `${nameOf(failed)} failed (${how})` };
  }
  return { ok: true, result: `regenerated: ${runs.map(nameOf).join(", ")}` };
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
