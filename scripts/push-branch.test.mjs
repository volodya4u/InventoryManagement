// Tests for scripts/push-branch.mjs. Run: node --test scripts/push-branch.test.mjs
// The unit tests check pushArguments(); the entry-point tests below run the real script against throwaway repositories in
// the OS temp folder (a bare `remote.git` and a clone whose origin is it), so nothing ever reaches GitHub.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { originProblem, pushArguments } from "./push-branch.mjs";

test("a claude/* branch is pushed to the branch of the same name, with upstream tracking, no tags and nothing else", () => {
  for (const branch of ["claude/factory-tuning", "claude/lucid-curie-73d2d0", "claude/harden-sales-reports-history-tests", "claude/a.b_c"]) {
    assert.deepEqual(pushArguments(branch), ["push", "--no-follow-tags", "-u", "origin", `refs/heads/${branch}:refs/heads/${branch}`], branch);
  }
});

test("main, other names and detached HEAD are refused", () => {
  for (const branch of ["main", "master", "HEAD", "", "claude", "claude/", "feature/x", "origin/claude/x", "CLAUDE/x", "release/claude/x"]) {
    assert.throws(() => pushArguments(branch), /claude\//, JSON.stringify(branch));
  }
});

test("a name that smuggles in a refspec, a flag, a path climb or whitespace is refused", () => {
  for (const branch of [
    "claude/x:main",
    "claude/x:refs/heads/main",
    "claude/x main",
    "claude/x\nmain",
    "claude/x\tmain",
    "claude/../main",
    "claude/x..y",
    "claude/-x",
    "claude/--force",
    "claude/+x",
    "claude/x.lock",
    "claude/x.",
    "claude/x;rm -rf",
    "claude/$(id)",
    "claude/`id`",
  ]) {
    assert.throws(() => pushArguments(branch), /claude\//, JSON.stringify(branch));
  }
});

test("a pushed branch never adds a force, a delete, a mirror or a second ref", () => {
  const args = pushArguments("claude/factory-tuning");
  assert.equal(args.length, 5);
  assert.deepEqual(args.slice(0, 4), ["push", "--no-follow-tags", "-u", "origin"]);
  assert.deepEqual(args.filter((arg) => /^[-+]/.test(arg)), ["--no-follow-tags", "-u"], "no force, delete, mirror or other flag");
  assert.ok(!args[4].startsWith("+"), "not a forced refspec");
});

test("origin is pushed only when it has one url and git pushes to that url unchanged", () => {
  const url = "https://github.com/volodya4u/InventoryManagement.git";
  assert.equal(originProblem([url], [url]), "");
  assert.match(originProblem([], []), /exactly one url \(found 0\)/);
  assert.match(originProblem([url, "../decoy.git"], [url, "../decoy.git"]), /exactly one url \(found 2\)/);
  for (const pushUrls of [["../decoy.git"], [], [url, url], ["git@github.com:volodya4u/InventoryManagement.git"]]) {
    const problem = originProblem([url], pushUrls);
    assert.match(problem, /somewhere other than remote\.origin\.url/, JSON.stringify(pushUrls));
    assert.ok(!problem.includes("decoy") && !problem.includes("github"), "no url in the message");
  }
});

// --- The entry point, against temporary repositories -------------------------------------------------------------------

const SCRIPT = fileURLToPath(new URL("./push-branch.mjs", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "push-branch-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

// The caller's git context (GIT_DIR, GIT_CONFIG_*, the user's own config) stays out; a test adds what it probes.
const ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key))),
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: join(tmp, "no-global-gitconfig"),
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, env: ENV, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${r.stderr}`);
  return r.stdout.trim();
}

// Every ref of a repository with its object id, one per line; equal before and after = nothing changed there.
const refs = (repo) => git(repo, "for-each-ref", "--format=%(refname) %(objectname)");
const withRef = (before, line) => [...before.split("\n"), line].sort().join("\n");

// Built once and copied per test: `remote.git` has `main`; `clone` has origin = ../remote.git, `main` tracking it, and
// `claude/ok` checked out one commit ahead.
let template;
function repos() {
  if (!template) {
    template = join(tmp, "template");
    mkdirSync(template);
    git(template, "init", "-q", "--bare", "-b", "main", "remote.git");
    git(template, "init", "-q", "-b", "main", "clone");
    const clone = join(template, "clone");
    git(clone, "commit", "-q", "--allow-empty", "-m", "first");
    git(clone, "remote", "add", "origin", "../remote.git");
    git(clone, "push", "-q", "-u", "origin", "main");
    git(clone, "switch", "-q", "-c", "claude/ok");
    git(clone, "commit", "-q", "--allow-empty", "-m", "second");
  }
  const root = mkdtempSync(join(tmp, "case-"));
  cpSync(template, root, { recursive: true });
  return { root, remote: join(root, "remote.git"), clone: join(root, "clone") };
}

const pushBranch = (cwd, args = [], env = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env: { ...ENV, ...env }, encoding: "utf8" });

const failure = (r) => `exit ${r.status}\n${r.stdout}${r.stderr}`;

function assertRefusedWithoutRemoteChange(t, cwd, args = [], env = {}, label = "") {
  const before = refs(t.remote);
  const r = pushBranch(cwd, args, env);
  assert.equal(r.status, 2, `${label} ${failure(r)}`);
  assert.equal(refs(t.remote), before, `${label}: the remote's refs changed`);
  return r;
}

test("extra arguments are refused with exit 2 and leave the remote's refs unchanged", () => {
  const t = repos();
  for (const args of [["--force"], ["origin", "main"], ["+refs/heads/claude/ok:refs/heads/main"], ["--mirror"], ["--delete", "main"], [""]]) {
    const r = assertRefusedWithoutRemoteChange(t, t.clone, args, {}, JSON.stringify(args));
    assert.match(r.stderr, /takes no arguments/);
  }
});

test("a detached HEAD is refused with exit 2 and no remote change", () => {
  const t = repos();
  git(t.clone, "switch", "-q", "--detach", "HEAD");
  const r = assertRefusedWithoutRemoteChange(t, t.clone);
  assert.match(r.stderr, /refusing to push ""/);
});

test("main, feature/x and other branch names git allows are refused with exit 2 and no remote change", () => {
  const t = repos();
  for (const name of ["main", "feature/x", "claude-x", "CLAUDE/x", "claude/+x", "claude/-x", "claude/$(id)", "claude/x;id", "release/claude/x"]) {
    if (name !== "main") git(t.clone, "branch", "--", name);
    git(t.clone, "symbolic-ref", "HEAD", `refs/heads/${name}`);
    const r = assertRefusedWithoutRemoteChange(t, t.clone, [], {}, name);
    assert.match(r.stderr, /only a branch named claude\/<name>/, name);
  }
});

test("a claude/x:main branch cannot exist: git refuses the name, and a HEAD file naming it is refused with exit 2", () => {
  const t = repos();
  for (const name of ["claude/x:main", "claude/x main", "claude/x..y", "claude/x.lock"]) {
    assert.notEqual(spawnSync("git", ["update-ref", `refs/heads/${name}`, "HEAD"], { cwd: t.clone, env: ENV }).status, 0, name);
    assert.notEqual(spawnSync("git", ["symbolic-ref", "HEAD", `refs/heads/${name}`], { cwd: t.clone, env: ENV }).status, 0, name);
  }
  writeFileSync(join(t.clone, ".git", "HEAD"), "ref: refs/heads/claude/x:main\n");
  assertRefusedWithoutRemoteChange(t, t.clone);
});

test("claude/ok is pushed with exit 0: only refs/heads/claude/ok is added, main keeps its SHA and upstream is set", () => {
  const t = repos();
  const before = refs(t.remote);
  const main = git(t.remote, "rev-parse", "refs/heads/main");
  const r = pushBranch(t.clone);
  assert.equal(r.status, 0, failure(r));
  assert.equal(refs(t.remote), withRef(before, `refs/heads/claude/ok ${git(t.clone, "rev-parse", "HEAD")}`));
  assert.equal(git(t.remote, "rev-parse", "refs/heads/main"), main);
  assert.equal(git(t.clone, "rev-parse", "--symbolic-full-name", "@{upstream}"), "refs/remotes/origin/claude/ok");
});

test("a claude/* branch checked out in a linked worktree is pushed the same way", () => {
  const t = repos();
  git(t.clone, "worktree", "add", "-q", "-b", "claude/wt", "../wt");
  const before = refs(t.remote);
  const r = pushBranch(join(t.root, "wt"));
  assert.equal(r.status, 0, failure(r));
  assert.equal(refs(t.remote), withRef(before, `refs/heads/claude/wt ${git(t.clone, "rev-parse", "claude/wt")}`));
});

test("a remote rejection from a pre-receive hook gives a non-zero exit and moves no ref", () => {
  const t = repos();
  writeFileSync(join(t.remote, "hooks", "pre-receive"), "#!/bin/sh\necho rejected by the test >&2\nexit 1\n", { mode: 0o755 });
  const before = refs(t.remote);
  const r = pushBranch(t.clone);
  assert.notEqual(r.status, 0, failure(r));
  assert.notEqual(r.status, 2, "a rejection is git's exit code, not the script's refusal");
  assert.match(r.stderr, /pre-receive hook declined/);
  assert.equal(refs(t.remote), before);
});

test("an unreachable origin gives git's own exit code", () => {
  const t = repos();
  git(t.clone, "remote", "set-url", "origin", join(t.root, "missing.git"));
  const direct = spawnSync("git", ["push", "-u", "origin", "refs/heads/claude/ok:refs/heads/claude/ok"], { cwd: t.clone, env: ENV });
  const before = refs(t.remote);
  const r = pushBranch(t.clone);
  assert.notEqual(direct.status, 0);
  assert.equal(r.status, direct.status, failure(r));
  assert.equal(refs(t.remote), before);
});

// --- Execution context: settings that could add a ref or move the destination (openspec/changes/push-branch-entry-tests)

test("push.followTags does not let an annotated tag ride along with the branch", () => {
  const t = repos();
  git(t.clone, "tag", "-a", "v1", "-m", "a tag that must stay local");
  git(t.clone, "config", "push.followTags", "true");
  const before = refs(t.remote);
  const r = pushBranch(t.clone);
  assert.equal(r.status, 0, failure(r));
  assert.equal(refs(t.remote), withRef(before, `refs/heads/claude/ok ${git(t.clone, "rev-parse", "HEAD")}`));
});

test("remote.origin.mirror cannot turn the push into a mirror: git refuses it and nothing changes", () => {
  const t = repos();
  git(t.clone, "config", "remote.origin.mirror", "true");
  const before = refs(t.remote);
  const r = pushBranch(t.clone);
  assert.notEqual(r.status, 0, failure(r));
  assert.equal(refs(t.remote), before);
});

// A destination other than remote.origin.url: the push must be refused before it reaches either repository.
function assertNoPushAnywhere(t, label, env = {}) {
  const decoy = join(t.root, "decoy.git");
  const decoyBefore = refs(decoy);
  const r = assertRefusedWithoutRemoteChange(t, t.clone, [], env, label);
  assert.match(r.stderr, /origin/, label);
  assert.equal(refs(decoy), decoyBefore, `${label}: the push reached the other repository`);
}

test("a repo-local remote.origin.pushurl is refused with exit 2 and nothing is pushed anywhere", () => {
  const t = repos();
  git(t.root, "init", "-q", "--bare", "decoy.git");
  git(t.clone, "config", "remote.origin.pushurl", "../decoy.git");
  assertNoPushAnywhere(t, "pushurl");
});

test("a url insteadOf or pushInsteadOf rewrite of origin is refused with exit 2 and nothing is pushed anywhere", () => {
  for (const key of ["insteadOf", "pushInsteadOf"]) {
    const t = repos();
    git(t.root, "init", "-q", "--bare", "decoy.git");
    git(t.clone, "config", `url.../decoy.git.${key}`, "../remote.git");
    assertNoPushAnywhere(t, key);
  }
});

test("a second remote.origin.url is refused with exit 2 and nothing is pushed anywhere", () => {
  const t = repos();
  git(t.root, "init", "-q", "--bare", "decoy.git");
  git(t.clone, "config", "--add", "remote.origin.url", "../decoy.git");
  assertNoPushAnywhere(t, "second url");
});

test("a pushurl injected through GIT_CONFIG_COUNT in the environment is refused with exit 2", () => {
  const t = repos();
  git(t.root, "init", "-q", "--bare", "decoy.git");
  assertNoPushAnywhere(t, "GIT_CONFIG_COUNT", {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "remote.origin.pushurl",
    GIT_CONFIG_VALUE_0: join(t.root, "decoy.git"),
  });
});

test("GIT_DIR in the environment chooses the repository: its current branch and its origin are used, under the same rules", () => {
  const t = repos();
  git(t.root, "clone", "-q", "remote.git", "other");
  const other = join(t.root, "other", ".git");
  assertRefusedWithoutRemoteChange(t, t.clone, [], { GIT_DIR: other }, "GIT_DIR on main");
  git(join(t.root, "other"), "switch", "-q", "-c", "claude/other");
  const before = refs(t.remote);
  const r = pushBranch(t.clone, [], { GIT_DIR: other });
  assert.equal(r.status, 0, failure(r));
  assert.equal(refs(t.remote), withRef(before, `refs/heads/claude/other ${git(t.remote, "rev-parse", "main")}`));
});
