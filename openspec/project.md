# Project: Flower Shop Inventory

Local inventory and sales system for a flower shop. See `docs/adr/0001-adopt-existing-stack.md` for the stack and
for why the factory is installed additively.

## Stack

Spring Boot 4.1.1 (Java 21) + SQLite through `JdbcTemplate`; Angular 22 frontend (pnpm, Vitest). Backend tests are
JUnit 5 under `src/test/java`; frontend tests are `*.spec.ts` next to the code.

## Layout

- `specs/` — baseline capability specs reverse-engineered from the shipped code (already implemented; the code and
  its tests are the proof). Every requirement cites the FR ids in `docs/requirements.md`.
- `changes/` — one folder per new slice (proposal, design, tasks). New work only.
- `docs/specs/` is the repo's own per-feature spec convention (`docs/specs/TEMPLATE.md`, checked by
  `scripts/check-specs.mjs`). The user decided on 2026-10-11 (see `AGENTS.md`, "Project Factory"): a feature that changes the schema, an API and a page together uses `docs/specs/`; anything smaller uses `changes/` here.

## Rules

- Existing behavior is the baseline; changing it is a gated slice approved by the user, never a side effect of onboarding.
- Definition of done is in `AGENTS.md` (`mvn -B -ntp verify`, frontend tests, `prettier --check`, `node scripts/dod.mjs`).

## Owner decisions (the OQ-1 path)

An open question (`OQ-n` in `docs/requirements.md`) is a question for the owner, never a defect to fix. It stays
`open`, with its decision cells empty, until the owner answers. A recommended default is only a suggestion. When the
owner answers:

1. Record the answer in the question's row. Set Status to `answered`, or to `ratified` for "use the default". Put the
   owner's words in **Owner-approved intent**, kept apart from **Observed behavior**, and fill in the Decision owner, the
   Date and the Reference (the PR or chat the answer came from).
2. Make the requirement say it. Update the FR/NFR row and the baseline spec under `specs/` that cites it. If the
   behaviour changes, do it through a slice the owner approved (`changes/<slice>/`).
3. Hold it with a regression test that carries `// @trace <the requirement>` and name that test in the row's Tests cell.

`scripts/decisions.mjs` checks the table, and `scripts/decisions.test.mjs` runs it in CI. OQ-1, the stored selling price
(#80), and OQ-2, the dashboard sales count (#81), are the two answered so far.
