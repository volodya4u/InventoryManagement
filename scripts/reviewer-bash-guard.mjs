#!/usr/bin/env node
// PreToolUse hook (matcher: Bash) for the reviewer subagent, wired in .claude/agents/reviewer.md.
// Keeps the reviewer read-only: only one plain `git diff`, `git log`, `git show` or `git status` runs.
// Blocked: shell operators and redirection, `--output` (writes a file), `--ext-diff` (runs a program),
// `--no-index` and `.env*` paths (would read secrets past the protect-env hook).
// Exit code 2 = the tool call is BLOCKED and stderr is fed back to the subagent. Unreadable input blocks too.
let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

const block = (reason) => {
  process.stderr.write(`Blocked by reviewer guard: ${reason} The reviewer may only run git diff, git log, git show or git status.\n`);
  process.exit(2);
};

let ev;
try {
  ev = JSON.parse(raw || "{}");
} catch {
  block("the hook input was not valid JSON.");
}

const cmd = String(ev.tool_input?.command ?? "").trim();
if (!/^git (diff|log|show|status)(\s|$)/.test(cmd)) block(`"${cmd.slice(0, 80)}" is not a read-only git command.`);
if (/[;&|<>`$\\\r\n]/.test(cmd)) block("shell operators, redirection and substitution are not allowed.");
if (/(^|\s)--(output|ext-diff|no-index)\b/.test(cmd)) block("--output, --ext-diff and --no-index are not allowed.");
if (/(^|[\s:/"'])\.env(?!\.example\b)(\.[^\s"']*)?(["']|\s|$)/.test(cmd)) block(".env files are secrets.");
process.exit(0);
