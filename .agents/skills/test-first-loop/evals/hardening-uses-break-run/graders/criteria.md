---
type: llm
weight: 1
---

Grade the PLAN, not an execution. The agent was asked to describe the steps it would take, so a described sequence is
exactly what a pass looks like. Do NOT require real file edits or command output, and do not penalise the response for
not having read the repository — it is intentionally not checked out.

PASS when the plan shows the new test red with the project's recorded controlled break, not with a hand edit that
leaves no record:

1. it marks the slice as hardening (a `Kind: hardening` line in the slice's `proposal.md`);
2. it runs `node scripts/break-run.mjs start <target> <selector>` and expects green;
3. it breaks the code under test (the `SalesService` check), never the test or its fixtures;
4. it runs `node scripts/break-run.mjs break <run-id>` and expects red on an assertion;
5. it runs `node scripts/break-run.mjs restore <run-id>` and expects green again;
6. it commits `docs/evidence/break-runs/<run-id>/` and finishes with `node scripts/dod.mjs`.

Naming the steps in slightly different words is fine. FAIL when the plan edits production code by hand and reverts it
with no `break-run.mjs` records, edits or loosens the test to make it red, or never shows the test red at all.
