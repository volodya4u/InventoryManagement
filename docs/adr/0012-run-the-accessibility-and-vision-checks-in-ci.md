# ADR-0012: Run the accessibility and vision checks in CI

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** volodya4u (user), Claude

## Context

ADR-0011 added `scripts/check-a11y.mjs` and `scripts/check-vision.mjs` and their committed reports, `docs/qa/a11y-report.json`
and `docs/qa/vision-report.json`. It also said that nothing in CI ran them: the acceptance-method gate reads each report's own
verdict (`status: passed`, `met: true`), but a frontend change that left a report stale was caught only when someone ran the
scripts. The owner asked for a plan to close that gap and chose the strict variant.

## Decision

- **Two steps in `.github/workflows/factory-gates.yml`,** after "Acceptance artifacts exist":
  `node scripts/check-a11y.mjs --check` and `node scripts/check-vision.mjs`. Both are plain Node with no dependencies; they read the
  committed reports, the screenshots and `frontend/src` (through `git ls-files`, which the existing full checkout provides), so they
  need no browser and no JAR. They run for every pull request, Dependabot's included: those do not touch `frontend/src`.
- **A stale report fails.** The reports carry a hash of the frontend source (line endings normalised, unit specs left out). A change to
  a stylesheet, a template or a component therefore needs, in the same pull request, a fresh axe run (`pnpm run check:a11y`, about a
  minute) and a fresh judging round for the vision report (all 24 screenshots, one judge each). This is the same rule as the traceability
  report ("a stale report cannot be merged"). The alternative, warning on a stale vision report while failing on an incomplete one, was
  not taken: it would let a changed UI merge unjudged, and it needed a change to the locked `check-vision.mjs`.
- **What the vision step proves.** That the report is complete (every page at every width), current, and for the screenshots on disk (a
  hash of each). It does not prove that a judge ran, and the verdicts stay a model's judgement and not deterministic (ADR-0011).
- **The lock is re-sealed** in the same commit: `factory-gates.yml` is in the lock's soft tier (a drift only warns), but its hash is
  recorded, and the note keeps the earlier ones. No gate script changes.

## Consequences

- A frontend change costs more: an axe run and a judging round belong to its pull request. Changes that do not touch `frontend/src`
  (the backend, the docs, `package.json`, the e2e specs) are unaffected.
- A difference between the Windows machine that made the reports and the Linux runner would fail the first run: the source hash
  normalises CRLF and the screenshots are binary, so none is expected, and the pull request that adds the steps shows it before it merges.
- `factory-gates` has a longer step list but stays well inside its 5-minute limit: both steps take well under a second.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| Fail when either report is stale (chosen) | A report cannot describe a different tree; no change to the gate scripts | Every frontend change needs a judging round |
| Fail on stale axe, warn on stale vision | Cheaper UI tweaks | A changed UI can merge unjudged; edits a locked script |
| Leave it to the acceptance-method gate | Nothing to maintain | A stale report keeps passing |
