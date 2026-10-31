# Keep keyboard focus inside modal dialogs

## Why

MT-28 found that opening New Raw Material leaves focus on its opener. Tab then reaches Receive Stock behind the dialog. The Raw Materials, Products and Sales pages use the same custom modal structure, so keyboard users need one consistent focus rule for all of them. The owner approved this fix in chat on 2026-10-31.

## What Changes

- Add a shared frontend directive to focus a dialog control on open, wrap Tab and Shift+Tab inside it, and return focus to the opener on close.
- Apply it to every Raw Materials, Products and Sales modal, including stock, production, return and cancellation dialogs.
- Add FR-150 and cite it in the app-shell-routing baseline and capability plan; keep MT-28's failed run as historical evidence and rerun it after the fix is running.

## Acceptance criteria

| # | Given / When / Then | Test | Browser coverage |
| - | ------------------- | ---- | ---------------- |
| 1 | Given New Raw Material is opened from its keyboard control, when it appears, Tab and Shift+Tab stay inside and wrap at the ends; when it closes, focus returns to the opener | `frontend/src/app/raw-materials/raw-materials.component.spec.ts` › "keeps dialog focus inside and returns it to the opener" | `e2e/18-accessibility.spec.ts` › "every catalog and sale dialog keeps keyboard focus inside and restores it on close" exercises every dialog path and full return and cancellation |

## Impact

- Affected: one shared directive and spec, the three feature components and templates, frontend component specs, `docs/requirements.md`, `docs/mvp-capability-plan.md`, `openspec/specs/app-shell-routing/spec.md`, `docs/autonomy-log.md`, QA handoff after a rerun.
- No database, API, dependency or configuration change. Rollback is a git revert.
