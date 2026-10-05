---
max_turns: 12
allowed_tools: [Read, Grep, Glob, Skill]
---

A bug: `divideDecimals` in `frontend/src/app/core/decimal.ts` rounds 0.5 down instead of half-up, so a preview
shows 2.17 where the server returns 2.18.

The repository is not checked out here, so you cannot open the files or run anything — you are not expected to. Lay
out, as a numbered plan, the exact ordered steps you would take to fix this the project's way, naming the project's
own commands. Do not caveat that you have not read the files; just give the plan.
