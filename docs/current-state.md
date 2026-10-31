# Current state

> Handoff note for the next agent session. It is a map, not a source of truth: check every line against the files and
> commands it points to, and update this file when you finish a piece of work.

## Last updated

- **Date:** 2026-10-31 (Europe/Kyiv)
- **Branch when written:** `codex/record-mt27-mt28-manual-check`, on top of `origin/main` at `b8122fe`
- **Active OpenSpec change:** none; the retro slice is archived under `openspec/changes/archive/2026-10-30-resolve-retro-pd4-pd6-pd7-pd8/`
- **Progress:** the MVP behaviour is shipped and described by the 16 baseline specs under `openspec/specs/`, which the
  owner ratified on 2026-10-11 (BC-4 in `docs/requirements.md`). The QA proof pack is drafted under `docs/qa/` and is not
  accepted: MT-27 and MT-29 passed, MT-28 failed because keyboard focus escaped the New Raw Material dialog, and the
  other 26 manual cases have not been run. The owner has not signed `docs/qa/mvp-acceptance-report.md`.
- **Next task (the owner's):** enroll a hardware signing key in `quality/allowed-signers`, sign decisions for the seven
  historical correction dispositions and backfill their `approvalRef` values (risk R-16); until then `correct --check`
  warns about them. The MT-28 keyboard focus defect needs a fix and a rerun before claiming manual accessibility
  acceptance. The owner can decide whether any of the other 26 manual cases are needed before the decision in
  section 6 of the acceptance report. No agent task is open from the retro slice.
- **Claims:**
  - The release gate is red, and the reasons are listed — evidence: `docs/qa/mvp-acceptance-report.md` (section 5) and
    `node scripts/gate-status.mjs`
  - MT-27 and MT-29 passed; MT-28 failed because focus moved behind the New Raw Material dialog, and spoken screen
    reader output was not verified; the other 26 manual cases remain unrun — evidence: `docs/qa/manual-test-plan.md`
    (signed run records)
  - Two non-functional requirements are waived, not passed (NFR-15 performance, NFR-16 availability); the waivers for NFR-17, NFR-18 and NFR-20 are closed — evidence: `docs/qa/waivers/`, ADR-0011
  - Two process gaps cannot be repaired and are waived, not fixed — evidence: `docs/qa/historical-gaps.md`, ADR-0009 and `docs/qa/waivers/2026-10-28-trajectory-*.md`
  - PD-4, PD-6, PD-7 and PD-8 are done: each has red/green harness tests, and the slice is merged and archived. The seven
    legacy approval references are not verified yet and wait for the owner's signed decisions — evidence:
    `scripts/retro-pd*.test.mjs`, risk R-16, `node scripts/correct.mjs --check`
  - Until a key is enrolled, every new `resolved` or `waived` correction fails `correct --check`; the waiver recipe in
    `AGENTS.md` now says such an answer needs the owner's signed `approvalRef` tag — evidence: `scripts/correct.mjs`,
    the Waivers bullet of `AGENTS.md`
  - Risks that need an owner decision are marked **Decision** — evidence: `docs/qa/risk-register.md`

This file has no phase or gate line on purpose. `scripts/gate-status.mjs` compares such a line with the computed gate
frontier, and `scripts/check-process-ratchet.mjs` picks its warning budgets from it. Without one, the ratchet applies
the strictest band (`docs/adr/0008-adapt-process-ratchet.md`). Adding a phase loosens those budgets, so it is the
owner's decision, recorded in an ADR, not a handoff edit.

## Source of truth

1. `AGENTS.md` and `CLAUDE.md`: rules, commands, the Definition of done, boundaries.
2. `docs/requirements.md`: the `FR`, `NFR`, `TC` and `BC` rows, and the open questions `OQ-n` with the owner's decisions.
3. `openspec/project.md` and `openspec/specs/`: the accepted behaviour, one folder per capability.
4. `docs/specs/`: feature specs for changes that touch the schema, an API and a page together.
5. `docs/mvp-capability-plan.md`: the capability list and the order of slices.
6. `docs/adr/`: architecture and process decisions (ADR-0001 to ADR-0009).
7. `docs/qa/`: the proof pack, the generated traceability and trajectory reports, and the waivers.
8. `docs/autonomy-log.md`: the trust level of each piece of agent work and who decided it.

## Factory parts not installed

ADR-0001 installed Project Factory additively, and ADR-0004 closed its follow-ups. Some factory parts are left out on
purpose:

The names below come from the Project Factory plugin's catalogue; ADR-0001 itself names only the Playwright and
JavaScript-app scripts, "parity, automations, `qa-verify`".

- Scripts that need Playwright or a JavaScript app: `qa-verify`, `check-a11y`, `check-visual-fidelity`,
  `check-parity-suite`, `parity-block-loop`. The owner approved Playwright on 2026-10-30 and it is installed (see the last
  bullet). `record-demos` and `check-recordings` now exist (ADR-0010): the clips in `docs/qa/demo-recordings/` are the browser
  specs recorded, and 10 requirements no page can show are listed in `docs/qa/recording-exemptions.json`. `check-a11y` and `check-vision` exist too (ADR-0011): axe over every page in both colour schemes
  (`docs/qa/a11y-report.json`) and a vision judge over every page at 375, 768 and 1280 px (`docs/qa/vision-report.json`, an LLM's
  judgement, not deterministic); the owner answered OQ-8 and OQ-15 and the three baseline waivers are closed.
- `automations/` (drift-watch, dep-audit, ci-triage in the plugin): opt-in and off by default; the folder does not exist
  here.
- The factory's agents and workflows: the plugin provides them, and the repository uses its own `reviewer` agent.
- A lessons block in `AGENTS.md` (`BEGIN-FACTORY-LESSONS` in the plugin): ADR-0001 says any such block needs the
  owner's approval; it also changes `AGENTS.md`, so the evals must be re-run.
- Adapters for Cursor, Copilot and Codex: none are committed.
- A root `package.json` exists only for the browser tests (`@playwright/test`, `@axe-core/playwright`, `playwright.config.ts`, `e2e/`; the CI
  `e2e` job runs them). The gate scripts and the harness under `scripts/` still run with plain `node`, and `dod.mjs`
  does not run the browser tests.

## Validation commands

Run each on its own (see `CLAUDE.md`):

```bash
node scripts/dod.mjs
node scripts/check-traceability.mjs --check-fresh
node scripts/check-acceptance-methods.mjs --mode=existence
node scripts/check-acceptance-methods.mjs --mode=artifact
node scripts/correct.mjs --check
node scripts/check-factory-integrity.mjs
node scripts/pr-evidence.mjs origin/main HEAD
```

`openspec validate --all --strict` runs in the `factory-gates` workflow (ADR-0004), not in `dod.mjs`.

## Environment

- Backend on http://localhost:8081, frontend dev server on http://localhost:4200; start commands are in `AGENTS.md`.
- Local data is the SQLite file `flower-shop-local.db` in the project root; never commit it.
- The first start with a new database needs `APP_ADMIN_INITIAL_PASSWORD` in the environment (see `README.md`). Never
  write a value for it anywhere in the repository.
- `.env*` files are blocked for agents by a hook; ask the owner to change them.

## Gotchas

- The `protect-env` hook blocks a recursive `grep`; use the Grep tool or limit `grep` to named files.
- The `angular-cli` MCP server can time out at session start (recorded in `README.md`, "Static vs dynamic context");
  the Angular 22 facts agents need most are also in `.claude/rules/frontend.md`.
- `correct.mjs --check` reads a pinned baseline commit from git history to tell the seven legacy approvals from new
  ones; a shallow clone lacks it and would fail them instead of warning, so CI jobs that run it need `fetch-depth: 0`.
- `pnpm` only in `frontend/`, never npm or yarn.
- The project path on the owner's machine contains non-ASCII characters (a OneDrive folder); quote it in shell commands.
