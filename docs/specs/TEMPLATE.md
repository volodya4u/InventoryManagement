# Spec: <feature name>

<!-- Copy to docs/specs/<feature>.md. Write one when a feature changes the schema, an API and a page together
     (AGENTS.md); a bug fix or a change in one layer needs none. In Claude Code the plan approved in plan mode is
     saved here before any code, and the reviewer subagent gets this path. Keep it to one screen: the code and the
     tests hold the details. Delete these comments. -->

Status: Draft | Approved by <who> on <date> | Done in <PR link>

## Goal

<!-- One or two sentences: who needs what, and why. -->

## Out of scope

- <!-- What this deliberately does not do, so nobody "helpfully" adds it. -->

## Acceptance criteria

<!-- Each criterion becomes at least one test; name it here and keep the name when the test is written. -->

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given …, when …, then … | `InventoryFlowIntegrationTest` › `…` |
| 2 | Given …, when …, then … | `frontend/src/app/…/….spec.ts` › "…" |

## Changes

- **Schema**: tables and columns in `schema.sql`, the idempotent step in `InventorySchemaMigration` and its case in
  `InventorySchemaMigrationTest`, or "none".
- **API**: method, path, request and response records, error statuses.
- **UI**: page, route (`app.routes.ts`, `SpaController` and its forwarding test), dialogs.
- **Boundaries**: anything on the "Ask before" list in `AGENTS.md`; each needs a human yes.

## Risks and open questions

- <!-- Rounding of money and quantities, existing data, concurrency, anything still undecided. -->

## Verification

- `node scripts/dod.mjs` is green, the reviewer subagent approves, and <any manual check in the running app>.
