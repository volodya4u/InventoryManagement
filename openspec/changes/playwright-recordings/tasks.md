# Tasks — playwright-recordings

- [x] 1. Write `scripts/check-recording-exemptions.test.mjs` and record it red on an assertion through `node scripts/test-run.mjs harness scripts/check-recording-exemptions.test.mjs`; add the exemptions and the `e2e` scan directory to `scripts/check-traceability.mjs`, and record green.
- [x] 2. Add the two new tests to `scripts/e2e-setup.test.mjs` and write `scripts/e2e-recording.test.mjs`, record both red, then add `projectServers`, `recording-manifest.mjs` and the reporter, and record green.
- [x] 3. Write `scripts/check-recordings.test.mjs`, record it red, add `scripts/check-recordings.mjs` from the plugin reference with the freshness fix, and record green.
- [x] 4. Write the Playwright specs for every UI flow, tag each with the requirements it proves, and run them in Chromium (and in Firefox and WebKit before the pull request).
- [x] 5. Run `pnpm run record:demos`, commit `docs/qa/demo-recordings/` and `docs/qa/recordings-report.md`, and list the requirements no page shows in `docs/qa/recording-exemptions.json`.
- [x] 6. Write ADR-0010, update the QA documents, README and current state, re-seal the lock, add the autonomy-log row, run the Factory checks and `node scripts/dod.mjs`, run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
