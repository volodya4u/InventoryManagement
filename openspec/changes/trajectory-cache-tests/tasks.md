# Tasks — trajectory-cache-tests

- [x] 1. Add the four cases to `scripts/check-trajectory.test.mjs`; they pass on the unchanged script.
- [x] 2. Re-seal `factory-lock.json` for the changed test (owner-approved), with the earlier adaptation notes carried over.
- [x] 3. Show each case red with a recorded break run of `scripts/check-trajectory.mjs` (`node scripts/break-run.mjs start|break|restore`), restored to the head commit's code, and commit `docs/evidence/break-runs/`.
- [x] 4. Update autonomy-log row 76 with the five review rounds of #108 and add this slice's row.
- [x] 5. Run `node scripts/dod.mjs` and the Factory checks (each on its own). Run the `reviewer` subagent, commit, run `node scripts/pr-evidence.mjs origin/main HEAD`, push with `node scripts/push-branch.mjs`, and open the pull request.
