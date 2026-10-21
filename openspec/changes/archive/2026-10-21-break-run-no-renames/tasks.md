# Tasks — break-run-no-renames

- [x] 1. Write the failing case in `scripts/break-run.test.mjs` (a fixture moved out of its folder at the break) and record it red through `node scripts/test-run.mjs harness scripts/break-run.test.mjs`.
- [x] 2. Pass `--no-renames` to the `--name-only` diffs in `scripts/break-run.mjs` and `scripts/break-replay.mjs`, then record the file green.
- [x] 3. Write `design.md`, and archive this change under `openspec/changes/archive/2026-10-21-break-run-no-renames/`.
- [x] 4. Run `node scripts/dod.mjs` and the five Factory checks (each on its own), then add the autonomy-log row. Run the `reviewer` subagent, then commit with the `Slice:` trailer. Run `node scripts/pr-evidence.mjs origin/main HEAD`, push with `node scripts/push-branch.mjs`, and open the pull request.
