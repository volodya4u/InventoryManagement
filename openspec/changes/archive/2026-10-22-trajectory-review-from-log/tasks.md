# Tasks — trajectory-review-from-log

- [x] 1. Write the failing cases in `scripts/check-trajectory.test.mjs` (throwaway repositories with a merged pull request and its agent log), and record them red through `node scripts/test-run.mjs`.
- [x] 2. Read the review evidence of a slice without `review-findings.json` from the agent log of the pull request that merged it, with the rule of `scripts/check-review.mjs`, cached per merged slice; record green.
- [x] 2a. After the first review: a slice whose newest `Slice:` commit is on the first-parent line reads missing (a later, unrelated approval is not lent to it), cache entries count only while their merge is on that line, the cache hash covers `dod-fingerprint.mjs`, git errors and a tracked cache file are not trusted; record the extended cases red, then green.
- [x] 2b. After the second review: take merges from `main`'s first-parent line (reachable from `HEAD`), not `HEAD`'s, so a branch that merged `main` does not pass its own merge off as the slice's pull request; a failing tree fingerprint reads missing instead of crashing the generator; record the case red, then green.
- [x] 3. Re-seal `factory-lock.json` and add an update note to `docs/adr/0004-close-factory-follow-ups.md`.
- [x] 4. Run `node scripts/dod.mjs` and the Factory checks, then add the autonomy-log row. Run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
