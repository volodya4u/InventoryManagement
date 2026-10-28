# Ratchet backend and frontend coverage

## Why

`node scripts/gate-status.mjs` shows G5 (hardening, coverage) as NOT-EARNED with scope 0. The onboarding installed
`scripts/check-coverage-ratchet.mjs`, but nothing writes the coverage summary it reads: Maven has no JaCoCo and the Angular
unit-test builder runs without coverage. A coverage drop on either side of the app goes unnoticed.

## What Changes

- Collect backend coverage with JaCoCo in `mvn verify` and convert its XML report into the json-summary shape the ratchet
  reads (`scripts/jacoco-summary.mjs`).
- Collect frontend coverage with Vitest's V8 provider (`ng test --coverage`, `json-summary` reporter).
- Give the ratchet `--summary`, `--baseline`, `--label` and `--require` options, so each side has its own committed baseline
  and a run that must see coverage fails when the summary or baseline is missing. Without options it behaves as before.
- Show both sides under G5 in `gate-status.mjs`, ratchet both in CI's `build-and-test` job and in `node scripts/dod.mjs`.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a JaCoCo XML report, when it is converted, then the summary carries the lines, statements, functions and branches totals, covered counts and percentages from the report's LINE, INSTRUCTION, METHOD and BRANCH counters | `scripts/jacoco-summary.test.mjs` › "converts JaCoCo report counters to a coverage summary" |
| 2 | Given no JaCoCo report, when the conversion runs, then it exits non-zero, names the missing report and writes no summary | `scripts/jacoco-summary.test.mjs` › "fails when the JaCoCo report is missing" |
| 3 | Given `--summary` and `--baseline` paths, when a metric drops below that baseline, then the ratchet fails, and `--update` writes only that baseline | `scripts/check-coverage-ratchet.test.mjs` › "ratchets the summary and baseline it is given" |
| 4 | Given `--require` and no summary or no baseline, when the ratchet runs, then the result is FAIL with exit code 1 | `scripts/check-coverage-ratchet.test.mjs` › "fails a required run without coverage" |
| 5 | Given the CI workflow, when `build-and-test` runs, then the frontend tests run with `--coverage` and a later step converts the JaCoCo report and ratchets the backend and the frontend with `--require` | `scripts/ci-workflow.test.mjs` › "build-and-test ratchets backend and frontend coverage" |
| 6 | Given the output of the two ratchet runs, when the Definition of done judges it, then it passes only when both sides report PASS | `scripts/dod-checks.test.mjs` › "coverage verdict needs both sides to pass" |

## Impact

- Affected files: `pom.xml`, `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/angular.json`,
  `.github/workflows/ci.yml`, `scripts/check-coverage-ratchet.mjs`, `scripts/gate-status.mjs`, `scripts/dod.mjs`,
  `scripts/dod-checks.mjs`, the new `scripts/jacoco-summary.mjs`, their tests, `quality/coverage-*-baseline.json` and
  `factory-lock.json`.
- Harness work with no MVP FR row or baseline spec delta (`skip_specs: true`).
- The owner approved the plan on 2026-10-27: per-side baselines, enforced in CI and the Definition of done, a new
  devDependency (`@vitest/coverage-v8`), the JaCoCo plugin, and an edit to two gate-locked files with the lock re-sealed
  (`docs/adr/0006-per-side-coverage-ratchet.md`). During implementation the owner also approved the test-scoped JaCoCo
  runtime agent (`org.jacoco:org.jacoco.agent:runtime`) on Surefire's `argLine` instead of `prepare-agent`
  (`design.md`).
