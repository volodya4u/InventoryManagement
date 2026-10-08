# Project rules — Flower Shop Inventory

Trust level 1 ("Assistant"): propose, then wait for a human decision before changing more
than one file or running anything that is not on the allow-list in `.claude/settings.json`.

## Commands

- `mvn -B -ntp verify` — backend tests; also installs the pinned Node and pnpm into `target/frontend-tooling`
  and builds the Angular app. Same command as CI. Add `-Dskip.frontend=true` for a backend-only run.
- `cd frontend && pnpm exec ng test --watch=false` — frontend unit tests (Vitest). pnpm only — never npm or yarn.
- Dev: `mvn "-Dskip.frontend=true" spring-boot:run` (http://localhost:8081) + `cd frontend && pnpm start`
  (http://localhost:4200). Never start a second instance of either.
- `node scripts/dod.mjs` — the whole Definition of done in CI order; prints a Markdown evidence table. The
  `test-first-loop` skill drives a change from a failing test to this table and a review.
- `node scripts/agent-log-summary.mjs` — summary of `.agent-log/actions.jsonl`: what you actually did this session.
- Docs: Dependabot moves versions monthly, so look an API up for the version in `pom.xml` / `frontend/package.json`
  when the change imports a third-party package the code does not use yet, touches code that calls a library a
  Dependabot update has just moved, or changes the build or its config — `angular-cli` MCP (`list_projects`, then
  `search_documentation`) for `@angular/*`, `context7` (`query-docs`) for Spring Boot and other libraries. The
  **Docs lookup** gate of `scripts/pr-evidence.mjs` fails a branch that adds such an import without a recorded lookup.

## Definition of done

- `mvn -B -ntp verify`, the frontend tests and `pnpm exec prettier --check .` (in `frontend/`) are green.
- New backend behaviour has a JUnit test under `src/test/java` in the same package (API flows go to
  `InventoryFlowIntegrationTest`); new frontend logic has a `*.spec.ts` next to the code.
- Evidence is the tools' record, not typed text: `node scripts/dod.mjs` and `node scripts/test-run.mjs` (the loop's red
  and green runs) record their results in the agent log, a hook records the reviewer's verdict, and the `pr-evidence`
  CI job checks them against the pull request's head commit and reports them (`scripts/pr-evidence.mjs`).
- Changing `.claude/agents/reviewer.md`, a skill under `.agents/skills/`, this file, or the model: run the matching
  evals (`evals/README.md`) and paste the scores. CI only checks the suite is present (`scripts/check-evals.mjs`).
- Before a PR, a fresh-context, read-only reviewer checks the diff (Claude Code: the `reviewer` subagent); fix or
  answer every blocking finding. Dependabot updates merged by the `dependabot-auto-merge` CI job skip it (CI is their
  checker); the ones that job leaves open are reviewed like any other change, and a human merges them.

## Conventions the build does not enforce

- Feature packages `com.flowershop.inventory.<feature>`; DTOs and requests are Java `record`s.
- Persistence is plain SQL through `JdbcTemplate` in `*Repository` classes — no JPA. Read NUMERIC columns
  with `SqliteDecimals.read`, never `rs.getBigDecimal` directly.
- A schema change goes to `src/main/resources/schema.sql` (new databases) AND an idempotent step in
  `InventorySchemaMigration` (existing local databases) with a case in `InventorySchemaMigrationTest`.
- A feature that changes the schema, an API and a page together starts with `docs/specs/<feature>.md` from
  `docs/specs/TEMPLATE.md`, approved by a human; each acceptance criterion names its test, and text in "double quotes"
  is exact copy that the test holds verbatim (`scripts/check-specs.mjs` checks it in CI). When the code has to differ,
  change the spec in the same pull request and say so under "Changed after approval".
- Frontend: Prettier settings in `frontend/.prettierrc` (100 columns, single quotes).
- English UI copy, code, comments and commit messages. Commit subject: one short imperative sentence
  ("Prevent changing a raw material's unit once quantities use it"), one logical change per commit.

## Boundaries

- Ask before: adding a dependency, editing `pom.xml`, `frontend/package.json`, `application*.yml`,
  `SecurityConfig` or `auth/`, CI workflows, `.claude/settings.json`, `.mcp.json`.
- Never: touch `.env*` (a hook blocks it anyway), write a real password (`APP_ADMIN_INITIAL_PASSWORD`)
  anywhere in the repo, commit `*.db` files, delete tests to get green, `git push --force`, `rm -rf`.

<!-- Maintainers: keep this file under ~50 lines. Add a rule only after the agent gets something wrong
     twice. No repo overview, no file map, no API docs — the README covers the domain. -->
