#!/usr/bin/env node
// One targeted test run of the test-first loop (step 2 Red, step 3 Green), recorded by the tool: it runs the command
// the skill names, prints the tail of the output and appends a TestRun record (exit code, tests, failed, why it failed,
// the first failure line) to the agent log buffer (scripts/loop-record.mjs). scripts/pr-evidence.mjs reads the records
// to show red -> green in the pull request, so nobody pastes it there by hand.
// The record also lists each test of the run with its status (`results`, read from the runner's own report through
// scripts/test-results.mjs: Surefire XML, Vitest JSON, node:test JUnit), so the gate can tell the criterion's own test
// from the rest of its class or file. A run whose report is missing keeps the console summary and is recorded
// `structured: false`; the gate does not count it. `testFiles` holds the blob id of each test file the run used.
// Usage (from the repo root):
//   node scripts/test-run.mjs backend <TestClass>[#method]       mvn -B -ntp -Dskip.frontend=true test -Dtest=...
//   node scripts/test-run.mjs frontend <path/to/file.spec.ts>    ng test --watch=false --include ... (in frontend/)
//   node scripts/test-run.mjs harness <scripts/file.test.mjs>    node --test ...
// Exit code: the runner's (2 for bad arguments). The full output goes to target/test-run/last.log.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { findFiles, frontendNode, vitestSummary } from "./dod-checks.mjs";
import { codeFingerprint } from "./dod-fingerprint.mjs";
import { appendRecord } from "./loop-record.mjs";
import { junitTests, vitestTests } from "./test-results.mjs";

const ansi = /\x1b\[[0-9;]*m/g;
const clip = (line) => line.trim().slice(0, 200);
// The selector reaches a shell on Windows (mvn is a .cmd there), so only plain test names and paths pass.
const SELECTORS = {
  backend: /^[\w.$#,*+-]+$/,
  frontend: /^[\w./\\-]+\.spec\.ts$/,
  harness: /^[\w./\\-]+\.test\.mjs$/,
};

// Repo-relative with forward slashes, the way specs name tests (`frontend/src/app/...spec.ts`, `scripts/x.test.mjs`).
export function normalizeSelector(target, selector) {
  const path = String(selector).replace(/\\/g, "/").replace(/^\.\//, "");
  if (target === "frontend") return path.startsWith("frontend/") ? path : `frontend/${path}`;
  return path;
}

// kind: pass | assertion (red for the right reason) | compile (nothing ran) | no-tests | error (red, cause unknown).
function verdict(status, tests, failed, compileError, firstFailure) {
  if (compileError) return { tests, failed, kind: "compile", firstFailure: clip(compileError) };
  if (tests === 0) return { tests, failed, kind: "no-tests", firstFailure: "" };
  if (failed > 0) return { tests, failed, kind: "assertion", firstFailure: clip(firstFailure) };
  return status === 0 ? { tests, failed, kind: "pass", firstFailure: "" } : { tests, failed, kind: "error", firstFailure: clip(firstFailure) };
}

const firstLine = (text, pattern) => text.split("\n").find((line) => pattern.test(line)) ?? "";

function summarizeMaven(out, status) {
  if (/No tests (matching pattern .* )?were executed|No tests to run/.test(out)) return verdict(status, 0, 0, "", "");
  // Keep the file name, not the absolute path: the record is committed.
  const compile = /COMPILATION ERROR/.test(out)
    ? firstLine(out, /\.java:\[\d+,\d+\]/).replace(/^\[ERROR\]\s*/, "").replace(/^.*[\\/](?=[^\\/]+\.java:)/, "")
    : "";
  const runs = [...out.matchAll(/Tests run: (\d+), Failures: (\d+), Errors: (\d+)/g)].at(-1);
  const tests = runs ? Number(runs[1]) : 0;
  const failed = runs ? Number(runs[2]) + Number(runs[3]) : 0;
  const lines = out.split("\n");
  const header = lines.findIndex((line) => /^\[ERROR\] (Failures|Errors):\s*$/.test(line));
  const failure = header >= 0 ? (/^\[ERROR\]\s+(\S.*)$/.exec(lines[header + 1] ?? "")?.[1] ?? "") : firstLine(out, /AssertionError|Exception:/);
  return verdict(status, compile ? 0 : tests, failed, compile, failure);
}

function summarizeVitest(out, status) {
  const summary = vitestSummary(out);
  if (!summary) {
    const ts = /(TS\d{4}:.*?)(?:\s+\[plugin [^\]]+\])?\s*$/.exec(firstLine(out, /\bTS\d{4}:/))?.[1];
    if (ts) return verdict(status, 0, 0, ts, "");
    return status === 0 ? verdict(status, 0, 0, "", "") : verdict(status, 0, 0, firstLine(out, /\S/) || "no Vitest summary", "");
  }
  const tests = Number(/\((\d+)\)\s*$/.exec(summary.tests)?.[1] ?? 0);
  const failed = Number(/(\d+) failed/.exec(summary.tests)?.[1] ?? 0);
  return verdict(status, tests, failed, "", firstLine(out, /^\s*(AssertionError|TypeError|ReferenceError|Error)\b/));
}

function summarizeNodeTest(out, status) {
  const compile = firstLine(out, /SyntaxError|ERR_MODULE_NOT_FOUND|does not provide an export named/);
  const count = (key) => Number(new RegExp(`^(?:ℹ|#) ${key} (\\d+)\\s*$`, "m").exec(out)?.[1] ?? 0);
  return verdict(status, count("tests"), count("fail"), compile, firstLine(out, /^\s*(AssertionError|Error)\b/));
}

export function summarize(target, rawOutput, status) {
  const out = rawOutput.replace(ansi, "").replace(/\r\n?/g, "\n");
  if (target === "backend") return summarizeMaven(out, status);
  if (target === "frontend") return summarizeVitest(out, status);
  return summarizeNodeTest(out, status);
}

// The run's kind from its per-test results (null: the runner wrote no report, so the console summary stands, unstructured).
// A compile error wins over any report, and so does a runner that failed while every test passed (kind error).
export function structuredVerdict(results, status, summary) {
  if (!results) return { ...summary, structured: false, results: [] };
  if (summary.kind === "compile") return { ...summary, structured: true, results: [] };
  const ran = results.filter((r) => r.status !== "skipped");
  const failed = ran.filter((r) => r.status === "assertion" || r.status === "error").length;
  const kind = !ran.length ? "no-tests" : ran.some((r) => r.status === "assertion") ? "assertion" : failed || status !== 0 ? "error" : "pass";
  return { tests: ran.length, failed, kind, firstFailure: kind === "pass" ? "" : summary.firstFailure, structured: true, results };
}

const reportPath = (root, target) => join(root, "target", "test-run", target === "frontend" ? "vitest.json" : "harness.xml");

// The per-test results of this run, or null when the runner wrote no report. Surefire keeps one file per class and
// never deletes old ones, so only the files written since the run started are read.
function readResults(root, target, selector, since) {
  try {
    if (target === "backend") {
      const dir = join(root, "target", "surefire-reports");
      if (!existsSync(dir)) return null;
      const files = readdirSync(dir)
        .filter((f) => /^TEST-.*\.xml$/.test(f))
        .map((f) => join(dir, f))
        .filter((f) => statSync(f).mtimeMs >= since);
      return files.length ? files.flatMap((f) => junitTests(readFileSync(f, "utf8"), { kind: "surefire" })) : null;
    }
    const report = reportPath(root, target);
    if (!existsSync(report)) return null;
    const text = readFileSync(report, "utf8");
    return target === "frontend" ? vitestTests(text, root) : junitTests(text, { kind: "node", file: selector });
  } catch {
    return null;
  }
}

// The blob id of each test file the run used (its class files for a backend selector), as `git add` would store it.
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function testFiles(root, target, selector) {
  const classes = [...new Set(selector.split(",").map((s) => s.split("#")[0]))];
  const paths =
    target === "backend"
      ? classes.flatMap((c) => findFiles(join(root, "src", "test", "java"), new RegExp(`^${escapeRegExp(c)}\\.java$`)))
      : [join(root, selector)];
  const rel = paths.map((p) => relative(root, p).replace(/\\/g, "/"));
  if (!rel.length) return {};
  try {
    const blobs = execFileSync("git", ["-C", root, "hash-object", "--", ...rel], { encoding: "utf8" }).trim().split(/\r?\n/);
    return Object.fromEntries(rel.map((path, i) => [path, blobs[i]]));
  } catch {
    return {};
  }
}

function command(root, target, selector) {
  if (target === "backend") {
    return { cmd: "mvn", args: ["-B", "-ntp", "-Dskip.frontend=true", "test", `-Dtest=${selector}`], cwd: root, shell: process.platform === "win32" };
  }
  if (target === "frontend") {
    const ng = join(root, "frontend", "node_modules", "@angular", "cli", "bin", "ng.js");
    const include = selector.replace(/^frontend\//, "");
    // json first: --output-file applies to the first reporter; default keeps the console summary.
    const args = [ng, "test", "--watch=false", "--include", include, "--reporters", "json", "--reporters", "default", "--output-file", reportPath(root, target)];
    return { cmd: frontendNode(root), args, cwd: join(root, "frontend"), env: { ...process.env, NG_CLI_ANALYTICS: "false" } };
  }
  const reporters = ["--test-reporter=spec", "--test-reporter-destination=stdout", "--test-reporter=junit", `--test-reporter-destination=${reportPath(root, target)}`];
  return { cmd: process.execPath, args: ["--test", ...reporters, selector], cwd: root };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [target, raw] = process.argv.slice(2);
  if (!SELECTORS[target] || !raw || !SELECTORS[target].test(raw)) {
    console.error("Usage: node scripts/test-run.mjs backend <TestClass>[#method] | frontend <file.spec.ts> | harness <file.test.mjs>");
    process.exit(2);
  }
  const root = process.cwd();
  const selector = normalizeSelector(target, raw);
  let code = null;
  try {
    code = codeFingerprint(root); // at the start, like dod.mjs: the code this run tested
  } catch {
    /* not a git work tree: record without it */
  }
  const { cmd, args, ...options } = command(root, target, selector);
  mkdirSync(join(root, "target", "test-run"), { recursive: true });
  rmSync(reportPath(root, target), { force: true });
  const files = testFiles(root, target, selector);
  const since = Date.now();
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  const seconds = Number(((Date.now() - since) / 1000).toFixed(1));
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? String(r.error) : ""}`;
  writeFileSync(join(root, "target", "test-run", "last.log"), output);
  const status = r.status ?? 1;
  const s = structuredVerdict(readResults(root, target, selector, since), status, summarize(target, output, status));
  console.log(output.replace(ansi, "").trimEnd().split(/\r?\n/).slice(-40).join("\n"));
  const outcome = s.kind === "pass" ? "green" : `red (${s.kind})`;
  const how = s.structured ? "" : " (no structured report: this run does not count as red or green)";
  console.log(`\nTestRun ${target} ${selector}: ${outcome}${how}, exit ${status}, ${s.tests} tests, ${s.failed} failed${s.firstFailure ? ` - ${s.firstFailure}` : ""}`);
  const recorded = appendRecord(root, { event: "TestRun", target, selector, exit: status, ...s, seconds, code, testFiles: files });
  console.log(recorded ? "Recorded in .agent-log/pending.jsonl; the next commit folds it into the agent log." : "Could not record the run.");
  process.exit(status);
}
