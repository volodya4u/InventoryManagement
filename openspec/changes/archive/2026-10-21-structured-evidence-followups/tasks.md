# Tasks — structured-evidence-followups

- [x] 1. Write the three failing cases and record them red through `node scripts/test-run.mjs harness …`.
- [x] 2. `scripts/test-results.mjs`: unreadable reports give `null`. `scripts/test-run.mjs`: a report with tests wins over a console compile line. `scripts/pr-evidence.mjs`: an ambiguous leaf title does not count.
- [x] 3. Record green on the final code. Extend `docs/adr/0005-evidence-integrity.md`, then archive this change under `openspec/changes/archive/2026-10-21-structured-evidence-followups/`.
- [x] 4. Run `node scripts/dod.mjs` and the Factory checks, add the autonomy-log row, then run the reviewer. Commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
