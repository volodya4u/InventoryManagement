# Tasks — break-run-follow-ups

- [x] 1. Write the failing cases (AC 1–4) in `scripts/break-run.test.mjs` and `scripts/pr-evidence.test.mjs`, with a stub `isTestPath()` so they fail on assertions, plus the two pins (AC 5–6). Record each file red through `node scripts/test-run.mjs harness <file>`.
- [x] 2. Implement `isTestPath()` and `snapshot(root, { worktree: false })` in `scripts/break-run.mjs`. Make the replay decide on snapshots and check the restore step and the recorded test files. Use `isTestPath()` in the gate and quiet its `git show`. Record each file green.
- [x] 3. Show AC 5 and AC 6 red with recorded break runs of `scripts/break-replay.mjs` (`node scripts/break-run.mjs`), restored to the head commit's code, and commit `docs/evidence/break-runs/`.
- [x] 4. Fix the wording in the archived `replayable-break-runs` design, update the `CLAUDE.md` how-to, write `design.md`, and archive this change under `openspec/changes/archive/2026-10-21-break-run-follow-ups/`.
- [x] 5. Run `node scripts/dod.mjs` and the five Factory checks (each on its own), then add the autonomy-log row. Run the `reviewer` subagent, commit, run `node scripts/pr-evidence.mjs origin/main HEAD`, push with `node scripts/push-branch.mjs`, and open the pull request.
