# ADR-0002: Wire the factory gates into git hooks and CI

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** volodya4u (user), Claude

## Context

ADR-0001 installed the factory's checks additively and left them unwired: `node scripts/gate-status.mjs` reported G0
as failing, and `check-factory-integrity.mjs` warned that `.githooks/` was missing. The owner chose to finish the
wiring next. The factory's templates assume a Node and TypeScript app (`npx eslint`, `npx tsc --noEmit`, `npm ci`,
Playwright, and a rule that every commit under `src/` carries a trailer), so none of them could be copied as they are.

## Decision

- **Git hooks** in `.githooks/`, activated per clone with `git config core.hooksPath .githooks`.
  - `pre-commit` (`scripts/hooks-pre-commit.mjs`): refuses real env files and obvious secrets, runs the traceability
    and trajectory checks and stages their regenerated reports, and refuses while a correction has no disposition.
    ESLint and `tsc` are dropped: this repo has neither.
  - `commit-msg` (`scripts/hooks-commit-msg.mjs`) is **warn-only**: a commit touching production code (Java under
    `src/main`, Angular files outside `*.spec.ts`) without a `Slice:` or `Refs:` trailer gets a reminder and goes ahead.
    The template would have blocked every Java commit, and AGENTS.md has no trailer convention.
  - Both run with `FACTORY_TELEMETRY=off`, because `trace/ledger.jsonl` is tracked and a ledger line per commit would
    leave the tree dirty.
  - `.gitattributes` pins `.githooks/*` to LF: with `core.autocrlf=true` a CRLF shebang line stops the hooks running.
- **CI** in a new workflow, `.github/workflows/factory-gates.yml`; `ci.yml` is not edited. It checks that the
  traceability report is fresh and the chain intact, that every acceptance method exists, that no correction is open,
  and, as a **hard gate**, factory integrity. The integrity step is skipped for Dependabot pull requests, like
  `pr-evidence`.
- **Workflow files are the soft tier.** Dependabot's monthly `github-actions` bumps edit `.github/workflows/*.yml` and
  `ci.yml` auto-merges them once green; with those files hard-locked, the next push to `main` and every later pull
  request would fail the integrity step until someone re-sealed the lock. So `check-factory-integrity.mjs` now treats
  `.github/workflows/` like the plugin's existing `.claude/workflows/` tier: drift is a visible warning plus a ledger
  event, not a failure. Gate scripts and `.githooks/*` stay hard-locked. `scripts/check-factory-integrity.test.mjs`
  covers both tiers in a throwaway git repository.
- **`.claude/settings.json` is untouched.** The integrity check only warns when the file has no `hooks` key, and it has
  one. The factory's one Claude hook is an ESLint PostToolUse hook that does not apply here.
- `factory-lock.json` is re-sealed in the same commit, so `.githooks/*` and the new workflow are locked and nothing
  reads as drift.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| Adapted hooks and a separate workflow (chosen) | Nothing in `ci.yml` or `settings.json` changes; the hooks do work that exists in this repo | Two workflow files; hooks reach a clone only after `core.hooksPath` is set |
| The templates as shipped | No adaptation to maintain | Fail on `npx eslint`/`tsc`; block every Java commit; `npm ci` has no `package.json` to read |
| Add the steps to `ci.yml` | One workflow | Edits a locked, guarded file and needs the lock re-sealed for every later tweak |
| Integrity advisory or local-only | No trailer cost | Tampering with a gate script would not fail a pull request |
| Workflows hard-locked | Strongest protection for CI files | Fails `main` after every Dependabot actions bump until the lock is re-sealed by hand |
| Dependabot commits count as approved | Workflows stay hard-locked | A commit author name can be forged, so the guarantee is weaker than it looks |

## Consequences

- G0 in `gate-status` can pass: it needs `scripts/check-traceability.mjs` and `.githooks/`.
- A later edit to a hard-locked file (the factory scripts, this repo's own `scripts/check-*.mjs`, `.githooks/*`) needs a
  `Refs: PD-n` trailer on the commit, or the lock re-sealed in that commit, or `factory-gates` fails. Editing a workflow
  only warns, so review the warning in the job log.
- `scripts/hooks-pre-commit.mjs` and `scripts/hooks-commit-msg.mjs` are not locked: the lock matches
  `scripts/check-*.mjs`, `qa-verify`, `gate-status`, `.githooks/*` and the workflows. The thin shell wrappers are
  locked; the hook logic (the secret scan, the trailer reminder) is protected by review and `pr-evidence`, not by the lock.
- Other clones and worktrees created by fresh checkouts must run `git config core.hooksPath .githooks`; CI catches the
  same things regardless.
- The secret scan skips `.agent-log/`: the log records command text and every commit stages it, so it would only ever
  flag itself. A real secret typed into a command would reach the log; that is outside this ADR.
- `node scripts/gate-status.mjs` runs the release and artifact variants of the checks, which rewrite tracked generated
  files (`trace/acceptance-contracts.json` flips to artifact mode, `docs/qa/traceability-report.md` and `trace/*.json`
  change, and a line is appended to `trace/ledger.jsonl`). Discard that with `git checkout -- docs/qa trace` before
  committing; the pre-commit hook regenerates the two reports it owns in their normal form. Untracking those generated
  files would remove the trap and is a possible follow-up. *Update 2026-10-12 (ADR-0004): `gate-status.mjs` now restores them, and
  `trace/ledger.jsonl` is untracked.*
- Not wired, as follow-ups: `npx openspec validate --strict` in CI (an npm download at run time), and a unit test for the
  adapted `@trace` scanners from ADR-0001. *Update 2026-10-12 (ADR-0004): both are done.*
