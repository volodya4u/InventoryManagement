// Unit test for scripts/agent-log-summary.mjs. Run: node --test scripts/agent-log-summary.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const tmp = mkdtempSync(join(tmpdir(), "agent-log-summary-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

// The reviewer's verdict rides on its PostToolUse (SubagentHandback) line — a tool event — not on a SubagentStop line.
const fixture = join(tmp, "actions.jsonl");
writeFileSync(
  fixture,
  [
    { ts: "2026-01-01T00:00:00Z", event: "PreToolUse", id: "t1", tool: "Bash", cmd: "x", mode: "auto" },
    { ts: "2026-01-01T00:00:01Z", event: "PostToolUse", id: "t1", tool: "Bash", exit: 0, mode: "auto" },
    { ts: "2026-01-01T00:00:02Z", event: "PostToolUse", id: "t2", tool: "SubagentHandback", agent: "reviewer", verdict: "APPROVE", blocking: 0, exit: 0, mode: "auto" },
    { ts: "2026-01-01T00:00:03Z", event: "DodRun", exit: 0 },
  ]
    .map((e) => JSON.stringify(e))
    .join("\n") + "\n",
);

test("the summary counts a reviewer verdict recorded on a PostToolUse line", () => {
  const r = spawnSync(process.execPath, [join(process.cwd(), "scripts", "agent-log-summary.mjs"), fixture], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 reviewer verdict\(s\)/);
  // The verdict line is a normal executed tool call with exit 0, so it is not counted as a failure.
  assert.match(r.stdout, /0 failed/);
});
