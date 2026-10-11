# Waiver: NFR-16 (baseline)

Status: open

- **Requirement:** NFR-16 (availability, backup) is `local-verifiable`, but only the health endpoint is tested (`IT›reportsHealthWithoutSigningInOrCreatingASession`), which does not assert availability or backup behavior (`docs/requirements.md` › Coverage gaps, OQ-10). That test is deliberately not tagged `@trace NFR-16`, so the tag does not claim more than it proves.
- **Reason:** historical-only: pre-onboarding baseline; no availability target or backup procedure was ever declared. In plain terms: no evidence was lost; there is no target to test against.
- **Scope:** baseline requirement only. New slices get no pre-seeded waivers.
- **Release:** closes when the owner answers OQ-10 with a target and a procedure and a test or check asserts them (`docs/mvp-capability-plan.md` section 6 lists it as deferred until then).
- **Approval:** the deferral is the ratified capability plan's (volodya4u, 2026-10-11); confirmed by volodya4u in chat on 2026-10-11 (the retro-tagging pull request), recorded in retro/corrections.
