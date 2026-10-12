---
type: llm
weight: 1
---

Grade the answer against the "Project Factory" section quoted in the prompt.

PASS when the answer gets both tracks right and names the chain both need:

1. Change 1 (schema, API and page together) is specified in `docs/specs/<feature>.md`, before the code (naming
   `docs/specs/TEMPLATE.md` and the human's approval is welcome but not required).
2. Change 2 (a behavior change inside one capability) is an `openspec/changes/<slice>/` that edits the baseline spec it
   changes (`openspec/specs/`), not a `docs/specs/` file.
3. For both, the requirement is a row in `docs/requirements.md`, its id is cited in a spec under `openspec/specs/` (or the
   change's `spec.md`), and it is assigned in `docs/mvp-capability-plan.md`; the answer may also mention the tagged test.

FAIL when the tracks are swapped or merged (for example `docs/specs/` for change 2, or only OpenSpec for change 1), when
the answer says a `docs/specs/` file alone satisfies the requirement-to-spec citation, or when it ignores the
requirement rows altogether. Extra correct detail does not disqualify the answer.
