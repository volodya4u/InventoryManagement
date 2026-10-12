# Harden frontend specs

## Why
Eight rows of the baseline coverage gaps (`docs/requirements.md` › Coverage gaps) describe frontend behavior that ships
but no Vitest spec asserts: FR-34, FR-55, FR-75, FR-86, FR-146, NFR-19, NFR-21 and NFR-22. Slice H6 of
`docs/mvp-capability-plan.md` pins them with specs. It is test-only: it changes no component, route or style.

## What Changes
- New `frontend/src/app/core/image-file.spec.ts` for the client-side image check (FR-75).
- New `frontend/src/app/app.routes.spec.ts` for the route table, the guarded shell and the default redirects, and for
  `authGuard` (FR-34).
- Delete-confirmation specs in the raw materials and products component specs (FR-55, FR-86, NFR-19).
- Report spec additions: the sale-number link (FR-146) and the UAH display with two decimals and no currency code shown
  (NFR-21, NFR-22; the API side of NFR-22 is not a frontend property and stays open).
- Every new test carries an `@trace <id>` tag so `scripts/check-traceability.mjs` joins it to its requirement.

## Impact
- Affected specs: `app-shell-routing`, `images`, `products`, `raw-materials`, `monthly-sales-report`. Their requirements
  and scenarios are unchanged; only the `> GAP:` notes become "Covered by slice" notes, and the matching rows in
  `docs/requirements.md` are closed in the same pull request. NFR-19, NFR-21 and NFR-22 stay PARTIAL with a narrower gap.
- Affected code: `frontend/src/**/*.spec.ts` only. No production file in the final diff.
- Dependencies: none. No new package and no new import of a package `main` does not already import.
