#!/usr/bin/env node
// Runs the whole Playwright suite in every supported browser and writes docs/qa/e2e-report.json (the `e2e` class of the
// acceptance-method gate reads it). Needs the built JAR (mvn -B -ntp -DskipTests package, or E2E_JAR=<path>) and the browsers
// (pnpm exec playwright install). A run of fewer browsers is reported "incomplete", never "passed".
// Usage: pnpm run report:e2e
import { spawnSync } from "node:child_process";

// The report says the whole suite passed, so a filtered run (--grep, a file name, --project) must not be able to write it.
if (process.argv.length > 2) {
  console.error("e2e-report.mjs runs the whole suite and takes no arguments; use `pnpm run test:e2e` for a filtered run.");
  process.exit(2);
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["exec", "playwright", "test"], {
  stdio: "inherit",
  env: { ...process.env, E2E_REPORT: "1" },
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
