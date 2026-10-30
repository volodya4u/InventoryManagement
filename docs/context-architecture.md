# Context architecture — Flower Shop Inventory

Which context an agent pays for on every turn (static) and which it loads only when a task needs it (dynamic). The
static layer costs tokens on every turn, so it stays small on purpose. `README.md` ("Static vs dynamic context")
explains the idea and the CI checks behind it; this file lists the parts and the rules for moving one.

## Static layer — loaded every session

| Source | When it loads | Holds |
|---|---|---|
| `CLAUDE.md`, which imports `AGENTS.md` | Every Claude Code session | Commands, the Definition of done, the Project Factory rules, conventions, boundaries |
| `AGENTS.md` alone | Every session of any other agent tool | The same rules without the Claude Code section |
| Skill and agent descriptions (frontmatter of `.claude/skills/*/SKILL.md`, `.claude/agents/reviewer.md`) | Every Claude Code session | One description each, so the agent knows when to load the body |
| `.claude/rules/frontend.md` | Only when the work touches `frontend/**` | Angular 22 facts and the frontend decimal rule |

No token budget is set. Measure the always-loaded files with `wc -c CLAUDE.md AGENTS.md` (bytes divided by four is a
rough token count) before and after a change that adds rules to them.

## Dynamic layer — loaded on demand

| Loaded when… | Source |
|---|---|
| Working on a capability | Its code under `src/main/java/com/flowershop/inventory/<feature>/` or `frontend/src/`, and its spec under `openspec/specs/<capability>/` |
| Changing behaviour or fixing a bug | The `test-first-loop` skill body (`.agents/skills/test-first-loop/`, copied to `.claude/skills/`) |
| Proposing, applying or archiving an OpenSpec change | The `openspec-*` skills and `openspec/project.md` |
| Using a library API | The `context7` MCP server, or `angular-cli` for the installed Angular version (`.mcp.json`) — never model memory |
| Reviewing a branch | The `reviewer` subagent, which starts with a fresh context of its own |
| Doing QA or preparing a release | `docs/qa/` and the generated traceability and trajectory reports |
| Resuming work | `docs/current-state.md`, read at the start of a session and not imported into `CLAUDE.md`; the "Where to start" section of `AGENTS.md` points to it |
| Session start in the cloud | `scripts/session-start.mjs` prints the setup summary (`SessionStart` hook) |
| Session end after a code change | The `dod-fresh` `Stop` hook injects a reminder only when the code changed since the last green `dod.mjs` |

## Rules

1. **Default to dynamic.** A rule goes into `AGENTS.md` or `CLAUDE.md` only if most sessions need it and the agent cannot
   find it in the code or spec in front of it.
2. **A pointer, not the detail.** Prefer one line that names a skill, spec or doc over pasting its content into the static
   layer.
3. **Path-scoped when it is about one area.** Rules for one part of the tree go in `.claude/rules/` with a `paths:` filter,
   as `frontend.md` does.
4. **Changing the static layer is reviewed.** Editing `AGENTS.md`, a skill or `reviewer.md` needs the matching evals
   (`evals/README.md`). Moving a part from one layer to the other, or setting a budget, is recorded as an ADR in
   `docs/adr/`.
