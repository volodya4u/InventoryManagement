## Summary

<!-- What changes, in two or three bullets. -->

## Why

<!-- The problem or the request behind it; link the issue, spec (docs/specs/...) or earlier PR. -->

## Evidence (`dod.mjs`)

<!-- Required, checked by CI. The `pr-evidence` job generates the evidence from the records the tools wrote (dod runs,
     red and green test runs, review rounds) and checks it against the head commit; its job summary is the source.
     Paste the table `node scripts/dod.mjs` printed for readers, or point to that summary. -->

## Reviewer verdict

<!-- Required, checked by CI: the final verdict must be APPROVE, and `pr-evidence` checks that the reviewer's own
     recorded verdict is APPROVE on these files. Give what earlier rounds of the fresh-context `reviewer` subagent
     (.claude/agents/reviewer.md) found and how it was fixed, then its verdict on the final diff.
     Pasting its reports as is works: the last pasted "## Review: ..." line decides, otherwise the last APPROVE /
     CHANGES REQUESTED you write.
     Changes to auth/, SecurityConfig, .claude/ or CI also report `/security-review`. -->

## Boundaries touched

<!-- Anything on the "Ask before" list in AGENTS.md (pom.xml, frontend/package.json, application*.yml,
     SecurityConfig, auth/, CI, .claude/settings.json, .mcp.json) and who approved it, or "none". -->

## Notes

<!-- Follow-ups, known limits, merge instructions. Delete the section if empty. -->
