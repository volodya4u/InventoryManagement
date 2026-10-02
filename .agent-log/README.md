# .agent-log

Observability layer of this repo. `actions.jsonl` gets ONE JSON line per hook event, written by
`.claude/hooks/log-action.mjs` (wired in `.claude/settings.json`):

    {"ts":"2026-09-08T16:31:07.000Z","event":"PreToolUse","id":"toolu_01","session":"7d3c1a2f","mode":"default","tool":"Edit","path":"src/main/resources/schema.sql"}
    {"ts":"2026-09-08T16:31:07.412Z","event":"PostToolUse","id":"toolu_01","session":"7d3c1a2f","mode":"default","tool":"Edit","path":"src/main/resources/schema.sql","exit":0,"ms":14}

- `PreToolUse`  = the agent PROPOSED an action (before the permission check and any hook decision).
- `PostToolUse` / `PostToolUseFailure` = the action actually RAN (`exit` 0, or N from "Exit code N", "error", "interrupted").
- A PreToolUse line whose `id` never gets a Post line = proposed but not executed: blocked by a hook, a permission rule, or you.

Fields: ts, event, id (tool_use_id), session (first 8 chars), mode (permission mode), tool, path | cmd | pattern | url, exit, ms.

Read it with `node scripts/agent-log-summary.mjs` (per-tool proposed / executed / blocked / failed). Verify the hooks without an agent:
`node scripts/hooks-selftest.mjs`. Both need only Node 20+ on PATH and run from the repo root.
The file is committed on purpose: what the agent DID lives next to what it SAID (the transcript).
