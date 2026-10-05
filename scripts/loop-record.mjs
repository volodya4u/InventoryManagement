// Loop records: what dod.mjs and test-run.mjs found, written by the tools themselves rather than pasted into a pull
// request. A record is one JSON line (event DodRun or TestRun) appended to .agent-log/pending.jsonl, the buffer the
// agent-log hooks write to; the fold hook (.claude/hooks/agent-log-fold.mjs) moves it into the committed
// .agent-log/actions.jsonl on the next `git commit`, so it lands in the pull request with the work, where
// scripts/pr-evidence.mjs checks it against the code of the pull request.
// appendRecord never throws: a record is evidence about a run, it must not fail that run.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const pendingPath = (root) => join(root, ".agent-log", "pending.jsonl");

export function appendRecord(root, entry) {
  try {
    const path = pendingPath(root);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
    return true;
  } catch {
    return false;
  }
}
