// Tests for the review evidence of scripts/check-trajectory.mjs, against throwaway git repositories: a slice merged by a
// pull request whose agent-log lines hold the reviewer's verdict on the branch head counts as reviewed.
// Run: node --test scripts/check-trajectory.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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
function repo(name, logFor, { findings, base = "main" } = {}) {
  const root = join(tmp, name);
  mkdirSync(root);
  git(root, "init", "-q", "-b", base);
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
  git(root, "switch", "-q", base);
  git(root, "merge", "-q", "--no-ff", "-m", "Merge pull request #1 from claude/demo", "claude/demo");
  return root;
}

// The script exits 1 for an unwaived gap but writes trace/trajectory.json first; `warned` means a review-evidence finding was
// raised at all, whether as a warning or as a failure.
const evidence = (root) => {
  spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: "utf8" });
  const { slices, warnings, failures } = JSON.parse(readFileSync(join(root, "trace", "trajectory.json"), "utf8"));
  return { review: slices[0].reviewEvidence, warned: [...warnings, ...failures].some((w) => w.check === "review-evidence") };
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
  // A branch that merged main after an unapproved slice and a later approved pull request: the slice reads its own
  // pull request's verdict, not the later one's, because merges are taken from main's first-parent line, not HEAD's.
  const later = join(tmp, "branch-merged-main");
  mkdirSync(later);
  git(later, "init", "-q", "-b", "main");
  write(later, "README.md", "x\n");
  write(later, ".agent-log/actions.jsonl", "");
  git(later, "add", "-A");
  git(later, "commit", "-q", "-m", "Start");
  git(later, "branch", "claude/b");
  const pr = (branch, message, files, verdictFor) => {
    git(later, "switch", "-q", "-c", branch, "main");
    for (const [path, text] of Object.entries(files)) write(later, path, text);
    git(later, "add", "-A");
    git(later, "commit", "-q", "-m", message);
    const log = readFileSync(join(later, ".agent-log/actions.jsonl"), "utf8");
    write(later, ".agent-log/actions.jsonl", `${log}${verdictFor(treeFingerprintAt(later, "HEAD"))}\n`);
    git(later, "add", "-A");
    git(later, "commit", "-q", "-m", "Fold the review into the agent log");
    git(later, "switch", "-q", "main");
    git(later, "merge", "-q", "--no-ff", "-m", `Merge pull request from ${branch}`, branch);
  };
  const folder = "openspec/changes/archive/2026-10-22-demo";
  pr("claude/demo", "Do the demo\n\nSlice: demo", { [`${folder}/design.md`]: "# D\n", [`${folder}/tasks.md`]: "- [x] 1.\n" }, (tree) =>
    verdict(1, { tree, verdict: "CHANGES REQUESTED", blocking: 1 }),
  );
  pr("claude/other", "Do something else", { "scripts/other.mjs": "export const o = 1;\n" }, (tree) => verdict(2, { tree }));
  git(later, "switch", "-q", "claude/b");
  write(later, "scripts/b.mjs", "export const b = 1;\n");
  git(later, "add", "-A");
  git(later, "commit", "-q", "-m", "Work on b");
  git(later, "merge", "-q", "--no-ff", "-m", "Merge main into claude/b", "main");
  assert.match(evidence(later).review, /^not approved \(agent log\): The reviewer's last verdict is CHANGES REQUESTED/);
  // With neither origin/main nor main, main's line is unknown: HEAD's own line could hold a branch's merge of the base, so
  // every slice reads missing and nothing is cached, even for a pull request that recorded an APPROVE.
  const trunk = repo("no-main-ref", (tree) => verdict(1, { tree }), { base: "trunk" });
  git(trunk, "switch", "-q", "-c", "claude/b", "trunk~1");
  write(trunk, "scripts/b.mjs", "export const b = 1;\n");
  git(trunk, "add", "-A");
  git(trunk, "commit", "-q", "-m", "Work on b");
  git(trunk, "merge", "-q", "--no-ff", "-m", "Merge trunk into claude/b", "trunk");
  assert.deepEqual(evidence(trunk), { review: "missing", warned: true });
  assert.equal(existsSync(join(trunk, "target/trajectory/review-cache.json")), false);
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

// A loose object of a repository, moved aside so git cannot read it, and a function that puts it back.
const hideObject = (root, rev) => {
  const sha = git(root, "rev-parse", rev);
  const path = join(root, ".git", "objects", sha.slice(0, 2), sha.slice(2));
  renameSync(path, `${path}.hidden`);
  return () => renameSync(`${path}.hidden`, path);
};
const cachePath = (root) => join(root, "target/trajectory/review-cache.json");
// A cache entry for the slice's newest trailer commit, merged by `merge`, claiming an approval; `rules` defaults to the
// hash a run of the script wrote.
const plantApproval = (root, merge, rules) => {
  const newest = git(root, "log", "-n", "1", "--grep=^Slice:", "--format=%H");
  rules ??= JSON.parse(readFileSync(cachePath(root), "utf8")).rules;
  writeFileSync(cachePath(root), JSON.stringify({ rules, reviews: { [newest]: { merge, review: "approved (agent log)" } } }));
};

test("a git error while reading a merged slice's agent log reads missing and is not cached", () => {
  const root = repo("git-error", (tree) => verdict(1, { tree }));
  const unhide = hideObject(root, "HEAD^2:.agent-log/actions.jsonl");
  assert.deepEqual(evidence(root), { review: "missing", warned: true });
  assert.equal(existsSync(cachePath(root)), false, "the git error is not written to the cache");
  // Once git can read the log again, the next run gives the real answer, not a cached "missing".
  unhide();
  assert.equal(evidence(root).review, "approved (agent log)");
});

test("a tree fingerprint that throws reads missing instead of crashing the generator", () => {
  const root = repo("fingerprint-error", (tree) => verdict(1, { tree }));
  // The branch head's scripts/ folder: git ls-tree -r needs it, the agent-log diff does not.
  hideObject(root, "HEAD^2:scripts");
  let result;
  assert.doesNotThrow(() => (result = evidence(root)), "the generator must not crash on a failing fingerprint");
  assert.deepEqual(result, { review: "missing", warned: true });
  assert.equal(existsSync(cachePath(root)), false, "the fingerprint failure is not written to the cache");
});

test("a cache written under other rules is discarded", () => {
  const root = repo("rules-changed", () => "");
  assert.equal(evidence(root).review, "missing");
  plantApproval(root, git(root, "rev-parse", "HEAD"), "a hash of rules that changed since");
  assert.equal(evidence(root).review, "missing");
});

test("a warm run reads a merged slice's answer from the cache", () => {
  const root = repo("warm-read", () => "");
  assert.equal(evidence(root).review, "missing");
  // An entry for the real pull request merge, under the current rules, changes the answer: the run read the cache.
  plantApproval(root, git(root, "rev-parse", "HEAD"));
  assert.equal(evidence(root).review, "approved (agent log)");
});

// --- slice waivers (PD-5) ---------------------------------------------------------------------------------------------

const SLICE = "2026-10-22-demo";
// A repository with one archived slice that no commit's Slice trailer names (so it has no trailer and no review).
function gapRepo(name) {
  const root = join(tmp, name);
  mkdirSync(root);
  git(root, "init", "-q", "-b", "main");
  write(root, `openspec/changes/archive/${SLICE}/design.md`, "# Design\n");
  write(root, `openspec/changes/archive/${SLICE}/tasks.md`, "- [x] 1. Do it.\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "Do the demo without a trailer");
  return root;
}
// A waiver file; a field left out (null) is not written.
const waiverText = ({ status = "open", gate = "Trajectory", slices = SLICE, approval = "volodya4u, in chat on 2026-10-28" } = {}) =>
  ["# Waiver: a historical trajectory gap", "", status && `Status: ${status}`, gate && `Gate: ${gate}`, slices && `Slices: ${slices}`, approval && `Approval: ${approval}`, "", "The gap cannot be repaired."]
    .filter((line) => typeof line === "string")
    .join("\n");
const waive = (root, text, file = "gap.md") => write(root, `docs/qa/waivers/${file}`, `${text}\n`);
const run = (root, ...flags) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...flags], { cwd: root, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
};

test("fails per-slice for an unwaived missing trailer", () => {
  const { status, out } = run(gapRepo("no-trailer"));
  assert.equal(status, 1, out);
  assert.match(out, /FAIL {2}\[trailer\]/);
});

test("fails per-slice for an unwaived stale review", () => {
  const { status, out } = run(repo("stale-review", () => verdict(1, { tree: "a tree the reviewer saw before the last change" })));
  assert.equal(status, 1, out);
  assert.match(out, /FAIL {2}\[review-evidence\]/);
});

test("reports a slice waiver as WAIVED in both modes", () => {
  const root = gapRepo("waived");
  waive(root, waiverText());
  for (const flags of [[], ["--release"]]) {
    const { status, out } = run(root, ...flags);
    assert.equal(status, 0, `${flags.join(" ")}: ${out}`);
    assert.match(out, /WAIVED \[trailer\]/);
    assert.match(out, /WAIVED \[review-evidence\]/);
    assert.doesNotMatch(out, /FAIL/);
  }
  const { waived } = JSON.parse(readFileSync(join(root, "trace", "trajectory.json"), "utf8"));
  assert.deepEqual(waived.map((w) => w.check).sort(), ["review-evidence", "trailer"]);
});

test("does not let a requirement waiver or a mention cover a slice", () => {
  const root = gapRepo("mention");
  // Names a requirement and not the slice, and a waiver that mentions the slice in prose without a Slices: line.
  waive(root, waiverText({ slices: null }).replace("The gap", "FR-1 is waived. The gap"), "requirement.md");
  waive(root, waiverText({ slices: null }).replace("The gap", `Unlike ${SLICE}, the gap`), "mention.md");
  const { status, out } = run(root);
  assert.equal(status, 1, out);
  assert.match(out, /FAIL {2}\[trailer\]/);
});

test("ignores a closed or unapproved slice waiver", () => {
  for (const [name, text] of [
    ["closed", waiverText({ status: "closed" })],
    ["no-status", waiverText({ status: null })],
    ["no-approval", waiverText({ approval: null })],
    ["other-gate", waiverText({ gate: "Red -> green" })],
  ]) {
    const root = gapRepo(`ignored-${name}`);
    waive(root, text);
    const { status, out } = run(root);
    assert.equal(status, 1, `${name}: ${out}`);
  }
});
