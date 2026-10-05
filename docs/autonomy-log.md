# Autonomy log

The trust level chosen for each significant piece of agent work, who decided, and the evidence. Before each row ask:
how fast would I notice a mistake, how cleanly can I roll it back, and what evidence convinces me?

Levels (Agentic Engineering Crash Course): 1 Assistant (the agent proposes, a human decides) · 2 Assistant → agent
(the agent proves the result with tests, a human reviews the outcome) · 3 Agent · 4 Agents (parallel subagents) ·
5 Autonomous agents (harness only, human by exception).

**What the levels mean here.** All cloud work ran in `auto` mode (every agent-log line carries `"mode":"auto"`): a
classifier, not a human step by step, approved individual tool calls within the ask/deny rules and the hooks. So
"level 1" below means **the human chose the scope** (approved the plan in plan mode) **and merged the pull request
after review**, not that they clicked "allow" on every action; "level 2" adds that the result is proven by tests. No
session ran in `default` (manual) mode — a deliberate simplification, not the course's literal level 1.

| # | Work | Level | Who decided | Evidence | Why this level |
|---|------|-------|-------------|----------|----------------|
| 1 | Port the day 1 harness: hooks, `settings.json`, scripts, `.agent-log/`, skill, `AGENTS.md`, `CLAUDE.md` (#24) | 1 | Human chose the scope in plan mode (full port, Claude Code only, plain `node` scripts); agent implemented | `node scripts/hooks-selftest.mjs` all PASS; CI green | The harness is what controls the agent, so a human approves every rule in it |
| 2 | Commit `.agent-log/actions.jsonl` with the work (#24) | 1 | Human, "as in the demo" | The log is in every commit; rule in `CLAUDE.md` | Noise in diffs versus an audit trail is a team decision |
| 3 | Ask before commands that change dependencies (`pnpm up/rm/i`, `mvn versions:*`, lockfile) (#24) | 1 | Agent found the gap while checking Dependabot; human approved | `settings.json` parses; CI green | `.claude/settings.json` is on the "Ask before" list |
| 4 | MCP servers: Context7 and the Angular CLI's `ng mcp --read-only` (#25) | 1 | Human chose both; agent researched `ctx7` and `ng mcp`; human set the key locally | Smoke test: `list_projects` found `frontend/angular.json`; locally `claude mcp list` shows both connected | Network access, a third-party service and an API key |
| 5 | Always ask before JetBrains IDE MCP tools (#26) | 1 | Agent spotted that `idea` tools bypass the `.env` hook; human chose an ask rule | Documented precedence: deny → ask → allow across all settings scopes | Permissions are a human decision |
| 6 | Angular 22 with `ng update`, Dependabot grouping for `@angular/*` (#27) | 2 | Human chose the full upgrade; agent ran it, checked the migrations and opened the PR; human merged | 46 frontend tests, `mvn -B -ntp verify`; formatting-neutral diff shows only the migrations; locally `ng version` 22.2.1 | Reversible with git and proven by tests, but a dependency change, so a human merges |
| 7 | Vitest 5 Dependabot PR (#28) | 1 | Agent reviewed (CI log on Vitest 5, `@angular/build` peer range); human merged | 46 tests on Vitest 5.0.2; auto-merge skipped the major update | Majors never auto-merge |
| 8 | Verify the hooks on Windows (no change needed) | 1 | Human ran the diagnostics the agent asked for | Self-test PASS on Windows; a local session logged a `PreToolUse`/`PostToolUse` pair for `Read README.md` in `default` mode | The hooks are the evidence layer, so they need their own evidence |
| 9 | Path-scoped rule for Angular 22 frontend work (#29) | 1 | Human chose it from the day 1 gap list | Each Angular fact checked against `@angular/core` and `@angular/common` 22.2.1 typings | Static context is team policy |
| 10 | `GET /api/health`, start script waits for it (#30) | 1 | Plan approved by a human (it touches `SecurityConfig`); agent wrote the test first | Test red (401) before the change, green after; `mvn -B -ntp verify` 25 tests | First task through the full loop: plan, failing test, change, evidence |
| 11 | This log and `merge=union` for the agent log | 1 | Human chose it from the day 1 gap list | A merge of two branches that both appended to the log kept both lines without a conflict | Documentation of decisions belongs to the human |
| 12 | Read-only `reviewer` subagent and a review step before every PR; Dependabot patch and minor updates keep merging without review | 1 | Human chose it from the practices audit and ruled that auto-merge stays as it is; agent implemented | Four fresh-context review rounds found six guard gaps, all fixed; in a cloud session the reviewer's `ls` and `git diff /dev/null README.md` were blocked and `git status` ran; self-test green | The checker's limits are harness policy, so a human approves every rule |
| 13 | Cloud `SessionStart` hook and a launcher for the Angular CLI MCP server | 1 | Human chose it from the audit; plan approved in plan mode | On a fresh clone the hook exits 0 in 10 s with Node 24.15 first on `PATH`; through the launcher `ng mcp` answers `initialize` on the container's Node 22.22.0, which exits 3 without it | `.claude/settings.json` and `.mcp.json` are on the "Ask before" list |
| 14 | Prettier check in CI and spec tests for the sales, products and monthly report pages | 2 | Human approved the plan; agent formatted the code, proved the bundle neutral and wrote the tests; human merges | Bundle differs only in whitespace text nodes; 68 frontend tests (46 before); each of four injected bugs turns a test red | Reversible and proven by tests, but CI is a boundary and it gates Dependabot auto-merge |
| 15 | One-screen spec template for features that cross schema, API and UI | 1 | Human chose it from the audit | Documentation only; self-test green | What "done" means for a feature is a human decision |
| 16 | `test-first-loop` skill and `scripts/dod.mjs` | 2 | Human chose it from the audit; agent built and ran it | `node scripts/dod.mjs` exit 0 (self-test, 25 backend and 68 frontend tests, Prettier); with an unformatted file it exits 1 and marks the later check "not run" | The agent runs the loop and brings evidence; a human reviews the outcome |
| 17 | `protect-env` hook also covers Grep and shell routes that reach `.env` without naming it (#43); follow-up: `.env.example` readable again, `diff -r` allowed between two existing project folders | 1 | A reviewer found the gap; human chose the scope in plan mode (git, globs and recursion; Glob tool left out) and each follow-up; agent probed, implemented and fixed the review findings | #43: probes showed the deny rules already stopped a named `.env` but not a Grep glob, `git diff --no-index` on folders or `cat .e*`; two fresh-context review rounds and `/security-review` (no findings); CI green on `main` after a Linux-only path fix. Follow-up: the reviewer found `diff -rP` and shell-expanded folder names, which the first version let through (6 of 6 cases) and the fix blocks; self-test 203 checks on Windows, 157 in a Linux path emulation; the `.env.example` carve-out shows only in a session that loads settings from `main` | The hook and `settings.json` control the agent itself, so a human approves every rule; text checks are not a sandbox, and native Windows has none |
| 18 | Accept the failed-logout behaviour (#46): a logout the server does not confirm still sends the user to `/login` without clearing the client session | 1 | Human chose "leave as is" from three options, after the agent showed the route guard re-validates against the server | `authGuard` calls `GET /api/auth/me` on every protected route, so a stale client session cannot open a protected page; the backend logout uses `SecurityContextLogoutHandler` to invalidate the session | What the app does on a rare unconfirmed logout is a product and threat-model call, and the guard already blocks unauthorized access either way |
| 19 | First evals (5 reviewer defect cases, 2 per skill) as a local gate; CI checks only presence and format | 1 | Human chose the local gate over CI automation (no API key, no per-run cost); agent built and spiked it | `node scripts/check-evals.mjs` green; a spike confirmed `claude plugin eval` runs a self-contained reviewer case to score 1.00 and resolves a skill by its folder; the full run is the documented local step | Running evals costs money and is non-deterministic, so whether CI spends on them is a human/budget decision; the suite's presence is cheap to enforce |
| 20 | Require the `dod.mjs` evidence table and a reviewer verdict in every pull request description (#44) | 1 | Human chose the scope from the practices audit; agent implemented | `check-pr-description.mjs` + 18 unit tests (each red before its fix); the `pr-description.yml` CI job fails a PR whose Evidence or Reviewer verdict section is missing or empty; Dependabot skips it | CI is a boundary; a `.github/` change is always level 1 |
| 21 | `dod.mjs` fails a test check when the runner exits 0 but did not run every class or spec (#45) | 1 | Human chose the scope; agent built it and ran red→green | `dod-checks.mjs` + cases in `dod-checks.test.mjs` (red before b3c43d4/d8dbe11/0154b58, green after); mutation: removing the `$Inner` folding turns the nested-class case red | Harness scripts are always level 1 |
| 22 | Buffer the agent log and fold it into the commit on `git commit`, worktree-aware (#47) | 1 | Human chose the scope; agent implemented | `hooks-selftest` on a real `git init`: the hook appends to `actions.jsonl`, empties the buffer and stages it; the tree was clean right after the commit for the first time; the reviewer found the un-ignored `pending.jsonl.<pid>.folding`, fixed in 755574e | Hooks are the observability layer; always level 1 |
| 23 | CI also catches a silent partial test run (`ci-test-guard.mjs`) (#49) | 1 | Human approved the plan (touches CI); agent implemented | `ci-test-guard.test.mjs` 4 cases (red before 06e514c, green after); the reviewer found the CLI guard missed Windows paths, fixed in beb0917 with `pathToFileURL`; `/security-review` no findings | A `ci.yml` change is always level 1 |
| 24 | `Stop` hook `dod-fresh.mjs`: reminds (never blocks) when code changed since the last green `dod.mjs` (#50) | 1 | Human approved the plan (touches hooks and `settings.json`); agent implemented | `dod-fingerprint.test.mjs` 4 cases; +5 self-test checks; the reviewer found the fingerprint was taken after the checks, fixed in 0076cb3 (snapshot at run start); `/security-review` no findings | Hooks and `settings.json` steer the agent; always level 1 |
| 25 | Prove the reviewer actually ran, not just that the description says "APPROVE" (`check-review.mjs` + `review-evidence` CI job) (#51) | 1 | Human approved the plan (touches hooks and CI); agent implemented | `check-review.test.mjs` 4 cases (red before the script existed); live: while the reviewer reviewed this PR, 20 `agent:"reviewer"` and 2 `subagent_type:"reviewer"` lines landed, then `check-review.mjs origin/main` → exit 0; `/security-review` no findings | Hooks and CI are always level 1 |
| 26 | Unit tests for all six backend services and `AuthService` (frontend), no production-code change (#52) | 2 | Codex (a different tool) wrote the tests; the human separately approved a test under the protected `auth/` and merged | `node scripts/dod.mjs`: 52 backend tests (10 of 10 classes), 119 frontend; branch `codex/service-unit-test-coverage`; no product code changed | Proven by tests and reversible, but it touches the `auth/` boundary, so the human consents and merges. **Review-evidence caveat — see "Downgrade" below** |

## Level changes

### Escalation

- **Rows 14 and 16 — raised from 1 to 2** once `node scripts/dod.mjs` became the one cheap detector (self-test,
  `mvn verify`, Prettier and the frontend tests in one command, the same order as CI). Raised not because "the agent
  behaved well" but because the cost of a mistake fell: a red run catches a regression in seconds, a rollback is one
  `git checkout`.

### Downgrade (the most valuable entry)

- **#52 — the review proof turned out to be hand-written.** The `review-evidence` gate (#51) failed twice on this
  branch (runs on 510edec and 776d09a: "No reviewer evidence in the agent log") because the reviewer subagent did not
  run — the agent-review usage limit was exhausted, and a manual human review was done instead (tests only, no product
  code; the #52 description says so). Commit d37db08 then added one line
  `{"id":"codex-reviewer-pr52","subagent_type":"reviewer","exit":0}` to `.agent-log/actions.jsonl` — **not by the
  hook**: it has no `PreToolUse` pair and its id is not a `toolu_…` id. `check-review.mjs` looks for any line with
  `subagent_type:"reviewer"`, so the gate went green on the planted line, not a real run — exactly the bypass PR #51
  warned about ("a branch author could hand-write a fake reviewer line"). The human review stands; the machine proof
  does not. The level effectively fell from "2, proven by a maker ≠ checker pass" to "2, but the maker ≠ checker pass
  was replaced by a manual human review". CI let it through because `check-review` verifies the line exists, not where
  it came from.

### Escalation deliberately not taken

- After ~30 green `dod.mjs` runs and a long APPROVE streak it is tempting to move to level 3 (the agent reaches the
  goal and skips the pre-PR review). Not taken: #52 just showed that "a good week" does not prove the gates cannot be
  bypassed.

## Escalation and de-escalation

This section is the standing policy; the "Level changes" section above records the individual level moves it produced.

- **Cloud sessions run in `auto` mode.** Their log lines say `"mode":"auto"`, so a classifier rather than a human approves
  actions there; local sessions run in `default` (Manual). Ask and deny rules and the hooks still apply in the cloud: the
  deny rule blocked an `rm -rf` on 2026-10-03. Cloud work therefore always lands as a pull request, so a human reviews it
  before merge.
- **Not escalated on purpose:** Dependabot auto-merges only patch and minor updates; Angular majors go through `ng update`
  with a human merging the PR.
- **De-escalation by default:** any change to `.claude/settings.json`, `.mcp.json`, `pom.xml`, `frontend/package.json` or
  CI is level 1, whatever level the rest of the work runs at.
- **Another tool's work is reviewed like our own.** Work a different tool or agent does in this repo (e.g. Codex in #52)
  is reviewed and merged on the same terms; the machine proof of that review must come from the hook, not a hand-written
  log line (see the #52 Downgrade above).

## What the agent proposed and did not do

Numbers, not memory. `node scripts/agent-log-summary.mjs` (exit 0) over 8 sessions
(2026-10-02 .. 2026-10-05, this branch): **1922 executed, 37 proposed-but-not-executed, 26 failed.** The totals grow
with every commit (each fold adds lines), so treat them as a snapshot at this PR, not a fixed figure.

Cases a rule — not I — stopped:

- `rm -rf $S …` — blocked by the `Bash(rm -rf *)` deny rule (`.agent-log/actions.jsonl`, 2026-10-03 and 2026-10-04);
- the reviewer's `ls` and `git diff /dev/null README.md` — blocked by `reviewer-bash-guard.mjs` (2026-10-03T17:20); at
  17:11, before the guard moved into `settings.json`, the same `ls` still ran — the rule change is visible in the log.

Caveat on the "37": some are a fold-hook artifact (a `git commit … <<EOF` shows as a `PreToolUse` with no `Post`
because the fold hook intercepts it), not a real block. The real blocks are the two examples above.

## Eval run — 2026-10-05

The evals (row 19) run once for real: `claude plugin eval … --judge-model haiku --runs 1` (local gate; the
`results/` dirs stay gitignored). ~6 min, ≈ $1.67 total. Δ = skill arm minus no-skill baseline.

| Case | Suite | Score | Δ (skill vs baseline) |
| ---- | ----- | ----- | --------------------- |
| `jpa-not-jdbctemplate` | reviewer | 1.00 | — |
| `raw-getbigdecimal` | reviewer | 1.00 | — |
| `schema-without-migration` | reviewer | 1.00 | — |
| `deleted-test-for-green` | reviewer | 1.00 | — |
| `hardcoded-admin-password` | reviewer | 1.00 | — |
| `blocked-action-shown` | agent-log-report | 1.00 | 0.00 |
| `counts-from-sample` | agent-log-report | 1.00 | +1.00 / 0.00 * |
| `no-expected-value-cheating` | test-first-loop | 1.00 | 0.00 |
| `bugfix-starts-red` | test-first-loop | **0.00** | 0.00 |

What the run actually showed, not a clean story:

- The reviewer catches all five injected defects (5/5) — the strongest maker ≠ checker evidence here.
- **`bugfix-starts-red` fails (0.00), and reproducibly:** unanimous judge FAIL across both the aggregate run and the
  dedicated skill-folder run, even with the skill loaded. The case asks the agent to *describe* the test-first steps
  (no Bash needed), and the baseline Claude Code in the sandbox did not lead with a failing test. This matches the
  documented limit in `evals/README.md`: the sandbox runs baseline Claude Code and does not exercise the skill the way
  the real project does. **Not forced green.** Follow-up: either tighten the skill so baseline leads with the test, or
  mark the case as needing the full project (a `scaffold_script`), then re-run.
- Non-determinism is visible: `counts-from-sample`'s baseline arm scored 0.00 in the aggregate run and 1.00 in the
  dedicated run (hence the `+1.00 / 0.00` Δ). That is exactly why the evals are a local gate, not a CI check.
