@AGENTS.md

## Claude Code

- Start in plan mode for anything touching `schema.sql`, `InventorySchemaMigration`, `auth/`, `SecurityConfig` or
  config files; a one-line diff needs no plan.
- For a feature that needs a spec (`AGENTS.md`), save the approved plan as `docs/specs/<feature>.md` from the template
  before writing code.
- Review with the `reviewer` subagent, passing only the base ref, the goal and the spec path. Changes to `auth/`,
  `SecurityConfig`, `.claude/` or CI also get `/security-review`.
- Do not edit `.agent-log/` or `.claude/hooks/` — they are the observability layer (a hook logs every tool call).
- `.agent-log/actions.jsonl` is committed on purpose: stage it with every commit. Lines written by the commit command
  itself land in the next commit.
- Project skills live in `.claude/skills/`; the canonical copy is `.agents/skills/` (sync with `node scripts/skills-sync.mjs`).
