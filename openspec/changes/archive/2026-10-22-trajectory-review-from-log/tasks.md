# Tasks — trajectory-review-from-log

- [x] 1. Write the failing cases in `scripts/check-trajectory.test.mjs` (throwaway repositories with a merged pull request and its agent log), and record them red through `node scripts/test-run.mjs`.
- [x] 2. Read the review evidence of a slice without `review-findings.json` from the agent log of the pull request that merged it, with the rule of `scripts/check-review.mjs`, cached per merged slice; record green.
- [x] 3. Re-seal `factory-lock.json` and add an update note to `docs/adr/0004-close-factory-follow-ups.md`.
- [x] 4. Run `node scripts/dod.mjs` and the Factory checks, then add the autonomy-log row. Run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
