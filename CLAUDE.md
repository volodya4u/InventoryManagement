@AGENTS.md

## Claude Code

- Start in plan mode for anything touching `schema.sql`, `InventorySchemaMigration`, `auth/`, `SecurityConfig` or
  config files; a one-line diff needs no plan.
- Do not edit `.agent-log/` or `.claude/hooks/` — they are the observability layer (a hook logs every tool call).
- Project skills live in `.claude/skills/`; the canonical copy is `.agents/skills/` (sync with `node scripts/skills-sync.mjs`).
