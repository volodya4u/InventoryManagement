// Unit tests for scripts/check-review.mjs. Run: node --test scripts/check-review.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewProblems, reviewVerdicts, reviewerRan } from "./check-review.mjs";

const line = (obj) => JSON.stringify(obj);
const verdict = (ts, value, tree = "tree-now", blocking = 0) =>
  line({ ts, event: "PostToolUse", tool: "SubagentHandback", agent: "reviewer", exit: 0, verdict: value, blocking, tree });

test("the last recorded verdict decides: APPROVE on these files passes", () => {
  const lines = [verdict("2026-10-05T10:00:00Z", "CHANGES REQUESTED", "tree-old", 2), verdict("2026-10-05T11:00:00Z", "APPROVE")];
  assert.deepEqual(reviewProblems(lines, "tree-now"), []);
  assert.deepEqual(reviewVerdicts(lines).map((v) => v.verdict), ["CHANGES REQUESTED", "APPROVE"]);
});

test("a last verdict of CHANGES REQUESTED fails, with its blocking count", () => {
  const lines = [verdict("2026-10-05T10:00:00Z", "APPROVE"), verdict("2026-10-05T11:00:00Z", "CHANGES REQUESTED", "tree-now", 2)];
  assert.match(reviewProblems(lines, "tree-now").join(" "), /CHANGES REQUESTED \(2 blocking\)/);
});

test("an APPROVE of other files fails: the review must cover the final diff", () => {
  assert.match(reviewProblems([verdict("2026-10-05T10:00:00Z", "APPROVE", "tree-before-the-last-edit")], "tree-now").join(" "), /changed after/);
});

test("a hand-written reviewer line without a verdict no longer passes (the PR #52 bypass)", () => {
  const planted = line({ id: "codex-reviewer-pr52", event: "PostToolUse", tool: "Agent", subagent_type: "reviewer", exit: 0 });
  assert.equal(reviewerRan([planted]), true);
  assert.match(reviewProblems([planted], "tree-now").join(" "), /no verdict was recorded/);
  assert.match(reviewProblems([], "tree-now").join(" "), /No reviewer verdict/);
});

test("only executed lines carry a verdict: a proposed (PreToolUse) one does not count", () => {
  const proposed = line({ ts: "2026-10-05T10:00:00Z", event: "PreToolUse", tool: "SubagentHandback", agent: "reviewer", verdict: "APPROVE", tree: "tree-now" });
  assert.deepEqual(reviewVerdicts([proposed]), []);
});

test("a line from the reviewer subagent counts", () => {
  assert.equal(reviewerRan([line({ event: "PreToolUse", tool: "Bash", agent: "reviewer" })]), true);
});

test("the Agent spawn line with subagent_type reviewer counts", () => {
  assert.equal(reviewerRan([line({ event: "PreToolUse", tool: "Agent", subagent_type: "reviewer" })]), true);
});

test("ordinary lines without the reviewer do not count", () => {
  const lines = [
    line({ event: "PreToolUse", tool: "Edit", path: "src/App.java" }),
    line({ event: "PreToolUse", tool: "Agent", subagent_type: "Explore" }),
    line({ event: "PostToolUse", tool: "Bash", agent: "general-purpose" }),
  ];
  assert.equal(reviewerRan(lines), false);
});

test("malformed lines are ignored", () => {
  assert.equal(reviewerRan(["not json", "", line({ tool: "Read", agent: "reviewer" })]), true);
  assert.equal(reviewerRan(["not json", "{bad"]), false);
});
