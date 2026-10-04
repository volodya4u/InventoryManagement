#!/usr/bin/env node
// Proof of review, not just a claim: the pull-request-description check only sees the word "APPROVE" in the body.
// This confirms the fresh-context `reviewer` subagent actually ran on this branch, from the committed agent log.
// log-action.mjs tags each line with `agent` (the subagent that made the call) and records `subagent_type` on the
// Agent spawn line; this looks for either naming the reviewer among the log lines this branch added over its base.
// Usage (from the repo root): node scripts/check-review.mjs [base-ref]   (base-ref default: origin/main)
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function reviewerRan(lines) {
  return lines.some((line) => {
    try {
      const e = JSON.parse(line);
      return e.agent === "reviewer" || e.subagent_type === "reviewer";
    } catch {
      return false;
    }
  });
}

// The agent-log lines this branch added over its base: the `+` side of the diff, minus the `+++` file header.
export function addedLogLines(base) {
  const diff = execFileSync("git", ["diff", `${base}...HEAD`, "--", ".agent-log/actions.jsonl"], { encoding: "utf8" });
  return diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2] || "origin/main";
  let lines;
  try {
    lines = addedLogLines(base);
  } catch (error) {
    console.error(`Could not diff .agent-log/actions.jsonl against ${base}: ${error.message}`);
    process.exit(2);
  }
  if (reviewerRan(lines)) {
    console.log(`Reviewer evidence: the \`reviewer\` subagent ran on this branch (agent log vs ${base}).`);
    process.exit(0);
  }
  console.error(
    `No reviewer evidence in the agent log added over ${base}. The fresh-context \`reviewer\` subagent must run ` +
      "before a pull request (AGENTS.md), and the log is committed, so its run should appear. Run the reviewer, " +
      "then commit the log.",
  );
  process.exit(1);
}
