# Close the follow-ups of the signed-approval review

## Why
The final review of slice 3 step B (#99, `review-signed-approval`) approved it and listed four non-blocking
follow-ups:

- **The verifier trusts the repository's signing program.** `scripts/approve-pr.mjs` pins `gpg.ssh.program` when it
  signs, but `scripts/signed-approval.mjs` does not when it verifies. A repository-local `gpg.ssh.program` that prints
  a good signature turns any signed tag into a valid approval in that checkout. The agent can write that setting where
  `pr-evidence.mjs` runs locally.
- **A second approval fails with a raw error.** When `approve/<sha>` is already on origin, `git push` refuses and the
  owner sees `approve-pr: Command failed: git push …`, with the new signed tag left behind locally.
- **Two decisions have no test.** The drift guard (the script or its verifier differs from origin/main) and the run
  selection (which human-approval run and which pr-evidence job to re-run) live inside `main()` and `rerun()`.
- **No test shows the Human approval row in the report table.**

The main session added a fifth item: the owner is on Windows, where Git for Windows' bundled `ssh-keygen` may not reach
a FIDO2 security key and Windows' own `C:/Windows/System32/OpenSSH/ssh-keygen.exe` does. `approve-pr.mjs` pins plain
`ssh-keygen`, which in Git Bash is the bundled one, so the owner's first signature may fail.

## What Changes
- `scripts/signed-approval.mjs` passes `-c gpg.ssh.program=ssh-keygen` to `git verify-tag`, as `approve-pr.mjs` does
  when it signs. A command-line `-c` wins over every config file, so a repository-local program is never called.
- `scripts/approve-pr.mjs`:
  - Before asking for the touch, `refuseExistingApproval()` stops when `approve/<sha>` is already in the local
    repository or on origin. It says where the tag is and how to check or remove it, and deletes nothing, since the
    tag may be a valid approval. The final review found the reason: the fetch of the pull request's head auto-follows
    tags that point into it, so a tag already on origin arrived locally and `git tag -s` failed with a raw error before
    the push check ran. The fetch now passes `--no-tags` as well.
  - Before pushing, it runs `git ls-remote --tags origin refs/tags/approve/<sha>` and counts only that exact ref (a
    pattern also matches refs that merely end in it). If the tag is already there, it deletes the local tag and says so,
    with the command that checks the existing tag. If origin cannot be read or the push fails, it also deletes the local
    tag and names the step that failed.
  - The drift guard and the run selection become exported pure functions, `driftProblem()`, `approvalRun()`, `ciRun()`
    and `evidenceJob()`, and the push becomes `pushApproval()` with the command runner passed in, so a test can drive
    it without a remote. The selection matches the workflow path exactly and sorts by creation time instead of relying
    on the API's order.
  - It signs with `signingProgram()`: the owner's `gpg.ssh.program` from the global config
    (`git config --global --get gpg.ssh.program`) when it is an absolute path, else plain `ssh-keygen`. A
    repository-local setting is still never read, since the choice is pinned with `-c`. The script prints the program
    before asking for the touch. The verifier keeps plain `ssh-keygen`: verifying needs no security key.
- `scripts/pr-evidence.mjs` builds its Human approval row through an exported `humanApprovalRow()`, so the report test
  can show it.
- New `scripts/approve-pr.test.mjs`; new cases in `scripts/signed-approval.test.mjs` and `scripts/pr-evidence.test.mjs`.

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given a repository-local gpg.ssh.program that always reports a good signature by an allowed signer, when a tag signed by an unknown key is checked, then it is still invalid | `scripts/signed-approval.test.mjs` › "a repository-local gpg.ssh.program cannot fake a good signature" |
| 2 | Given approve/<sha> already on origin, when the approval is pushed, then nothing is pushed, the local tag is deleted and the message says the tag already exists; a ref that only ends in the tag name does not count | `scripts/approve-pr.test.mjs` › "an approval tag already on origin is not pushed: the local tag is deleted and the message says so" |
| 3 | Given origin cannot be read or the push fails, when the approval is pushed, then the local tag is deleted and the message names the step that failed; otherwise the one tag is pushed | `scripts/approve-pr.test.mjs` › "when origin cannot be read or the push fails, the local tag is deleted and the message names the step" |
| 4 | Given the comparison of the approval tools with origin/main, when either file differs or the comparison fails, then the drift guard refuses, and it passes only on an empty, successful diff | `scripts/approve-pr.test.mjs` › "the drift guard refuses when the script or its verifier differs from origin/main, or the comparison fails" |
| 5 | Given the workflow runs and jobs the API returns, when the runs to re-run are chosen, then the latest human-approval run of this pull request and the pr-evidence job of the latest CI run on the head are picked, and other workflows, pull requests and commits are not | `scripts/approve-pr.test.mjs` › "run selection picks the latest human-approval run of the pull request and the pr-evidence job of the latest CI run on the head" |
| 6 | Given each approval state, when the pr-evidence report is built, then the Human approval row follows Review and reads FAIL in CI without a signature, N/A locally and PASS when signed | `scripts/pr-evidence.test.mjs` › "the report shows the Human approval row after Review: FAIL in CI without a signature, N/A locally, PASS when signed" |
| 7 | Given the owner's global gpg.ssh.program, when the signing program is chosen, then an absolute path is used as given, and no setting, a relative name or a network path falls back to plain ssh-keygen | `scripts/approve-pr.test.mjs` › "the signing program is an absolute gpg.ssh.program from the global config, else plain ssh-keygen" |
| 8 | Given approve/<sha> already in the local repository or on origin, or origin unreadable, when the owner starts an approval, then it stops before the touch, signs nothing, deletes nothing and says where the tag is and how to check it; with the tag nowhere it goes ahead | `scripts/approve-pr.test.mjs` › "an approval tag already here or on origin stops the approval before the touch" |

## Impact
- Affected specs: none. This is harness work with no FR row; the change declares no spec delta (`skip_specs` in
  `.openspec.yaml`).
- Affected code: `scripts/signed-approval.mjs`, `scripts/approve-pr.mjs`, `scripts/pr-evidence.mjs` and their tests.
  None is a locked gate file (`factory-lock.json`), so no re-seal and no `Refs: PD-n`.
- Not touched: `quality/allowed-signers`, `.github/workflows/human-approval.yml`, any `approve/*` tag. The agent did
  not run `approve-pr.mjs`; its tests use a fake command runner and never reach a remote.
- Takes effect for the verifier when this merges, since `human-approval.yml` runs main's copy.
