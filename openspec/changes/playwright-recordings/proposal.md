# Browser flows and recordings: the UI requirements shown, the rest listed

## Why

Release gate G7 fails because no recording manifest names any of the 149 MVP functional requirements. The owner decided
(2026-10-30, after the plan for the Playwright work): record every UI flow as a short clip committed under `docs/qa/`, and list
the requirements a browser cannot show one by one with the automated test that covers each, teaching the locked
`check-traceability.mjs` to accept that list. This is the second of three pull requests (foundation, **flows and recordings**,
accessibility and vision checks). It changes no product behaviour.

## What Changes

- **Specs for every UI flow** in `e2e/` (59 tests across sign-in, session, shell, raw materials and their stock, images,
  products, production, product stock, sales, returns and cancellations, dashboard, stock history, the monthly report, security,
  layout and change password). Each carries `// @trace FR-n` for the requirements whose main behaviour its assertions exercise; where a page refuses something before the server can, the test also sends the request from the page and asserts the server's answer. Data a
  flow needs is set up through the API (`e2e/support/api.ts`); the page is what is driven and asserted.
- **One server and database per browser** (`projectServers` in `e2e/support/run-settings.mjs`), so specs can create data by
  name in each browser.
- **Recordings.** `e2e/support/recording-reporter.mjs` and `recording-manifest.mjs` turn each tagged test of a Chromium run
  with video on (`pnpm run record:demos`, `scripts/record-demos.mjs`) into a clip, a still, an explainer and a manifest in
  `docs/qa/demo-recordings/`; a clip is asserted only if its test passed. The tag above the test is the clip's proof.
- **`scripts/check-recordings.mjs`** (new gate, the plugin reference with one fix: a stale report now fails) and the generated
  `docs/qa/recordings-report.md`.
- **Gate change** to `scripts/check-traceability.mjs`: `e2e` joins the scanned test directories, and
  `docs/qa/recording-exemptions.json` lists requirements that need no clip (10, each with a reason and covering tests). The lock
  is re-sealed. ADR-0010.
- **Documents:** the demo script, acceptance report, risk R-15, current state and README stop saying that no recording exists;
  the CI `e2e` job gets a longer timeout.
- Not changed: the application and its tests, `dod.mjs`, the three NFR waivers (the next pull request), requirement rows.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a requirement listed with a reason and a covering test, when `--strict-recordings` runs, then it counts as covered and the report shows `exempt` | `scripts/check-recording-exemptions.test.mjs` › "an exempted requirement counts as covered under --strict-recordings and shows as exempt" |
| 2 | Given an exemption for a requirement that no test is tagged with, when the check runs, then it fails | `scripts/check-recording-exemptions.test.mjs` › "an exemption for a requirement that no test is tagged with fails" |
| 3 | Given an exemption for a requirement that a manifest records, when the check runs, then it fails as stale | `scripts/check-recording-exemptions.test.mjs` › "an exemption for a requirement that a manifest records fails as stale" |
| 4 | Given an exemption with no reason, no test, or an unknown or Future requirement, when the check runs, then it fails | `scripts/check-recording-exemptions.test.mjs` › "an exemption with no reason, no test, or an unknown or Future requirement fails" |
| 5 | Given an exemptions file that is not valid JSON, when the check runs, then it fails instead of being ignored | `scripts/check-recording-exemptions.test.mjs` › "a malformed exemptions file fails instead of being ignored" |
| 6 | Given an `@trace` tag in a Playwright spec under `e2e/`, when traceability runs, then the requirement is joined to that test | `scripts/check-recording-exemptions.test.mjs` › "an @trace tag in a Playwright spec under e2e/ joins the requirement" |
| 7 | Given the browser projects, when their servers are planned, then each has its own port and database | `scripts/e2e-setup.test.mjs` › "each browser project gets its own server port and database" |
| 8 | Given `E2E_BROWSERS`, when the servers are planned, then only those run, and an unknown name is refused | `scripts/e2e-setup.test.mjs` › "E2E_BROWSERS limits the projects and refuses a name it does not know" |
| 9 | Given a test with a `// @trace` tag directly above it, when its clip is made, then the tag is the clip's proof, and a test without one proves nothing | `scripts/e2e-recording.test.mjs` › "the proof of a clip is the @trace tag directly above its test" |
| 10 | Given tests that passed and failed, when the manifest is built, then only the passed ones are asserted and a clip with no proof is left out | `scripts/e2e-recording.test.mjs` › "the manifest lists every clip with its files and marks a clip asserted only when its test passed" |
| 11 | Given a manifest, when `check-recordings` runs, then a clip is evidence only if its video exists and is large enough and its flow passed (a missing still is a warning) | `scripts/check-recordings.test.mjs` › "a clip whose video and screenshot exist and whose flow passed is evidence" |
| 12 | Given a manifest whose video is missing, too small, or not asserted, when `check-recordings` runs, then it fails | `scripts/check-recordings.test.mjs` › "a manifest whose video is not on disk fails" |
| 13 | Given no recorded clip while product code exists, when `check-recordings` runs, then it is not earned, never a pass | `scripts/check-recordings.test.mjs` › "no recorded clip while product code exists is not earned, never a pass" |
| 14 | Given a committed report that no longer matches, when `check-recordings --check-fresh` runs, then it fails | `scripts/check-recordings.test.mjs` › "--check-fresh fails when the committed report is stale" |

The Playwright specs prove the requirements they are tagged with, in a real browser: `pnpm run test:e2e` (three browsers) and
the CI `e2e` job run them, and `pnpm run record:demos` records them. `test-run.mjs` has no Playwright runner, so their evidence
is those runs and the clips, not agent-log records.

## Impact

- Affected files: `e2e/**`, `playwright.config.ts`, `package.json`, `scripts/{check-traceability,check-recordings,record-demos}.mjs`
  and their tests, `docs/qa/{demo-recordings/**,recordings-report.md,recording-exemptions.json}`, `docs/adr/0010-*.md`,
  `factory-lock.json`, `.github/workflows/ci.yml`, the QA documents named above, `docs/autonomy-log.md`, this change folder.
- About 28 MB of video and stills are added to the repository. The CI `e2e` job gets longer (three browsers, one after another).
- Rollback: revert the commit; the gate returns to its previous behaviour and the lock to its previous seal.
