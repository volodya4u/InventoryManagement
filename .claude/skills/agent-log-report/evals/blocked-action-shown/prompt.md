---
max_turns: 12
allowed_tools: [Read, Grep, Glob, Skill, Bash]
---

From the `agent-log-report` skill's point of view, explain what a `PreToolUse` line whose `id` never gets a
matching `PostToolUse`/`PostToolUseFailure` line means, and how the report should present it.

```
{"ts":"2026-01-01T00:00:00Z","event":"PreToolUse","id":"z","tool":"Write","path":".env.production"}
```
