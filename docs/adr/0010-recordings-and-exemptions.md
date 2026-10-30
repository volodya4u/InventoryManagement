# ADR-0010: Record the browser flows, and list the requirements no browser can show

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** volodya4u (user), Claude

## Context

The release gate G7 runs `check-traceability.mjs --release --strict-tests --strict-recordings`, which fails for every MVP
functional requirement that no recording manifest mentions, and the recordings gate `check-recordings.mjs`, which was never
installed here because the repository had no browser driver. The owner approved Playwright on 2026-10-30 (see the
`playwright-foundation` slice) and chose, for the recordings: record every UI flow, short clips committed under `docs/qa/`, and
list the requirements a browser cannot show one by one, with the automated test that covers each, instead of recording them
or relaxing the gate. Of the 149 requirements, 139 now have a clip; 10 are listed.

## Decision

- **The clips come from the tests.** `pnpm run record:demos` (`scripts/record-demos.mjs`) runs the Playwright specs once in
  Chromium with video on. `e2e/support/recording-reporter.mjs` turns every test with a `// @trace FR-n` tag above it into a
  clip: the video, a still, a short explainer, and a manifest (`docs/qa/demo-recordings/manifest.json`). The tag is the one
  `check-traceability.mjs` already joins to a test, so a clip proves the requirements its test is tagged with, and a clip
  counts as `asserted` only when its test passed. There is no second script of the same flows to drift. **A tag is a claim the
  reviewer checks:** a test carries the id of a requirement only when its assertions exercise that requirement's main behaviour.
  Where the page refuses something before the server can (a write-off larger than the stock), the test also sends the request
  from the page (`e2e/support/page-api.ts`) and asserts the server's own answer, or the requirement is not tagged.
- **`check-recordings.mjs`** is the plugin's reference script, with one fix: a stale report now fails (`--check-fresh` printed
  the failure and exited 0). It checks that each clip's video exists and is at least 10,000 bytes and that its flow passed. A
  missing still is a warning, as in the reference.
- **`check-traceability.mjs` is changed in two ways** (a gate-locked file, approved here):
  - `e2e` joins the directories it scans for `@trace` tags, so the Playwright specs count as tests for a requirement.
  - `docs/qa/recording-exemptions.json` lists requirements that need no clip. An entry counts as covered for
    `--strict-recordings` only while it names a real MVP functional requirement, gives a reason and at least one test, some test
    is tagged with its id, and no manifest also records it (then it is stale). A broken file fails the check; it is never
    ignored. The traceability report shows such a requirement as `exempt`, not as recorded.
- **What may be exempt.** A requirement that neither a page nor a request this suite sends from a page shows: a startup failure
  (FR-18), a startup that changes nothing (FR-19), a database constraint (FR-149), a migration (FR-147, FR-148), a race the suite
  does not stage (FR-32), a value no flow here makes visible (FR-45 rounds to four decimals, the page shows two, and no flow uses a quantity large
  enough to show the difference), and the
  server's checks of an uploaded file, which the page applies first (FR-70, FR-71, FR-72; the suite's page requests send text
  fields, not files, so these could be moved out of the list by extending the helper). Anything a person can do or see on a page
  is recorded; that is what the owner decided.
- **Each browser has its own server.** `playwright.config.ts` starts one JAR per browser project on its own port and database
  (`e2e/support/run-settings.mjs`), so a spec can create `Rose` in every browser. The recording run uses Chromium only.
- **The lock is re-sealed** in the commit that edits `scripts/check-traceability.mjs` and adds `scripts/check-recordings.mjs`,
  keeping the earlier adaptation notes and adding one, on the owner's approval of the plan.

## Consequences

- G7's recording check can pass. G7 still also needs the archived-change check (`bind-loopback`, `playwright-foundation` and
  this slice are archived in their own pull requests after merge) and the manual run and acceptance signature, which no script
  can give.
- A clip shows what the test did, not that a person judged it legible. The vision check that does is the third pull request.
- The exemption list is a place where coverage can quietly shrink. Its entries are in the repository, each needs a reason and a
  covering test, and a requirement that gains a clip makes its entry fail until it is removed. The covering tests are free text:
  the gate checks that some test carries the requirement's tag, not that each name given resolves to a test. A reviewer checks the
  names; the gate could resolve them in a later change.
- The recordings are binary files in the repository (about 28 MB for 59 clips). They are regenerated rarely; a change that
  alters what a clip shows regenerates it in the same pull request.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| Clips from the tests, exemptions listed (chosen) | One script of each flow; the proof is the assertion; exemptions are visible and checked | A gate change; larger repository |
| A separate `record-demos` script with its own clip list (the plugin's shape) | No change to the specs | Two copies of every flow that drift; a clip need not assert what the test asserts |
| Tag every requirement as recorded without a clip | Gate passes | False evidence |
| Re-tag the 10 as another verification class | No exemption file | The class names have no mechanism here, and the rows would then fail `--mode=existence` |
| Keep G7 red for these requirements | Honest | G7 could then never pass |
