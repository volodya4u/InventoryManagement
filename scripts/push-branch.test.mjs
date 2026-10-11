// Unit tests for scripts/push-branch.mjs. Run: node --test scripts/push-branch.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { pushArguments } from "./push-branch.mjs";

test("a claude/* branch is pushed to the branch of the same name, with upstream tracking and nothing else", () => {
  for (const branch of ["claude/factory-tuning", "claude/lucid-curie-73d2d0", "claude/harden-sales-reports-history-tests", "claude/a.b_c"]) {
    assert.deepEqual(pushArguments(branch), ["push", "-u", "origin", `refs/heads/${branch}:refs/heads/${branch}`], branch);
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
  assert.equal(args.length, 4);
  assert.deepEqual(args.slice(0, 3), ["push", "-u", "origin"]);
  assert.ok(!args.some((arg) => /^(--|\+)|^-[^u]/.test(arg)), "no force, delete, mirror or other flag");
  assert.ok(!args[3].startsWith("+"), "not a forced refspec");
});
