#!/usr/bin/env node
// The Definition of done from AGENTS.md as one command, in CI order (.github/workflows/ci.yml). Stops at the first
// failing check and prints a Markdown evidence table (check, command, exit code, time, result) to paste into a
// report or a pull request. Each check's full output goes to target/dod/<n>.log; a failing check also prints its tail.
// A test check also fails when its runner exits 0 but did not run every test class or spec file on disk (backend,
// frontend) or ran no test at all (self-test, harness unit tests, backend); see scripts/dod-checks.mjs.
// The frontend checks run with the Node that Maven pins (target/frontend-tooling) when it is installed.
// Usage: node scripts/dod.mjs   (run from the repo root; exit code 0 = done, otherwise the failing check's code)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  backendVerdict,
  checkExitCode,
  exitColumn,
  expectedTestClasses,
  findFiles,
  frontendVerdict,
  nodeTestVerdict,
  selfTestVerdict,
  specFilePattern,
} from "./dod-checks.mjs";
import { codeFingerprint, markerPath } from "./dod-fingerprint.mjs";

const root = process.cwd();
const frontend = join(root, "frontend");
const pinned = join(root, "target", "frontend-tooling", "node", process.platform === "win32" ? "node.exe" : "node");
const ansi = /\x1b\[[0-9;]*m/g;
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
// The top level of scripts/ only, like the shell glob in the CI step.
const harnessTests = readdirSync(join(root, "scripts"))
  .filter((name) => name.endsWith(".test.mjs"))
  .map((name) => join("scripts", name));

// Resolved lazily: the frontend tools exist only after the Maven build has installed them.
const frontendNode = () => (existsSync(pinned) ? pinned : process.execPath);
// Each check's verdict says whether the run is complete beyond its exit code, and what goes in the Result column.
const checks = [
  {
    name: "Agent harness self-test",
    label: "node scripts/hooks-selftest.mjs",
    run: () => spawnSync(process.execPath, [join(root, "scripts", "hooks-selftest.mjs")], { cwd: root, encoding: "utf8" }),
    verdict: selfTestVerdict,
  },
  {
    name: "Harness unit tests",
    label: "node --test scripts/*.test.mjs",
    // Without file arguments node --test would search the whole repository, so an empty list runs nothing and fails,
    // like the unmatched glob in CI.
    run: () =>
      harnessTests.length
        ? spawnSync(process.execPath, ["--test", ...harnessTests], { cwd: root, encoding: "utf8" })
        : { status: 0, stdout: "" },
    verdict: (out) => (harnessTests.length ? nodeTestVerdict(out) : { ok: false, result: "no scripts/*.test.mjs files" }),
  },
  {
    name: "Backend build and tests",
    label: "mvn -B -ntp verify",
    run: () => sh("mvn", ["-B", "-ntp", "verify"]),
    verdict: (_, since) =>
      backendVerdict(join(root, "target", "surefire-reports"), since, expectedTestClasses(join(root, "src", "test", "java"))),
  },
  {
    name: "Frontend formatting",
    label: "prettier --check . (in frontend/)",
    run: () =>
      spawnSync(frontendNode(), [join(frontend, "node_modules", "prettier", "bin", "prettier.cjs"), "--check", "."], {
        cwd: frontend,
        encoding: "utf8",
      }),
    // Like CI, only the exit code decides; the message just fills the Result column.
    verdict: (out) => ({
      ok: true,
      result: /All matched files use Prettier code style/.test(out) ? "all files formatted" : "unformatted files",
    }),
  },
  {
    name: "Frontend unit tests",
    label: "ng test --watch=false (in frontend/)",
    run: () =>
      spawnSync(frontendNode(), [join(frontend, "node_modules", "@angular", "cli", "bin", "ng.js"), "test", "--watch=false"], {
        cwd: frontend,
        encoding: "utf8",
        env: { ...process.env, NG_CLI_ANALYTICS: "false" },
      }),
    verdict: (out) => frontendVerdict(out, findFiles(join(frontend, "src"), specFilePattern).length),
  },
];

const logDir = join(root, "target", "dod");
mkdirSync(logDir, { recursive: true });
// Every log starts as "not run", so a check skipped after a failure never shows an earlier run's output.
for (const [i, check] of checks.entries()) writeFileSync(join(logDir, `${i + 1}.log`), `${check.name}: not run\n`);
const head = sh("git", ["rev-parse", "--short", "HEAD"]).stdout?.trim() || "unknown";
const dirty = (sh("git", ["status", "--porcelain"]).stdout ?? "").split("\n").filter(Boolean).length;
const rows = [];
let exitCode = 0;
for (const [i, check] of checks.entries()) {
  const since = Date.now();
  const r = check.run();
  const seconds = ((Date.now() - since) / 1000).toFixed(1);
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? String(r.error) : ""}`.replace(ansi, "");
  writeFileSync(join(logDir, `${i + 1}.log`), out);
  const { ok, result } = check.verdict(out, since);
  // A runner that exits 0 but ran only part of the suite still fails the check.
  const code = checkExitCode(r.status, ok);
  rows.push(`| ${check.name} | \`${check.label}\` | ${exitColumn(r.status, code)} | ${seconds} s | ${result} |`);
  if (code !== 0) {
    exitCode = code;
    const why = r.status === 0 ? `the runner exited 0, but ${result}` : `exit ${code}`;
    console.error(`\n${check.name} failed (${why}). Last lines of target/dod/${i + 1}.log:\n`);
    console.error(out.trimEnd().split("\n").slice(-60).join("\n"));
    for (const skipped of checks.slice(i + 1)) rows.push(`| ${skipped.name} | \`${skipped.label}\` | – | – | not run |`);
    break;
  }
}

console.log(`\n## Definition of done: ${exitCode === 0 ? "green" : "RED"}\n`);
console.log(`HEAD ${head}${dirty ? ` with ${dirty} uncommitted file(s)` : ""}, ${new Date().toISOString()}, Node ${process.version}` +
  (existsSync(pinned) ? " (frontend checks on the pinned Node from target/frontend-tooling)" : "") + "\n");
console.log("| Check | Command | Exit | Time | Result |");
console.log("| ----- | ------- | ---- | ---- | ------ |");
for (const row of rows) console.log(row);

// Record a green run so the dod-fresh Stop hook (.claude/hooks/dod-fresh.mjs) can tell when code changed since.
if (exitCode === 0) {
  try {
    writeFileSync(markerPath(root), JSON.stringify({ head, fingerprint: codeFingerprint(root), at: new Date().toISOString() }) + "\n");
  } catch {
    /* the marker is a convenience, never fail the run over it */
  }
}
process.exit(exitCode);
