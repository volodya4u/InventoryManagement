# Design — playwright-a11y-vision

## Axe as a spec and as a script
The check is one spec, `e2e/18-accessibility.spec.ts`, so the CI `e2e` job runs it in three browsers. `scripts/check-a11y.mjs`
runs the same spec in Chromium with `E2E_A11Y_DIR` set, aggregates the per-page results into the report, and verifies it.
`--check` needs no browser, so the gate can verify a committed report. The report is tied to the frontend source by a hash
(line endings normalised, unit specs left out), and the routes come from `app.routes.ts`, so a new page fails the check until it
is covered.

## The dark scheme
The application declares `color-scheme: light` and has no dark theme. The owner asked for axe in the light and the dark scheme,
so the dark pass emulates `prefers-color-scheme: dark`; the report says what that shows (the light theme, checked again). In the
screenshots the dark rendering was byte-identical to the light one for every page, so only the light ones are kept and judged.
If a dark screenshot ever differs it is kept and judged too (`dark` in the report).

## An LLM judges the screenshots
A fresh `project-factory:vision-judge` looks at each screenshot, one agent per screenshot, with the same question: does the
layout fit this width, and is it legible. That is a judgement and not a measurement: the report says so, another run can differ,
and the script cannot know that a judge ran. What it can know it checks: every page at every width has a verdict, each verdict is
for the file on disk (a hash), and nothing in the frontend changed after the judging. A change to the frontend therefore makes
the report stale, and every screenshot is judged again.

## What the judges found
The first round failed three screenshots (Raw Materials at 375 and 768 px, Stock History at 1280 px): a table scrolled inside its
frame and nothing showed that it did. A shadow on the edge of any `.table-responsive` with more to scroll to fixed the cue; the
second round still failed Raw Materials at 375 px (its total label sat off screen) and at 768 px (the table was 38 px too wide for
its frame). Smaller cell padding below 992 px and a left-aligned total label on a phone fixed those, and the third round, with
all 24 screenshots judged again from nothing, passed. The failing rounds are recorded here, not in the report, which describes the
tree it was made from.

## The e2e report
The `e2e` class of the acceptance-method gate wants a committed artifact with a `status`. Playwright's own JSON report has none and
`test-results/` is not committed, so a small reporter writes `docs/qa/e2e-report.json` when `pnpm run report:e2e` runs the whole
suite. It says `passed` only if the run finished, no test failed and every supported browser passed a test; a run of one browser
is `incomplete`. The gate cannot tell how old the file is, which is the same limit as the recordings and is stated in ADR-0011.
