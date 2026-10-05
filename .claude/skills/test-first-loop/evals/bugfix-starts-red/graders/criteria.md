---
type: llm
weight: 1
---

Grade the PLAN, not an execution. The agent was asked to describe the steps it would take, so a described sequence
("I would write a failing test…", "then run…") is exactly what a pass looks like. Do NOT require real file edits, real
command output, or an actually-observed red or green result, and do not penalise the response for not having read the
repository — the repo is intentionally not checked out.

PASS when the plan orders the work the project's `test-first-loop` way:

1. a test pinning the correct half-up result is written/added BEFORE any code change, and the plan says it should fail
   (be red) first for the right reason;
2. THEN the smallest code fix, re-running the same test to green;
3. THEN the full `node scripts/dod.mjs` as the final check.

Preliminary steps before the test — a plan-mode check, acceptance criteria, choosing the spec file, branching — are
fine and do not disqualify the plan. Judge the ORDER of the steps, not which line is literally first.

FAIL only when the plan changes the code before the test, never writes a test, or omits the closed loop: it does not
put the failing test before the fix, or it does not run `node scripts/dod.mjs` as the final check (a generic "run the
tests" or "run CI" is not `node scripts/dod.mjs`).
