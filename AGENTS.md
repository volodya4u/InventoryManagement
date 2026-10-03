# Project rules — Flower Shop Inventory

Trust level 1 ("Assistant"): propose, then wait for a human decision before changing more
than one file or running anything that is not on the allow-list in `.claude/settings.json`.

## Commands

- `mvn -B -ntp verify` — backend tests; also installs the pinned Node and pnpm into `target/frontend-tooling`
  and builds the Angular app. Same command as CI. Add `-Dskip.frontend=true` for a backend-only run.
- `cd frontend && pnpm exec ng test --watch=false` — frontend unit tests (Vitest). pnpm only — never npm or yarn.
- Dev: `mvn "-Dskip.frontend=true" spring-boot:run` (http://localhost:8081) + `cd frontend && pnpm start`
  (http://localhost:4200). Never start a second instance of either.
- `node scripts/agent-log-summary.mjs` — summary of `.agent-log/actions.jsonl`: what you actually did this session.
- Docs: Dependabot moves versions monthly, so when unsure about an API, look it up — `angular-cli` MCP
  (`list_projects`, then `search_documentation` with that version) for Angular, `context7` for Spring Boot and other libraries.

## Definition of done

- `mvn -B -ntp verify` and the frontend tests are green.
- New backend behaviour has a JUnit test under `src/test/java` in the same package (API flows go to
  `InventoryFlowIntegrationTest`); new frontend logic has a `*.spec.ts` next to the code.
- Evidence, not claims: report the command you ran and its exit code / test count.

## Conventions the build does not enforce

- Feature packages `com.flowershop.inventory.<feature>`; DTOs and requests are Java `record`s.
- Persistence is plain SQL through `JdbcTemplate` in `*Repository` classes — no JPA. Read NUMERIC columns
  with `SqliteDecimals.read`, never `rs.getBigDecimal` directly.
- A schema change goes to `src/main/resources/schema.sql` (new databases) AND an idempotent step in
  `InventorySchemaMigration` (existing local databases) with a case in `InventorySchemaMigrationTest`.
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
