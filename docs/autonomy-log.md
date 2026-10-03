# Autonomy log

The trust level chosen for each significant piece of agent work, who decided, and the evidence. Before each row ask:
how fast would I notice a mistake, how cleanly can I roll it back, and what evidence convinces me?

Levels (Agentic Engineering Crash Course): 1 Assistant (the agent proposes, a human decides) · 2 Assistant → agent
(the agent proves the result with tests, a human reviews the outcome) · 3 Agent · 4 Agents (parallel subagents) ·
5 Autonomous agents (harness only, human by exception).

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

## Escalation and de-escalation

- **Cloud sessions run in `auto` mode.** Their log lines say `"mode":"auto"`, so a classifier rather than a human approves
  actions there; local sessions run in `default` (Manual). Ask and deny rules and the hooks still apply in the cloud: the
  deny rule blocked an `rm -rf` on 2026-10-03. Cloud work therefore always lands as a pull request, so a human reviews it
  before merge.
- **Not escalated on purpose:** Dependabot auto-merges only patch and minor updates; Angular majors go through `ng update`
  with a human merging the PR.
- **De-escalation by default:** any change to `.claude/settings.json`, `.mcp.json`, `pom.xml`, `frontend/package.json` or
  CI is level 1, whatever level the rest of the work runs at.
