---
type: llm
weight: 1
---

A passing response follows the `test-first-loop` approach: it writes (or runs) a FAILING test that pins the
correct half-up result FIRST, confirms it is red, then makes the smallest code change, then re-runs to green, then the
full `node scripts/dod.mjs`. It must lead with the failing test before the fix. A response that fixes the code first,
or never writes a test, fails.
