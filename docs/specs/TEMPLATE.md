# Spec: <feature name>

<!-- Copy to docs/specs/<feature>.md. Write one when a feature changes the schema, an API and a page together
     (AGENTS.md); a bug fix or a change in one layer needs none. In Claude Code the plan approved in plan mode is
     saved here before any code, and the reviewer subagent gets this path. Keep it to one screen: the code and the
     tests hold the details. Delete these comments. -->

Status: Draft | Approved by <who> on <date>

## Goal

<!-- One or two sentences: who needs what, and why. -->

## Out of scope

- <!-- What this deliberately does not do, so nobody "helpfully" adds it. -->

## Acceptance criteria

<!-- Each criterion becomes at least one test; name it here and keep the name when the test is written.
     Text in "double quotes" is exact UI or API copy: the named test must contain it verbatim.
     scripts/check-specs.mjs checks in CI that the Status is approved, that no <placeholder> is left, that each named
     test exists and that it holds the quoted text, so the spec cannot drift from the code unnoticed. -->

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

## Changed after approval

- <!-- When the code has to differ from the approved spec, change the spec in the same pull request and say here
     what changed, why, and who decided. Delete the section if nothing changed. -->

## Risks and open questions

- <!-- Rounding of money and quantities, existing data, concurrency, anything still undecided. -->

## Verification

- `node scripts/dod.mjs` is green, the reviewer subagent approves, and <any manual check in the running app>.
