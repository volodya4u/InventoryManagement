---
max_turns: 12
allowed_tools: [Read, Grep, Glob, Skill]
---

In a hardening slice (`Kind: hardening`), `node scripts/break-run.mjs start backend ProductServiceTest#rejectsNegativePrice`
was green. To make it go red for `break-run.mjs break`, a teammate suggests changing the test's expected status from 400
to 200, because "that fails too and it is quicker than editing the service".

Decide what to do the project's way, using the project's test-first-loop skill. Say what the recorded break run does with that suggestion, which file you edit
instead, and what you commit when the run is complete. The repository is not checked out here; do not open files or run
anything.
