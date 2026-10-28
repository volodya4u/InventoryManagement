# Waiver: trajectory trailer of 2026-10-12-harden-frontend-specs

Status: open
Gate: Trajectory
Slices: 2026-10-12-harden-frontend-specs
Checks: trailer
Approval: volodya4u, in chat on 2026-10-28: "Please continue with PD-5 and the waivers"

- **Finding waived:** `trailer`. No commit carries a `Slice: harden-frontend-specs` trailer.
- **What happened:** slice H6, merged as #69 (merge `99e6753`, commit `863b6b5`). The commit message has no trailer; the five
  sibling slices H1 to H5 carry theirs.
- **Why it cannot be repaired:** a trailer cannot be added to a merged commit without rewriting history, which this
  repository does not do. The review of the slice is not waived: it was recovered from the agent log and recorded in the
  archived change's `review-findings.json` (see `docs/qa/historical-gaps.md`, "Recovered").
- **Scope:** the `Checks:` line above, on this one slice: the `trailer` check only. It waives no other slice, not
  `review-evidence` (the check reads that separately, and it would fail if the slice lost its review), not `process`, and no
  requirement. New slices get no such waiver and fail the check if they lack a trailer.
- **Release:** closes if a commit with the trailer ever lands on the slice (it will not), or when the owner decides the slice
  no longer needs the exception. While open it shows as WAIVED in `docs/qa/trajectory-report.md`, never as a pass.
