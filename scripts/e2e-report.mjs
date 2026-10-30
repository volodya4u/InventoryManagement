#!/usr/bin/env node
// Runs the whole Playwright suite in every supported browser and writes docs/qa/e2e-report.json (the `e2e` class of the
// acceptance-method gate reads it). Needs the built JAR (mvn -B -ntp -DskipTests package, or E2E_JAR=<path>) and the browsers
// (pnpm exec playwright install). A run of fewer browsers is reported "incomplete", never "passed".
// Usage: pnpm run report:e2e
import { spawnSync } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["exec", "playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, E2E_REPORT: "1" },
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
