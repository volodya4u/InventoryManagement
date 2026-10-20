# Tasks — structured-test-evidence

- [x] 1. Write the failing cases for the parsers (`scripts/test-results.test.mjs`) and the run summary (`scripts/test-run.test.mjs`), then implement `scripts/test-results.mjs` and the structured capture in `scripts/test-run.mjs`.
- [x] 2. Write the failing cases in `scripts/pr-evidence.test.mjs` and `scripts/check-specs.test.mjs` and record them red with the structured recorder. Then implement per-test matching, stale-green detection, the no-test criterion, `branchWaivers`, `-M` and the single check of an active proposal. Re-seal the lock with its notes kept.
- [x] 3. The criteria of task 1 were written before the recorder could report per-test results, so a structured red was not possible then. Show each one red with a controlled break of the code it tests, restore the code, and record green on the final code.
- [x] 4. Extend `docs/adr/0005-evidence-integrity.md` with slice 2. Archive this change under `openspec/changes/archive/2026-10-20-structured-test-evidence/`.
- [x] 5. Run `node scripts/dod.mjs`, then the Factory checks, then add the autonomy-log row. Run the reviewer, commit, then run `node scripts/pr-evidence.mjs origin/main HEAD`.
