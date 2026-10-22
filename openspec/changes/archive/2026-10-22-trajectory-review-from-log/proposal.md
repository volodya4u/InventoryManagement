# Read a slice's review evidence from the agent log

## Why
`scripts/check-trajectory.mjs` counts an archived slice as reviewed only when its folder holds a `review-findings.json`
with `clean: true`, the file the Project Factory's own review workflow writes. This repository reviews with the
`reviewer` subagent instead, whose verdict a hook records in `.agent-log/actions.jsonl`, and `pr-evidence` checks that
verdict against the pull request's head. So every archived slice warned "review-findings.json is missing", even the
reviewed ones, and the warning could no longer tell a reviewed slice from an unreviewed one.

ADR-0004 had left the warning in place rather than write files to satisfy it. On 2026-10-22 the owner chose to have the
check read the agent log instead.

## What Changes
- **Review evidence from the agent log.** When a slice has no `review-findings.json`, `check-trajectory.mjs` finds the
  pull request that merged it: the first merge on `main`'s first-parent line (`origin/main`, else `main`; with neither, the slice reads `missing`),
  reachable from `HEAD`, that descends from the newest commit carrying its `Slice:` line. A slice whose newest `Slice:`
  commit is itself on that line (pushed to `main`, or squash-merged) reads `missing`, so no later pull request lends it
  an approval. On the agent-log lines the pull request added, it applies the rule `pr-evidence` applies
  (`reviewProblems` in `scripts/check-review.mjs`, against `treeFingerprintAt` of the branch head):
  - the last hook-recorded verdict is `APPROVE` with 0 blocking findings, and its tree is the head's: the slice reads
    `approved (agent log)` and no longer warns;
  - a verdict that fails that rule reads `not approved (agent log): <why>` and warns;
  - no verdict, or no merge to find, stays `missing` and warns.
- **No file is written.** A `review-findings.json`, where one exists, still decides first.
- **The lock.** `check-trajectory.mjs` and the new `scripts/check-trajectory.test.mjs` match `scripts/check-*.mjs`, so
  `factory-lock.json` is re-sealed in the same pull request (owner-approved).

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given an archived slice whose merged pull request recorded the reviewer's APPROVE with 0 blocking on the branch head (after an earlier CHANGES REQUESTED too), when the trajectory is checked, then it reads approved and does not warn, and a clean `review-findings.json` still decides first | `scripts/check-trajectory.test.mjs` › "an archived slice counts as reviewed when its pull request recorded the reviewer's APPROVE on the branch head" |
| 2 | Given a verdict for an earlier tree, with blocking findings, CHANGES REQUESTED or written by hand, or no verdict or merge at all, when the trajectory is checked, then the slice is not counted as reviewed and warns | `scripts/check-trajectory.test.mjs` › "an archived slice is not counted as reviewed on a verdict that is stale, open or not recorded by the hook" |

## Impact
- Affected specs: none (the harness only).
- Affected code: `scripts/check-trajectory.mjs` (locked) and its new test, `factory-lock.json`, the regenerated
  `docs/qa/trajectory-report.md` and `trace/trajectory.json`, and an update note in `docs/adr/0004-close-factory-follow-ups.md`.
