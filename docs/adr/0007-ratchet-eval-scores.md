# ADR-0007: Ratchet the eval scores from the committed record

- **Status:** Accepted
- **Date:** 2026-10-28
- **Deciders:** volodya4u (user), Claude

## Context

ADR-0001 installed `scripts/check-eval-ratchet.mjs` because `gate-status.mjs` calls it. It reads
`evals/results/latest.json` (`{ dimensions, cases }`) against a committed baseline and has skipped since: the eval-suite
workflow that would write the file is not used here, `evals/results/` is gitignored, and there is no baseline. The
repository already commits the scores that matter, in `evals/record.json` (one `claude plugin eval` run, written by
`scripts/eval-record.mjs`), and `pr-evidence` fails an out-of-date record. What nothing checks is whether the scores went
down. CI never runs the evals, so a ratchet there can only read committed data.

## Decision

- Derive the ratchet's input from the record. `scripts/eval-summary.mjs` writes `evals/results/latest.json`: one dimension
  per suite (reviewer, factory-rules, and one per skill), each the mean case score on a 0-100 scale. `eval-record.mjs`
  writes it after the record. It is committed (`.gitignore` keeps that one file) and a test holds it identical to the
  record.
- Keep `check-eval-ratchet.mjs` as it is (no locked file changes) and commit `quality/eval-baseline.json`, earned with
  `--update` from the record.
- Enforce it in CI (`build-and-test`, an "Eval ratchet" step) and in `node scripts/dod.mjs`. `eval-summary.mjs --check` fails
  a stale summary and a missing baseline, because the ratchet itself skips (exit 0) without one.
- To loosen a floor on purpose, add `docs/qa/waivers/<name>.json` with
  `{"check": "eval-ratchet", "metrics": ["<dimension>"], "reason": "..."}` and run `--update`; to raise it, run `--update`
  after a better record and commit the baseline.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| Derived, committed summary (chosen) | Runs in CI with no model call; no locked file edit | One more generated file to keep in step (a test does) |
| Add `--summary` and `--baseline` options to the locked ratchet, as ADR-0006 did for coverage | Summary can stay out of git | Locked file changes and a re-seal for no gain: the summary is small |
| Run the evals in CI | Real scores per pull request | Costs money on every push and is non-deterministic; the README rules it out |
| Absolute thresholds | Simple | A number someone picks by hand; does not ratchet up |

## Consequences

- G (evals) in `gate-status.mjs` reads PASS instead of SKIP-pending.
- A re-record that scores a suite lower than its floor fails CI and the Definition of done until the skill is fixed, the
  baseline is waived, or the model noise is averaged away with `--runs`. The first baseline is whatever the committed
  record scores, noise included.
- `evals/results/latest.json` and the baseline change in every pull request that re-records the evals.
