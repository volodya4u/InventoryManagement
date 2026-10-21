# Design — agents-decision-recipe

## A pointer, not a second copy
`AGENTS.md` names the recipe and its check in one sentence and leaves the steps in `openspec/project.md`. Two full
copies would drift, and `AGENTS.md` is embedded word for word in the factory-rules eval prompts, so every extra line
there is paid for on each eval run.

## Holding the pointer
The new case in `scripts/decisions.test.mjs` reads the Project Factory section through `agentsSection()` from
`scripts/factory-rules-evals.mjs`, the same function that builds the eval prompts, so it checks exactly the text an
agent and the evals see. It also checks that the "Owner decisions" heading still exists in `openspec/project.md`.

## Evals
Changing `AGENTS.md` changes the input fingerprint in `evals/record.json`, so the `pr-evidence` **Evals** gate needs a
new record. The run pins `claude-sonnet-5-5`, the model of the previous record, so the scores compare like for like.
