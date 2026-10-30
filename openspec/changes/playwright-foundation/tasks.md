# Tasks — playwright-foundation

- [x] 1. Write `scripts/e2e-setup.test.mjs` and record it red on an assertion through `node scripts/test-run.mjs harness scripts/e2e-setup.test.mjs`.
- [x] 2. Add `e2e/support/run-settings.mjs`, `playwright.config.ts`, the CI `e2e` job and the Dependabot wait, and record green.
- [x] 3. Add the root `package.json` with `@playwright/test`, `pnpm-lock.yaml`, `e2e/support/auth.ts` and `e2e/sign-in.spec.ts`; run `pnpm run test:e2e` green in Chromium, Firefox and WebKit.
- [x] 4. Add the Dependabot npm entry, the `.gitignore` lines, the README section and the `docs/current-state.md` update.
- [x] 5. Add the autonomy-log row, run the Factory checks and `node scripts/dod.mjs`, run the reviewer, commit, and run `node scripts/pr-evidence.mjs origin/main HEAD`.
