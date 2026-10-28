# Tasks — dod-eval-diagnostics

- [x] 1. Write the test in `scripts/dod-checks.test.mjs` and record it red on an assertion through `node scripts/test-run.mjs`.
- [x] 2. Make `evalRatchetVerdict` quote the first line of a result-less output, and record green.
- [x] 3. Run `node scripts/dod.mjs` and the Factory checks, add the autonomy-log row, run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
