@AGENTS.md

## Claude Code

- Start in plan mode for anything touching `schema.sql`, `InventorySchemaMigration`, `auth/`, `SecurityConfig` or
  config files; a one-line diff needs no plan.
- For a feature that needs a spec (`AGENTS.md`), save the approved plan as `docs/specs/<feature>.md` from the template
  before writing code.
- Project Factory (`AGENTS.md`): a new or changed requirement ships with its `@trace` test or an open waiver, the spec
  citation and the spec track the user chose; run the Factory checks listed there (each on its own) before the
  reviewer, because `node scripts/dod.mjs` does not. Editing a gate script or `.githooks/*` needs the user's approval
  and a `Refs: PD-n` trailer or a re-seal.
- Review with the `reviewer` subagent, passing only the base ref, the goal and the spec path. Changes to `auth/`,
  `SecurityConfig`, `.claude/` or CI also get `/security-review`.
- The reviewer's verdict counts only for the files it saw, and only once a commit folds it into `actions.jsonl`. So
  finish every change first (the autonomy-log row included), run `node scripts/dod.mjs`, then the reviewer, then
  commit (log-only is fine), and confirm with `node scripts/pr-evidence.mjs origin/main HEAD` before pushing — the
  `pr-evidence` CI job runs the same check.
- Push and open the pull request without asking, as the last step of a finished change: once `pr-evidence` shows
  no gate `FAIL` (each is `PASS`, `N/A` or an approved `WAIVED`), check the description with `PR_BODY=… node scripts/check-pr-description.mjs`, run
  `node scripts/push-branch.mjs` (it pushes the current `claude/*` branch and nothing else, and is the one push
  `.claude/settings.json` allows without a prompt; a raw `git push` still asks, and so does editing the script) and `gh pr create` into `main`. Stop and
  report instead if a gate is red or the reviewer asked for changes. A human merges every pull request by hand: never
  merge, enable auto-merge, force-push or push `main`.
- Human approval (ADR-0005): the owner approves a pull request by signing the tag `approve/<head-sha>` with a hardware
  key (`node scripts/approve-pr.mjs <pr>`). Never run that script, never create, move or push an `approve/*` tag, and
  never edit `quality/allowed-signers`. Once main lists a key there, the **Human approval** gate in CI and the
  `human-approval` check stay red until the owner has signed; that is expected, not something to fix.
- Run the loop's red and green tests through `node scripts/test-run.mjs` so they are recorded, not pasted.
- A test that pins behaviour that already exists cannot go red first. Mark its slice's `proposal.md` with a
  `Kind: hardening` line and show each test red with a recorded controlled break, never an unrecorded hand edit:
  1. `node scripts/break-run.mjs start <target> <selector>`, which must be green;
  2. break the code under test by hand (never a test or its fixtures: `break` refuses any test path);
  3. `node scripts/break-run.mjs break <run-id>`, which must be red on an assertion;
  4. `node scripts/break-run.mjs restore <run-id>`, which must be green on the start's code.

  Commit `docs/evidence/break-runs/<run-id>/` with the work. A reviewer replays it with
  `node scripts/break-replay.mjs <run-id>`.
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
