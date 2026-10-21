# Deny git log/diff --output and anchor the Edit ask rules

## Why
The permission review of slice 5 ([#89](https://github.com/volodya4u/InventoryManagement/pull/89),
`openspec/changes/push-branch-entry-tests/design.md`, "A hole outside the push rule") found that the allow rules
`Bash(git log *)` and `Bash(git diff *)` in `.claude/settings.json` also match `--output=<file>`. A probe showed that
`git log -1 --format=<text> --output=.git/config` replaces the repository config with any text, with no prompt, and from
there a `pushurl`, `core.hooksPath` or `core.fsmonitor`. The same review found that the ask rule
`Edit(./scripts/push-branch.mjs)` is relative to the current directory, not to the project root. Slice 5 left both
unfixed, because `.claude/settings.json` is on the `AGENTS.md` "Ask before" list.

## What Changes
- `.claude/settings.json` (the user chose these exact rules on 2026-10-20, option "(b) 1+2, plus anchor all ./ ask rules"):
  - deny: add `Bash(git log *--output*)` and `Bash(git diff *--output*)`. A deny rule wins over the allow rules.
  - ask: every `Edit(./…)` rule becomes `Edit(/…)`, anchored at the project root: `pom.xml`, `frontend/package.json`,
    `frontend/pnpm-lock.yaml`, `frontend/pnpm-workspace.yaml`, `.github/**`, `.claude/settings.json`, `.mcp.json` and
    `scripts/push-branch.mjs`. The `.env` deny rules stay as they are.
- `scripts/settings-permissions.test.mjs` (new): pins the deny rules against the `--output` spellings git accepts, that
  plain `git log` and `git diff` stay allowed, and that no Edit ask rule is relative to the current directory.
- `scripts/hooks-selftest.mjs`: one more reviewer-guard case, `git log … --output=.git/config` is blocked.
  `scripts/reviewer-bash-guard.mjs` itself already blocks `--output` and its abbreviations, so it does not change.

## Impact
- Affected files: `.claude/settings.json`, `scripts/settings-permissions.test.mjs`, `scripts/hooks-selftest.mjs`. None is
  a locked gate file (`factory-lock.json`), so no re-seal.
- Behavior change: `git log` and `git diff` with `--output` are refused for the agent, even with approval; so is
  `git diff --output-indicator-*` (see `design.md`). The user runs such a command by hand.
- Harness work: no FR row, so no Factory chain; the change declares no spec delta (`skip_specs` in `.openspec.yaml`).

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given the project settings, when the agent writes `git log` or `git diff` with `--output=<f>` or `--output <f>`, then a deny rule matches before the allow rules | `scripts/settings-permissions.test.mjs` › "git log and git diff with --output, in both spellings git accepts, are denied" |
| 2 | Given the project settings, when the agent writes a plain `git log` or `git diff`, then the allow rules still match and nothing is denied | `scripts/settings-permissions.test.mjs` › "plain git log and git diff stay allowed without a prompt" |
| 3 | Given the ask rules, then every Edit rule, `Edit(/scripts/push-branch.mjs)` included, is anchored at the project root | `scripts/settings-permissions.test.mjs` › "every Edit ask rule is anchored at the project root, push-branch.mjs included" |

The reviewer-guard case in `scripts/hooks-selftest.mjs` is a regression pin, not an acceptance criterion: the guard
already blocked `--output` before this change, so the case could not go red.
