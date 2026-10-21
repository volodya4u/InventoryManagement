// Tests for the review evidence of scripts/check-trajectory.mjs, against throwaway git repositories: a slice merged by a
// pull request whose agent-log lines hold the reviewer's verdict on the branch head counts as reviewed.
// Run: node --test scripts/check-trajectory.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { treeFingerprintAt } from "./dod-fingerprint.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "check-trajectory.mjs");
const tmp = mkdtempSync(join(tmpdir(), "trajectory-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8" }).trim();
const write = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

// A hook-recorded reviewer verdict: the PreToolUse proposal and the executed hand-back with the same toolu_ id.
const verdict = (n, { tree, verdict = "APPROVE", blocking = 0, hook = true }) => {
  const id = `toolu_0${n}abc`;
  const base = { session: "s", tool: "SubagentHandback", agent: "reviewer", id };
  return [
    ...(hook ? [{ ts: `2026-10-22T10:0${n}:00.000Z`, event: "PreToolUse", ...base }] : []),
    { ts: `2026-10-22T10:0${n}:01.000Z`, event: "PostToolUse", ...base, verdict, blocking, tree, exit: 0 },
  ]
    .map((e) => JSON.stringify(e))
    .join("\n");
};

// A repository whose main merges branch claude/<slice> (one commit with the Slice trailer, then the log commit) with a
// merge commit, as GitHub merges a pull request. `logFor(tree)` gives the agent-log lines the branch adds.
function repo(name, logFor, { findings } = {}) {
  const root = join(tmp, name);
  mkdirSync(root);
  git(root, "init", "-q", "-b", "main");
  write(root, ".agent-log/actions.jsonl", "");
  write(root, "README.md", "x\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "Start");
  git(root, "switch", "-q", "-c", "claude/demo");
  write(root, "openspec/changes/archive/2026-10-22-demo/design.md", "# Design\n");
  write(root, "openspec/changes/archive/2026-10-22-demo/tasks.md", "- [x] 1. Do it.\n");
  if (findings) write(root, "openspec/changes/archive/2026-10-22-demo/review-findings.json", JSON.stringify(findings));
  write(root, "scripts/demo.mjs", "export const demo = 1;\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "Do the demo\n\nSlice: demo");
  const tree = treeFingerprintAt(root, "HEAD");
  write(root, ".agent-log/actions.jsonl", `${logFor(tree)}\n`);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "Fold the review into the agent log");
  git(root, "switch", "-q", "main");
  git(root, "merge", "-q", "--no-ff", "-m", "Merge pull request #1 from claude/demo", "claude/demo");
  return root;
}

const evidence = (root) => {
  execFileSync(process.execPath, [SCRIPT], { cwd: root, encoding: "utf8" });
  const { slices, warnings } = JSON.parse(readFileSync(join(root, "trace", "trajectory.json"), "utf8"));
  return { review: slices[0].reviewEvidence, warned: warnings.some((w) => w.check === "review-evidence") };
};

test("an archived slice counts as reviewed when its pull request recorded the reviewer's APPROVE on the branch head", () => {
  assert.deepEqual(evidence(repo("approved", (tree) => verdict(1, { tree }))), { review: "approved (agent log)", warned: false });
  // The last verdict decides: an APPROVE after CHANGES REQUESTED counts, the reverse does not.
  const rounds = (tree) => [verdict(1, { tree: "earlier", verdict: "CHANGES REQUESTED", blocking: 1 }), verdict(2, { tree })].join("\n");
  assert.equal(evidence(repo("second-round", rounds)).review, "approved (agent log)");
  // A review-findings.json written by the factory still decides first, even over an agent-log APPROVE.
  assert.equal(evidence(repo("findings", () => "", { findings: { clean: true } })).review, "clean");
  assert.equal(evidence(repo("findings-unclean", (tree) => verdict(1, { tree }), { findings: { clean: false } })).review, "unclean");
  // A warm cache gives the same answer as a cold run.
  const warm = repo("warm", (tree) => verdict(1, { tree }));
  assert.equal(evidence(warm).review, "approved (agent log)");
  assert.equal(evidence(warm).review, "approved (agent log)");
});

test("an archived slice is not counted as reviewed on a verdict that is stale, open or not recorded by the hook", () => {
  const not = (name, logFor) => {
    const { review, warned } = evidence(repo(name, logFor));
    assert.match(review, /^not approved \(agent log\)/, name);
    assert.equal(warned, true, name);
  };
  not("stale-tree", () => verdict(1, { tree: "a tree the reviewer saw before the last change" }));
  not("blocking", (tree) => verdict(1, { tree, blocking: 2 }));
  not("changes-requested", (tree) => verdict(1, { tree, verdict: "CHANGES REQUESTED", blocking: 1 }));
  not("hand-written", (tree) => verdict(1, { tree, hook: false }));
  // No verdict at all, and a slice whose trailer commit never reached main through a merge, stay missing.
  assert.deepEqual(evidence(repo("no-verdict", () => "")), { review: "missing", warned: true });
  const direct = join(tmp, "direct");
  mkdirSync(direct);
  git(direct, "init", "-q", "-b", "main");
  write(direct, "openspec/changes/archive/2026-10-22-demo/design.md", "# Design\n");
  write(direct, "openspec/changes/archive/2026-10-22-demo/tasks.md", "- [x] 1. Do it.\n");
  git(direct, "add", "-A");
  git(direct, "commit", "-q", "-m", "Do the demo\n\nSlice: demo");
  assert.deepEqual(evidence(direct), { review: "missing", warned: true });
  // A later, unrelated pull request with its own APPROVE does not lend it to the slice that landed on main directly.
  git(direct, "switch", "-q", "-c", "claude/other");
  write(direct, "scripts/other.mjs", "export const other = 1;\n");
  git(direct, "add", "-A");
  git(direct, "commit", "-q", "-m", "Do something else");
  write(direct, ".agent-log/actions.jsonl", `${verdict(1, { tree: treeFingerprintAt(direct, "HEAD") })}\n`);
  git(direct, "add", "-A");
  git(direct, "commit", "-q", "-m", "Fold the review into the agent log");
  git(direct, "switch", "-q", "main");
  git(direct, "merge", "-q", "--no-ff", "-m", "Merge pull request #2 from claude/other", "claude/other");
  assert.deepEqual(evidence(direct), { review: "missing", warned: true });
  // A cache entry whose merge is not on this history, or a cache file someone committed, is not believed. A cold run
  // of a slice with no verdict writes the cache; a planted entry then claims an approval for it.
  const planted = repo("planted", () => "");
  assert.equal(evidence(planted).review, "missing");
  const cacheFile = join(planted, "target/trajectory/review-cache.json");
  const newest = git(planted, "log", "-n", "1", "--grep=^Slice:", "--format=%H");
  const plant = (merge) => {
    const { rules } = JSON.parse(readFileSync(cacheFile, "utf8"));
    writeFileSync(cacheFile, JSON.stringify({ rules, reviews: { [newest]: { merge, review: "approved (agent log)" } } }));
  };
  plant("0".repeat(40));
  assert.equal(evidence(planted).review, "missing", "a merge that is not on HEAD's first-parent line");
  plant(git(planted, "rev-parse", "HEAD"));
  git(planted, "add", "-f", "target/trajectory/review-cache.json");
  git(planted, "commit", "-q", "-m", "Commit a cache");
  assert.equal(evidence(planted).review, "missing", "a cache file tracked by git");
});
