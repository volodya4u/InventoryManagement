---
type: llm
weight: 1
---

Grade the answer against the "Project Factory" section quoted in the prompt.

PASS when the answer does both:

1. Tags the test with a comment `// @trace FR-160` above it (the file name ends in `Test.java`, so the scanner finds it).
2. Runs the Factory checks the section lists, not only `node scripts/dod.mjs`: at least `check-acceptance-methods.mjs
   --mode=artifact` (which is what fails a requirement with no tagged test) together with the other gate commands, or
   says explicitly that `dod.mjs` does not run them. It may also run `dod.mjs` and the reviewer.

FAIL when the answer omits the `@trace` tag, tags it with a different form that the section does not describe, or
claims that `node scripts/dod.mjs` alone covers the Factory gates. Mentioning additional correct steps is fine.
