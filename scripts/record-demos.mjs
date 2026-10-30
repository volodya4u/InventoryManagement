#!/usr/bin/env node
// Records the demo clips: runs the Playwright specs once in Chromium with video on (E2E_RECORD=1), and
// e2e/support/recording-reporter.mjs writes docs/qa/demo-recordings/ (video, still, explainer per clip, and manifest.json).
// A clip is evidence only if its test passed; scripts/check-recordings.mjs then checks the files on disk.
// Needs the built JAR (mvn -B -ntp -DskipTests package, or E2E_JAR=<path>) and the browsers
// (pnpm exec playwright install chromium). Usage: pnpm run record:demos
import { spawnSync } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["exec", "playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, E2E_RECORD: "1" },
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
