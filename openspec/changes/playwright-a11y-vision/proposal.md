# Accessibility and vision checks, and the three waivers closed

## Why

Three baseline waivers (NFR-17 `e2e`, NFR-18 `vision-verify`, NFR-20 `a11y`) said "no mechanism here". The owner approved
Playwright and axe, and answered OQ-8 and OQ-15 in chat on 2026-10-30: the browsers are Chromium, Firefox and WebKit, and the
accessibility target is WCAG 2.1 AA with axe in the light and the dark scheme, failing on serious and critical violations.
This is the third of three pull requests (foundation, flows and recordings, **accessibility and vision checks**). It changes
the application's stylesheet only where a check found a real defect.

## What Changes

- **Accessibility gate.** `scripts/check-a11y.mjs` (new gate) runs `@axe-core/playwright` (the one new dependency, approved with
  Playwright) over every route in `frontend/src/app/app.routes.ts`, signed in, in the light and the dark colour scheme, with the
  WCAG 2.1 A and AA rule sets, and writes `docs/qa/a11y-report.json`; `--check` verifies it without a browser (every route in
  both schemes, no serious or critical violation, made from the current frontend source). `e2e/18-accessibility.spec.ts` is
  the same check as a spec, so the CI `e2e` job runs it too.
- **Vision gate.** `scripts/check-vision.mjs` (new gate) screenshots every page at 375, 768 and 1280 px
  (`e2e/19-page-screenshots.spec.ts`, `docs/qa/vision/`), and a fresh `project-factory:vision-judge` judges each one; the verdicts
  are merged into `docs/qa/vision-report.json`. The report says it is an LLM's judgement and not deterministic; the script
  verifies that it is complete, that each verdict belongs to the screenshot on disk, and that the frontend source has not
  changed since.
- **A browser spec for NFR-17** (`e2e/20-browsers.spec.ts`: every page opens without a script or console error, in each browser)
  and **`docs/qa/e2e-report.json`**, written by `pnpm run report:e2e` (`e2e/support/e2e-report-reporter.mjs`): `passed` only for a
  whole run of every supported browser, so the `e2e` class has an artifact the gate can read.
- **Defects the checks found, fixed in the stylesheet:** secondary text, the rose accent and the outline success and warning
  buttons failed the 4.5:1 contrast ratio on seven pages; wide tables scrolled inside their frame with no sign of it, so a clipped
  column looked cut off (a shadow now shows on an edge with more to scroll to); the Raw Materials table was 38 px too wide at
  768 px and its total label sat off screen on a phone.
- **Decisions and waivers:** OQ-8 and OQ-15 answered in `docs/requirements.md` (the OQ-1 path), the NFR-17/18/20 rows rewritten,
  the three waivers set to `Status: closed` with their evidence. ADR-0011; the integrity lock is re-sealed for the two new gate
  scripts.
- Not changed: the backend, the other requirement rows, `dod.mjs`.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given the router, when the routes to check are read, then they are its paths without the redirects | `scripts/check-a11y.test.mjs` › "the routes to check are the paths in the router, without the redirects" |
| 2 | Given every route checked in both schemes with no violation, when the report is verified, then it passes | `scripts/check-a11y.test.mjs` › "a report that covers every route in both schemes with no violation passes" |
| 3 | Given a serious or critical violation, when the report is built and verified, then it fails and names the page | `scripts/check-a11y.test.mjs` › "a serious or critical violation makes the report fail and names the page" |
| 4 | Given a minor or moderate violation, when the report is verified, then it is listed and does not fail | `scripts/check-a11y.test.mjs` › "a minor or moderate violation is listed but does not fail the report" |
| 5 | Given a route or scheme that was not checked, when the report is verified, then it fails | `scripts/check-a11y.test.mjs` › "a route or a scheme that was not checked is a problem" |
| 6 | Given a page where axe ran no rule, when the report is verified, then it proves nothing and fails | `scripts/check-a11y.test.mjs` › "a page where axe ran no rule proves nothing" |
| 7 | Given a report made from other frontend source, when it is verified, then it is stale | `scripts/check-a11y.test.mjs` › "a report made from other frontend source is stale" |
| 8 | Given every shot judged met and readable, when the vision report is verified, then it passes | `scripts/check-vision.test.mjs` › "a report where every shot is judged met and readable passes and says met" |
| 9 | Given a vision report, when it is verified, then it must say it is LLM-judged and not deterministic | `scripts/check-vision.test.mjs` › "the report says it is an LLM's judgement and not deterministic" |
| 10 | Given a shot judged not readable or not met, when the report is verified, then the shot and the note are named | `scripts/check-vision.test.mjs` › "a shot judged not readable or not met is a problem naming the shot and the note" |
| 11 | Given a screenshot that changed or vanished since it was judged, when the report is verified, then it fails | `scripts/check-vision.test.mjs` › "a screenshot that changed or vanished since it was judged is a problem" |
| 12 | Given a vision report made from other frontend source, when it is verified, then it is stale | `scripts/check-vision.test.mjs` › "a report made from other frontend source is stale" |
| 13 | Given the judge's verdicts, when they are merged, then each goes to its shot and an unknown id is refused | `scripts/check-vision.test.mjs` › "verdicts from the judge are merged by shot id, and an unknown id is refused" |
| 14 | Given a whole passing run of every supported browser, when the e2e report is made, then it says passed | `scripts/e2e-report.test.mjs` › "a passing run of every supported browser is passed, with a count per browser" |
| 15 | Given a run of fewer browsers, when the e2e report is made, then it is incomplete, never passed | `scripts/e2e-report.test.mjs` › "a run that did not include every supported browser is incomplete, never passed" |
| 16 | Given a failed test, when the e2e report is made, then it is failed | `scripts/e2e-report.test.mjs` › "one failed test makes the run failed" |

The Playwright specs (`e2e/16-layout.spec.ts`, `e2e/18-accessibility.spec.ts`, `e2e/19-page-screenshots.spec.ts`,
`e2e/20-browsers.spec.ts`) run through `pnpm run test:e2e` and the CI `e2e` job; `test-run.mjs` has no Playwright runner, so
their evidence is those runs, `docs/qa/a11y-report.json`, `docs/qa/vision-report.json` and `docs/qa/e2e-report.json`. The
stylesheet fixes were measured before and after: axe failed on seven pages, a judge failed three screenshots, and the Raw
Materials table was 772 px in a 734 px frame; they were not recorded as red `test-run.mjs` runs.

## Impact

- Affected files: `scripts/{check-a11y,check-vision,e2e-report}.mjs` and their tests, `e2e/**`, `playwright.config.ts`,
  `package.json`, `pnpm-lock.yaml`, `frontend/src/styles.scss`,
  `docs/qa/{a11y-report.json,vision-report.json,vision/**,e2e-report.json}`, `docs/requirements.md`, the three waivers, the QA
  documents, `docs/adr/0011-*.md`, `factory-lock.json`, `docs/autonomy-log.md`, this change folder.
- One new dependency, `@axe-core/playwright` (exact version; it brings `axe-core`). About 3 MB of screenshots are added.
- Rollback: revert the commits; the waivers reopen and the stylesheet returns to its earlier colours.
