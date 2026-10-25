# Share the OpenSpec harness setup

## Why

OpenSpec 1.15 generated project-local workflows for Codex and Claude Code, but the files are still untracked. Its new
`config.yaml` is only a template, and the generated workflows grant the OpenSpec CLI without the human decision this
repository's Trust Level 1 rule requires. The new `.agents/skills/` folders also need eval cases before the harness
gate will accept them.

## What Changes

- Add concise project context and artifact/operation rules to `openspec/config.yaml`, while retaining the existing
  `openspec/project.md` used by `AGENTS.md` and the decisions check.
- Share the six OpenSpec workflows for Codex and Claude Code, plus Claude Code's six chat commands. Remove their
  generated OpenSpec CLI auto-approval so this repository's permission rule still applies.
- Give each new shared skill two eval cases and mirror those cases to Claude Code while retaining OpenSpec's
  tool-specific skill instructions. Record fresh eval scores.
- Keep the unrelated traceability working-tree changes out of this slice.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given this project's OpenSpec configuration, when a workflow requests instructions, then it receives the local spec track, acceptance-evidence and owner-decision rules without losing the existing project recipe | `scripts/openspec-setup.test.mjs` › "OpenSpec config carries the project's Factory workflow" |
| 2 | Given the shared OpenSpec workflow files, when Codex or Claude Code loads them, then none preapproves OpenSpec CLI commands outside the repository allow-list | `scripts/openspec-setup.test.mjs` › "OpenSpec workflows do not preapprove CLI commands" |
| 3 | Given the six OpenSpec skills shared with Codex and Claude Code, when the harness checks them, then every skill has two well-formed eval cases in both locations, while each tool keeps its own invocation syntax | `scripts/openspec-setup.test.mjs` › "OpenSpec skills have eval cases and target-specific instructions" |
| 4 | Given a skill sync run, when OpenSpec has generated different instructions for Codex and Claude Code, then the sync preserves both versions and mirrors the shared eval cases | `scripts/skills-sync.test.mjs` › "sync preserves OpenSpec target instructions and mirrors their evals" |

## Impact

- Affected specs: none (agent tooling only; `skip_specs: true`).
- Affected files: OpenSpec configuration, generated skills and commands, skill eval cases, their mirror, the eval
  record, this change's artifacts, and the autonomy log. No application or locked gate files change.
