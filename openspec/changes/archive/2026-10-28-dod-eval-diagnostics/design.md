# Design — dod-eval-diagnostics

## Where the reason was lost
`dod.mjs` already captures stderr before stdout of both eval scripts and stops at the first non-zero exit, so the reason a
script printed reaches `evalRatchetVerdict`. The verdict only looked for a `Result:` line, and `eval-summary.mjs --check`
prints none, so the table said "no result" and dropped the text. The fix is in the verdict, not in `dod.mjs`.

## What is quoted
When there is no `Result:` line, the first non-empty trimmed line of the output, capped at 160 characters. The first line
is where `eval-summary.mjs` states its reason; a longer output would make a table cell unreadable. A `Result:` line of any
value (`PASS`, `FAIL`, `SKIP-pending`) keeps its old message, because the ratchet then ran and said what it found. Empty
output keeps the old message with no trailing colon.
