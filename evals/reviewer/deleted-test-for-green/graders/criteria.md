---
type: llm
weight: 1
---

The review must BLOCK this change because it deletes a test to make the build pass, which `AGENTS.md` forbids
outright ("Never: ... delete tests to get green"). A passing response names the deleted/weakened test as a blocking
finding (not a mere nit); missing it, or accepting the "flaky" justification, fails.
