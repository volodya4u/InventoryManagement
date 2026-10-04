// Unit tests for scripts/check-review.mjs. Run: node --test scripts/check-review.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewerRan } from "./check-review.mjs";

const line = (obj) => JSON.stringify(obj);

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
