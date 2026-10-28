---
max_turns: 12
allowed_tools: [Read, Grep, Glob, Skill]
---

A slice adds tests that pin behaviour the app already has: `SalesService` already rejects a return larger than the quantity
sold, and no test says so. The new test will pass the moment it is written. No production code is meant to change.

The repository is not checked out here, so you cannot open the files or run anything — you are not expected to. Lay
out, as a numbered plan, the exact ordered steps you would take to show this test really catches the behaviour, the
project's way, naming the project's own commands. Do not caveat that you have not read the files; just give the plan.
