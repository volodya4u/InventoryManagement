#!/usr/bin/env node
// Proof of review, not a claim. log-action.mjs records the `reviewer` subagent's own verdict from the report it hands
// back (its "## Review: APPROVE | CHANGES REQUESTED" line, the blocking count, the first findings, and `tree`, the
// fingerprint of the files it saw). This checks the agent-log lines this branch added over its base: the last recorded
// verdict must be APPROVE, and it must cover the files as they are now, so a review of an earlier diff or a hand-written
// line naming the reviewer (the PR #52 bypass) does not pass.
// Usage (from the repo root): node scripts/check-review.mjs [base-ref]   (base-ref default: origin/main)
// scripts/pr-evidence.mjs runs the same check in CI against the head commit of the pull request.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { treeFingerprint } from "./dod-fingerprint.mjs";

const parse = (line) => {
  if (line && typeof line === "object") return [line]; // already-parsed entries are accepted too
  try {
    return [JSON.parse(line)];
  } catch {
    return [];
  }
};

// Any line from or about the reviewer: it was at least started on this branch.
export function reviewerRan(lines) {
  return lines.flatMap(parse).some((e) => e.agent === "reviewer" || e.subagent_type === "reviewer");
}

// The reviewer's recorded verdicts, oldest first, one per review. Only executed lines count (a PreToolUse line is a
// proposal). One review's hand-back is recorded twice — on the reviewer's own `SubagentHandback` line and on the
// parent `Agent` call's completion — with the same verdict, tree, blocking count and findings; a resumed reviewer
// records once. Those duplicates are collapsed by content so each review counts once, while genuinely separate rounds
// (a later review sees a different tree, or returns a different verdict) are kept.
export function reviewVerdicts(lines) {
  const sorted = lines
    .flatMap(parse)
    .filter((e) => e.event === "PostToolUse" && (e.verdict === "APPROVE" || e.verdict === "CHANGES REQUESTED"))
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  // Collapse duplicates by content, keeping the LAST occurrence so a repeated verdict never shadows a later distinct
  // one: reviewProblems decides on the final verdict, and keeping the last is the safe choice if a tuple ever recurs.
  const seen = new Set();
  const kept = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i];
    const key = `${e.verdict}|${e.tree ?? ""}|${e.blocking ?? ""}|${JSON.stringify(e.findings ?? [])}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(e);
  }
  return kept.reverse();
}

// What is missing for the review to count, given the fingerprint of the files under review now; [] when nothing is.
export function reviewProblems(lines, tree) {
  const verdicts = reviewVerdicts(lines);
  if (!verdicts.length) {
    return [
      reviewerRan(lines)
        ? "The reviewer ran on this branch, but no verdict was recorded: its report must end in a `## Review: APPROVE` " +
          "or `## Review: CHANGES REQUESTED` line (.claude/agents/reviewer.md). Run it again on the final diff."
        : "No reviewer verdict in the agent log added on this branch. Run the `reviewer` subagent on the final diff " +
          "(AGENTS.md), then commit so the log folds in.",
    ];
  }
  const last = verdicts.at(-1);
  if (last.verdict !== "APPROVE") {
    return [
      `The reviewer's last verdict is CHANGES REQUESTED (${last.blocking ?? "?"} blocking): fix or answer the ` +
        "blocking findings, then run the reviewer again.",
    ];
  }
  if (!last.tree || last.tree !== tree) {
    return ["Files changed after the reviewer's last APPROVE (its recorded tree differs): run the reviewer again on the final diff, then commit."];
  }
  return [];
}

// The agent-log lines this branch added over its base: the `+` side of the diff, minus the `+++` file header.
export function addedLogLines(base, head = "HEAD") {
  const diff = execFileSync("git", ["diff", `${base}...${head}`, "--", ".agent-log/actions.jsonl"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
  const problems = reviewProblems(lines, treeFingerprint(process.cwd()));
  if (!problems.length) {
    const rounds = reviewVerdicts(lines).length;
    console.log(`Reviewer evidence: the \`reviewer\` subagent's last verdict is APPROVE on these files (${rounds} round(s) recorded on this branch vs ${base}).`);
    process.exit(0);
  }
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
