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
  `scripts/check-specs.mjs`). It stays in force for new features until the user decides how the two merge.

## Rules

- Existing behavior is the baseline; changing it is a gated slice approved by the user, never a side effect of onboarding.
- Definition of done is in `AGENTS.md` (`mvn -B -ntp verify`, frontend tests, `prettier --check`, `node scripts/dod.mjs`).
