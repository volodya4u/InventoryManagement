// Unit tests for scripts/loop-record.mjs. Run: node --test scripts/loop-record.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { appendRecord, pendingPath } from "./loop-record.mjs";

const tmp = mkdtempSync(join(tmpdir(), "loop-record-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

test("a record lands as one JSON line in the agent log buffer, next to the hooks' lines", () => {
  const root = join(tmp, "repo");
  assert.equal(appendRecord(root, { event: "DodRun", exit: 1 }), true);
  assert.equal(appendRecord(root, { event: "TestRun", exit: 0 }), true);
  const lines = readFileSync(pendingPath(root), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => [l.event, l.exit]), [["DodRun", 1], ["TestRun", 0]]);
  assert.match(lines[0].ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("a record never throws: it is evidence, not part of the run it records", () => {
  const blocker = join(tmp, "not-a-dir");
  writeFileSync(blocker, "a file where the .agent-log folder would go");
  assert.equal(appendRecord(blocker, { event: "DodRun", exit: 0 }), false);
});
