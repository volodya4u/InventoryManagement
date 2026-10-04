// Shared by the agent-log hooks (log-action.mjs, agent-log-fold.mjs). Where the agent log of a hook event goes: the copy of the project the agent is working in.
// CLAUDE_PROJECT_DIR names the copy the session started in, so in a git worktree it points at the main copy while the
// agent edits and commits the worktree. The event's cwd decides instead: its nearest ancestor with a .git entry (a
// folder, or a file in a worktree) is the root when it is a copy of this project, that is, when it has this hook.
// A cwd outside any copy (a temp folder, another repository) falls back to CLAUDE_PROJECT_DIR.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function logRoot(cwd, projectDir) {
  if (cwd) {
    for (let dir = resolve(cwd); ; dir = dirname(dir)) {
      if (existsSync(join(dir, ".git"))) {
        if (existsSync(join(dir, ".claude", "hooks", "log-action.mjs"))) return dir;
        break;
      }
      if (dirname(dir) === dir) break;
    }
  }
  return projectDir || cwd || process.cwd();
}

// log-action.mjs appends here between commits; agent-log-fold.mjs moves the lines to actions.jsonl on `git commit`.
export const pendingLog = (root) => join(root, ".agent-log", "pending.jsonl");
export const committedLog = (root) => join(root, ".agent-log", "actions.jsonl");

// `git commit`, also with global options before the subcommand (`git -C dir commit`, `git --no-pager commit`).
export const commitCommand = /(^|[\s;&|(])git(\s+-[cC]\s+\S+|\s+--[\w-]+(=\S+)?)*\s+commit\b/;
