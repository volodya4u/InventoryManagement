# Accept a reviewer verdict only from a hook-recorded reviewer line

## Why
Slice 3 of the evidence-integrity plan asks where review evidence comes from. `scripts/check-review.mjs` accepts any
`PostToolUse` line in the branch's agent log that carries a verdict. In #52 a hand-written line in
`.agent-log/actions.jsonl` (`{"id":"codex-reviewer-pr52","subagent_type":"reviewer","exit":0}`) passed the older gate.
The verdict field now stops that exact line, but a hand-written line with a verdict and the head tree would still
pass. The check also lets an APPROVE through when it has no blocking count or lists a blocking finding.

The agent and the owner share one GitHub identity here, so no record on GitHub can tell them apart. The owner chose to
ship these local checks now and leave a trusted channel to a later slice (decision of 2026-10-21, ADR-0005).

## What Changes
- A verdict counts only on a line the log hook writes for the reviewer:
  - its `id` is a `toolu_…` id;
  - a `PreToolUse` line with the same id and tool is among the lines the branch adds;
  - it is either a `SubagentHandback` by `agent: "reviewer"` or an `Agent` call with `subagent_type: "reviewer"`.
  Other verdict lines are ignored. When no valid verdict is left, the gate says how many it ignored.
- An APPROVE passes only with `blocking === 0`, a number. An APPROVE that lists blocking findings or carries no
  count fails.
- The existing tree check stays: the verdict's tree must equal the head commit's tree, so a verdict copied from another
  branch fails.

This raises the cost of forging a verdict. It cannot make forging impossible: a determined author can still write both
lines with a well-formed id. ADR-0005 says so, and the trusted channel is left to a later slice.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given verdict lines without a toolu_ id, without their PreToolUse line, or from another tool or subagent, when the review is checked, then they are ignored and the gate says so | `scripts/check-review.test.mjs` › "provenance: a verdict counts only on a hook-recorded reviewer line, a toolu_ id with its PreToolUse line" |
| 2 | Given the #52 planted line with an APPROVE on the head tree and a hand-written PreToolUse line, when the review is checked, then it does not pass | `scripts/check-review.test.mjs` › "the #52 replay: a hand-written reviewer line with an APPROVE on the head tree does not pass" |
| 3 | Given an APPROVE with a blocking finding or with no blocking count, when the review is checked, then it does not pass | `scripts/check-review.test.mjs` › "blocking: an APPROVE that lists a blocking finding, or gives no blocking count, does not pass" |
| 4 | Given a verdict copied from another branch, with or without its PreToolUse line, when the review is checked, then it does not pass | `scripts/check-review.test.mjs` › "replay: a verdict copied from another branch fails on its tree, and one copied without its PreToolUse line is ignored" |

## Impact
- Affected specs: none. This is harness work with no FR rows. The decision is recorded in `docs/adr/0005-evidence-integrity.md`.
- Affected code: `scripts/check-review.mjs` and its test. Both are locked gate files, so the lock is re-sealed with its
  notes kept. The fixture of `scripts/agent-log-summary.test.mjs` also changes: it counts verdicts through the same
  `reviewVerdicts`, so its reviewer line now has the hook's shape (a `toolu_` id and its PreToolUse line).
- Records: every reviewer verdict in `.agent-log/actions.jsonl` so far has a `toolu_` id and its `PreToolUse` line, so
  no genuine review stops counting.
- Dependencies: none. No `AGENTS.md`, skill, `reviewer.md` or CI change.
