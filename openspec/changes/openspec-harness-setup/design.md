# Design — openspec-harness-setup

## Keep one project recipe

`AGENTS.md` and `openspec/project.md` remain the authoritative human-readable project rules. The new
`openspec/config.yaml` supplies the short subset OpenSpec injects into proposal, spec, task, apply and archive
instructions. It points to those sources rather than duplicating every rule.

## Share the generated workflows safely

Keep OpenSpec's six generated workflows under `.agents/skills/` and Claude's tool-specific copies under
`.claude/skills/`. Change `scripts/skills-sync.mjs` to mirror eval cases without replacing generated Claude skill
instructions; it still copies every non-OpenSpec skill in full. Keep Claude's `/opsx:*` command adapters in
`.claude/commands/opsx/`. Remove
`allowed-tools: Bash(openspec:*)` from both forms: `openspec` is not in `.claude/settings.json`'s allow-list. A
focused test catches the line if a future `openspec update` restores it, making each update an explicit review.

## Evals and evidence

Add two self-contained cases to each new skill's `evals/` folder, with prompts and graders that test the workflow's
core boundary. Sync them to `.claude/skills/` while preserving the Claude-specific `SKILL.md` content. Run
`scripts/eval-record.mjs`, the Factory checks and `dod.mjs`.
The fresh read-only reviewer checks the entire diff before the pull request.
