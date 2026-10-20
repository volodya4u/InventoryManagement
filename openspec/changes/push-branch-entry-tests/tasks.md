# Tasks — push-branch-entry-tests

- [x] 1. Entry-point tests in `scripts/push-branch.test.mjs` against temporary repositories (AC 1–15); record the red run with `node scripts/test-run.mjs harness scripts/push-branch.test.mjs`.
- [x] 2. `scripts/push-branch.mjs`: `--no-follow-tags` in `pushArguments()` (AC 9) and the origin destination check in `main()` (AC 11–14); update the unit tests for the new argument; record the green run.
- [x] 3. `design.md`: what each execution-context probe showed, the review of `Bash(node scripts/push-branch.mjs)`, and what is left.
- [x] 4. `node scripts/dod.mjs`, the five Factory checks each on its own, the autonomy-log row.
- [ ] 5. `reviewer` subagent, `/security-review`, commit, `node scripts/pr-evidence.mjs origin/main HEAD`, push with `node scripts/push-branch.mjs`, pull request.
