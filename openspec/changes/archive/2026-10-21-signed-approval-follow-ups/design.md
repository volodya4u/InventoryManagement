# Design — signed-approval-follow-ups

## The pinned signing program
`git verify-tag` with `gpg.format=ssh` calls `gpg.ssh.program` twice: `-Y find-principals` to name the signer, then
`-Y verify`, and it trusts a `Good "git" signature for <principal>` line in the output. The program is read from git's
config, so in a checkout where the agent can write `.git/config` (where `pr-evidence.mjs` runs locally) a script that
prints that line made any signed tag valid. The new case in `scripts/signed-approval.test.mjs` shows it: before the fix
a tag signed by an unknown key came back `valid`, signed by `owner@example.com`.

A `-c name=value` on git's command line takes precedence over the system, global and repository config files, so
`-c gpg.ssh.program=ssh-keygen` closes it, as `approve-pr.mjs` already does for signing. `ssh-keygen` is then found on
`PATH`, which comes from the environment, not from the repository. In CI, `human-approval.yml` runs on a fresh
checkout of main, so this mattered mostly for the local row; the verifier is the same code in both places.

## The signing program on Windows
Signing needs the security key, and on Windows Git for Windows' bundled `ssh-keygen` (the one `ssh-keygen` resolves to
in Git Bash) may not talk to a FIDO2 key, while Windows' own OpenSSH does. So `approve-pr.mjs` no longer pins plain
`ssh-keygen` for signing. `signingProgram(globalValue)` takes the output of
`git config --global --get gpg.ssh.program`:
- an absolute path (`C:/…`, `C:\…` or `/…`) is used as given;
- anything else falls back to `ssh-keygen` on `PATH`: no setting, a bare or relative name (which would depend on the
  working directory), a drive-relative `C:name`, or a network path (`\\server\…`, `//server/…`).

The choice is still passed with `-c`, so a repository-local `gpg.ssh.program` is never used. `--global` reads only the
user's global file, not the repository's. That file is outside every repository, but the agent runs as the same OS user
and could write it too, so the script prints `Signing with <program>` before asking for the touch, and the header says
to check that line. The verifier keeps plain `ssh-keygen`: verifying reads only public keys and needs no security key.

## A tag that is already on origin
`pushApproval({ tag, sha, run })` runs `git ls-remote --tags origin refs/tags/approve/<sha>` just before the push. git
matches an ls-remote pattern against the end of each ref, so `refs/tags/old/approve/<sha>` would match too; only the
exact ref, or its peeled `^{}` line, counts. When the tag is there:
- the new local tag is deleted, so the next run does not stop at `git tag -s` with "already exists";
- nothing is pushed;
- the message says the tag is already on origin, prints the command that checks it with main's verifier, and says how
  to remove it on origin if it is not a valid approval.

A failed `ls-remote` or a failed push also deletes the local tag and names the step, with git's first stderr line
or its exit code, never the raw `Command failed: …` of `execFileSync`. The runner is passed in so the tests can drive
each path with a fake runner; the real runner is the script's `sh`.

What this does not cover: a local `approve/<sha>` left over from an earlier successful run still makes `git tag -s`
fail before the check. Deleting the local tag after a successful push, or checking origin before signing, would cover
it; neither was asked for here.

## The pure functions
- `driftProblem(diff)` reads the result of `git diff --name-only origin/main -- scripts/approve-pr.mjs
  scripts/signed-approval.mjs`. It names the changed files, and it refuses when git failed (no `origin/main`, or no
  git). The old `git diff --quiet` refused there too, since any exit but 0 counted, but it said the files differed.
- `approvalRun(runs, pr)`, `ciRun(runs, sha)` and `evidenceJob(jobs)` choose what to re-run. The workflow path must be
  exactly `.github/workflows/human-approval.yml` or `.github/workflows/ci.yml` (`endsWith` also matched, say,
  `not-human-approval.yml`), `ciRun` also checks `head_sha` instead of trusting the query, and the newest run wins by
  `created_at` instead of the API's order. The API returns `path` in this form; checked on this repository's runs.

## The report row
`scripts/pr-evidence.mjs` builds the row through `humanApprovalRow(result, env)`, which reads `GITHUB_ACTIONS` from
the environment it is given. The new report case feeds it each state and checks the rendered table: the row follows
**Review**, fails in CI without a signature, is N/A locally, passes when signed, and fails on a bad tag.

## Not touched
`quality/allowed-signers`, `.github/workflows/human-approval.yml` and every `approve/*` tag. `approve-pr.mjs` was not
run; it needs the owner's hardware key.
