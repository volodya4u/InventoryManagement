# Tasks — improve-PD-5

- [x] 1. Add the five tests to `scripts/check-trajectory.test.mjs` and record each red on an assertion through `node scripts/test-run.mjs`.
- [x] 2. Add slice waivers and fail unwaived `trailer` / `review-evidence` findings in `scripts/check-trajectory.mjs`, and record green.
- [x] 3. Write the two waivers, run `node scripts/correct.mjs --detect` and record the owner's dispositions.
- [x] 4. Write ADR-0009, update `docs/qa/historical-gaps.md`, and re-seal `factory-lock.json` with the adaptation note.
- [x] 5. Add the autonomy-log row, run the Factory checks and `node scripts/dod.mjs`, run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
