# Push-branch entry tests

## Why
`scripts/push-branch.mjs` is the one push `.claude/settings.json` allows without a prompt (`Bash(node scripts/push-branch.mjs)`).
Its tests ([#78](https://github.com/volodya4u/InventoryManagement/pull/78)) only cover `pushArguments()`; nothing runs the
entry point, so nothing shows that a refused call leaves the remote alone, that the allowed call moves only the intended
branch, or what the push does under repository settings and environment variables the script does not look at. This is
slice 5 of the evidence-integrity program.

## What Changes
- `scripts/push-branch.test.mjs` runs the real entry point (`node <abs>/scripts/push-branch.mjs`) against temporary
  repositories in the OS temp folder: a bare `remote.git` and a clone whose `origin` is it. Nothing reaches GitHub. The
  remote's refs (`git for-each-ref`) are compared before and after each call.
- Two holes the tests found are closed in `scripts/push-branch.mjs`:
  - `push.followTags` (repository or user config) made git push annotated tags along with the branch. The push now
    passes `--no-follow-tags`; `pushArguments()` and its unit tests change accordingly.
  - A `remote.origin.pushurl`, a `url.*.insteadOf` / `pushInsteadOf` rewrite, a second `remote.origin.url`, or the same
    settings injected through `GIT_CONFIG_COUNT`, sent the push to a repository other than the one `remote.origin.url`
    names, with exit 0. `main()` now refuses (exit 2) unless origin has exactly one URL and git's push URL for origin is
    that URL unchanged.
- `design.md` records what each execution-context probe showed (`GIT_DIR`, the config settings above,
  `remote.origin.mirror`, `NODE_OPTIONS`, the working directory) and reviews the exact-command permission rule.

## Impact
- Affected code: `scripts/push-branch.mjs`, `scripts/push-branch.test.mjs`. `push-branch.mjs` is not a locked gate file
  (`factory-lock.json`), so no re-seal. No change to `.claude/settings.json` (see `design.md`).
- Behavior change: a checkout whose origin has a push URL that differs from its fetch URL (including a user-level
  `insteadOf`, such as an SSH rewrite of `https://github.com/`) is now refused; such a push is done by hand, with a prompt.
- Harness work: no FR row, so no Factory chain; the change declares no spec delta (`skip_specs` in `.openspec.yaml`).

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given any argument, when the script runs, then it exits 2 and the remote's refs are unchanged | `scripts/push-branch.test.mjs` › "extra arguments are refused with exit 2 and leave the remote's refs unchanged" |
| 2 | Given a detached HEAD, when the script runs, then it exits 2 and the remote is unchanged | `scripts/push-branch.test.mjs` › "a detached HEAD is refused with exit 2 and no remote change" |
| 3 | Given `main`, `feature/x` or another name git allows outside `claude/<name>`, then exit 2 and no remote change | `scripts/push-branch.test.mjs` › "main, feature/x and other branch names git allows are refused with exit 2 and no remote change" |
| 4 | Given a `claude/x:main`-style name, then git refuses to create it, and a HEAD file naming it by hand is refused with exit 2 | `scripts/push-branch.test.mjs` › "a claude/x:main branch cannot exist: git refuses the name, and a HEAD file naming it is refused with exit 2" |
| 5 | Given `claude/ok` checked out, then exit 0, only `refs/heads/claude/ok` is added, `main` keeps its SHA and upstream is set | `scripts/push-branch.test.mjs` › "claude/ok is pushed with exit 0: only refs/heads/claude/ok is added, main keeps its SHA and upstream is set" |
| 6 | Given a `claude/*` branch in a linked worktree (how the agent works here), then it is pushed the same way | `scripts/push-branch.test.mjs` › "a claude/* branch checked out in a linked worktree is pushed the same way" |
| 7 | Given a `pre-receive` hook that rejects, then a non-zero exit that is not 2, and no ref moves | `scripts/push-branch.test.mjs` › "a remote rejection from a pre-receive hook gives a non-zero exit and moves no ref" |
| 8 | Given an unreachable origin, then the script exits with the code a direct `git push` gives | `scripts/push-branch.test.mjs` › "an unreachable origin gives git's own exit code" |
| 9 | Given `push.followTags` and an annotated tag, then only the branch reaches the remote | `scripts/push-branch.test.mjs` › "push.followTags does not let an annotated tag ride along with the branch" |
| 10 | Given `remote.origin.mirror`, then git refuses the refspec push and nothing changes | `scripts/push-branch.test.mjs` › "remote.origin.mirror cannot turn the push into a mirror: git refuses it and nothing changes" |
| 11 | Given a repo-local `remote.origin.pushurl`, then exit 2 and neither repository changes | `scripts/push-branch.test.mjs` › "a repo-local remote.origin.pushurl is refused with exit 2 and nothing is pushed anywhere" |
| 12 | Given a `url.*.insteadOf` or `pushInsteadOf` rewrite of origin, then exit 2 and neither repository changes | `scripts/push-branch.test.mjs` › "a url insteadOf or pushInsteadOf rewrite of origin is refused with exit 2 and nothing is pushed anywhere" |
| 13 | Given a second `remote.origin.url`, then exit 2 and neither repository changes | `scripts/push-branch.test.mjs` › "a second remote.origin.url is refused with exit 2 and nothing is pushed anywhere" |
| 14 | Given a pushurl injected through `GIT_CONFIG_COUNT`, then exit 2 and neither repository changes | `scripts/push-branch.test.mjs` › "a pushurl injected through GIT_CONFIG_COUNT in the environment is refused with exit 2" |
| 15 | Given `GIT_DIR` naming another clone, then that clone's branch and origin are used, under the same rules | `scripts/push-branch.test.mjs` › "GIT_DIR in the environment chooses the repository: its current branch and its origin are used, under the same rules" |
