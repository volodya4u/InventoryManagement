# Waiver: NFR-17 (baseline)

Status: closed

- **Requirement:** NFR-17 declares `e2e` verification, which has no mechanism in this repository: end-to-end browser testing (no Playwright in this repo).
- **Reason:** historical-only: pre-onboarding baseline; evidence cannot be reconstructed. In plain terms: no evidence was lost; the verification mechanism for this requirement has never existed in this repository.
- **Scope:** baseline requirement only. New slices get no pre-seeded waivers.
- **Release:** closes when the owner answers the matching open question in docs/requirements.md (OQ-8 / OQ-15) and either a mechanism is added or the tag is changed.
- **Approval:** confirmed by volodya4u in chat on 2026-10-11 (baseline sign-off).
- **Closed:** 2026-10-30. OQ-8 was answered (Chromium, Firefox and WebKit) and the mechanism exists: Playwright runs the whole `e2e/` suite once per browser, and `e2e/20-browsers.spec.ts` is tagged `@trace NFR-17`. Evidence: `docs/requirements.md` (NFR-17, OQ-8), ADR-0010 and ADR-0011, the CI job `e2e`. Closed under the plan the owner approved on 2026-10-30; the owner merges the pull request that closes it.
