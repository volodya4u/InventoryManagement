# Design — git-output-deny-rules

## The hole

`.claude/settings.json` allows `Bash(git log *)` and `Bash(git diff *)` without a prompt. A `*` in a Bash rule matches any
text, so both rules also match `--output=<file>`; the permissions documentation (`code.claude.com/docs/en/permissions`,
"Wildcard patterns") itself lists `git log --output=<file> main` among the commands `Bash(git log * main)` matches. Slice 5 showed in a
temporary repository that `git log -1 --format=<text> --output=.git/config` replaces the repository config with any text,
exit 0. Claude Code checks a shell redirect target (`> file`) against the Edit rules and protected paths, but not a path
inside a program's own option, so the write needs no prompt. A written `.git/config` can set a `pushurl`,
`core.hooksPath` or `core.fsmonitor`, and the last two run code on the next `git` command.

## Which spellings git accepts

Probed with git 2.45.1 (Windows) in a temporary repository:

| Command | Result |
| ------- | ------ |
| `git log -1 --format=tformat:X --output=f` | writes `f`, exit 0 |
| `git log -1 --format=tformat:X --output f` | writes `f`, exit 0 |
| `git log … --outpu=f`, `--outp=f`, `--out=f` | `fatal: unrecognized argument`, exit 128 |
| `git diff --output=f`, `git diff --output f`, `git diff --stat --output=f` | writes `f`, exit 0 |
| `git diff --outp=f`, `--out=f` | `error: invalid option`, exit 129 |
| `git show --output=f` | writes `f`, exit 0 (not allow-listed, so it prompts) |
| `git status --output=f` | `unknown option`, exit 129 |

So the two spellings git accepts both contain the text `--output`, and git does not take an abbreviation of it.
`scripts/reviewer-bash-guard.mjs` still blocks abbreviations for the reviewer, because a later git could accept them.

## The rules

The user chose the exact rules on 2026-10-20 (option "(b) 1+2, plus anchor all ./ ask rules"):

- **deny** `Bash(git log *--output*)` and `Bash(git diff *--output*)`. Rules are evaluated deny, then ask, then allow, and
  an allow rule cannot carve an exception out of a deny rule, so the narrower allow rules no longer approve the write.
  A deny or ask rule also matches each part of a compound command and past any leading variable assignment.
- **ask** every `Edit(./…)` rule becomes `Edit(/…)`. A `./path` rule is relative to the current directory and a `/path`
  rule in project settings to the primary working directory, so a `cd` no longer moves what the rule protects. The
  `.env` deny rules keep their form: the `protect-env` hook covers `.env` files wherever they are.

**Side effect.** `git diff --output-indicator-new=<c>` (and `-old`, `-context`) also contains `--output`, so it is denied
too. These options only change the `+`/`-`/space markers of a diff; the user runs them by hand if ever needed. Two
rules per command (`*--output=*` and `*--output *`) would avoid it, at the cost of a rule set that is harder to read.

## Why deny rules and not a hook

The documentation says a Bash rule matches the command text as written and is not a security boundary around the
program: a deny rule covers the form Claude usually produces. So a quoted spelling such as `git log --out"put"=f` (which
the shell turns into `--output=f`) still matches the allow rule `Bash(git log *)` and not the deny rule. A PreToolUse
hook that removes the quotes before matching would close that, as `scripts/reviewer-bash-guard.mjs` does for the reviewer;
the user did not choose it (option "c"). This is the same line slice 5 drew for `push-branch.mjs`: the rules keep a
cooperating agent from writing a file by mistake through an allowed command; an agent that sets out to evade them can
also run code it wrote through the test runners.

## Tests

`scripts/settings-permissions.test.mjs` reads `.claude/settings.json` and matches commands against its Bash rules with a
small model of the documented matching: each `*` stands for any text, and a trailing ` *` that is the only wildcard also
matches the bare command (`git log`). The model is not Claude Code's matcher, so the test pins what the rules say, not
how Claude Code reads them. The red run was against the old rules (two tests failed: no deny rule, `./` anchors); the
green run is against the new ones. `scripts/hooks-selftest.mjs` gets a `git log … --output=.git/config` case for the
reviewer guard, which had only a `git diff --output` case.

## Not verified live

After the edit, this session ran `git log -1 --format=tformat:x --output=<scratchpad file>` and it was not refused. The
reason is in the worktree documentation: a worktree session started from the desktop app reads project settings from the
main checkout's root, and that copy does not have the new rules until this change is merged there. So two things are
to be checked after the merge, in a session started from the main checkout: the same command with a scratchpad target
should be refused by a deny rule, and an edit of `scripts/push-branch.mjs` should prompt under `Edit(/scripts/push-branch.mjs)`
(the `/` anchor is taken from the documentation; the test checks only the rule's text).

## Alternatives considered

- Drop `Bash(git log *)` and `Bash(git diff *)` from the allow list: every `git log` and `git diff` would prompt, and
  they are among the most frequent read-only commands of the loop.
- Narrow the allow rules to fixed forms (`Bash(git log --oneline *)`): the `*` would still match `--output` later in the
  command, so it needs the deny rule anyway.
