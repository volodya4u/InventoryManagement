# Design — harden-security-tests

> Reconstructed on 2026-10-27. The slice was archived without a `design.md`. This file is written from its
> `proposal.md`, `tasks.md` and the merged commit 2a19de8 (pull request #72, branch `claude/harden-security-tests`); it
> records what that diff shows and nothing the original author did not save. See `docs/qa/historical-gaps.md`.

## Approach
Test-only. Thirteen MockMvc tests in `InventoryFlowIntegrationTest` cover sign-in, the 401 and 403 bodies, CSRF, logout,
the password rules, the CSP header, the session identifier, the error switches and the pinned absences. Three smaller
classes hold what MockMvc cannot show or what is a unit property:
- `config/SecurityConfigTest` checks that the real password encoder is bcrypt at cost 12 (NFR-2).
- `auth/LocalAdminInitializerTest` checks that a bootstrap password shorter than the policy is accepted (NFR-1, OQ-7).
- `auth/SessionCookieHttpTest` makes a real HTTP exchange on a random port, because MockMvc has no servlet container
  to set or enforce the session cookie flags (NFR-4).

## The one new import
`SessionCookieHttpTest` imports `org.springframework.boot.test.web.server.LocalServerPort`, a package nothing on `main`
imported yet. Task 1 records the documentation lookup (Spring Boot 4.1, context7) that the Docs lookup gate expects.

## Limits that were accepted
- NFR-10 (no lockout) is an absence. It was not shown red, because that needs a throttle to exist.
- NFR-3 (session timeout) pins the configured value; MockMvc cannot enforce it.
- The FR-2 row was corrected, not the code: sign-in lookup is case-insensitive in two layers.

## Red evidence
Each test was shown failing against a deliberately broken production file through `node scripts/test-run.mjs`, then
restored; the final diff touches no production file (task 6). Those runs are in the agent log of that commit; the
`docs/evidence/break-runs/` folder did not exist yet.
