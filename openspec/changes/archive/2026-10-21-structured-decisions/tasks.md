# Tasks — structured-decisions

- [x] 1. Write the failing cases (`scripts/decisions.test.mjs` with throwaway projects and the repository self-check, and the autonomy-columns case in `scripts/pr-evidence.test.mjs`), and record them red through `node scripts/test-run.mjs`.
- [x] 2. Write `scripts/decisions.mjs`, and migrate the Open questions table: OQ-1 and OQ-2 answered with their words kept, the rest open with their requirements linked.
- [x] 3. Add the two columns to `docs/autonomy-log.md`, with row 26 filled in and the older rows `not recorded`. Check both columns in `autonomyProblems`.
- [x] 4. Document the recipe in `openspec/project.md`, then extend `docs/adr/0005-evidence-integrity.md`.
- [x] 5. Run `node scripts/dod.mjs` and the Factory checks, then add the autonomy-log row. Run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
