# ADR-0011: Check accessibility and layout in a browser, and close the three baseline waivers

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** volodya4u (user), Claude

## Context

Three requirements of the baseline carried waivers that said "no mechanism here": NFR-17 (supported browsers, class `e2e`),
NFR-18 (responsive layout, `vision-verify`) and NFR-20 (accessibility, `a11y`). Each waiver closes when the owner answers its
open question and a mechanism exists. Playwright arrived with ADR-0010. On 2026-10-30, in the plan for this work, the owner
answered OQ-8 (Chromium, Firefox and WebKit, WebKit standing in for Safari) and OQ-15 (WCAG 2.1 AA, axe in the light and the dark
scheme, failing on serious and critical violations), and approved `@axe-core/playwright` with Playwright.

## Decision

- **Accessibility is a gate.** `scripts/check-a11y.mjs` (gate-locked) runs axe over every route of the router, signed in, in both
  colour schemes, and writes `docs/qa/a11y-report.json`; `--check` verifies the committed report: every route in both schemes, no
  serious or critical violation, and made from the current frontend source. The same check runs as `e2e/18-accessibility.spec.ts`
  in the CI `e2e` job. Minor and moderate findings are listed in the report and do not fail it.
- **The dark scheme is an emulated preference.** The application has no dark theme, so the dark pass emulates
  `prefers-color-scheme: dark`; the report and the NFR-20 row say so. Building a dark theme is a product decision and is not made
  here.
- **Layout is judged by a model, and says so.** `scripts/check-vision.mjs` (gate-locked) takes screenshots of every page at 375,
  768 and 1280 px, a fresh `project-factory:vision-judge` judges each one, and the verdicts are `docs/qa/vision-report.json`. The
  report states that it is an LLM's judgement and not deterministic. The script checks completeness, that each verdict is for the
  screenshot on disk (a hash), and freshness against the frontend source; it cannot check that a judge ran, and the report does not
  claim it.
- **The browsers have a spec and a record.** `e2e/20-browsers.spec.ts` opens every page in the browser under test and fails on a
  script or console error; the whole suite runs once per browser. `pnpm run report:e2e` runs everything in all three and writes
  `docs/qa/e2e-report.json`, which says `passed` only for a whole run of every supported browser (`incomplete` otherwise), so the
  `e2e` class has a committed artifact. The gate cannot see how old it is.
- **What the checks found was fixed in the stylesheet,** each class in its own commit: contrast of secondary text, the rose accent
  and the outline success and warning buttons (seven pages); a shadow on the edge of a wide table that has more to scroll to;
  cell padding below 992 px and a left-aligned total label on a phone (Raw Materials). Nothing else in the application changed.
- **The rows and the waivers.** OQ-8 and OQ-15 are `answered` with the owner's words, date and reference, and a test that holds
  each; the NFR-17/18/20 rows say what is checked and how; the three waivers are `Status: closed` with their evidence.
- **The lock is re-sealed** in the commit that adds the two gate scripts, keeping the earlier adaptation notes and adding one, on
  the owner's approval of the plan.

## Consequences

- G6 and G7 no longer fail for these three requirements. G7 still needs the three changes archived (`bind-loopback`,
  `playwright-foundation`, `playwright-recordings` and this one, each in its own pull request after merge), and the manual run and
  the owner's signature on the acceptance report, which no script can give.
- The vision verdicts are not repeatable. A later change to the frontend makes the report stale and every screenshot has to be
  judged again, which costs one model call per screenshot (24).
- Automated accessibility rules find only part of the problems. MT-28 stays as the manual check, and a pass here does not
  replace a screen-reader test.
- The a11y and e2e reports are records of a run on a given tree; the a11y report is tied to the frontend source by a hash, the e2e
  report is not tied to anything and is as old as its last run.
- Nothing in CI runs `check-a11y.mjs --check` or `check-vision.mjs` yet: the acceptance-method gate reads the two reports' own
  verdicts (`status: passed`, `met: true`), but a frontend change that leaves a report stale is caught only when someone runs the
  two scripts. Adding them to `.github/workflows/factory-gates.yml` changes CI, which needs the owner's approval, so it is left as
  a follow-up. The CI `e2e` job does run the axe spec itself in three browsers.
- A finding for the owner (OQ-8): Firefox and Safari show a plain text box for the Monthly Sales month field.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| Axe as a spec and a script, vision by agent (chosen) | Runs in CI and by hand; honest about what is judged | A model call per screenshot; the verdicts vary |
| Pixel diff against a reference | Deterministic | There is no reference design, and a baseline of today's pixels proves nothing about legibility |
| Keep the waivers open | Nothing to maintain | The release gate can never pass |
| Build a dark theme | Meets "light and dark" literally | A product change nobody asked for |
