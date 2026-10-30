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
Every round judged all 24 screenshots again from nothing, because any change to the frontend makes the report stale. Seven rounds were run. Rounds one, two, four and six failed some screenshots; rounds three and five passed, but each was followed by a frontend change that made its report stale (below), so only the seventh describes the final tree.
- Rounds one and two: a table scrolled inside its frame and nothing showed that it did; the Raw Materials table was 38 px too wide at 768 px and its total label sat off screen on a phone. A shadow on the edge of any `.table-responsive` with more to scroll to, smaller cell padding below 992 px and a left-aligned total label on a phone fixed those.
- Round four, once the screenshots held every sale state and a low-stock material: a low-stock badge touching the material's name. A margin fixed it.
- After the first pull-request run: the CI runner has no Inter or Segoe UI and its wider fallback font made the Raw Materials table 55 px too wide at 768 px, which a forced wide font reproduces locally. Header labels may now wrap below 992 px, and the layout test also checks the table in a wide font.
- Round six: several judges called the scroll shadow too faint to read as a cue, the dimmed rows of cancelled and returned sales pale, and sale dates broke over three lines on a phone. The shadow is stronger, the dimmed rows darker, the refund caption larger and the date does not wrap.
- The full end-to-end run, which leaves cancelled and returned sales behind, also found the dimmed rows at 3.8:1; axe now checks every sale state (`everySaleState` in `e2e/support/bouquet.ts`).
A judge can differ on another run: the judges' own notes on the final round still call the shadow "subtle" in places and say it can be hard to see at a reduced scale. The failing rounds are recorded here, not in the report, which describes the tree it was made from.


## The e2e report
The `e2e` class of the acceptance-method gate wants a committed artifact with a `status`. Playwright's own JSON report has none and
`test-results/` is not committed, so a small reporter writes `docs/qa/e2e-report.json` when `pnpm run report:e2e` runs the whole
suite. It says `passed` only if the run finished, no test failed and every supported browser passed a test; a run of one browser
is `incomplete`. The gate cannot tell how old the file is, which is the same limit as the recordings and is stated in ADR-0011.
