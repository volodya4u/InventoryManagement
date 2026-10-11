# Harden security tests

## Why
Seventeen rows of the baseline coverage gaps (`docs/requirements.md` › Coverage gaps) describe authentication,
session and header behavior that ships but no backend test asserts: FR-2, FR-3, FR-4, FR-6, FR-8, FR-12, FR-13 and
NFR-1, NFR-2, NFR-3, NFR-4, NFR-5, NFR-6, NFR-7, NFR-9, NFR-10, NFR-11. Slice H1 of `docs/mvp-capability-plan.md`
pins them with tests. It is test-only: it changes no production file.

## What Changes
- Thirteen tests in `InventoryFlowIntegrationTest` (MockMvc) for sign-in, the 401 and 403 bodies, CSRF, logout, the
  password rules, the CSP header, the session identifier, the error switches, and the pinned absences.
- `config/SecurityConfigTest`: the real password encoder is bcrypt at cost 12.
- `auth/LocalAdminInitializerTest`: a bootstrap password shorter than the policy is accepted (OQ-7).
- `auth/SessionCookieHttpTest`: a real HTTP exchange on a random port shows the session cookie flags (NFR-4).
- Every test carries an `@trace <id>` comment so `scripts/check-traceability.mjs` joins it to its requirement.

## Impact
- Affected specs: `authentication`, `session-lifetime`, `app-shell-routing`. Their requirements and scenarios are
  unchanged; only the `> GAP:` notes become "Covered by slice" notes, and the matching rows in
  `docs/requirements.md` are closed. The FR-2 row is corrected: lookup is case-insensitive in two layers.
- Affected code: `src/test/java` only. No production file in the final diff.
- Dependencies: none. New import: `org.springframework.boot.test.web.server.LocalServerPort` (docs looked up).
- Honest limits: NFR-10 (no lockout) is an absence and was not shown red, since that needs a throttle; NFR-3 pins the
  configured value because MockMvc has no servlet container to enforce it.
