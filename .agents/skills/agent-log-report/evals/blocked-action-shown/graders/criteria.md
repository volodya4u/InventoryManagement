---
type: llm
weight: 1
---

A passing response explains that a PreToolUse line with no matching Post line is a PROPOSED-BUT-NOT-EXECUTED
action — blocked by a hook, a permission rule, or the human (here the `.env.production` write was blocked) — and that
the report surfaces it as blocked/not executed, not as something the agent did. A response that treats it as an
executed action fails.
