# Tasks — harden-frontend-specs

- [x] 1. `core/image-file.spec.ts`: FR-75 (extension, MIME, size limit, exact messages, no file).
- [x] 2. `app.routes.spec.ts`: FR-34 (route table behind `authGuard`, `/` and unknown paths redirect to `/dashboard`, the guard sends an unauthenticated user to `/login`).
- [x] 3. `raw-materials.component.spec.ts`: FR-55, NFR-19 (confirm declined sends nothing, confirmed deletes and removes the row).
- [x] 4. `products.component.spec.ts`: FR-86, NFR-19 (same).
- [x] 5. `monthly-sales-report.component.spec.ts`: FR-146, NFR-21, NFR-22.
- [x] 6. Show each new spec fail against a deliberately broken production input through `node scripts/test-run.mjs`, then revert; the final diff touches no production file.
- [x] 7. Close five rows and narrow NFR-19, NFR-21 and NFR-22 in `## Coverage gaps` of `docs/requirements.md`; refresh `docs/qa/traceability-report.md` (`node scripts/check-traceability.mjs`). Keep `trace/acceptance-contracts.json` an existence-mode record: do not leave artifact-mode output in the tree.
- [ ] 8. `node scripts/dod.mjs`, reviewer, autonomy-log row, commit, `node scripts/pr-evidence.mjs origin/main HEAD`.
