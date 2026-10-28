# ADR-0001: Adopt the existing Spring Boot + Angular stack under Project Factory

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** volodya4u (user), Claude (onboarding)

## Context

Flower Shop Inventory is a working local inventory and sales system. It was onboarded to Project Factory
(`/project-factory:onboard`) after it already had its own agent harness: `AGENTS.md` rules, hooks that log every tool
call, a `reviewer` subagent, the `test-first-loop` skill, `scripts/dod.mjs`, a `pr-evidence` CI job, evals and
`docs/specs/` for feature specs. The factory's reference scripts assume a Node app with a root `package.json`,
`openspec/`, Playwright and ESLint, none of which this repository has at its root.

Detected stack (read from `pom.xml`, `frontend/package.json`, `.github/workflows/ci.yml`):

| Layer | What is there |
| --- | --- |
| Backend | Spring Boot 4.1.1 parent, Java 21, `spring-boot-starter-web/security/jdbc/validation` |
| Persistence | SQLite via `sqlite-jdbc`, plain SQL through `JdbcTemplate` (no JPA); `schema.sql` plus idempotent `InventorySchemaMigration` |
| Frontend | Angular 22, Bootstrap 5, RxJS 7.8, TypeScript 6, pnpm 11.9, Node v24.15 pinned in `pom.xml` |
| Build | Maven; `frontend-maven-plugin` installs Node and pnpm and builds the Angular app inside `mvn verify` |
| Tests | JUnit 5 + Spring Boot test (`src/test/java`, 10 classes); Vitest + jsdom (`frontend/src/**/*.spec.ts`, 14 specs) |
| CI | GitHub Actions: `build-and-test`, `pr-evidence`, `dependabot-auto-merge` |
| Agent harness | `.claude/` hooks, `reviewer` agent, `test-first-loop` skill, `scripts/*.mjs`, `docs/autonomy-log.md` |

## Decision

We adopt what is there. The stack is not migrated, and the factory adapts to it rather than the reverse.

- The repo's own Definition of done (`mvn -B -ntp verify`, frontend tests, `prettier --check`) stays the gate for code.
- The factory is installed **additively**: new files only (check scripts, `quality/`, `retro/`, `docs/adr/`,
  `docs/qa/waivers/`, requirements and baseline specs). Existing config is not edited in this step: `.claude/settings.json`,
  `.github/workflows/ci.yml`, `.mcp.json`, `AGENTS.md`, `.gitignore`, `pom.xml`, `frontend/package.json` and git hooks.
  Wiring any of those is a separate, human-approved change.
- No factory agents, workflows or tool adapters (`.cursor`, Copilot, Codex) are copied. The plugin provides its
  agents natively, and the repo already has its own `reviewer` and `.codex/`.
  *Correction 2026-10-28:* no `.codex/` was ever committed to this repository (`git log --all -- .codex` is empty), so
  the repo has no Codex adapter, not one of its own. No adapter is added; `docs/current-state.md` lists what is not
  installed.
- The copied check scripts are pure Node but were written for a JS app, so two were adapted to this layout: `check-traceability.mjs` and
  `check-acceptance-methods.mjs` now also scan `frontend/src` and count `*Test.java` / `*Tests.java` as tests when they look for
  `@trace <id>` tags (without that, no JUnit or Angular test could ever be traced). `quality/telemetry.config.json` declares
  `scripts/dod.mjs` as the `local-verifiable` mechanism; that is a weak existence check, the real proof is the tag join in artifact mode.
- `check-coverage-ratchet.mjs` and `check-eval-ratchet.mjs` are installed because `gate-status` calls them, but they read JS coverage and
  eval artifacts this repo does not produce, so they report NOT-EARNED here. That is the honest state, not a defect. A Java coverage
  tool would be a new dependency and needs approval.
- Factory scripts that assume a Playwright or JS-app stack (`record-demos`, `check-a11y`, `check-recordings`,
  `check-visual-fidelity`, parity, automations, `qa-verify`) are not installed.

## Alternatives considered

| Option | Pros | Cons |
| --- | --- | --- |
| Additive baseline only (chosen) | No existing config touched; reversible by deleting new files; keeps the working harness | Factory gates are not wired into CI or hooks yet; two spec locations until reconciled |
| Full merge | One uniform loop, CI-enforced | Edits to guarded files; second hook layer next to the commit-time log fold; the `AGENTS.md` change forces an evals re-run |
| `--no-reverse` (loop only) | Fastest | Legacy behavior stays outside the spec/trace chain |
| Migrate to the factory's default stack | Matches the reference scripts | Rewrites a working product; no user value |

## Consequences

- Baseline requirements and specs describe current behavior, and every inferred row is an assumption until the user
  signs off.
- `docs/specs/` (repo convention, enforced by `scripts/check-specs.mjs`) and `openspec/` (factory convention) coexist.
  New feature specs keep following `docs/specs/TEMPLATE.md` until the user chooses one.
- The factory's gate dashboard (`node scripts/gate-status.mjs`) will show NOT-EARNED / missing for checks that are not
  installed or have no evidence. That is the intended honest state, not a defect.
- Follow-up that needs approval: wiring factory checks into CI and hooks, and any `AGENTS.md` lesson block.
