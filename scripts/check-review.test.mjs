// Unit tests for scripts/check-review.mjs. Run: node --test scripts/check-review.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewProblems, reviewVerdicts, reviewerRan } from "./check-review.mjs";

const line = (obj) => JSON.stringify(obj);
// A verdict the way the log hook records it: a PreToolUse line and its PostToolUse line with the same toolu_ id.
let seq = 0;
const hooked = (post) => {
  const id = post.id ?? `toolu_test${String(++seq).padStart(4, "0")}`;
  const { verdict: _v, blocking: _b, findings: _f, tree: _t, exit: _e, ...pre } = post;
  return [line({ ...pre, id, event: "PreToolUse" }), line({ ...post, id })];
};
const verdict = (ts, value, tree = "tree-now", blocking = 0) =>
  hooked({ ts, event: "PostToolUse", tool: "SubagentHandback", agent: "reviewer", exit: 0, verdict: value, blocking, tree });

test("the last recorded verdict decides: APPROVE on these files passes", () => {
  const lines = [...verdict("2026-10-05T10:00:00Z", "CHANGES REQUESTED", "tree-old", 2), ...verdict("2026-10-05T11:00:00Z", "APPROVE")];
  assert.deepEqual(reviewProblems(lines, "tree-now"), []);
  assert.deepEqual(reviewVerdicts(lines).map((v) => v.verdict), ["CHANGES REQUESTED", "APPROVE"]);
});

test("a last verdict of CHANGES REQUESTED fails, with its blocking count", () => {
  const lines = [...verdict("2026-10-05T10:00:00Z", "APPROVE"), ...verdict("2026-10-05T11:00:00Z", "CHANGES REQUESTED", "tree-now", 2)];
  assert.match(reviewProblems(lines, "tree-now").join(" "), /CHANGES REQUESTED \(2 blocking\)/);
});

test("an APPROVE of other files fails: the review must cover the final diff", () => {
  assert.match(reviewProblems(verdict("2026-10-05T10:00:00Z", "APPROVE", "tree-before-the-last-edit"), "tree-now").join(" "), /changed after/);
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

test("one review recorded twice (SubagentHandback + Agent) counts once", () => {
  // A foreground reviewer logs the same verdict on its own SubagentHandback line and on the parent Agent completion.
  const handback = hooked({ ts: "2026-10-06T10:43:45Z", event: "PostToolUse", tool: "SubagentHandback", agent: "reviewer", verdict: "APPROVE", blocking: 0, findings: [], tree: "tree-A" });
  const agent = hooked({ ts: "2026-10-06T10:43:46Z", event: "PostToolUse", tool: "Agent", subagent_type: "reviewer", verdict: "APPROVE", blocking: 0, findings: [], tree: "tree-A" });
  assert.equal(reviewVerdicts([...handback, ...agent]).length, 1);
  assert.deepEqual(reviewProblems([...handback, ...agent], "tree-A"), []);
});

test("separate rounds are kept: a different tree or verdict is not a duplicate", () => {
  const r1a = hooked({ ts: "2026-10-06T10:00:00Z", event: "PostToolUse", tool: "SubagentHandback", agent: "reviewer", verdict: "CHANGES REQUESTED", blocking: 1, findings: ["B: x"], tree: "tree-A" });
  const r1b = hooked({ ts: "2026-10-06T10:00:01Z", event: "PostToolUse", tool: "Agent", subagent_type: "reviewer", verdict: "CHANGES REQUESTED", blocking: 1, findings: ["B: x"], tree: "tree-A" });
  const r2 = hooked({ ts: "2026-10-06T10:05:00Z", event: "PostToolUse", tool: "SubagentHandback", agent: "reviewer", verdict: "APPROVE", blocking: 0, findings: [], tree: "tree-B" });
  const v = reviewVerdicts([...r1a, ...r1b, ...r2]);
  assert.deepEqual(v.map((e) => e.verdict), ["CHANGES REQUESTED", "APPROVE"]); // two rounds, the doubled first collapsed
  assert.deepEqual(reviewProblems([...r1a, ...r1b, ...r2], "tree-B"), []);
});

test("reviewVerdicts accepts already-parsed entries, not only JSON strings", () => {
  const [pre, post] = hooked({ event: "PostToolUse", tool: "SubagentHandback", agent: "reviewer", verdict: "APPROVE", tree: "t", blocking: 0, findings: [] }).map((l) => JSON.parse(l));
  assert.equal(reviewVerdicts([pre, post, post]).length, 1);
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

test("provenance: a verdict counts only on a hook-recorded reviewer line, a toolu_ id with its PreToolUse line", () => {
  const ok = { ts: "2026-10-21T10:00:00Z", event: "PostToolUse", tool: "SubagentHandback", agent: "reviewer", exit: 0, verdict: "APPROVE", blocking: 0, tree: "tree-now" };
  assert.deepEqual(reviewProblems(hooked(ok), "tree-now"), []);
  const [pre, post] = hooked(ok);
  const cases = {
    "no PreToolUse line": [post],
    "an id the hook never writes": hooked({ ...ok, id: "review-1" }),
    "another tool's line": hooked({ ...ok, tool: "Bash", cmd: "echo" }),
    "another subagent's handback": hooked({ ...ok, agent: "general-purpose" }),
    "an Agent call that spawned another subagent": hooked({ ...ok, tool: "Agent", agent: undefined, subagent_type: "Explore" }),
    "a PreToolUse line of another tool": [line({ ...JSON.parse(pre), tool: "Read" }), post],
  };
  for (const [name, lines] of Object.entries(cases)) {
    assert.equal(reviewVerdicts(lines).length, 0, name);
    assert.match(reviewProblems(lines, "tree-now").join(" "), /ignored 1 verdict line\(s\) that no hook recorded/, name);
  }
  // A foreground reviewer's verdict on the parent Agent call counts too.
  assert.deepEqual(reviewProblems(hooked({ ...ok, tool: "Agent", agent: undefined, subagent_type: "reviewer" }), "tree-now"), []);
});

test("the #52 replay: a hand-written reviewer line with an APPROVE on the head tree does not pass", () => {
  // d37db08 planted {"id":"codex-reviewer-pr52","subagent_type":"reviewer","exit":0}; the same line with a verdict, the
  // head commit's tree and even a hand-written PreToolUse line still lacks an id the hook writes.
  const planted = { id: "codex-reviewer-pr52", event: "PostToolUse", tool: "Agent", subagent_type: "reviewer", exit: 0, verdict: "APPROVE", blocking: 0, tree: "tree-now" };
  const lines = [line({ ...planted, event: "PreToolUse", verdict: undefined }), line(planted)];
  assert.notDeepEqual(reviewProblems(lines, "tree-now"), []);
  assert.match(reviewProblems(lines, "tree-now").join(" "), /no hook recorded/);
});

test("blocking: an APPROVE that lists a blocking finding, or gives no blocking count, does not pass", () => {
  const approve = (blocking) => hooked({ ts: "2026-10-21T10:00:00Z", event: "PostToolUse", tool: "SubagentHandback", agent: "reviewer", exit: 0, verdict: "APPROVE", blocking, tree: "tree-now" });
  assert.match(reviewProblems(approve(1), "tree-now").join(" "), /APPROVE but lists 1 blocking finding/);
  assert.match(reviewProblems(approve(undefined), "tree-now").join(" "), /no blocking count/);
  assert.match(reviewProblems(approve("0"), "tree-now").join(" "), /no blocking count/);
  assert.deepEqual(reviewProblems(approve(0), "tree-now"), []);
});

test("replay: a verdict copied from another branch fails on its tree, and one copied without its PreToolUse line is ignored", () => {
  const other = hooked({ ts: "2026-10-20T09:00:00Z", event: "PostToolUse", tool: "SubagentHandback", agent: "reviewer", exit: 0, verdict: "APPROVE", blocking: 0, tree: "tree-of-another-branch" });
  assert.match(reviewProblems(other, "tree-now").join(" "), /changed after/);
  assert.match(reviewProblems([other[1]], "tree-now").join(" "), /no hook recorded/);
});
