# Fail every CI step whose command fails before its tee

## Why

PR #96 gave the `pr-evidence` step an explicit Bash shell, so its `pr-evidence.mjs | tee` returns the script's failure.
Two steps of `build-and-test` still pipe into `tee` under GitHub Actions' unspecified shell (`bash -e {0}`, no
`pipefail`), so `tee`'s success hides the command's failure:

- "Frontend unit tests": a failing Vitest run exits 0, and the next step's guard only compares the spec-file count, so
  `build-and-test` can go green with failing frontend tests. `dependabot-auto-merge` waits on that job, so a Dependabot
  update that breaks a frontend test can merge itself.
- "Dynamic context (angular-cli MCP)": its comment says a broken server fails the build, which is false today.

## What Changes

- `.github/workflows/ci.yml` gets `defaults: run: shell: bash`, so GitHub runs every step with
  `bash --noprofile --norc -eo pipefail {0}`; the now-redundant step-level `shell: bash` of the evidence step goes, and
  the Frontend unit tests comment says where `pipefail` comes from.
- `scripts/ci-workflow.test.mjs` finds every step in `ci.yml` that pipes into `tee` (with or without spaces around
  the `|`), resolves its shell from the step, its job's default or the workflow default, and runs each pipeline with a
  failing and a passing left command.
- This replaces the step-level `shell: bash` that `openspec/changes/ci-evidence-pipefail/` (PR #96) set on the
  evidence step; that change's criterion still holds, since its step now gets the same shell from the workflow default.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given any step in `ci.yml` that pipes a command into `tee`, when its command fails and `tee` succeeds under the step's resolved shell, then the step exits with the command's failure status | `scripts/ci-workflow.test.mjs` › "every tee step in ci.yml propagates its command's failure" |
| 2 | Given `shell: bash` as the workflow's or the job's `defaults.run.shell` or as the step's own `shell`, or none of them, when the test resolves a step's shell in GitHub's order (step, job, workflow), then the first three count as Bash with `pipefail`, none as `bash -e`, and a job default of another shell is refused rather than taken for Bash | `scripts/ci-workflow.test.mjs` › "a workflow default or a step-level shell: bash enables pipefail" |

## Impact

- Affected files: `.github/workflows/ci.yml` and `scripts/ci-workflow.test.mjs`.
- Harness work with no MVP FR row or baseline spec delta (`skip_specs: true`). The existing evidence policy is in
  `docs/adr/0005-evidence-integrity.md` and `AGENTS.md`.
- The user approved the workflow-level shell default for `ci.yml` on 2026-10-21. No dependency or locked gate file
  changes.
