# Tasks — decisions-trace-scope

- [x] 1. Write the failing case in `scripts/decisions.test.mjs` (an untagged JUnit method and spec test below a tagged one, and a test's own tag above its annotations and comments), and record it red through `node scripts/test-run.mjs`.
- [x] 2. Stop the scan in `traceIds` at the end or the declaration of the test above, then record green.
- [x] 3. Correct the "as `check-traceability.mjs` counts them" sentence in the slice 6 design.
- [x] 4. Run `node scripts/dod.mjs` and the Factory checks, then add the autonomy-log row. Run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
