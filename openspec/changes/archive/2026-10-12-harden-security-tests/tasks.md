# Tasks — harden-security-tests

- [x] 1. Docs lookup for `@LocalServerPort` and `WebEnvironment.RANDOM_PORT` (Spring Boot 4.1, context7).
- [x] 2. `InventoryFlowIntegrationTest`: FR-2, FR-3, FR-4, FR-6, FR-8, FR-12, FR-13, NFR-1, NFR-3, NFR-5, NFR-6, NFR-7, NFR-9, NFR-10, NFR-11.
- [x] 3. `config/SecurityConfigTest`: NFR-2.
- [x] 4. `auth/LocalAdminInitializerTest`: NFR-1 (bootstrap).
- [x] 5. `auth/SessionCookieHttpTest`: NFR-4.
- [x] 6. Show each test fail against a deliberately broken production file through `node scripts/test-run.mjs`, then restore with `git checkout`; the final diff touches no `src/main` file.
- [x] 7. Close the seventeen rows in `## Coverage gaps` of `docs/requirements.md`; refresh `docs/qa/traceability-report.md`.
- [x] 8. `node scripts/dod.mjs`, reviewer, `/security-review`, autonomy-log row, commit, `node scripts/pr-evidence.mjs origin/main HEAD`.
