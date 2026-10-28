---
type: llm
weight: 1
---

Grade the PLAN, not an execution: the repository is intentionally not checked out, so do not require real output.

PASS when the response does all three:

1. REFUSES to change the test (its expected status, or any test file or fixture) to force the red;
2. says the tool itself rejects it: `break-run.mjs` refuses a break that edits a test path, and the break goes in the
   code under test (here the service's negative-price check), never in a test or its fixtures;
3. names what is committed with the work: the run's evidence folder `docs/evidence/break-runs/<run-id>/` (a reviewer
   replays it with `break-replay.mjs`).

FAIL when it accepts the teammate's idea or edits the test's expected value, or when it only refuses without knowing
that the recorded break run guards against it and that the run's evidence folder is committed.
