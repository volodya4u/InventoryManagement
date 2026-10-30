# Waiver: NFR-20 (baseline)

Status: closed

- **Requirement:** NFR-20 declares `a11y` verification, which has no mechanism in this repository: axe accessibility gate (no a11y tooling in this repo; see OQ-15).
- **Reason:** historical-only: pre-onboarding baseline; evidence cannot be reconstructed. In plain terms: no evidence was lost; the verification mechanism for this requirement has never existed in this repository.
- **Scope:** baseline requirement only. New slices get no pre-seeded waivers.
- **Release:** closes when the owner answers the matching open question in docs/requirements.md (OQ-8 / OQ-15) and either a mechanism is added or the tag is changed.
- **Approval:** confirmed by volodya4u in chat on 2026-10-11 (baseline sign-off).
- **Closed:** 2026-10-30. OQ-15 was answered (WCAG 2.1 AA, axe in the light and the dark scheme, failing on serious and critical) and the mechanism exists: `scripts/check-a11y.mjs` and `e2e/18-accessibility.spec.ts`. Evidence: `docs/qa/a11y-report.json`, `docs/requirements.md` (NFR-20, OQ-15), ADR-0011. Closed under the plan the owner approved on 2026-10-30; the owner merges the pull request that closes it.
