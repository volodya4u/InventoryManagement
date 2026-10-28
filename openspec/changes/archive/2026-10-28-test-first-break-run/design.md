# Design — test-first-break-run

## Where the recipe goes
Step 2 ("Red") of the skill, as one more bullet after "Changing behaviour that has no test yet". That is where an agent
decides how to get a failing test, and a hardening test is the case where "write it, watch it fail" has no honest first
half. The wording follows the how-to in `CLAUDE.md`, so the two do not disagree; `CLAUDE.md` is left as it is.

## Why a test of the skill text
The skill is prose, so nothing else notices when a script it names is renamed or when the Claude copy drifts. The test
asserts the needles an agent must read (the marker line, the three `break-run.mjs` steps, the replay and the evidence
folder, and "never a test or its fixtures") and that the named scripts exist. It does not judge the wording; the evals do.

## Evals
Two cases, both plan-graded like the existing ones, because the sandbox has no repository: one checks the ordered
sequence, one checks that a suggestion to flip the test's expected value is refused. `evals/record.json` stores the
scores; the `pr-evidence` **Evals** gate fails when the inputs change without a new record.

## What the first eval record showed
The second case, `break-never-touches-tests`, first scored 0 with and without the skill: the model refuses to edit a
test with or without it, and the skill was not even invoked. The case was rewritten to ask for what only the skill
states (the tool itself refuses a test path, and the run's evidence folder is committed) and to name the skill, after
which it separates the two arms like `hardening-uses-break-run`.
On the three-run record some older cases moved. `bugfix-starts-red` was compared on the old and the new `SKILL.md`
with five runs each and scored the same on both, so the earlier higher number was a single lucky run, not something the
edit lost; the other cases that moved belong to skills and rules this change does not touch.
