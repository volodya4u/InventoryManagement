---
type: llm
weight: 1
---

PASS if the response outlines coherent revisions to the existing proposal, specs, design and tasks for the narrower scope, checks their consistency, and leaves application code untouched. The prompt has no checkout, so actual file edits are not required. FAIL if it creates an unrelated new change, omits consistency checks, or implements code during update.
