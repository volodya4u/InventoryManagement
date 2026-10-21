#!/usr/bin/env node
// A controlled break, recorded so another reviewer can replay it (ADR-0005, slice 4). A test that pins behaviour that
// already exists passes from the start, so it cannot go red before a change the way a new behaviour's test does.
// Instead it is shown red by breaking the code it tests:
//   node scripts/break-run.mjs start <target> <selector>   runs the test (it must be green), snapshots the tree, prints
//                                                          the run id
//   (edit the code under test by hand: the controlled break; never a test or its fixtures, see isTestPath)
//   node scripts/break-run.mjs break <run-id>              saves the edit as a patch, runs the test (red expected)
//   node scripts/break-run.mjs restore <run-id>            reverses the patch, checks the tree is the start's again,
//                                                          runs the test (green expected)
// <target> and <selector> are scripts/test-run.mjs's (backend Class[#method] | frontend file.spec.ts | harness
// file.test.mjs). Each step appends a BreakRun record (the run id, the step, the code fingerprint and every test's
// result) to the agent log, and run.json + mutation.patch go to docs/evidence/break-runs/<run-id>/, committed with the
// pull request: under docs/ they are not code, so they never change the fingerprint a restore is checked against.
// scripts/pr-evidence.mjs accepts a complete run for a criterion of a slice marked `Kind: hardening`, and
// scripts/break-replay.mjs <run-id> replays it.
// Exit code: 0 when the step did what it should (green start, red break, green restore on the start's code), 1 when it
// did not, 2 for bad arguments.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { appendRecord } from "./loop-record.mjs";
import { executeRun, normalizeSelector, validSelector } from "./test-run.mjs";

export const EVIDENCE_DIR = "docs/evidence/break-runs";
// A test, or a file tests read (resources, fixtures): a break that edits one changes what is checked, not the code
// under test. Not only the run's own test file: a fixture another test reads, or a shared test helper, counts too.
const TEST_PATH = /(^|\/)src\/test\/|\.(spec|test)\.ts$|\.test\.mjs$|(^|\/)(tests?|__tests__|fixtures|__fixtures__|__mocks__|testdata|test-data)\//;
export const isTestPath = (path) => TEST_PATH.test(String(path).replace(/\\/g, "/"));
const NOT_SNAPSHOT = ["docs/evidence/break-runs", ".agent-log"];

const git = (root, args, env) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env }).trimEnd();
// Of the patch's bytes (a Buffer as git wrote it), never of text a reader may have re-encoded or trimmed.
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// The working tree as a git tree object, the way `git add -A` would store it, through a throwaway index so the real one
// is untouched. The evidence folder and the agent log are left out: they change while the run goes on. With
// { worktree: false }, HEAD's tree with the same paths left out: what a clean working tree snapshots to.
export function snapshot(root, { worktree = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "break-run-index-"));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(dir, "index") };
    git(root, ["read-tree", "HEAD"], env);
    if (worktree) git(root, ["add", "-A"], env);
    // Dropped after the add, not excluded from it: git refuses a pathspec that names an ignored path.
    git(root, ["rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", ...NOT_SNAPSHOT], env);
    return git(root, ["write-tree"], env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// git apply [-R] --binary on the working tree; the first line of git's complaint when it fails, null when it worked.
export function applyPatch(root, patch, { reverse = false } = {}) {
  const r = spawnSync("git", ["-C", root, "apply", ...(reverse ? ["-R"] : []), "--binary", patch], { encoding: "utf8" });
  return r.status === 0 ? null : (`${r.stderr ?? ""}`.split(/\r?\n/).find(Boolean) ?? `exit ${r.status}`);
}

const runDir = (root, id) => join(root, EVIDENCE_DIR, id);
export function readRun(root, id) {
  const path = join(runDir(root, id), "run.json");
  return /^[\w.-]+$/.test(id ?? "") && existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}
const writeRun = (root, run) => writeFileSync(join(runDir(root, run.id), "run.json"), `${JSON.stringify(run, null, 2)}\n`);
const stepOf = (step, record) => ({ step, ts: new Date().toISOString(), code: record.code, kind: record.kind, results: record.results });

export function startRun(root, target, raw, { id } = {}) {
  if (!validSelector(target, raw)) return { ok: false, problem: "usage: start <backend|frontend|harness> <selector>" };
  const selector = normalizeSelector(target, raw);
  const { record } = executeRun(root, target, selector);
  if (record.kind !== "pass" || !record.structured) {
    return { ok: false, problem: `the test must be green before the break (it is ${record.kind}${record.structured ? "" : ", unstructured"})` };
  }
  const runId = id ?? `${new Date().toISOString().replace(/[-:]|\.\d+/g, "")}-${randomBytes(2).toString("hex")}`;
  mkdirSync(runDir(root, runId), { recursive: true });
  writeRun(root, { id: runId, target, selector, baseTree: snapshot(root), testFiles: record.testFiles, steps: [stepOf("start", record)] });
  appendRecord(root, { event: "BreakRun", run: runId, step: "start", ...record });
  return { ok: true, id: runId, record };
}

export function breakRun(root, id) {
  const run = readRun(root, id);
  if (!run) return { ok: false, problem: `no break run ${id} under ${EVIDENCE_DIR}` };
  if (run.steps.some((s) => s.step !== "start")) return { ok: false, problem: `run ${id} already has its break: restore it, then start a new run for another break` };
  const broken = snapshot(root);
  // Both sides of a rename: with rename detection, a fixture moved out of its test folder lists only the new path.
  const files = git(root, ["diff", "--name-only", "--no-renames", run.baseTree, broken]).split("\n").filter(Boolean);
  if (!files.length) return { ok: false, problem: "no code changed since the start: make the controlled break in the code under test first" };
  const tests = files.filter((f) => Object.hasOwn(run.testFiles ?? {}, f) || isTestPath(f));
  if (tests.length) return { ok: false, problem: `the break edits the test file ${tests.join(", ")}: break the code under test, never a test or its fixtures` };
  // git's bytes as they are: trimming would drop a blank last context line (" \n") and corrupt the patch.
  const patch = execFileSync("git", ["-C", root, "diff", "--binary", run.baseTree, broken], { maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(join(runDir(root, id), "mutation.patch"), patch);
  const { record } = executeRun(root, run.target, run.selector);
  const patchSha256 = sha256(patch);
  Object.assign(run, { brokenTree: broken, patchSha256, patchFiles: files });
  run.steps.push(stepOf("break", record));
  writeRun(root, run);
  appendRecord(root, { event: "BreakRun", run: id, step: "break", ...record, patchSha256, patchFiles: files });
  return record.kind === "assertion"
    ? { ok: true, record }
    : { ok: false, record, problem: `the test did not fail on an assertion (${record.kind}): the break did not reach the behaviour it pins; restore this run, then start a new one with another break` };
}

export function restoreRun(root, id) {
  const run = readRun(root, id);
  if (!run?.patchSha256) return { ok: false, problem: `run ${id} has no recorded break` };
  if (run.steps.some((s) => s.step === "restore")) return { ok: false, problem: `run ${id} is already restored: start a new run to try again` };
  const patch = join(runDir(root, id), "mutation.patch");
  if (sha256(readFileSync(patch)) !== run.patchSha256) return { ok: false, problem: "mutation.patch changed since the break" };
  // A tree that is the start's already (the break undone by hand) needs no reverse; reversing it again would fail.
  if (snapshot(root) !== run.baseTree) {
    const reversed = applyPatch(root, patch, { reverse: true });
    if (reversed) {
      return { ok: false, problem: `git apply -R could not reverse the break (${reversed}): undo only the break by hand, so the tree is the start's, then run restore again` };
    }
  }
  const after = snapshot(root);
  if (after !== run.baseTree) {
    const files = git(root, ["diff", "--name-only", "--no-renames", run.baseTree, after]).split("\n").filter(Boolean);
    return { ok: false, problem: `after reversing the patch the tree is not the start's (${files.join(", ")})` };
  }
  const { record } = executeRun(root, run.target, run.selector);
  run.steps.push(stepOf("restore", record));
  writeRun(root, run);
  appendRecord(root, { event: "BreakRun", run: id, step: "restore", ...record, patchSha256: run.patchSha256, patchFiles: run.patchFiles });
  const start = run.steps[0];
  if (record.kind !== "pass") return { ok: false, record, problem: `the restored code is not green (${record.kind})` };
  if (record.code !== start.code) return { ok: false, record, problem: "the restored code is not the code the run started from" };
  return { ok: true, record };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [step, ...rest] = process.argv.slice(2);
  const root = process.cwd();
  const result =
    step === "start" && rest.length === 2
      ? startRun(root, rest[0], rest[1])
      : (step === "break" || step === "restore") && rest.length === 1
        ? (step === "break" ? breakRun : restoreRun)(root, rest[0])
        : null;
  if (!result) {
    console.error("Usage: node scripts/break-run.mjs start <target> <selector> | break <run-id> | restore <run-id>");
    process.exit(2);
  }
  const r = result.record;
  if (r) console.log(`BreakRun ${step}: ${r.kind}, ${r.tests} tests, ${r.failed} failed${r.firstFailure ? ` - ${r.firstFailure}` : ""}`);
  if (result.id) console.log(`Run id: ${result.id} (evidence in ${EVIDENCE_DIR}/${result.id}/). Now break the code under test, then: node scripts/break-run.mjs break ${result.id}`);
  if (result.problem) console.error(`break-run ${step}: ${result.problem}`);
  else if (r) console.log("Recorded in .agent-log/pending.jsonl; the next commit folds it into the agent log.");
  process.exit(result.ok ? 0 : 1);
}
