#!/usr/bin/env node
// The Definition of done from AGENTS.md as one command, in CI order (.github/workflows/ci.yml). Stops at the first
// failing check and prints a Markdown evidence table (check, command, exit code, time, result) to paste into a
// report or a pull request. Each check's full output goes to target/dod/<n>.log; a failing check also prints its tail.
// The frontend checks run with the Node that Maven pins (target/frontend-tooling) when it is installed.
// Usage: node scripts/dod.mjs   (run from the repo root; exit code 0 = done, otherwise the failing check's code)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const frontend = join(root, "frontend");
const pinned = join(root, "target", "frontend-tooling", "node", process.platform === "win32" ? "node.exe" : "node");
const ansi = /\x1b\[[0-9;]*m/g;
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: process.platform === "win32" });

function surefireResult(since) {
  const dir = join(root, "target", "surefire-reports");
  if (!existsSync(dir)) return "no test reports";
  let tests = 0;
  let failed = 0;
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (!/^TEST-.*\.xml$/.test(name) || statSync(file).mtimeMs < since) continue;
    const suite = /<testsuite\b[^>]*>/.exec(readFileSync(file, "utf8"))?.[0] ?? "";
    const attr = (key) => Number(new RegExp(`\\b${key}="(\\d+)"`).exec(suite)?.[1] ?? 0);
    tests += attr("tests");
    failed += attr("failures") + attr("errors");
  }
  return `${tests} tests, ${failed} failed`;
}

// Resolved lazily: the frontend tools exist only after the Maven build has installed them.
const frontendNode = () => (existsSync(pinned) ? pinned : process.execPath);
const checks = [
  {
    name: "Agent harness self-test",
    label: "node scripts/hooks-selftest.mjs",
    run: () => spawnSync(process.execPath, [join(root, "scripts", "hooks-selftest.mjs")], { cwd: root, encoding: "utf8" }),
    result: (out) => `${(out.match(/^PASS /gm) ?? []).length} checks passed, ${(out.match(/^FAIL /gm) ?? []).length} failed`,
  },
  {
    name: "Backend build and tests",
    label: "mvn -B -ntp verify",
    run: () => sh("mvn", ["-B", "-ntp", "verify"]),
    result: (_, since) => surefireResult(since),
  },
  {
    name: "Frontend formatting",
    label: "prettier --check . (in frontend/)",
    run: () =>
      spawnSync(frontendNode(), [join(frontend, "node_modules", "prettier", "bin", "prettier.cjs"), "--check", "."], {
        cwd: frontend,
        encoding: "utf8",
      }),
    result: (out) => (/All matched files use Prettier code style/.test(out) ? "all files formatted" : "unformatted files"),
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
    result: (out) => /^\s*Tests\s+(.+)$/m.exec(out)?.[1].trim() ?? "no test summary",
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
  const code = r.status ?? 1;
  rows.push(`| ${check.name} | \`${check.label}\` | ${code} | ${seconds} s | ${check.result(out, since)} |`);
  if (code !== 0) {
    exitCode = code;
    console.error(`\n${check.name} failed (exit ${code}). Last lines of target/dod/${i + 1}.log:\n`);
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
process.exit(exitCode);
