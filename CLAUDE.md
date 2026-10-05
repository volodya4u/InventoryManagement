@AGENTS.md

## Claude Code

- Start in plan mode for anything touching `schema.sql`, `InventorySchemaMigration`, `auth/`, `SecurityConfig` or
  config files; a one-line diff needs no plan.
- For a feature that needs a spec (`AGENTS.md`), save the approved plan as `docs/specs/<feature>.md` from the template
  before writing code.
- Review with the `reviewer` subagent, passing only the base ref, the goal and the spec path. Changes to `auth/`,
  `SecurityConfig`, `.claude/` or CI also get `/security-review`.
- The reviewer's run only counts once a commit folds the agent log into `actions.jsonl`, so make a commit after the
  review (log-only is fine) and confirm with `node scripts/check-review.mjs origin/main` before pushing — the
  `review-evidence` CI job enforces it.
- Changing `reviewer.md`, a skill or `AGENTS.md` (or the model): run the matching evals and paste the scores (`evals/README.md`).
- Do not edit `.agent-log/` or `.claude/hooks/` — they are the observability layer (a hook logs every tool call).
- `.agent-log/actions.jsonl` is committed on purpose; you need not stage it. A hook buffers each tool call in
  `.agent-log/pending.jsonl` (gitignored) and folds the buffer into `actions.jsonl`, staged, on every `git commit`.
- Project skills live in `.claude/skills/`; the canonical copy is `.agents/skills/` (sync with `node scripts/skills-sync.mjs`).
