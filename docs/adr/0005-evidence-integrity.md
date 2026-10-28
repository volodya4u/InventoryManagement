# ADR-0005: Evidence integrity — no misleading passes

- **Status:** Accepted (all six slices: 1-4 and 6 here, 5 in #89; with a follow-up to slice 2)
- **Date:** 2026-10-20
- **Deciders:** volodya4u (user), Claude

## Context

The `pr-evidence` gates (ADR-0002, `scripts/pr-evidence.mjs`) are how a pull request proves its loop, but some passes did
not prove anything. In [#72](https://github.com/volodya4u/InventoryManagement/pull/72), slice H1 `harden-security-tests` was an
OpenSpec change, and the **Red → green** gate only read the `docs/specs/` files a branch added. Its ✅ meant "no new spec",
and the test runs listed under it were history that nothing checked. Other rows used the same ✅ for "this does not apply here".

The owner approved a program of six slices, each with its own pull request:

1. explicit gate status;
2. per-test evidence matched to the final code;
3. where review evidence comes from (a reviewer run in CI, and a GitHub review as the human fallback);
4. replayable deliberate-break runs;
5. entry-point tests for the push safeguard;
6. structured owner decisions and trust incidents.

This ADR records slice 1. Later slices extend it.

## Decision (slice 1)

- **Four statuses.** Each gate reports `PASS`, `FAIL`, `N/A` with its reason, or `WAIVED` with each waived item and who
  approved it, through one function (`gateStatus`). Only `FAIL` fails the job. A gate that does not apply is never shown
  as a pass.
- **Red → green follows the criteria, not the file type.** It checks each acceptance criterion that the branch adds or
  changes, either in `docs/specs/*.md` or in the `## Acceptance criteria` table of an `openspec/changes/[archive/]<slice>/proposal.md`.
  A criterion counts as changed when its row text or its named test differs from the merge-base version. A rename (archiving a
  slice) is compared with its old path, so archiving alone asks for no new evidence. A slice proposal that the branch adds
  without a table fails. Otherwise leaving the table out would be the easy way to get a pass.
- **Harness tests can be named**, as `scripts/x.test.mjs` › "title". For now, a harness TestRun of that file covers them.
  Slice 2 matches the test id instead.
- **Waivers are exceptions that stay visible.** A gate waiver is a `docs/qa/waivers/*.md` file that the branch adds. It
  needs `Status: open` (a waiver without it is not open), `Gate: Red → green`, `Criteria: <path> AC<n>, AC<m>` (or
  a path alone, with several paths separated by `;`) and an `Approval:` line.
  `correct.mjs --detect` asks for the owner's disposition, as for any waiver. A waiver must not mention a requirement id
  unless it is meant to waive it.
- **`check-specs.mjs` checks active slice proposals too**: each named test exists and holds the quoted text. In a pull
  request it also checks each proposal the branch adds, even one created straight under `archive/`. Older archived
  slices are not checked, because their tests may since have been renamed.
- `check-specs.mjs` is a locked gate file, so the lock is re-sealed in the same commit, keeping the earlier adaptation
  notes and adding one for this change.

## Consequences

- A hardening slice like #72 now fails the gate unless each criterion has a recorded red, then green run, or an approved
  waiver. Slice 4 adds the break → red → restore → green form for strengthening tests of existing behavior.
- Readers of the report can tell `N/A` from `PASS` at a glance. Tooling that matched on "✅" alone must also accept `➖ N/A`.

## Decision (slice 2, structured-test-evidence)

- **Each test gets its own result.** `scripts/test-run.mjs` reads the runner's own report and records each test with
  its status, through the new `scripts/test-results.mjs`:
  - Surefire XML;
  - Vitest's JSON reporter, through `ng test --reporters json --output-file`, which is in the Angular 22 CLI reference;
  - node:test's `junit` reporter.

  A test id is `Class#method` or `<file> › <suite > title>`. A status is `pass`, `assertion`, `error` or `skipped`.
  The run-level kind is derived from those results. A run without a report is recorded `structured: false`.
- **The gate looks at the criterion's own test.** A failure of another test in the same class or file does not count
  as the criterion's red. Neither does a skipped test, an exception, a compile error or an unstructured run.
- **The green must be on the final code.** The passing run has to come after the red and carry the head commit's code
  fingerprint. A green on older code is reported as stale, and the fix is to re-run the targeted test after the last
  code change.
- **Records written before per-test results no longer count.** That is safe because the gate only reads records the
  branch adds.
- **This slice bootstrapped its own recorder.** Four of its criteria were written before a structured red could be
  recorded, and a fifth (a criterion that names no test) was already enforced by slice 1. Each was shown red by a
  controlled break of the code it tests. The break was in a path the recorder does not use itself: breaking the shared
  `AssertionError` pattern would have made the recorder log `error` instead of `assertion`, and that run was discarded.
  The code was then restored to the same blob ids and the run recorded green. Slice 4 turns this into a recorded,
  replayable workflow.
- `scripts/check-specs.mjs` (locked, re-sealed with the notes kept): a pull request diffs with `-M`, and only the archived
  proposals the branch adds are checked there, because `validateSpecs` already checks the active ones.

## Follow-up to slice 2 (structured-evidence-followups)

Three gaps that the review of #92 left open are now closed:

- **A report that cannot be read gives no results.** This covers Vitest JSON that does not parse, and JUnit text with no
  test element. The run is then recorded `structured: false`, not as one where no test ran.
- **A report that lists tests wins over a compile line in the console.** A test's child process can print such a line.
  The console's `compile` stands only when no test ran.
- **A criterion title shared by several tests in one file is ambiguous.** That happens when it matches only their leaf
  titles. Such a run counts neither as red nor as green, and the gate asks for distinct test titles. A title that
  equals a test's whole suite path still names that one test.

## Decision (slice 3, step A: review-provenance-local)

- **The agent and the owner share one GitHub identity here.** `gh` is authenticated as the owner, and the agent opens
  pull requests as the owner. So a commit status, comment or review on GitHub cannot tell the agent from the owner, and
  GitHub does not let the owner approve their own pull request. A `pull_request` workflow also runs the branch's own copy
  of the workflow file. The planned trusted channel would therefore not be trustworthy as designed. On 2026-10-21 the
  owner chose to ship the local checks now and to leave the trusted channel to its own slice.
- **A verdict counts only on a line the log hook wrote for the reviewer.** That line has a `toolu_` id and its
  `PreToolUse` line with the same id and tool. It is either the reviewer's own `SubagentHandback` or the `Agent` call
  with `subagent_type: reviewer`. Other verdict lines are ignored, and when no valid verdict is left the gate says how
  many. Every verdict line already in `.agent-log/actions.jsonl` passes this rule.
- **An APPROVE needs `blocking === 0`.** An APPROVE with blocking findings, or with no count at all, fails.
- **The limit stays stated.** These rules raise the cost of a forged line, such as the one #52 planted, but cannot
  prove a review happened. A careful author can still write both lines by hand. Only a record outside the branch that
  the author cannot write can prove it: a key the agent cannot use, or a workflow that runs from the base branch.
  `scripts/check-review.mjs` is locked, so the lock is re-sealed with its notes kept.

## Decision (slice 3, step B: review-signed-approval)

- **The trusted channel is a signature the agent cannot make.** The owner approves a pull request by signing an
  annotated tag `approve/<head-sha>` with an SSH key on a FIDO2 hardware key, which needs a touch for each signature.
  The owner chose this on 2026-10-21 over a second GitHub account and over a reviewer run in CI with an API key.
  `scripts/approve-pr.mjs` signs the tag, checks it, pushes it and re-runs the checks.
- **The verifier runs from main.** `.github/workflows/human-approval.yml` runs on `pull_request_target`: it checks out
  main and runs main's `scripts/signed-approval.mjs`. The pull request's head and tags are only fetched as data and
  read by `git verify-tag`. The token is read-only, and no secret is used. The allowed signers are main's
  `quality/allowed-signers`, never a branch's copy, and only hardware-backed (`sk-…`) key types count. The owner marks
  this check as required in branch protection.
- **Both are required, and shown apart.** The agent reviewer's APPROVE (step A) stays required. `pr-evidence` adds a
  **Human approval** row next to **Review**, so a human approval never reads as an automated pass. In CI a missing
  signature fails that row; locally it is N/A, so the finish flow can push before the owner signs.
- **It starts when a key is listed.** This change adds the signers file with no key, so everything stays N/A until a
  pull request adds the owner's public key.
- **The signers file is read by field position.** Both reviews of this slice found that taking the first
  type-looking token let a principal named `sk-ssh-ed25519@openssh.com` carry a software key past the filter. The key
  type is now the field before the key, and it must equal the type encoded in the key blob. `cert-authority` and
  `no-touch-required` lines are refused in any letter case, as OpenSSH reads them, and git itself refuses unknown keys
  (`gpg.minTrustLevel=fully`). The verifier pins `gpg.ssh.program=ssh-keygen` with `-c` on the command line (the
  signing tool pins its own program the same way), so a repository-local signing program cannot print a good signature (`signed-approval-follow-ups`).
  The verifier cannot see how the key was made, so the touch guarantee also needs the key
  itself to have been generated without `-O no-touch-required` (with `-O verify-required`, a PIN is asked too).
- **Limits.**
  - A valid tag proves that a holder of the hardware key approved that commit, not that they read the diff.
  - The touch proves that a signature was made, not what was signed. So `approve-pr.mjs` must run from a checkout of
    main the agent has not touched; it refuses to run when it or its verifier differs from `origin/main`, and it pins
    `gpg.ssh.program`. A tool cannot vouch for itself, though, so the owner should keep a separate clone for approving.
  - The pinned signing program is plain `ssh-keygen`, or the owner's `gpg.ssh.program` from the global git config when
    it is an absolute path; a repository's own setting is never read (`signed-approval-follow-ups`). On Windows the
    owner names Windows' own OpenSSH there (`C:/Windows/System32/OpenSSH/ssh-keygen.exe`), because Git for Windows'
    bundled `ssh-keygen` may not reach a FIDO2 key. The agent runs as the same OS user and could write that global file
    too, so `approve-pr.mjs` prints the program before the touch for the owner to check.
  - `pr-evidence` still runs the branch's own code, so its row can be faked by a branch that edits it.
  - The `human-approval` check is evidence and a reminder, not proof. Its final review found that `pull_request_target`
    runs the **base** branch's workflow, so an author who can push branches, as the agent can, has a way around it:
    1. Open a pull request into a branch whose copy of the workflow always passes.
    2. Retarget it to main.
    3. Re-run that green run.

    None of that shows in the diff against main. `edited` is now a trigger, so a retarget makes main's verifier run
    and go red, but re-running the old green run is still possible. A branch could also add another workflow that
    reports a check with the same name.
  - **The proof is the signature.** Before merging, the owner runs main's verifier from a clean clone of main
    (`node scripts/signed-approval.mjs origin/main <head-sha> --ci`), and `approve-pr.mjs` prints that command. The
    agent cannot alter that clone or forge the hardware-key signature it checks. A GitHub-side protection, such as a
    ruleset that pins the workflow to main's ref, is left to the owner.

## Decision (slice 4: replayable-break-runs)

- **Two workflows, both recorded.** New behaviour goes red → green, as before. Behaviour that already exists goes
  green → controlled break → red → restore → green, through `scripts/break-run.mjs`. The `start`, `break` and
  `restore` steps share one run id. The break is the author's hand-made edit to the code under test. The tool saves it
  as a patch, refuses one that touches the test file or changes nothing, and checks that the restore brings the tree
  back to the start exactly.
- **Evidence that can be replayed.** Each step appends a `BreakRun` record to the agent log: the code fingerprint, every
  test's result, and the patch's SHA-256 and files. `run.json` and `mutation.patch` are committed under
  `docs/evidence/break-runs/<run-id>/`. That folder is outside the code fingerprint, and `-text` in `.gitattributes`
  keeps the patch's bytes exact. `scripts/break-replay.mjs <run-id>` applies the committed patch on a clean tree,
  checks that the recorded test fails on an assertion again, reverses it, and checks that nothing is left behind. It
  needs no pull request narrative.
- **The gate accepts it only where it belongs.** A proposal with a `Kind: hardening` line lets each criterion pass on
  either red → green or a complete break run: the criterion's own test is green at the start, red on an assertion at
  the break, and green again at a restore of the same patch on the head commit's code, with that patch committed as it
  ran. Other slices keep red → green only.
- **The slice that built it showed one criterion red by hand, as slice 2 did.** The guard that break runs only count for
  hardening slices held before the change, so it was shown red with a controlled break of `pr-evidence.mjs`, then
  restored to its blob id. From now on such breaks go through `break-run.mjs`.
- **Closed 2026-10-27 (`test-first-break-run`):** the `test-first-loop` skill now carries the controlled-break recipe
  (`Kind: hardening`, `break-run.mjs start | break | restore`, the replay), with two eval cases; the scores are in
  `evals/record.json`. CLAUDE.md keeps its copy of the how-to.

## Decision (slice 6: structured-decisions)

- **Owner decisions are records.** The Open questions table in `docs/requirements.md` gets these columns:
  - Status (`open | answered | ratified | withdrawn`);
  - Recommended default, Observed behavior and Owner-approved intent, each in its own column;
  - Decision owner, Date and Reference;
  - Requirements and Tests.

  `scripts/decisions.mjs` checks the table, and its test runs on this repository in CI.
  - An open question keeps its decision cells empty, so a default never reads as an answer.
  - An answered or ratified one names who decided, when, and where the decision came from. It links requirements that
    exist and a test that carries `@trace` for one of them.

  That is the OQ-1 path made a rule: owner decision, then the requirement and its spec, then a regression test. OQ-1
  and OQ-2 moved into the new shape with their answers kept word for word. The other fourteen questions stay open.
- **Trust is three facts, not one number.** The autonomy log records Review method (`agent-reviewer | human |
  agent-reviewer + human | none`) and Evidence validity (`valid | weakened: <why> | invalid: <why>`) apart from Level.
  `pr-evidence` requires both on every row a branch adds. Row 26 (#52) now says what its Downgrade section says: a human
  review, with weakened evidence. Older rows say `not recorded`, rather than a value reconstructed from memory.
- **Not yet:** `AGENTS.md` still describes the open questions in one sentence. Changing it needs a paid eval run, so
  `openspec/project.md` carries the recipe.
