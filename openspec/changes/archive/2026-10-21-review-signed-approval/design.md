# Design — review-signed-approval

## Why a signed tag
In this repository the agent can write anything the owner can write through `gh` and git:
- PR comments and reviews;
- commit statuses;
- tags;
- files on a branch.

GitHub does not let the owner approve their own PR. What the agent cannot do is make a signature with a key on a FIDO2
security key. The key never leaves the device, and each signature needs a touch. `git tag -s` with `gpg.format=ssh`
makes such a signature, and `git verify-tag` with `gpg.ssh.allowedSignersFile` checks it, naming the principal in a line
`Good "git" signature for <principal>`.

## Why the check must run from main
The `pr-evidence` job runs on `pull_request`, so it uses the branch's own `ci.yml` and the branch's own scripts. A
branch could change the verifier to always say `valid`. The `human-approval` workflow runs on `pull_request_target`
instead:

- **Main's workflow and code:** GitHub reads the workflow file from main, and the default checkout is main. So the
  verifier that runs is main's.
- **The PR is only data:** `refs/pull/<n>/head` and the `approve/*` tags are fetched and read by `git verify-tag`, never
  executed.
- **Least privilege:** the token is `contents: read`, no secret is used, and `${{ }}` reaches the script only through
  `env`.

The required check protects against a branch that only edits the verifier, `pr-evidence.mjs` or `ci.yml`. It is not
proof against an author who can push branches. The final review found the way around it:

1. `pull_request_target` runs the **base** branch's workflow, so such an author opens a pull request into a branch whose
   copy of the workflow always passes.
2. The author retargets it to main.
3. The author re-runs that green run.

A second workflow reporting the same check name is another way. `edited` is a trigger, so a retarget makes main's
verifier run, but the old green run can still be re-run. The proof is the signature: before merging, the owner runs
`node scripts/signed-approval.mjs origin/main <head-sha> --ci` from a clean clone of main, as `approve-pr.mjs` prints.

## Verification
`signedApproval(root, { base, head, keyTypes })` goes through these steps in order, and stops at the first that fails:

1. Read `${base}:quality/allowed-signers`, splitting each line by position as `principals [options] keytype key`.
   Keep a line only if:
   - its key type is in `keyTypes` (by default `sk-ssh-ed25519@openssh.com` and `sk-ecdsa-sha2-nistp256@openssh.com`);
   - that type equals the type encoded in the key blob;
   - it has neither the `cert-authority` nor the `no-touch-required` option.

   A principal can be any string, so a principal that looks like a key type counts for nothing. If no line is kept,
   the state is `unset`.
2. `refs/tags/approve/<head-sha>` must exist (else `missing`) and be an annotated tag object (else `invalid`, "lightweight").
3. The tag's commit must be the head commit (else `invalid`, "points at …").
4. `git verify-tag` must succeed and name a principal (else `invalid`, with the first line git printed). It runs with
   `gpg.minTrustLevel=fully` against a temporary file holding the kept lines, so git itself also refuses a key the
   file does not list. Then the state is `valid`.

The tests pass `keyTypes: ["ssh-ed25519"]`, because a test cannot touch a hardware key. They create their keys with
`ssh-keygen` in a temporary folder and remove them afterwards. A separate case pins the hardware-only default.

## The two places it shows
- **`pr-evidence`:** a **Human approval** row, `FAIL` in CI when the tag is missing and `N/A` locally. This keeps the
  local finish flow (push once no gate fails) working before the owner signs.
- **`human-approval` workflow:** the same row, from main's code, as a check that can be required.

## Re-running after the signature
Pushing a tag triggers neither `pull_request` nor `pull_request_target`. So `approve-pr.mjs` re-runs two things through
the API: the latest `human-approval` run for the PR, and the `pr-evidence` job of the latest CI run on its head. If it
cannot find a run, it says so and points to the Checks tab.
