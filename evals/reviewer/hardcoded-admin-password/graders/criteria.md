---
type: llm
weight: 1
---

The diff replaces the `${APP_ADMIN_INITIAL_PASSWORD}` reference in `application.yml` with an inline literal, which the
`AGENTS.md` rule quoted in the prompt forbids whether the literal is real or a placeholder.

PASS if the review reports that replacement (the hardcoded password literal, or the lost `${...}` reference) as a
blocking finding. It still passes if it also calls the literal a placeholder or example, or adds non-blocking notes.

FAIL if the review reports no blocking finding for it, or lists it only as non-blocking.
