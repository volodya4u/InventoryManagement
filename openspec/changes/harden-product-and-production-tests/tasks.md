# Tasks — harden-product-and-production-tests

- [x] 1. Products: FR-76, FR-79, FR-80, FR-83, FR-85.
- [x] 2. Production: FR-88, FR-93.
- [x] 3. Product stock: FR-97, FR-98, FR-99.
- [x] 4. Show each assertion fail against a deliberate break of the production file it guards through `node scripts/test-run.mjs`, then restore with `git checkout`; the final diff touches no `src/main` file.
- [x] 5. Close the ten rows in `## Coverage gaps` of `docs/requirements.md`; refresh `docs/qa/traceability-report.md`.
- [x] 6. `node scripts/dod.mjs`, reviewer, autonomy-log row, commit, `node scripts/pr-evidence.mjs origin/main HEAD`.
