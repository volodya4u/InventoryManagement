#!/usr/bin/env node
// Claude Code SessionStart hook (wired in .claude/settings.json). Runs only in cloud sessions; local sessions exit at once.
// A cloud container starts from a fresh clone, so this installs what the agent needs to verify its work:
//   - the Node and pnpm versions pinned in pom.xml into target/frontend-tooling, and frontend/node_modules from the
//     frozen lockfile: used by `pnpm exec ng test`, Prettier and the angular-cli MCP server (scripts/ng-mcp.mjs);
//   - the Maven dependencies, by compiling the backend and its tests.
// It then puts the pinned Node first on PATH for the session's shell commands through $CLAUDE_ENV_FILE.
// Synchronous on purpose, so the tools exist before the first prompt. Idempotent. Stdout becomes session context,
// so build output goes to stderr only when a step fails.
import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

if (process.env.CLAUDE_CODE_REMOTE !== "true") process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const steps = [
  ["-B", "-ntp", "-q", "frontend:install-node-and-pnpm@install-node-and-pnpm", "frontend:pnpm@pnpm-install"],
  ["-B", "-ntp", "-q", "-Dskip.frontend=true", "test-compile"],
];
for (const args of steps) {
  const r = spawnSync("mvn", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    const output = `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? String(r.error) : ""}`;
    process.stderr.write(`session-start: mvn ${args.join(" ")} failed (exit ${r.status})\n${output.slice(-4000)}\n`);
    process.exit(1);
  }
}

const nodeDir = join(root, "target", "frontend-tooling", "node");
if (process.env.CLAUDE_ENV_FILE) appendFileSync(process.env.CLAUDE_ENV_FILE, `export PATH="${nodeDir}:$PATH"\n`);
console.log(
  "Cloud session setup: frontend/node_modules is installed and the pinned Node and pnpm from target/frontend-tooling " +
    "are first on PATH, so `pnpm exec ng test --watch=false` and `pnpm exec prettier` work in frontend/.",
);
