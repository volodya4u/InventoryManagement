# Fail PR evidence CI when an evidence gate fails

## Why

PR #95's `pr-evidence` job printed `Review: FAIL`, but GitHub marked the job successful. The workflow pipes the
evidence script into `tee` under GitHub Actions' unspecified Bash shell, so the step returned `tee`'s success status.

## What Changes

- Run the `pr-evidence` step with an explicit Bash shell. GitHub Actions adds `pipefail` for that shell, so a failed
  evidence script makes the step and job fail while `tee` still writes the report to the job summary.
- Add a regression test that executes the step's pipeline with a failing left command and a successful `tee`.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a failing evidence command and a successful summary `tee`, when the PR evidence step runs under its configured shell, then the step exits with the evidence command's failure status | `scripts/ci-workflow.test.mjs` › "pr-evidence CI step propagates a failed gate through tee" |

## Impact

- Affected files: `.github/workflows/ci.yml` and `scripts/ci-workflow.test.mjs`.
- Harness work with no MVP FR row or baseline spec delta (`skip_specs: true`). The existing evidence policy is in
  `docs/adr/0005-evidence-integrity.md` and `AGENTS.md`.
- The user approved this separate CI workflow fix on 2026-10-21. No dependency or locked gate file changes.
