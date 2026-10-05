# .agent-log

Observability layer of this repo. `.claude/hooks/log-action.mjs` (wired in `.claude/settings.json`) appends ONE
JSON line per hook event to `pending.jsonl` (gitignored). `.claude/hooks/agent-log-fold.mjs` folds that buffer into
`actions.jsonl` and stages it on every `git commit`, so the working tree stays clean between commits and the lines
land in the copy of the project the agent is working in — a git worktree included. A line looks like:

    {"ts":"2026-09-08T16:31:07.000Z","event":"PreToolUse","id":"toolu_01","session":"7d3c1a2f","mode":"default","tool":"Edit","path":"src/main/resources/schema.sql"}
    {"ts":"2026-09-08T16:31:07.412Z","event":"PostToolUse","id":"toolu_01","session":"7d3c1a2f","mode":"default","tool":"Edit","path":"src/main/resources/schema.sql","exit":0,"ms":14}

- `PreToolUse`  = the agent PROPOSED an action (before the permission check and any hook decision).
- `PostToolUse` / `PostToolUseFailure` = the action actually RAN (`exit` 0, or N from "Exit code N", "error", "interrupted").
- A PreToolUse line whose `id` never gets a Post line = proposed but not executed: blocked by a hook, a permission rule, or you.

Fields: ts, event, id (tool_use_id), session (first 8 chars), mode (permission mode), tool, path | cmd | pattern | url, exit, ms.
`agent` (the subagent that made the call, e.g. `reviewer`) and `subagent_type` (the subagent an `Agent` call spawns) appear only when a subagent is involved; `scripts/check-review.mjs` uses them to prove the reviewer ran on a branch.

Read it with `node scripts/agent-log-summary.mjs` (per-tool proposed / executed / blocked / failed); it reads the
committed `actions.jsonl` and the `pending.jsonl` buffer next to it, so this session's not-yet-committed actions show
too. Verify the hooks without an agent: `node scripts/hooks-selftest.mjs`. Both need only Node 20+ on PATH and run
from the repo root. `actions.jsonl` is committed on purpose: what the agent DID lives next to what it SAID (the
transcript). You need not stage it; the fold hook does, on each commit.
