# Tasks — replayable-break-runs

- [x] 1. Expose `executeRun` in `scripts/test-run.mjs` without changing what a TestRun records. Write the failing cases (`scripts/pr-evidence.test.mjs` for the gate, `scripts/break-run.test.mjs` with throwaway repositories for the workflow) and record them red through `node scripts/test-run.mjs`.
- [x] 2. Write `scripts/break-run.mjs` and `scripts/break-replay.mjs`, add the hardening path to Red → green in `scripts/pr-evidence.mjs`, and add `.gitattributes` for the evidence folder.
- [x] 3. Show criterion 3 red with a controlled break, since that guard held before the change, then restore the code to its blob id. Record the final greens.
- [x] 4. Extend `docs/adr/0005-evidence-integrity.md` and add the `CLAUDE.md` how-to. Archive this change under `openspec/changes/archive/2026-10-21-replayable-break-runs/`.
- [x] 5. Run `node scripts/dod.mjs` and the Factory checks, then add the autonomy-log row. Run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
