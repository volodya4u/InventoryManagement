# Improvement: improve-PD-5 — the trajectory check can waive an archived slice, and a new gap fails

- **Defect:** PD-5 from the process retro of 2026-10-28 (`process-auditor`; `docs/qa/process-defects.json` is local per
  ADR-0008, so this file is the committed record). Class `check-too-weak`, P1.
- **Approval:** volodya4u asked in chat on 2026-10-28 to continue with PD-5 and the waivers for the two historical gaps. The
  edit of this gate-locked script and the re-seal of `factory-lock.json` are covered by that request, as in ADR-0002, ADR-0004
  and ADR-0006; the repository has no `PD-n` approval trailer flow beyond the `Refs: PD-5` on the commit.

## Why

`scripts/check-trajectory.mjs` finds two kinds of process gap in an archived slice: no commit carries its `Slice:` trailer
(`trailer`), and no clean review is on record for its final tree (`review-evidence`). Today both are warnings in the normal
run and failures only under `--release`. That has two bad effects:

- A **new** gap of either kind still leaves G4 green. `docs/qa/historical-gaps.md` says a new slice must not have one, but
  nothing enforces it.
- The **two documented, unrepairable** gaps (a missing trailer on `2026-10-12-harden-frontend-specs`, a stale review on
  `2026-10-21-structured-evidence-followups`) make `--release` fail forever, because a waiver today can only name a
  requirement id, never a slice. So the release gate G7 can never go green, whatever else is fixed.

## What Changes

- **`scripts/check-trajectory.mjs`** (gate-locked; `factory-lock.json` is re-sealed in the same commit, ADR-0009):
  - A **slice waiver** is a `docs/qa/waivers/*.md` file with `Status: open`, `Gate: Trajectory`, an `Approval:` line, a
    `Slices:` line listing archived slice folders by their exact name and a `Checks:` line naming which of `trailer` and
    `review-evidence` it covers. It waives exactly those checks for exactly those slices and nothing else (not the other
    check, not `process`, not any requirement). The `Slices:` and `Checks:` lines are required: a waiver that only mentions a
    slice, or only a requirement id, waives nothing.
  - A waived finding is reported as **WAIVED** with the waiver's path, in the console, in `docs/qa/trajectory-report.md`
    (new "Waived" section) and in `trace/trajectory.json` (`waived`), in both modes. It is never a pass and never silent.
  - An **unwaived** `trailer` or `review-evidence` finding is now a **failure in both modes** (it was a warning without
    `--release`). `process` (missing `design.md` or `tasks.md`) and the scope checks keep their current gating.
- **`scripts/check-trajectory.test.mjs`** gets six tests; the shared `evidence` helper reads the generated JSON even when
  the run exits 1.
- **Two waivers** for the two documented gaps are added in the same pull request, so `main` stays green (PD-5 is only safe
  together with them). Each has a correction under `retro/corrections/` with the owner's disposition.
- **`docs/qa/historical-gaps.md`** says the two gaps are now waived, not warned.
- Not changed: the rule that a review counts only for the tree it saw, the merged history, `process`, `--strict-scope`.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given an archived slice that no commit's `Slice:` trailer names and no waiver, when the check runs without flags, then it fails on `trailer` | `scripts/check-trajectory.test.mjs` › "fails per-slice for an unwaived missing trailer" |
| 2 | Given an archived slice whose last APPROVE was on an older tree and no waiver, when the check runs without flags, then it fails on `review-evidence` | `scripts/check-trajectory.test.mjs` › "fails per-slice for an unwaived stale review" |
| 3 | Given an open `Gate: Trajectory` waiver with an `Approval:` and the slice in `Slices:`, when the check runs per-slice and with `--release`, then both exit 0 and print WAIVED | `scripts/check-trajectory.test.mjs` › "reports a slice waiver as WAIVED in both modes" |
| 4 | Given a waiver that names only a requirement id, or a slice only in its prose, when the check runs, then the slice's finding still fails | `scripts/check-trajectory.test.mjs` › "does not let a requirement waiver or a mention cover a slice" |
| 5 | Given a slice waiver whose `Status:` is closed or missing, or that has no `Approval:`, no `Checks:` line or another `Gate:`, when the check runs, then the slice's finding still fails | `scripts/check-trajectory.test.mjs` › "ignores a closed or unapproved slice waiver" |
| 6 | Given a slice with both findings and a waiver whose `Checks:` lists only `trailer`, when the check runs, then `trailer` is WAIVED and `review-evidence` fails; and `process` stays a failure even if a waiver lists it | `scripts/check-trajectory.test.mjs` › "covers only the checks a waiver lists" |

## Expected metric movement

- **Metric:** `trajectoryRelease` in `node scripts/gate-status.mjs`: FAIL (2 findings) → PASS with 2 WAIVED lines. G7 still
  has its other reasons (no recording manifests).
- **Unchanged on `main`:** the normal run stays PASS, because the only two findings are waived.

## Rollback

One commit, `git revert <sha>`, which restores the check, the lock and the docs together. The two waiver files and their
corrections can stay: without the check that reads them they are inert.

## Impact

- Affected files: `scripts/check-trajectory.mjs`, `scripts/check-trajectory.test.mjs`, `factory-lock.json` (re-sealed),
  `docs/adr/0009-waive-trajectory-gaps.md`, `docs/qa/waivers/` (two files), `retro/corrections/` (two files),
  `docs/qa/historical-gaps.md`, the generated trajectory report and JSON, `docs/autonomy-log.md`, this change folder.
