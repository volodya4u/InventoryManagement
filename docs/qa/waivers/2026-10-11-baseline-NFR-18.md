# Waiver: NFR-18 (baseline)

Status: closed

- **Requirement:** NFR-18 declares `vision-verify` verification, which has no mechanism in this repository: vision verification of rendered UI (no check-vision mechanism).
- **Reason:** historical-only: pre-onboarding baseline; evidence cannot be reconstructed. In plain terms: no evidence was lost; the verification mechanism for this requirement has never existed in this repository.
- **Scope:** baseline requirement only. New slices get no pre-seeded waivers.
- **Release:** closes when the owner answers the matching open question in docs/requirements.md (OQ-8 / OQ-15) and either a mechanism is added or the tag is changed.
- **Approval:** confirmed by volodya4u in chat on 2026-10-11 (baseline sign-off).
- **Closed:** 2026-10-30. The mechanism exists: `scripts/check-vision.mjs` verifies `docs/qa/vision-report.json` (every page at 375, 768 and 1280 px judged by a fresh `project-factory:vision-judge`), and `e2e/16-layout.spec.ts` tests the layout in a browser. The vision part is an LLM's judgement and is not deterministic; the report says so. Evidence: `docs/qa/vision-report.json`, `docs/qa/vision/`, ADR-0011. Closed under the plan the owner approved on 2026-10-30; the owner merges the pull request that closes it.
