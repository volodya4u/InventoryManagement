# Tasks — signed-approval-follow-ups

- [x] 1. Write the failing cases (AC 1–6) in `scripts/signed-approval.test.mjs`, the new `scripts/approve-pr.test.mjs` and `scripts/pr-evidence.test.mjs`, with stub exports so they fail on assertions, and record each file red through `node scripts/test-run.mjs harness <file>`.
- [x] 2. Pin `gpg.ssh.program` in `git verify-tag`; implement `driftProblem()`, `pushApproval()`, `approvalRun()`, `ciRun()`, `evidenceJob()` and use them in `main()` and `rerun()`; build the pr-evidence row through `humanApprovalRow()`. Record each file green. Then the same red-then-green loop for `signingProgram()` (AC 7).
- [x] 3. `design.md`, the ADR-0005 note; archive this change under `openspec/changes/archive/2026-10-21-signed-approval-follow-ups/`.
- [x] 4. `node scripts/dod.mjs`, the five Factory checks each on its own, the autonomy-log row; the `reviewer` subagent; commit; `node scripts/pr-evidence.mjs origin/main HEAD`; push with `node scripts/push-branch.mjs`; pull request.
