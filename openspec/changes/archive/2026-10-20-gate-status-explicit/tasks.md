# Tasks — gate-status-explicit

- [x] 1. Write the failing cases in `scripts/pr-evidence.test.mjs` and `scripts/check-specs.test.mjs`, and record them red through `node scripts/test-run.mjs harness …`.
- [x] 2. `scripts/pr-evidence.mjs`: `gateStatus`, a status on every gate, and the report's PASS / FAIL / N/A / WAIVED cells; exit 1 only on FAIL.
- [x] 3. `scripts/pr-evidence.mjs`: Red → green over added and changed criteria of `docs/specs/*.md` and OpenSpec slice proposals, harness tests, and gate waivers the branch adds.
- [x] 4. `scripts/check-specs.mjs`: harness test references, and validation of active changes' acceptance tables. Re-seal `factory-lock.json`.
- [x] 5. Record green. Update `AGENTS.md`, `CLAUDE.md`, the `test-first-loop` skill (then `node scripts/skills-sync.mjs`) and `docs/adr/0005-evidence-integrity.md`. Run the evals with `node scripts/eval-record.mjs`.
- [x] 6. Archive this change under `openspec/changes/archive/2026-10-20-gate-status-explicit/`. Run `node scripts/dod.mjs` and the Factory checks, add the autonomy-log row, run the reviewer, commit, then `node scripts/pr-evidence.mjs origin/main HEAD`.
