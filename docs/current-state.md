# Current state

> Handoff note for the next agent session. It is a map, not a source of truth: check every line against the files and
> commands it points to, and update this file when you finish a piece of work.

## Last updated

- **Date:** 2026-10-28 (Europe/Kyiv)
- **Branch when written:** `claude/qa-proof-pack-followup`, on top of the merge of [#134](https://github.com/volodya4u/InventoryManagement/pull/134) (the QA proof pack); it adds this file and aligns the proof pack with what the pages show
- **Active OpenSpec change:** none; `openspec/changes/` holds only `archive/`
- **Progress:** the MVP behaviour is shipped and described by the 16 baseline specs under `openspec/specs/`, which the
  owner ratified on 2026-10-11 (BC-4 in `docs/requirements.md`). The QA proof pack is drafted under `docs/qa/` and is not
  accepted: no manual case has been run and the owner has not signed `docs/qa/mvp-acceptance-report.md`.
- **Next task:** for the owner, run `docs/qa/manual-test-plan.md`, answer the open questions OQ-3 to OQ-16 in
  `docs/requirements.md`, and decide in section 6 of the acceptance report. For an agent, nothing is queued; take new
  work only from the owner, through the `test-first-loop` skill.
- **Claims:**
  - The release gate is red, and the reasons are listed — evidence: `docs/qa/mvp-acceptance-report.md` (section 5) and
    `node scripts/gate-status.mjs`
  - Five non-functional requirements are waived, not passed — evidence: `docs/qa/waivers/`
  - Two process gaps stay open on purpose — evidence: `docs/qa/historical-gaps.md`
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
6. `docs/adr/`: architecture and process decisions (ADR-0001 to ADR-0008).
7. `docs/qa/`: the proof pack, the generated traceability and trajectory reports, and the waivers.
8. `docs/autonomy-log.md`: the trust level of each piece of agent work and who decided it.

## Factory parts not installed

ADR-0001 installed Project Factory additively, and ADR-0004 closed its follow-ups. Some factory parts are left out on
purpose:

The names below come from the Project Factory plugin's catalogue; ADR-0001 itself names only the Playwright and
JavaScript-app scripts, "parity, automations, `qa-verify`".

- Scripts that need Playwright or a JavaScript app: `qa-verify`, `record-demos`, `check-recordings`, `check-a11y`,
  `check-visual-fidelity`, `check-parity-suite`, `parity-block-loop`. A browser automation tool is a new dependency
  and needs approval; until then the recording column of the traceability report stays empty.
- `automations/` (drift-watch, dep-audit, ci-triage in the plugin): opt-in and off by default; the folder does not exist
  here.
- The factory's agents and workflows: the plugin provides them, and the repository uses its own `reviewer` agent.
- A lessons block in `AGENTS.md` (`BEGIN-FACTORY-LESSONS` in the plugin): ADR-0001 says any such block needs the
  owner's approval; it also changes `AGENTS.md`, so the evals must be re-run.
- Adapters for Cursor, Copilot and Codex: none are committed.
- A root `package.json`: none; the Node scripts run with plain `node`.

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
- `pnpm` only in `frontend/`, never npm or yarn.
- The project path on the owner's machine contains non-ASCII characters (a OneDrive folder); quote it in shell commands.
