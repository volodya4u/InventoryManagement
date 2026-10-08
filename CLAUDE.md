@AGENTS.md

## Claude Code

- Start in plan mode for anything touching `schema.sql`, `InventorySchemaMigration`, `auth/`, `SecurityConfig` or
  config files; a one-line diff needs no plan.
- For a feature that needs a spec (`AGENTS.md`), save the approved plan as `docs/specs/<feature>.md` from the template
  before writing code.
- Review with the `reviewer` subagent, passing only the base ref, the goal and the spec path. Changes to `auth/`,
  `SecurityConfig`, `.claude/` or CI also get `/security-review`.
- The reviewer's verdict counts only for the files it saw, and only once a commit folds it into `actions.jsonl`. So
  finish every change first (the autonomy-log row included), run `node scripts/dod.mjs`, then the reviewer, then
  commit (log-only is fine), and confirm with `node scripts/pr-evidence.mjs origin/main HEAD` before pushing — the
  `pr-evidence` CI job runs the same check.
- Run the loop's red and green tests through `node scripts/test-run.mjs` so they are recorded, not pasted.
- Run each evidence-producing command (`dod.mjs`, `test-run.mjs`, `eval-record.mjs`, `pr-evidence.mjs`) on its own,
  not chained behind `&&`: the log hook clips each tool call's command line, so a command buried in a chain can be
  recorded only in part (that once hid an `eval-record.mjs` re-run from a reviewer).
- In `docs/autonomy-log.md` and `evals/README.md`, do not hand-restate a number or pass/fail a tool already produces
  (eval scores, mode/row counts, CI status). Point to the source instead: `evals/record.json` and the `pr-evidence` **Evals** table,
  `node scripts/agent-log-summary.mjs`, or a specific CI **job** URL (`…/runs/<id>/job/<id>`) — never a run URL whose
  top-level result is red. A hand-typed count is what drifted in #58 (mode counts, fixed in 8a505a0); no gate checks it.
- Changing `reviewer.md`, a skill or `AGENTS.md` (or the model): run the matching evals and paste the scores (`evals/README.md`).
- Do not edit `.agent-log/` or `.claude/hooks/` — they are the observability layer (a hook logs every tool call).
- `.agent-log/actions.jsonl` is committed on purpose; you need not stage it. A hook buffers each tool call in
  `.agent-log/pending.jsonl` (gitignored) and folds the buffer into `actions.jsonl`, staged, on every `git commit`.
- Project skills live in `.claude/skills/`; the canonical copy is `.agents/skills/` (sync with `node scripts/skills-sync.mjs`).
