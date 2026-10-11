# Harden infrastructure tests

## Why
Seven rows of the baseline coverage gaps (`docs/requirements.md` › Coverage gaps) describe infrastructure behavior that
ships but no backend test asserts: FR-33 (SPA route forwarding), FR-70 (image extension and MIME rejections), FR-72
(multipart size limits), FR-73 (image serving), FR-74 (updates keep the image), FR-149 (database rules) and NFR-13
(concurrent stock deduction). Slice H5 of `docs/mvp-capability-plan.md` pins them with tests. It is test-only: no
production file, no schema change and no dependency change. Removing an image (OQ-11) stays out of scope.

## What Changes
- `InventoryFlowIntegrationTest` (MockMvc and direct SQL): route forwarding, image serving, image keeping, and four
  database-rule tests, each with an `@trace <id>` comment, plus small private helpers for multipart forms and a seed.
- `ImageValidatorTest`: four unit tests for the extension, MIME type and signature rules.
- New `ImageUploadLimitHttpTest`: a real server on a random port with its own in-memory database, because the multipart
  limits are enforced by the servlet container, which MockMvc does not have.
- New `StockQuantitiesTest` (a competing deduction between the read and the guarded write) and
  `StockDeductionConcurrencyTest` (eight real threads against the real services, and the pool size).
- No new dependency. The new imports are JDK classes, `SoftAssertions.assertSoftly` from a package the tests already
  use, and classes already used by `SessionCookieHttpTest`.

## Impact
- Affected specs: `app-shell-routing`, `images`, `schema-migration`. The `> GAP:` notes become "Covered by slice" notes;
  the OQ-11 note stays. The FR-72 requirement and scenario text are corrected (below).
- Affected code: `src/test/java` only. No `src/main` file and no `src/main/resources` file in the final diff; the red
  evidence edited `schema.sql`, `application.yml`, `SpaController` and the test `application-test.yml` temporarily, and
  each was restored with `git checkout`.
- Corrected while testing: FR-72 said an oversized upload answers 413 "File too large" with detail "The maximum image
  size is 2 MB". Over real HTTP a file above 2 MB gets Spring's own problem detail (title "Content Too Large", detail
  "Maximum upload size exceeded"); the handler in `ApiExceptionHandler` that has the "File too large" text is never
  used for these requests (deleting it leaves the test green), and the validator's own 2 MB message is unreachable over real HTTP
  because the multipart limit is the same 2 MB. A request above 3 MB is refused too, but the container rejects it from
  its Content-Length and may close the connection before the client reads the 413, so that test pins "refused and
  nothing stored" (a 413 when a response arrives). Both look like behavior to fix in a separate, approved slice.
- Observed while testing: with the pool at two connections, the concurrent write-off tests fail with SQLite errors, so
  the pool size of 1 is what serializes writers; the `AND quantity = ?` guard is what protects against a lost update
  between a read and a write, which `StockQuantitiesTest` shows with a competing write.
