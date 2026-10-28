# Waiver: trajectory review evidence of 2026-10-21-structured-evidence-followups

Status: open
Gate: Trajectory
Slices: 2026-10-21-structured-evidence-followups
Checks: review-evidence
Approval: volodya4u, in chat on 2026-10-28: "Please continue with PD-5 and the waivers"

- **Finding waived:** `review-evidence`. The agent log's review of this slice is not approved: files changed after the
  reviewer's last APPROVE, so its recorded tree differs from the merged one.
- **What happened:** merged as #95 (merge `50a29eb`). The last APPROVE was logged on 2026-10-20 for a tree committed ten seconds
  earlier than `0ea93af`. Afterwards the branch merged `main` again (`e3e2f69`) and added evidence commits (`bb9768a`,
  `4852178`). None of the slice's three scripts (`test-results.mjs`, `test-run.mjs`, `pr-evidence.mjs`) or their tests changed
  after that review; the differences are `main`'s `scripts/hooks-pre-commit.mjs` change and its test, `README.md`,
  `docs/autonomy-log.md` and generated report, trace and log files.
- **Why it cannot be repaired:** no reviewer ran on the final tree, and a review run today would be a verdict for a different
  tree, not the missing one. The rule (a review counts only for the tree it saw) is right and is not changed.
- **Scope:** the `Checks:` line above, on this one slice: the `review-evidence` check only. It waives no other slice, not
  `trailer` (the check reads that separately), not `process`, and no requirement. New slices get no such waiver and fail the check if their review does not match the merged tree.
- **Release:** closes when the owner decides the slice no longer needs the exception. While open it shows as WAIVED in
  `docs/qa/trajectory-report.md`, never as a pass.
