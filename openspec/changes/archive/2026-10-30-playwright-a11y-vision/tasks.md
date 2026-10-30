# Tasks — playwright-a11y-vision

- [x] 1. Write `scripts/check-a11y.test.mjs`, record it red on an assertion through `node scripts/test-run.mjs harness scripts/check-a11y.test.mjs`, add `scripts/check-a11y.mjs`, and record green.
- [x] 2. Add `@axe-core/playwright` and `e2e/18-accessibility.spec.ts`; run axe, and fix each class of finding in the stylesheet in its own commit (muted text, rose accent, outline buttons).
- [x] 3. Write `scripts/check-vision.test.mjs`, record it red, add `scripts/check-vision.mjs` and `e2e/19-page-screenshots.spec.ts`, and record green.
- [x] 4. Capture the screenshots, have a fresh vision-judge judge each one, fix what it finds (the scroll shadow, the Raw Materials table and total row), capture again, judge all again, and merge the verdicts into `docs/qa/vision-report.json`.
- [x] 5. Write `scripts/e2e-report.test.mjs`, record it red, add `e2e/support/e2e-summary.mjs`, the reporter and `pnpm run report:e2e`, record green, and run the whole suite in every browser.
- [x] 6. Add `e2e/20-browsers.spec.ts`; answer OQ-8 and OQ-15 in `docs/requirements.md`, rewrite the NFR-17/18/20 rows, and close the three waivers.
- [x] 7. Write ADR-0011, update the QA documents and current state, re-seal the lock, add the autonomy-log row, run the Factory checks and `node scripts/dod.mjs`, run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
