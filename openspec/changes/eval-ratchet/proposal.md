# Ratchet the eval scores

## Why

`node scripts/gate-status.mjs` runs `scripts/check-eval-ratchet.mjs`, which skips because `evals/results/latest.json` does
not exist: nothing turns the committed eval record (`evals/record.json`) into the `{ dimensions, cases }` summary the
ratchet reads, `evals/results/` is gitignored so a summary would not reach CI, and no baseline is committed. A skill or
reviewer change can therefore lower a suite's score and still merge, as long as the record is fresh.

## What Changes

- **`scripts/eval-summary.mjs`** (new, unlocked) turns `evals/record.json` into `evals/results/latest.json`: one dimension per
  suite (the reviewer cases, the factory-rules cases, one per skill) as the mean case score on a 0-100 scale. `--check`
  fails when the committed summary is not what the record gives, or when `quality/eval-baseline.json` is missing (the
  ratchet would otherwise skip).
- **`scripts/eval-record.mjs`** writes the summary after the record, so they cannot drift apart.
- **`.gitignore`** keeps `evals/results/latest.json` (the rest of `evals/results/` stays ignored).
- **`quality/eval-baseline.json`** is earned with `node scripts/check-eval-ratchet.mjs --update` from the committed record.
- **CI and the Definition of done** run `eval-summary.mjs --check`, then `check-eval-ratchet.mjs`; `dod.mjs` passes the
  step only on a PASS over at least one case (`evalRatchetVerdict` in `scripts/dod-checks.mjs`).
- No locked gate script changes: `check-eval-ratchet.mjs` is used as it is.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a record whose cases belong to the reviewer, factory-rules and a skill's eval folders, when it is summarized, then each dimension is the mean of its cases' scores on a 0-100 scale | `scripts/eval-summary.test.mjs` › "groups the case scores by suite and averages each dimension on a 0-100 scale" |
| 2 | Given a record case with no case folder, when it is summarized, then it is counted under "unassigned" and not dropped | `scripts/eval-summary.test.mjs` › "a case with no folder is reported as unassigned, not dropped" |
| 3 | Given `--check`, when `latest.json` or the baseline is missing, or `latest.json` is not what the record gives, then it exits 1; when both are in place and fresh, it exits 0 | `scripts/eval-summary.test.mjs` › "--check fails when latest.json or the baseline is missing or stale, and passes when both are there" |
| 4 | Given the committed record, when `latest.json` and the baseline are read, then both exist and the summary is what the record gives | `scripts/eval-summary.test.mjs` › "the committed latest.json is what the committed record gives" |
| 5 | Given the output of the two eval commands, when the Definition of done judges it, then it passes only on a PASS over at least one case | `scripts/dod-checks.test.mjs` › "eval ratchet verdict needs a PASS on at least one case" |
| 6 | Given the CI workflow, when `build-and-test` runs, then an "Eval ratchet" step after the coverage ratchet checks the summary against the record and then ratchets the scores | `scripts/ci-workflow.test.mjs` › "build-and-test ratchets the eval scores after the coverage" |

## Impact

- Affected specs: none (harness work, `skip_specs: true`).
- Affected files: `scripts/eval-summary.mjs` and its test, `scripts/eval-record.mjs`, `scripts/dod.mjs`,
  `scripts/dod-checks.mjs` and their tests, `scripts/ci-workflow.test.mjs`, `.github/workflows/ci.yml` (the owner approved
  this CI step with the plan), `.gitignore`, `quality/eval-baseline.json`, `evals/results/latest.json`,
  `evals/README.md`, `docs/adr/0007-ratchet-eval-scores.md`. No locked file, no `factory-lock.json` change.
- The baseline is the floor of whatever the committed record scores now, noise included.
