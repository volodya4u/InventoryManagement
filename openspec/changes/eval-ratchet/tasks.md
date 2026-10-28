# Tasks — eval-ratchet

- [x] 1. Write the tests for the summary, the Definition-of-done verdict and the CI step, and record each red on an assertion through `node scripts/test-run.mjs` (the summary against a stub with the right exports and no behaviour).
- [x] 2. Add `scripts/eval-summary.mjs`, `evalRatchetVerdict`, the `dod.mjs` step and the CI step; record green.
- [x] 3. Write `evals/results/latest.json`, un-ignore it, and earn `quality/eval-baseline.json` with `check-eval-ratchet.mjs --update`.
- [x] 4. Make `eval-record.mjs` write the summary after the record.
- [ ] 5. Write ADR-0007 and the `evals/README.md` paragraph, run the Factory checks and `node scripts/dod.mjs`, add the autonomy-log row, run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
