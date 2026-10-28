# Tasks — process-ratchet

- [x] 1. Write `scripts/check-process-ratchet.test.mjs` and record each case red on an assertion through `node scripts/test-run.mjs` against the unadapted scanner.
- [x] 2. Adapt the scanner (`frontend/src`, `*Test.java`), and record green.
- [x] 3. Run `gate-status.mjs`, `ledger-report.mjs` and the ratchet locally, then earn `quality/process-baseline.json` with `--update`.
- [x] 4. Ignore the local digest files, write ADR-0008 and re-seal `factory-lock.json`.
- [ ] 5. Run the Factory checks and `node scripts/dod.mjs`, add the autonomy-log row, run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
