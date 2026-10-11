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
- Docs: Dependabot moves versions monthly, so look an API up before the first import of a package nothing on `main`
  imports yet (a Java package, or an npm module or entry point such as `@angular/common/http`) — `angular-cli` MCP
  (`list_projects`, then `search_documentation` with that version) for Angular, `context7` (`resolve-library-id`,
  then `query-docs`) for Spring Boot and other libraries. The `pr-evidence` **Docs lookup** gate fails a branch that
  adds such an import without a recorded lookup. When unsure about any other API, look it up too.

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

## Project Factory

Spec and evidence gates added by the onboarding (`docs/adr/0001`–`0003`). `.githooks/` runs the cheap ones on every
commit (once per clone: `git config core.hooksPath .githooks`); `.github/workflows/factory-gates.yml` fails a pull request
on the checks listed next. `node scripts/dod.mjs` already runs `check-traceability.mjs` and `check-trajectory.mjs` as
the generators of the two reports (they rewrite `docs/qa/traceability-report.md`, `docs/qa/trajectory-report.md` and
`trace/*.json`; commit them), but not the rest, so before the review also run, each on its own,
`node scripts/check-traceability.mjs --check-fresh` (what CI compares),
`node scripts/check-acceptance-methods.mjs --mode=existence`, the same with `--mode=artifact`,
`node scripts/correct.mjs --check` and `node scripts/check-factory-integrity.mjs`. `node scripts/gate-status.mjs`
rewrites tracked generated files; undo that with `git checkout -- docs/qa/traceability-report.md
docs/qa/trajectory-report.md trace`, not the whole of `docs/qa` (the waivers are hand-written).

- Requirements: `docs/requirements.md` — ids `FR-n`, `NFR-n`, `TC-n`, `BC-n`, each FR/NFR row with its evidence and a
  verification class. A row with no class fails `--mode=existence`; `local-verifiable` is the only class with a
  mechanism here (a class such as `e2e` or `pixel-diff` fails it). Open questions `OQ-n`
  are questions for the owner, not defects: never "fix" what one describes, and record the owner's answer in its row.
- Baseline specs: `openspec/specs/<capability>/` describe the shipped behavior, and each requirement cites its FR ids;
  `openspec/project.md` has the layout and rules. Existing behavior changes only through a slice the user approved.
- Spec track for new work: a feature that changes the schema, an API and a page together gets
  `docs/specs/<feature>.md` (see Conventions). Anything smaller — a behavior change inside one capability, or a
  test-hardening slice — gets `openspec/changes/<slice>/` (`proposal.md`, `tasks.md`, and `design.md` before it is archived) and edits the baseline
  spec it changes. The user chose this rule on 2026-10-11. Both tracks also need the Factory chain: a new MVP FR row in
  `docs/requirements.md`, its id cited in a spec under `openspec/specs/` (or a `spec.md` in the active change), and
  its id in `docs/mvp-capability-plan.md`; a `docs/specs/` file alone does not count, and a missing citation fails
  `check-traceability.mjs`. An archived change with an unticked task fails it too.
- Evidence: a test that proves a requirement carries `// @trace FR-12` (comma-separated ids allowed) above it, in a file
  under `src/test/java` or `frontend/src` named `*Test.java`, `*Tests.java`, `*.spec.ts` or `*.test.ts` (any other name
  is not found). `--mode=artifact` fails a requirement with no tagged test and no open waiver, so a new requirement row
  ships with its tagged test in the same pull request.
- Waivers: a requirement that cannot have a test gets `docs/qa/waivers/<date>-<slug>.md` with `Status: open`, the
  reason, the scope, what closes it and who approved it, and it must name the requirement id(s) it waives (it suppresses
  every id written in it). It shows as WAIVED, never as passed. Then run
  `node scripts/correct.mjs --detect`, which writes the correction to `retro/corrections/`; no commit passes while its
  `disposition` is empty. Ask the user, then record their answer as `{status: resolved|waived|invalid, by, ts, note}`;
  never invent it. Set `Status: closed` when the evidence exists (the correction stays). A correction from the user,
  e.g. "that is wrong", is recorded with `node scripts/correct.mjs "<utterance>"`.
- Integrity lock: `factory-lock.json` hashes the gate files (`scripts/check-*.mjs`, `scripts/gate-status.mjs`,
  `.githooks/*`). Editing one fails `check-factory-integrity.mjs` unless a commit that touches it carries a
  `Refs: PD-n` trailer (an approved gate change, ADR-0002) or the lock is re-sealed in the commit
  (`node scripts/check-factory-integrity.mjs --init-lock`); get the user's approval for either first. Workflow files and
  `quality/*` only warn. The hook logic in `scripts/hooks-*.mjs` is not locked: change it only with a review.
- Hooks: `pre-commit` refuses env files and obvious secrets, regenerates and stages the two reports with their
  `trace/*.json` (ADR-0003; never hand-edit them; a failing generator, such as an uncited FR, refuses the commit), and runs `correct.mjs --check`. `commit-msg` only reminds, and does
  not block, when a commit touches production code without a `Slice: <name>` or `Refs: FR-n` (also `BUG-n`) trailer on
  its own line.

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
