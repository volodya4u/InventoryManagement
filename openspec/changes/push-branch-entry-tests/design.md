# Design — push-branch-entry-tests

## What the push safeguard promises

`node scripts/push-branch.mjs` (no arguments) pushes the current branch, only when it is `claude/<name>`, to the branch
of the same name on `origin`, with upstream tracking, and nothing else. Exit 0 = pushed, 2 = refused, otherwise git's
code. The `.claude/settings.json` allow rule is the exact command `Bash(node scripts/push-branch.mjs)`.

The guard keeps a cooperating agent from making a costly push by mistake (a flag, a refspec, `main`). It is not a sandbox
around a hostile one: other allow rules already run code the agent wrote (`node scripts/test-run.mjs harness <any>.test.mjs`,
`mvn test`), and such code can call `git push` itself with the same credentials. The boundary for `main` is on GitHub:
the "Protect main" ruleset blocks deletion and non-fast-forward pushes and requires a pull request and status checks,
with no bypass actors (`gh api repos/volodya4u/InventoryManagement/rulesets/24460666`).

## How the tests run the entry point

`scripts/push-branch.test.mjs` builds one template in a temporary directory under `os.tmpdir()` (a bare `remote.git`
with `main`, and `clone` whose `origin` is `../remote.git`, with `claude/ok` checked out one commit ahead) and copies it
for each test, so a test costs one copy instead of a dozen git processes. The script runs as
`node <abs>/scripts/push-branch.mjs` with `cwd` set to the clone. Every git process gets an environment without the
caller's `GIT_*` variables, with `GIT_CONFIG_NOSYSTEM=1`, an empty `GIT_CONFIG_GLOBAL` and `GIT_TERMINAL_PROMPT=0`, so
the developer's own config (an `insteadOf`, a credential helper) cannot change the outcome and nothing can prompt. The
remote's `git for-each-ref` output (ref and object id) is compared before and after each call. The pre-receive hook is a
`#!/bin/sh` script written with mode 0755, which Git for Windows runs through its own `sh` and Linux runs directly.

## Execution-context probes

Each probe ran against the script as it was on `main`; the tests now pin the outcome.

| Context | What git did with the unchanged script | Decision |
| ------- | -------------------------------------- | -------- |
| `push.followTags=true` and an annotated tag on the branch | pushed `refs/tags/v1` along with the branch, exit 0 | **Hole, fixed**: `pushArguments()` adds `--no-follow-tags`, which overrides the setting. A second ref was the one thing the guard promised not to push, and the setting is an ordinary user preference, not an attack. |
| repo-local `remote.origin.pushurl` | pushed to the pushurl only; `origin`'s URL got nothing, exit 0 | **Hole, fixed**: refused with exit 2 (see the destination check). |
| `url.<x>.insteadOf` / `pushInsteadOf` rewriting origin's URL | pushed to the rewritten URL, exit 0 | **Hole, fixed**: refused with exit 2. |
| a second `remote.origin.url` | pushed to both URLs, exit 0 | **Hole, fixed**: refused with exit 2. |
| `GIT_CONFIG_COUNT`/`KEY_0`/`VALUE_0` injecting a pushurl | pushed to the injected URL, exit 0 | **Fixed by the same check**, because it reads git's effective config. |
| `remote.origin.mirror=true` | git itself refuses (`--mirror can't be combined with refspecs`), exit 128, no change | No change needed; pinned by a test. |
| `GIT_DIR` naming another clone | both git calls use that repository: its current branch, its origin, under the same name and destination rules | No change. Both calls see the same repository, so the name check and the push cannot disagree, and the allow rule does not match a command with a `GIT_DIR=` prefix (below). Pinned by a test. |
| the working directory | both git calls run in `process.cwd()`; the allowed command resolves `scripts/push-branch.mjs` against the same directory, so script and repository are one checkout; a linked worktree works the same way (tested) | No change. Pinning git to the script's own directory with `-C` would add nothing for the allowed command, would make the tests impossible (they run the worktree's script against a temporary clone), and `-C` does not override `GIT_DIR` anyway. |
| `NODE_OPTIONS` (`--require`, `--import`) | not probed: it runs code before the script, so no check inside the script can help | Covered by the permission rule (below). |
| a `claude/x:main` name | git refuses to create the ref and to point `HEAD` at it; a `HEAD` file written by hand reads as no branch | Refused as a detached HEAD (exit 2); pinned by a test. |

**Destination check.** After the name check, `main()` reads `git config --get-all remote.origin.url` and
`git remote get-url --push --all origin` (git's own resolution of `pushurl`, `insteadOf` and `pushInsteadOf`, from every
config source including `GIT_CONFIG_*`) and refuses unless there is exactly one URL and the push URL is that URL
unchanged (`originProblem()`). The message names the settings, not the URLs, because a URL may carry a credential.

This is defense against surprising config, not against a hostile writer of `.git/config`: whoever can write that file
can also set `core.hooksPath` or `core.fsmonitor` and run code on the next `git` command. What it does guarantee is that
a branch the agent pushes without a prompt lands only where `remote.origin.url` says.

**Cost.** A checkout whose push URL legitimately differs from its fetch URL (for example a user-level
`url."git@github.com:".insteadOf https://github.com/`) is now refused and pushed by hand, with a prompt. The developer's
current config has no such setting, and the real checkout passes the check.

**Not covered.** `push.recurseSubmodules` could push submodule commits to their own remotes; the repository has no
`.gitmodules`, so it was not probed. `origin` itself is whatever `remote.origin.url` says: changing it needs
`git remote set-url` (not allow-listed, so prompted) or a write to `.git/config` (see below).

## Review of `Bash(node scripts/push-branch.mjs)`

Checked against the Claude Code permissions documentation (`code.claude.com/docs/en/permissions`):

- **Exact command.** A rule with no `*` matches one exact command, so an argument, a second ref or a flag makes the
  command prompt. The script also refuses any argument (exit 2), so a rule widened by mistake still pushes nothing extra.
- **Compound commands** are split on `&&`, `||`, `;`, `|`, `&` and newlines, and each part must match a rule on its own, so
  `node scripts/push-branch.mjs && git push --force …` prompts for the second part.
- **Environment prefixes.** Claude Code strips a leading assignment only for a fixed set of known-safe variables; an allow
  rule does not match past any other assignment. So `GIT_DIR=… node scripts/push-branch.mjs`,
  `GIT_CONFIG_COUNT=…` and `NODE_OPTIONS=--require … node scripts/push-branch.mjs` prompt.
- **Editing the script still prompts.** `Edit(./scripts/push-branch.mjs)` stays in the `ask` list; this change does not
  touch `.claude/settings.json`.
- **The working directory.** The rule names a relative path, so it runs whatever `scripts/push-branch.mjs` sits in the
  current directory, and a `cd` inside the working directory needs no prompt. A copy elsewhere in the project
  (`<dir>/scripts/push-branch.mjs`) is not covered by the ask rule, because a `./path` rule is relative to the current
  directory, not anchored at the project root as a `/path` rule is. Writing such a copy prompts in Manual mode (and is a
  write the auto-mode classifier sees); in `acceptEdits` mode it does not. This is not a new capability: the test runners
  already run code the agent wrote, without a prompt. No settings change for this alone.

**A hole outside the push rule, reported and not fixed here.** The allow rules `Bash(git log *)` and `Bash(git diff *)`
also match `git log --output=<file>` and `git diff --output=<file>`, and the documentation lists `git log --output=<file>`
as a command a `git log` rule matches. A probe in a temporary repository showed that
`git log -1 --format=<text> --output=.git/config` replaces the repository's config with any text, exit 0. Claude Code's
protected-path check applies to its file tools and shell redirects, not to a path inside a git option, so this looks like a
prompt-free write to `.git/config` (a pushurl, `core.hooksPath`, `core.fsmonitor`) and to any other file. Whether Claude
Code's own checks stop it was not tested in this session. The destination check above stops the pushurl part for this
script; the rest needs a settings change (for example deny rules for `git log *--output*` and `git diff *--output*`, and
`Edit(/scripts/push-branch.mjs)` in place of the `./` form), which needs the user's approval, so it is left to a follow-up.

## Alternatives considered

- Strip every `GIT_*` variable from the environment of the script's git calls: it would also drop variables a credential
  setup may need (`GIT_ASKPASS`, `GIT_SSH_COMMAND`), and the destination check already covers the `GIT_CONFIG_*` route.
- Allow-list GitHub URLs in the script: it would tie the script to one host and make temporary-repository tests
  impossible without an override, which would itself be a way around the list.
