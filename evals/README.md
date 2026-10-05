# evals

Behaviour checks for the agent harness: does the `reviewer` catch real rule violations, and do the skills do their
job? Unlike the tests under `src/` and `scripts/*.test.mjs` (which check code), these run an LLM against a prompt and
score it with an LLM judge, so they cost money and are non-deterministic. CI never runs them. Two cheap checks run in
CI instead: `scripts/check-evals.mjs` (via `node --test`) confirms the suite is present and well-formed, and the
`pr-evidence` job fails the **Evals** gate when a branch changes an input the scores depend on but
`evals/record.json` does not match it.

## When to run

Run them, and commit `evals/record.json`, when you change `.claude/agents/reviewer.md`, a skill under
`.agents/skills/<skill>/`, `AGENTS.md`, or an eval case. `scripts/eval-record.mjs` runs all three suites and writes
the record: the model used, the judge model, the per-case scores (with / without the plugin and the delta), and the
git-blob fingerprint of those inputs. `pr-evidence` recomputes that fingerprint for the head commit; if it differs,
the scores are stale and the gate fails, so a reviewer or rules change cannot land on old numbers.

```sh
node scripts/eval-record.mjs                      # the CLI's logged-in model (recorded as "default")
node scripts/eval-record.mjs --model claude-opus-5-5   # pin a model; it is recorded and shown in the PR report
```

The gate keys on the inputs, not the model, because the model can change under you (an editor or operator can switch
it between commits), which would make a model-match check flaky. The record still stores the model, and the PR report
prints it next to the scores, so a reviewer can see which model produced them. When you change the model deliberately,
re-run `eval-record.mjs` to refresh the numbers — a model swap is exactly when a silent regression hides.

## How to run

Needs the `claude` CLI logged in (the judge and the run both call the model). Keep cost down with `--judge-model
haiku` and a small `--runs`.

```sh
# Skills: target the skill's folder so the skill loads; you get a no-plugin baseline arm (Δ) for free.
claude plugin eval .agents/skills/test-first-loop   --judge-model haiku
claude plugin eval .agents/skills/agent-log-report  --judge-model haiku

# Reviewer: the cases are self-contained (each embeds the AGENTS.md rule it tests), so they run against baseline.
claude plugin eval --eval-dir evals --judge-model haiku .

# One case, one run (cheap smoke): add --case <name> --runs 1
```

`--threshold 1` makes it exit non-zero if any case scores below 1 (useful if you ever wire a manual CI job with a
key). Results land in `evals/<...>/results/` (gitignored). Scaffolding scripts and real MCP servers stay off unless
you pass `--scaffold` / `--allow-real-servers`.

## Should the reviewer use a different model than the author?

The reviewer is `model: inherit`, so it shares the author's blind spots. To decide whether to pin it to a different
model, run the reviewer cases under each candidate (`--model <id>`) and compare scores; record the decision and the
numbers in `docs/autonomy-log.md`. This is a follow-up, not part of this suite.

## Cases

- `evals/reviewer/` — five injected-defect reviews, one per `AGENTS.md` rule: JPA instead of `JdbcTemplate`,
  `rs.getBigDecimal` instead of `SqliteDecimals.read`, a `schema.sql` change with no migration, a deleted test, and a
  committed `APP_ADMIN_INITIAL_PASSWORD`. Each grader passes only if the review flags that specific defect as blocking.
- `.agents/skills/<skill>/evals/` — two cases per skill (synced into `.claude/skills/` by `scripts/skills-sync.mjs`).

## Known limit

`claude plugin eval` runs a case in an isolated sandbox against baseline Claude Code; it loads a skill when you target
that skill's folder, but it does **not** load the project's `.claude/agents/` subagents or the repository files. So
the reviewer cases test the review *judgement* on an embedded rule + diff, not the real `reviewer.md` subagent reading
the repo. Evaluating the subagent end-to-end would need the project packaged as a plugin, or a `scaffold_script` that
stages `AGENTS.md` and `reviewer.md` into the sandbox — a follow-up.
