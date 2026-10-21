# Tasks — review-signed-approval

- [x] 1. Write the failing cases (`scripts/signed-approval.test.mjs` in throwaway repositories with throwaway keys, `scripts/human-approval-workflow.test.mjs`) and record them red through `node scripts/test-run.mjs`.
- [x] 2. `scripts/signed-approval.mjs` (verification, gate, command line), the **Human approval** row in `scripts/pr-evidence.mjs`, `.github/workflows/human-approval.yml`, `scripts/approve-pr.mjs`, `quality/allowed-signers` without a key, and the `CLAUDE.md` rule.
- [x] 3. Record green on the final code. Extend `docs/adr/0005-evidence-integrity.md`, then archive this change under `openspec/changes/archive/2026-10-21-review-signed-approval/`.
- [x] 4. Run `node scripts/dod.mjs` and the Factory checks, then add the autonomy-log row. Run the reviewer and `/security-review` (this is a CI change), then commit and run `node scripts/pr-evidence.mjs origin/main HEAD`.
