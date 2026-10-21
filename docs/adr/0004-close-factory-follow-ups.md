# ADR-0004: Close the follow-ups ADR-0001, ADR-0002 and ADR-0003 left open

- **Status:** Accepted
- **Date:** 2026-10-12
- **Deciders:** volodya4u (user), Claude

## Context

Three earlier ADRs named work they did not do:

- ADR-0002: `openspec validate --strict` in CI ("an npm download at run time"), and the dashboard trap — `node scripts/gate-status.mjs`
  rewrites tracked generated files and appends to `trace/ledger.jsonl`.
- ADR-0001 / ADR-0002: a unit test for the `@trace` scanners adapted to find JUnit classes and `frontend/src` specs.
- ADR-0003: archiving the six finished `harden-*` OpenSpec changes.

The owner asked for all four in one pull request.

## Decision

- **`openspec validate --all --strict` runs in the `factory-gates` workflow.** The CLI (`@fission-ai/openspec`) is not a
  repository dependency; the step runs `npx` on one pinned version (1.13.2, published 2026-09-23) with `OPENSPEC_TELEMETRY=0`,
  after `actions/setup-node@v7` (the CLI needs Node 20.19 or newer). The pin is edited by hand; Dependabot does not read it.
  The workflow has `contents: read` and no secrets, so a bad package version cannot reach anything beyond the checkout.
- **`scripts/check-trace-scanners.test.mjs`** runs the real `check-traceability.mjs` and `check-acceptance-methods.mjs` in a
  throwaway project and pins what ADR-0001 adapted: a JUnit `*Test.java` or `*Tests.java` and an Angular spec under
  `frontend/src` count as tests, a comma list of ids and repeated tags are read, a tag in production code, in a helper class,
  in a hidden or `node_modules` directory or in Markdown is not counted, and `FR-10` does not satisfy `FR-1`.
- **The dashboard trap is removed in two parts.** `scripts/gate-status.mjs` snapshots the four files the pre-commit hook owns
  (`GENERATED` in `scripts/hooks-pre-commit.mjs`) before it runs the release variants and restores them byte for byte after,
  through `scripts/generated-files.mjs` (new, unlocked, with `scripts/generated-files.test.mjs`). `trace/ledger.jsonl` is untracked
  and ignored, like `trace/acceptance-contracts.json` in ADR-0003: it is local telemetry that every check appends to and nothing
  validates, and `scripts/ledger-report.mjs` already copes with it being absent. Untracking the reports themselves was not an
  option: the hook stages them and `--check-fresh` compares the Markdown report.
- **The six `harden-*` changes move to `openspec/changes/archive/2026-10-12-harden-*`.** They have no `specs/` deltas (the baseline
  specs already carry the requirements), so there is nothing to merge. Four `tasks.md` files had their last box (the finish flow:
  dod, review, commit, `pr-evidence`) unticked; the slices were merged by pull requests whose `pr-evidence` job was green, and
  `check-traceability.mjs` fails an archived change with an unchecked task, so those four boxes are ticked.
- **The lock is re-sealed** in the same commit (`gate-status.mjs` is hard-locked; the new test matches `scripts/check-*.mjs`, so it
  joins the lock, and the workflow edit is the soft tier).

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| Restore the generated files in `gate-status.mjs` (chosen) | The dashboard leaves the tree as it found it; the hook and `--check-fresh` keep working | One more import in a locked script |
| Untrack all generated files | No snapshot code | The hook stages the reports and `--check-fresh` reads one; breaks both |
| Ask the reader to run `git checkout -- docs/qa trace` | No code | The trap stays |
| `openspec` as a `devDependency` | Version managed by Dependabot | Adds a root `package.json` and lockfile to a repo with none; needs approval |
| `npx @fission-ai/openspec@latest` | Always current | A different tool on every run; a release can turn CI red or run new code |

## Consequences

- A pull request that breaks the OpenSpec format of a spec, or leaves an active change without a delta, fails `factory-gates`.
  Active changes need a `specs/` delta (or `skip_specs: true` in `.openspec.yaml`) from now on, or must be archived.
- `node scripts/check-trajectory.mjs` now lists the six archived slices and warns that each has no `review-findings.json` and no
  `design.md` (ADR-0003 predicted this swap). The review evidence of those slices is the `pr-evidence` job of the pull request that
  merged each one, linked from its row in `docs/autonomy-log.md`; no file was written to satisfy the warning.
  *Update 2026-10-22 (owner's choice):* still no file is written, but `check-trajectory.mjs` now reads that evidence
  itself. A slice without `review-findings.json` counts as reviewed when the pull request that merged it recorded the
  reviewer's APPROVE (0 blocking) on its head tree, by the rule of `scripts/check-review.mjs`
  (`openspec/changes/archive/2026-10-22-trajectory-review-from-log/`).
- `trace/ledger.jsonl` stays on disk in existing clones but is no longer tracked; a fresh clone starts with an empty ledger.
- Still open: the `Slice:` trailer warning of `check-trajectory.mjs` for `harden-frontend-specs`, and the recording-evidence
  warnings, which belong to the factory's Playwright layer this repo does not use.
