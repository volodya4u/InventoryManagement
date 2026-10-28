# Design — eval-ratchet

## Why a derived, committed summary
`check-eval-ratchet.mjs` reads a fixed path, `evals/results/latest.json`, and the repository ignores `evals/results/`
because the eval reports there are large and local. CI never runs the evals (they cost money), so the only score data
CI has is the committed `evals/record.json`. The summary is therefore derived from the record by an unlocked script and
committed on its own path; a test and `--check` keep it identical to the record, so it cannot say anything the record
does not. Editing the locked ratchet to take `--summary` and `--baseline` options, as ADR-0006 did for coverage, was not
needed.

## Dimensions
A dimension is a suite: `reviewer`, `factory-rules`, and `skill-<name>` for each skill. A single case is too noisy a unit
for a ratchet whose tolerance is one point on a 0-100 scale, and a suite is the unit a change touches. The suite of a
case comes from where its folder is, since `evals/record.json` stores only case names.

## Why `--check` also looks for the baseline
`check-eval-ratchet.mjs` exits 0 with "SKIP-pending" when the baseline is missing, so deleting `quality/eval-baseline.json`
would turn the ratchet off without a failure. `eval-summary.mjs --check` runs first in CI and in the Definition of done
and fails when the baseline is not committed. `dod.mjs` also requires a PASS on at least one case.

## Noise
The scores come from a judged model run, and a re-record can move a suite by a case. The baseline is the floor of the
record at the time it is earned. To lower a floor on purpose, add `docs/qa/waivers/<name>.json` with
`{"check": "eval-ratchet", "metrics": ["<dimension>"], "reason": "..."}` and run `--update`; to raise it, run `--update`
after a better record and commit the baseline.
