#!/usr/bin/env node
// CI counterpart of the test-run guard in scripts/dod.mjs: a test runner can exit 0 while running only part of the
// suite (in #41, 7 of 8 Vitest spec files never started), and CI gates only on exit codes. This fails the job when
// the backend ran fewer test classes than exist, or the frontend ran fewer spec files than exist on disk.
// Reuses the pure verdict functions from scripts/dod-checks.mjs.
// Usage (from the repo root):
//   node scripts/ci-test-guard.mjs backend                     # after `mvn -B -ntp verify`
//   node scripts/ci-test-guard.mjs frontend <ng-test-log>      # against the captured `ng test` output
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { backendVerdict, expectedTestClasses, findFiles, frontendVerdict, specFilePattern } from "./dod-checks.mjs";

// since=0: in a clean CI checkout every Surefire report is from this run, so none is filtered out by mtime.
export function backendGuard(surefireDir, testDir) {
  return backendVerdict(surefireDir, 0, expectedTestClasses(testDir));
}

export function frontendGuard(vitestOutput, frontendSrc) {
  return frontendVerdict(vitestOutput, findFiles(frontendSrc, specFilePattern).length);
}

// Run only as a CLI, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd();
  const mode = process.argv[2];
  let verdict;
  if (mode === "backend") {
    verdict = backendGuard(join(root, "target", "surefire-reports"), join(root, "src", "test", "java"));
  } else if (mode === "frontend") {
    const logFile = process.argv[3];
    if (!logFile) {
      console.error("usage: node scripts/ci-test-guard.mjs frontend <ng-test-log>");
      process.exit(2);
    }
    verdict = frontendGuard(readFileSync(logFile, "utf8"), join(root, "frontend", "src"));
  } else {
    console.error("usage: node scripts/ci-test-guard.mjs backend|frontend [log]");
    process.exit(2);
  }
  console.log(`${mode}: ${verdict.result}`);
  process.exit(verdict.ok ? 0 : 1);
}
