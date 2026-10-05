---
max_turns: 12
allowed_tools: [Read, Grep, Glob, Skill]
---

A bug: `divideDecimals` in `frontend/src/app/core/decimal.ts` rounds 0.5 down instead of half-up, so a preview
shows 2.17 where the server returns 2.18. Fix it. Follow the project's way of making a change.

(Do not edit files in this eval; describe the exact sequence of steps you would take.)
