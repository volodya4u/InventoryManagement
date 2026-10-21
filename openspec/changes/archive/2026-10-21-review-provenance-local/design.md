# Design — review-provenance-local

## What the hook writes
`.claude/hooks/log-action.mjs` writes a `PreToolUse` line and then a `PostToolUse` line with the same `id`, which is the
tool-use id Claude Code passes, `toolu_…`. A verdict is written onto the `PostToolUse` line in one of two cases:

- the tool is `SubagentHandback` with `agent: "reviewer"` (a background reviewer handing back);
- the tool is `Agent`/`Task` with `subagent_type: "reviewer"` (a foreground reviewer's report returned to its caller).

Every verdict line on `main` today has that shape.

## The rule
`reviewVerdicts` keeps a verdict line only when all of these hold:

- the event is `PostToolUse` and the verdict is `APPROVE` or `CHANGES REQUESTED`;
- the `id` matches `^toolu_[A-Za-z0-9]+$`;
- some `PreToolUse` line has the same `id` and `tool`;
- the reviewer identity is one of the two forms above.

`ignoredVerdicts` counts the verdict lines that fail, and `reviewProblems` reports them when no valid verdict is left.

An APPROVE counts only with `Number.isInteger(blocking) && blocking === 0`. The hook counts the items under
`### Blocking`, so `None.` gives 0.

## Known limits of the id rule
The rule accepts only `toolu_` followed by letters and digits, so it fails closed. The hook has written longer ids on
other tools, such as `toolu_…_desktop` on `mcp__ccd_session_mgmt__send_message` lines, and Bedrock or Vertex ids carry
an infix (`toolu_bdrk_…`, `toolu_vrtx_…`). No reviewer line carries such an id today. If one ever does, that genuine
review is ignored, and the gate asks for the reviewer to run again. It is never counted by mistake. Widening the pattern
is a small change when that happens.

## What this does not do
A branch author can still write both lines by hand with a made-up `toolu_` id. Stronger validation of a file the
author can edit cannot prove a review happened. A record outside the branch that the author cannot write can, and that
is left to a later slice. In a single-account repository that means a key the agent cannot use, or a workflow that runs
from the base branch.
