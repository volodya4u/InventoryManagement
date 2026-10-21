# Require the owner's signed approval, verified from main's code

## Why
Step A of slice 3 (#97) made a forged reviewer line harder to write, but it cannot prove a review happened. The agent
shares the owner's GitHub identity and git config, and a pull request runs its own copy of `pr-evidence.mjs` and
`ci.yml`. So the agent can write any record the gates read, or edit the code that checks them. On 2026-10-21 the owner
chose a trusted channel the agent cannot use:

- **The signature:** an annotated tag `approve/<head-sha>`, signed with an SSH key on a FIDO2 hardware key, so each
  signature needs a physical touch.
- **The verifier:** it runs from main's code.
- **The policy:** both the agent reviewer's APPROVE and this signature are required.

## What Changes
- New `scripts/signed-approval.mjs`. A tag counts as an approval only when all of these hold:
  - it is annotated;
  - it points at the head commit, so an approval of another commit cannot be replayed;
  - `git verify-tag` accepts it against the allowed signers in `quality/allowed-signers`, read from the base ref,
    never from the branch;
  - its key type is hardware-backed (`sk-…`); other key types are ignored and reported.

  The result is one of four states: `unset` (no usable key on the base), `missing`, `invalid` or `valid`.
- `scripts/pr-evidence.mjs` gets a **Human approval** row of its own, next to **Review**, so a human approval never reads
  as an automated pass:
  - In CI (`GITHUB_ACTIONS=true`), a missing approval fails.
  - Locally, a missing approval is `N/A`.
  - A bad tag fails everywhere.
  - An unset signers file is `N/A`.
- New `.github/workflows/human-approval.yml`. It runs on `pull_request_target`, so GitHub uses main's copy of the
  workflow. It checks out main only, and fetches the pull request's head and the `approve/*` tags as data. It then runs
  main's copy of the verifier with `contents: read` and no secret. Nothing from the pull request is executed. The owner
  marks this check as required in branch protection.
- New `scripts/approve-pr.mjs`, for the owner to run:
  1. it signs the tag, which needs the key's touch;
  2. it checks the tag as CI will, and deletes it if it would fail;
  3. it pushes that one tag;
  4. it re-runs both checks, because pushing a tag does not trigger them.
- New `quality/allowed-signers`, with no key yet. Signed approval stays `N/A` until a pull request adds the owner's
  public key.
- `CLAUDE.md` tells the agent never to run the script, never to touch an `approve/*` tag, and never to edit the signers
  file.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a tag signed by an allowed signer on the head commit, when the approval is checked, then it is valid and names the signer | `scripts/signed-approval.test.mjs` › "a tag signed by an allowed signer on the head commit is valid and names the signer" |
| 2 | Given a tag signed by an unknown key, an unsigned or lightweight tag, or a signed tag on another commit, when the approval is checked, then it is not valid | `scripts/signed-approval.test.mjs` › "an unknown key, an unsigned tag, a lightweight tag or a tag on another commit is not valid" |
| 3 | Given a branch that adds its own key, or a base without a usable key, when the approval is checked, then the base's file decides and only hardware-backed keys count | `scripts/signed-approval.test.mjs` › "the allowed signers come from the base ref, not the branch, and only hardware-backed key types count" |
| 4 | Given each approval state, when the Human approval row is built, then a missing approval fails in CI and is N/A locally, a bad tag fails in both, and an unset file is N/A | `scripts/signed-approval.test.mjs` › "human approval: in CI a missing signature fails, locally it is N/A, a bad tag fails in both, and an unset signers file is N/A" |
| 5 | Given the command line in CI mode, when it runs, then it exits 1 without a valid approval, and 0 with one or when signing is not set up | `scripts/signed-approval.test.mjs` › "the command line exits 1 in CI without a valid approval, and 0 with one or when signing is not set up" |
| 6 | Given the human-approval workflow, when it is read, then it triggers on pull_request_target only, checks out main only, runs only main's verifier, reads only, and interpolates no expression into a script | `scripts/human-approval-workflow.test.mjs` › "the human-approval workflow runs main's verifier on pull_request_target and never runs the pull request's code" |

## Impact
- Affected specs: none. This is harness work with no FR rows. The decision is recorded in
  `docs/adr/0005-evidence-integrity.md`.
- Affected code and config:
  - `scripts/signed-approval.mjs`, `scripts/approve-pr.mjs` and their tests;
  - `scripts/pr-evidence.mjs`;
  - the new workflow;
  - `quality/allowed-signers`;
  - `CLAUDE.md`.

  No locked gate file changes. The owner approved the new workflow on 2026-10-21.
- Takes effect in two steps:
  1. When this merges, the workflow exists, and everything still shows `N/A` while the signers file has no key.
  2. Once a pull request adds the owner's hardware public key, every later pull request needs a signed tag.
- Limits:
  - A valid tag proves that a holder of the hardware key approved that commit. It does not prove they read the diff.
  - The `human-approval` check is evidence, not proof. An author who can push branches can fake it through a base
    branch whose copy of the workflow always passes, then retarget the pull request to main. `edited` is a trigger, so
    the retarget makes main's verifier run, but the old green run can still be re-run.
  - The proof is the owner running main's verifier from a clean clone of main before merging. `approve-pr.mjs` prints
    the command.
- Dependencies: none (git and OpenSSH `ssh-keygen` only). No `AGENTS.md`, skill or reviewer change.
