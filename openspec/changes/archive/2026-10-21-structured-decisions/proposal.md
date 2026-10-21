# Owner decisions and trust incidents as records

## Why
Slice 6 of the evidence-integrity plan (ADR-0005). Two kinds of judgement were recorded only as prose.

- **Owner answers to open questions.** OQ-1 and OQ-2 were answered in bold text inside a "Recommended default" column,
  with these facts mixed into one cell:
  - what the code does;
  - what the owner wanted;
  - the date;
  - the test that holds it.

  Nothing checked that an answer named its owner, its source, the requirement it governs or a test that holds it. And
  nothing stopped a default from reading like an answer.
- **Trust incidents.** The autonomy log had only a Level column. In #52 the evidence of review was a hand-written line,
  while the level stayed the same. The incident was recorded only in a prose section, and the table could not show it.

## What Changes
- **Structured open questions.** The Open questions table in `docs/requirements.md` gets the columns ID, Question,
  Status (`open | answered | ratified | withdrawn`), Recommended default, Observed behavior, Owner-approved intent,
  Decision owner, Date, Reference, Requirements and Tests.
  - OQ-1 and OQ-2 move into the new shape with their answers kept word for word, split into intent and observed
    behaviour as the old rows themselves marked them.
  - The other fourteen questions stay `open`, with empty decision cells. Each is linked to the requirement rows that
    cite it.
- **The checker.** New `scripts/decisions.mjs` checks the table:
  - a status is one of the four;
  - an open question has no intent, owner or date;
  - an answered or ratified question names an owner, a YYYY-MM-DD date, a reference and an intent, links requirements
    that exist, and links tests that exist and carry `@trace` for one of them;
  - a withdrawn question names a reference.

  `scripts/decisions.test.mjs` also checks this repository's table, so CI enforces it.
- **The autonomy log.** `docs/autonomy-log.md` gets two columns, Review method (`agent-reviewer | human | agent-reviewer
  + human | none`) and Evidence validity (`valid | weakened: <why> | invalid: <why>`), next to Level.
  - Row 26 (#52) records `human` and `weakened: …`.
  - Older rows say `not recorded`.
  - `pr-evidence`'s Autonomy log gate requires both columns on every row a branch adds.
- **The recipe.** `openspec/project.md` documents the decision → requirement and spec → regression test path.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given an answered question, when the table is checked, then it needs an owner, a date, a reference, an existing requirement and a test that traces it | `scripts/decisions.test.mjs` › "an answered question needs its owner, date, reference, an existing requirement and a test that traces it" |
| 2 | Given an open question with an intent or a decision owner, when the table is checked, then it fails, while its default and observation may stay | `scripts/decisions.test.mjs` › "an open question keeps its decision cells empty, so a default is never mistaken for an answer" |
| 3 | Given a row, when it is parsed, then observed behavior and owner-approved intent are separate, an unknown status is refused, and a table without the columns is refused | `scripts/decisions.test.mjs` › "observed behavior and owner-approved intent are separate cells, and a status outside the four is refused" |
| 4 | Given this repository, when its open questions are checked, then they are well formed | `scripts/decisions.test.mjs` › "the repository's own open questions are well formed" |
| 5 | Given an autonomy-log row a branch adds, when the gate checks it, then it needs a review method and an evidence validity apart from its level | `scripts/pr-evidence.test.mjs` › "autonomy: a new row records its review method and evidence validity apart from its level" |

## Impact
- Affected specs: none. These are a Factory document's format and the harness; no FR row changes meaning. The decision
  is recorded in `docs/adr/0005-evidence-integrity.md`.
- Affected code:
  - `scripts/decisions.mjs` (new) and its test;
  - `scripts/pr-evidence.mjs` and its test;
  - `docs/requirements.md` (the Open questions table and its intro);
  - `docs/autonomy-log.md` (two columns);
  - `openspec/project.md`.

  No locked gate file changes.
- Not in this slice: `AGENTS.md` still says "record the owner's answer in its row". Changing it needs a paid eval run,
  so `openspec/project.md` carries the recipe for now.
