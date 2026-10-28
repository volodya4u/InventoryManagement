# Tasks — test-first-break-run

- [x] 1. Write `scripts/test-first-loop-skill.test.mjs` and record it red against the old skill through `node scripts/test-run.mjs`.
- [x] 2. Add the controlled-break recipe to `.agents/skills/test-first-loop/SKILL.md`, add the two eval cases, sync with `node scripts/skills-sync.mjs`, and record green.
- [x] 3. Record the evals with `node scripts/eval-record.mjs` and commit `evals/record.json`; if a test-first-loop case regresses, fix the skill, not the case.
- [x] 4. Close the "Not yet" bullet of ADR-0005 slice 4.
- [x] 5. Run the Factory checks and `node scripts/dod.mjs`, add the autonomy-log row, run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
