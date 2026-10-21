# Tasks — review-provenance-local

- [x] 1. Move the fixtures of `scripts/check-review.test.mjs` to the hook's real shape (a `toolu_` id, its PreToolUse line). Write the four failing cases and record them red through `node scripts/test-run.mjs`.
- [x] 2. `scripts/check-review.mjs`: accept a verdict only on a hook-recorded reviewer line, report the ignored lines, and require `blocking === 0` for an APPROVE. Re-seal `factory-lock.json` with its notes kept.
- [x] 3. Record green on the final code, extend `docs/adr/0005-evidence-integrity.md`, and archive this change under `openspec/changes/archive/2026-10-21-review-provenance-local/`.
- [x] 4. Run `node scripts/dod.mjs` and the Factory checks, add the autonomy-log row, run the reviewer, then commit and run `node scripts/pr-evidence.mjs origin/main HEAD`.
