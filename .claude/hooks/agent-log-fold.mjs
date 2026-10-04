#!/usr/bin/env node
// Claude Code hook for PreToolUse on Bash. log-action.mjs buffers the agent log in .agent-log/pending.jsonl
// (gitignored), so the working tree stays clean between commits. When a command runs `git commit`, this hook moves
// the buffered lines to the end of .agent-log/actions.jsonl and stages that file, before the commit runs, so every
// commit carries the log through the commit command's own proposal; the commit's result lands in the next commit.
// It works in the copy of the project the command runs in (see agent-log-lib.mjs), worktrees included.
// The hook never blocks the agent: any error -> exit 0 silently.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { commitCommand, committedLog, logRoot, pendingLog } from "./agent-log-lib.mjs";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

try {
  const ev = JSON.parse(raw || "{}");
  if (ev.tool_name === "Bash" && commitCommand.test(String(ev.tool_input?.command ?? ""))) {
    const root = logRoot(ev.cwd, process.env.CLAUDE_PROJECT_DIR);
    const pending = pendingLog(root);
    if (existsSync(pending)) {
      // Rename first: log-action.mjs runs in parallel with this hook, and a line it appends now goes to a new
      // pending.jsonl instead of being lost when the buffer is emptied.
      const folding = `${pending}.${process.pid}.folding`;
      renameSync(pending, folding);
      const lines = readFileSync(folding, "utf8");
      mkdirSync(dirname(committedLog(root)), { recursive: true });
      if (lines.trim()) appendFileSync(committedLog(root), lines.endsWith("\n") ? lines : `${lines}\n`);
      rmSync(folding, { force: true });
    }
    if (existsSync(committedLog(root))) {
      spawnSync("git", ["add", "--", ".agent-log/actions.jsonl"], { cwd: root, stdio: "ignore", timeout: 5000 });
    }
  }
} catch {
  /* logging must never fail the session */
}
process.exit(0);
