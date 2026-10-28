# Tasks — improve-PD-1

- [x] 1. Write `scripts/ledger-report.test.mjs` and record each criterion red on an assertion through `node scripts/test-run.mjs` against the current `productCodePresent()`.
- [x] 2. Mirror `gate-status.mjs`'s product-code rule in `scripts/ledger-report.mjs`, and record green.
- [x] 3. Regenerate the local digest and check that `productCodePresent` is `true` on this repository.
- [x] 4. Run the Factory checks and `node scripts/dod.mjs`, add the autonomy-log row, run the reviewer, commit with `Refs: PD-1`, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
