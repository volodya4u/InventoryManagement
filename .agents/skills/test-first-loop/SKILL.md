---
name: test-first-loop
description: Deliver a behaviour change or a bug fix through a closed loop instead of step-by-step prompting - a failing test first, the smallest change that turns it green, the full Definition of done, an independent review, then an evidence report. Use when asked to fix a bug, add or change behaviour, or implement a spec from docs/specs/.
license: MIT
compatibility: Requires Node.js 20+, Java 21 and Maven. Uses scripts/dod.mjs and, in Claude Code, the reviewer subagent (.claude/agents/reviewer.md).
metadata:
  author: fwdays-agentic-engineering-crash-course
  version: "1.0"
---

# Test-first loop

Run the whole loop yourself; come back to the human only at the exits named below. Plan mode comes first wherever
`CLAUDE.md` asks for it (schema, `auth/`, `SecurityConfig`, config files): the loop starts after the plan is approved.

## Workflow

1. **Criteria.** Take the acceptance criteria from `docs/specs/<feature>.md`, or restate the request as one to five
   Given / When / Then lines. A feature that changes the schema, an API and a page together gets a spec first
   (`docs/specs/TEMPLATE.md`), approved by the human.
2. **Red.** Write the test where `AGENTS.md` puts it and run only that test through `scripts/test-run.mjs`, which
   records the run (exit code, counts, first failure line) in the agent log. It must fail on an assertion about the new
   behaviour, not on a compile error (the record says which).
   - Backend: `node scripts/test-run.mjs backend <TestClass>#<method>`
   - Frontend: `node scripts/test-run.mjs frontend <path/to/file.spec.ts>`
   - Harness scripts: `node scripts/test-run.mjs harness scripts/<name>.test.mjs`
   - Changing behaviour that has no test yet: first pin today's behaviour with a passing test, then write the failing one.
   - A test or a change (step 3) that imports a third-party package the code does not use yet, touches code that
     calls a library a Dependabot update has just moved, or changes the build or its config: look the API up for the
     version in `pom.xml` / `frontend/package.json` first — `context7` (`query-docs`), or the `angular-cli` MCP's
     `search_documentation` for `@angular/*`. The `pr-evidence` **Docs lookup** gate fails a new import without a
     recorded lookup.
3. **Green.** Make the smallest change that passes the test, then re-run the same `test-run.mjs` command. Repeat.
4. **Done.** Run `node scripts/dod.mjs` (self-test, harness unit tests, `mvn -B -ntp verify`, Prettier, frontend
   tests, the angular-cli MCP smoke test; the same checks as CI). It records each run. If a check is red, go back to
   step 3 with its failure. For formatting, run `pnpm exec prettier --write <files>` in `frontend/`.
5. **Review.** Finish every change first, the autonomy-log row included: the reviewer's verdict counts only for the
   files it saw. Claude Code: ask the `reviewer` subagent, passing only the base ref, the goal in one sentence and the
   spec path; a hook records its verdict. Any other agent: get an equivalent fresh-context, read-only review. Fix each
   blocking finding and go back to step 4. Fix each non-blocking finding or say why not.
6. **Record and report.** Commit one logical change at a time; a hook folds the agent log (tool calls, the `DodRun` and
   `TestRun` records, the reviewer's verdict) into `.agent-log/actions.jsonl` and stages it on each `git commit`.
   - **The records only count once a commit folds them in.** The reviewer runs (step 5) after your code commits, so
     make one more commit after the review — log-only is fine: `git commit -m "Record the reviewer run"`.
   - **Verify before you push:** `node scripts/pr-evidence.mjs <base> HEAD` (base usually `origin/main`) must show
     every gate ✅: the review on these files, a green dod run on this code, the specs, red → green for a new spec, the
     autonomy-log row, a docs lookup for a new third-party import. CI's `pr-evidence` job runs the same check and puts
     the report in its summary, so you need not paste red and green lines or the dod table by hand; report anything
     left open.

## Exits: stop and ask the human

- The same failure survives three attempts in a row. Report what you tried and the failure.
- Getting green would mean deleting, skipping or weakening a test, or changing an expected value to match the code.
  Never do it on your own.
- The change needs something on the "Ask before" list in `AGENTS.md`, such as a dependency or a config file.
- The reviewer and you disagree on a blocking finding.

## Gotchas

- Run one dev server at most; the loop needs none, because the tests start what they need.
- `dod.mjs` writes each check's full output to `target/dod/<n>.log`. Read the log rather than re-running a long build
  just to see its output.

When you change this skill, run its evals in `evals/` next to it (`claude plugin eval .agents/skills/test-first-loop`; see `evals/README.md`).
