# Tasks — agents-decision-recipe

- [x] 1. Write the failing case in `scripts/decisions.test.mjs` and record it red against the old `AGENTS.md` line through `node scripts/test-run.mjs`.
- [x] 2. Point the Project Factory section of `AGENTS.md` at "Owner decisions" in `openspec/project.md`, refresh the eval prompts with `node scripts/factory-rules-evals.mjs`, and record green.
- [x] 3. Record the evals with `node scripts/eval-record.mjs --model claude-sonnet-5-5`.
- [x] 4. Run `node scripts/dod.mjs` and the Factory checks, then add the autonomy-log row. Run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
