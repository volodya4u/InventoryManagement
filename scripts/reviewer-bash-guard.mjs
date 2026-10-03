#!/usr/bin/env node
// PreToolUse hook (matcher: Bash), wired in .claude/settings.json. It acts only inside the reviewer subagent
// (.claude/agents/reviewer.md): hooks get its name as `agent_type`; every other Bash call passes untouched.
// Wired in settings rather than in the agent's frontmatter because frontmatter hooks of project subagents run only
// after the workspace trust dialog, and did not run in a cloud session; settings hooks apply inside subagents too.
// Keeps the reviewer read-only: only one plain `git diff`, `git log`, `git show` or `git status` runs.
// Blocked: shell operators and redirection, `--output` (writes a file), `--ext-diff` (runs a program), and every way
// to read an untracked secret such as `.env` past the protect-env hook: `--no-index`, paths outside the work tree
// (git diffs them as if `--no-index` were given), shell globs and braces (`.en?`), and `.env*` names even when quoted.
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
if (ev.agent_type !== "reviewer") process.exit(0);

const cmd = String(ev.tool_input?.command ?? "").trim();
if (!/^git (diff|log|show|status)(\s|$)/.test(cmd)) block(`"${cmd.slice(0, 80)}" is not a read-only git command.`);
if (/[;&|<>`$\\\r\n]/.test(cmd)) block("shell operators, redirection and substitution are not allowed.");
if (/(^|\s)--(output|ext-diff|no-index)\b/.test(cmd)) block("--output, --ext-diff and --no-index are not allowed.");
if (/[*?[\]{}]/.test(cmd)) block("shell globs and braces are not allowed.");
const unquoted = cmd.replace(/["']/g, "");
if (unquoted.split(/\s+/).some((arg) => /^(\/|~|\.\.(\/|$)|[A-Za-z]:\/)/.test(arg) || arg.includes("/../"))) {
  block("paths outside the work tree are not allowed.");
}
if (/(^|[\s:/])\.env(?!\.example\b)(\.\S*)?(\s|$)/.test(unquoted)) block(".env files are secrets.");
process.exit(0);
