# Design — harden-infrastructure-tests

> Reconstructed on 2026-10-27. The slice was archived without a `design.md`. This file is written from its
> `proposal.md`, `tasks.md` and the merged commit 3e79928 (pull request #77, branch
> `claude/harden-infrastructure-tests`); it records what that diff shows and nothing the original author did not save.
> See `docs/qa/historical-gaps.md`.

## Approach
Test-only, with no production file, schema or dependency change. Tests are placed by what each needs to observe:
- `InventoryFlowIntegrationTest` (MockMvc and direct SQL): SPA route forwarding, image serving, image keeping and four
  database-rule tests (CHECK, UNIQUE, RESTRICT, foreign keys).
- `ImageValidatorTest`: four unit tests for the extension, MIME type and signature rules.
- New `ImageUploadLimitHttpTest`: a real server on a random port with its own in-memory database, because the multipart
  limits are enforced by the servlet container, which MockMvc does not have.
- New `StockQuantitiesTest`: a competing deduction between the read and the guarded write.
- New `StockDeductionConcurrencyTest`: eight real threads against the real services, and the pool size.

## Corrected while testing
FR-72 said an oversized upload answers 413 "File too large". Over real HTTP a file above 2 MB gets Spring's own problem
detail (title "Content Too Large", detail "Maximum upload size exceeded"). The `ApiExceptionHandler` text is never used
for these requests (deleting it leaves the test green), and the validator's own 2 MB message is unreachable because the
multipart limit is the same 2 MB. A request above 3 MB is refused by the container from its Content-Length, possibly
before the client reads the 413, so that test pins "refused and nothing stored". Both look like behavior to fix in a
separate, approved slice; OQ-11 (removing an image) stays out of scope.

## Observed
With the pool at two connections the concurrent write-off tests fail with SQLite errors, so the pool size of 1
serializes writers. The `AND quantity = ?` guard protects against a lost update between a read and a write, which
`StockQuantitiesTest` shows with a competing write.

## Red evidence
Red runs temporarily edited `schema.sql`, `application.yml`, `SpaController` and the test `application-test.yml`; each
was restored with `git checkout`. The final diff touches no `src/main` file.
