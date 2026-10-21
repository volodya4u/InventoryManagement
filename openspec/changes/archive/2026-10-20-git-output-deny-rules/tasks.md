# Tasks — git-output-deny-rules

- [x] 1. Probe which `--output` spellings `git log`, `git diff`, `git show` and `git status` accept, in a temporary repository; ask the user for the exact rules.
- [x] 2. `scripts/settings-permissions.test.mjs` (AC 1–3); record the red run against the old rules with `node scripts/test-run.mjs harness scripts/settings-permissions.test.mjs`.
- [x] 3. `.claude/settings.json`: the two deny rules and the `/` anchor for every Edit ask rule; record the green run.
- [x] 4. `scripts/hooks-selftest.mjs`: the reviewer-guard case for `git log --output` (a regression pin; the guard already blocked it).
- [x] 5. `design.md`: the probe, why deny rules and not a hook, the side effect and what is left.
- [x] 6. `node scripts/dod.mjs`, the five Factory checks each on its own, the autonomy-log row, `reviewer`, `/security-review`, commit, `node scripts/pr-evidence.mjs origin/main HEAD`, push with `node scripts/push-branch.mjs`, pull request.
