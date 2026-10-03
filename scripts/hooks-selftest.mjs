#!/usr/bin/env node
// Self-test for the Claude Code hooks in .claude/hooks/ — no agent needed.
// Pipes realistic hook payloads through both scripts against a TEMP project dir and checks:
//   1. protect-env.mjs blocks Read/Edit/Write of .env, .env.local, .env.production (exit 2) and allows .env.example + normal files;
//      it also blocks Grep on a .env path or with a glob that can match one, and Bash routes that read .env without
//      naming it (shell globs, git diff/grep --no-index, recursive grep or diff)
//   2. log-action.mjs appends one JSON line per event (PreToolUse = proposed, Post* = executed) with repo-relative paths
//   3. a PreToolUse line without a Post line for the same id is reported as "proposed but not executed"
//   4. scripts/reviewer-bash-guard.mjs is wired in settings and lets the reviewer subagent run only read-only git
//      commands (others exit 2), while other agents pass untouched
// Usage: node scripts/hooks-selftest.mjs   (run from the repo root)
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), "hooks-selftest-"));
const env = { ...process.env, CLAUDE_PROJECT_DIR: tmp };
const run = (script, payload) =>
  spawnSync(process.execPath, [join(here, ".claude", "hooks", script)], { input: JSON.stringify(payload), env, encoding: "utf8" });

let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failed++;
};

const base = { session_id: "selftest-0001", cwd: tmp, permission_mode: "default" };

// 1. guard
for (const [tool, file, expect] of [
  ["Edit", join(tmp, ".env"), 2],
  ["Write", join(tmp, ".env.local"), 2],
  ["Read", tmp + "\\.env.production", 2],
  ["Edit", join(tmp, ".env.example"), 0],
  ["Read", join(tmp, "src", "main", "resources", "application.yml"), 0],
]) {
  const r = run("protect-env.mjs", { ...base, hook_event_name: "PreToolUse", tool_name: tool, tool_input: { file_path: file } });
  check(`protect-env ${tool} ${file.split(/[\\/]/).pop()} -> exit ${expect}`, r.status === expect, r.status === 2 ? r.stderr.trim() : "");
}
const settings = JSON.parse(readFileSync(join(here, ".claude", "settings.json"), "utf8"));
const envMatcher = (settings.hooks?.PreToolUse ?? []).find((entry) =>
  entry.hooks.some((h) => (h.args ?? []).some((a) => a.endsWith("/.claude/hooks/protect-env.mjs"))),
)?.matcher;
check("protect-env is wired for Grep and Bash in .claude/settings.json", ["Grep", "Bash"].every((t) => envMatcher?.split("|").includes(t)), envMatcher);
// Grep: the path, and globs (a ripgrep glob searches files .gitignore hides)
const guardEnv = (tool, toolInput) =>
  run("protect-env.mjs", { ...base, hook_event_name: "PreToolUse", tool_name: tool, tool_input: toolInput }).status;
for (const [toolInput, expect] of [
  [{ pattern: "KEY", path: ".env" }, 2],
  [{ pattern: "KEY", path: join(tmp, "frontend", ".env.local") }, 2],
  [{ pattern: "KEY", path: ".env.example" }, 0],
  [{ pattern: "\\.env", path: "src" }, 0],
  [{ pattern: "KEY" }, 0],
  [{ pattern: "KEY", glob: "*.ts" }, 0],
  [{ pattern: "KEY", glob: "**/*.{ts,html}" }, 0],
  [{ pattern: "KEY", glob: "!.env*" }, 0],
  [{ pattern: "KEY", glob: ".env.example" }, 0],
  [{ pattern: "KEY", glob: "*" }, 2],
  [{ pattern: "KEY", glob: "**" }, 2],
  [{ pattern: "KEY", glob: "*.*" }, 2],
  [{ pattern: "KEY", glob: ".env*" }, 2],
  [{ pattern: "KEY", glob: ".env.q*" }, 2],
  [{ pattern: "KEY", glob: "*.local" }, 2],
  [{ pattern: "KEY", glob: "*.{ts,env}" }, 2],
  [{ pattern: "KEY", glob: "*.ts .env.production" }, 2],
  [{ pattern: "KEY", glob: "*.ts,.env" }, 2],
  [{ pattern: "KEY", path: "src", glob: "src/**" }, 2],
]) {
  const status = guardEnv("Grep", toolInput);
  check(`protect-env Grep ${JSON.stringify(toolInput)} -> exit ${expect}`, status === expect, status === expect ? "" : `got ${status}`);
}
// Bash: routes that read .env without naming it (a named .env is left to the deny rules)
for (const [command, expect] of [
  ["git diff main...HEAD", 0],
  ["git diff --stat", 0],
  ["git log --oneline main..HEAD", 0],
  ["git grep -n TODO", 0],
  ["cat '.e*'", 0],
  ["wc -l *.md", 0],
  ["ls src/**/*.ts", 0],
  ["grep -n TODO README.md", 0],
  ["diff a.txt b.txt", 0],
  ["mvn -B -ntp verify", 0],
  [`git diff --stat -- ${join(tmp, "README.md").replace(/\\/g, "/")}`, 0],
  [`git diff --stat -- ${tmp.replace(/\\/g, "/")}-other/x README.md`, 2],
  [`cd "${tmp}" && git diff --stat`, 0],
  ["cd frontend && git diff --stat", 0],
  ["cd .. && git diff a b", 2],
  ["grep -rn TODO src/app --include=*.ts", 0],
  ["grep -r --include '*.java' x src", 0],
  ["grep -r --include=* x .", 2],
  ["grep -r --include=*.ts --include=.env* x .", 2],
  ["git commit -F - <<'EOF'\nKeep .env and .e* out of reach\nEOF", 0],
  ['git commit -m "$(cat <<\'EOF\'\nBlock grep -r and .en? globs\nEOF\n)"', 0],
  ["git diff --no-index docs .", 2],
  ["git diff --no-index /dev/null .env", 2],
  ["git -C . diff --no-index a b", 2],
  ["git diff ../outside.txt README.md", 2],
  ["git diff /dev/null README.md", 2],
  ["git diff -- C:/Users/x/.env.local README.md", 2],
  ["nice git diff --no-index a b", 2],
  ["git grep --no-index -e KEY", 2],
  ["git grep --no-ind KEY", 2],
  ["git grep --untracked --no-exclude-standard KEY", 2],
  ["cat .e*", 2],
  ["head .en?", 2],
  ["ls .*", 2],
  ["cat {.env,README.md}", 2],
  ["cat frontend/.env*", 2],
  ["echo $(cat .e*)", 2],
  ["grep -rn TODO src", 2],
  ["grep -R x .", 2],
  ["grep -d recurse x .", 2],
  ["cd frontend && grep --recursive x .", 2],
  ["git ls-files -o | xargs grep -r x", 2],
  ["diff -r a b", 2],
]) {
  const status = guardEnv("Bash", { command });
  check(`protect-env Bash ${JSON.stringify(command)} -> exit ${expect}`, status === expect, status === expect ? "" : `got ${status}`);
}

// 2. logger: a proposed+executed Bash, a proposed+executed Edit, a proposed+failed Bash, a proposed-only Edit (blocked)
const events = [
  { ...base, hook_event_name: "PreToolUse", tool_use_id: "t1", tool_name: "Bash", tool_input: { command: "mvn -B -ntp verify" } },
  { ...base, hook_event_name: "PostToolUse", tool_use_id: "t1", tool_name: "Bash", tool_input: { command: "mvn -B -ntp verify" }, tool_response: { stdout: "ok" }, duration_ms: 4200 },
  { ...base, hook_event_name: "PreToolUse", tool_use_id: "t2", tool_name: "Edit", tool_input: { file_path: join(tmp, "src", "main", "java", "com", "flowershop", "inventory", "InventoryApplication.java") } },
  { ...base, hook_event_name: "PostToolUse", tool_use_id: "t2", tool_name: "Edit", tool_input: { file_path: join(tmp, "src", "main", "java", "com", "flowershop", "inventory", "InventoryApplication.java") }, duration_ms: 15 },
  { ...base, hook_event_name: "PreToolUse", tool_use_id: "t3", tool_name: "Bash", tool_input: { command: "mvn test" } },
  { ...base, hook_event_name: "PostToolUseFailure", tool_use_id: "t3", tool_name: "Bash", tool_input: { command: "mvn test" }, error: "Exit code 1\n[ERROR] Tests run: 1, Failures: 1", duration_ms: 900 },
  { ...base, hook_event_name: "PreToolUse", tool_use_id: "t4", tool_name: "Edit", tool_input: { file_path: join(tmp, ".env") } },
];
for (const e of events) {
  const r = run("log-action.mjs", e);
  check(`log-action ${e.hook_event_name} ${e.tool_name} exits 0 silently`, r.status === 0 && r.stdout === "");
}
const lines = readFileSync(join(tmp, ".agent-log", "actions.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
check("log has 7 lines", lines.length === 7);
check("PreToolUse line has no exit field", lines[0].event === "PreToolUse" && !("exit" in lines[0]) && lines[0].id === "t1");
check("PostToolUse Bash keeps cmd and exit 0", lines[1].cmd === "mvn -B -ntp verify" && lines[1].exit === 0 && lines[1].ms === 4200);
check("Edit line stores repo-relative path", lines[3].path === "src/main/java/com/flowershop/inventory/InventoryApplication.java", lines[3].path);
check("failure line carries exit code 1", lines[5].exit === 1);

// 3. summary pairs Pre/Post by id
const executedIds = new Set(lines.filter((l) => l.event !== "PreToolUse").map((l) => l.id));
const proposedOnly = lines.filter((l) => l.event === "PreToolUse" && !executedIds.has(l.id));
check("exactly one proposed-but-not-executed action (.env edit)", proposedOnly.length === 1 && proposedOnly[0].path === ".env");
const summary = spawnSync(process.execPath, [join(here, "scripts", "agent-log-summary.mjs"), join(tmp, ".agent-log", "actions.jsonl")], { encoding: "utf8" });
check("agent-log-summary reports 1 proposed but not executed", summary.status === 0 && /1 proposed but not executed/.test(summary.stdout));

// 4. reviewer guard (scripts/reviewer-bash-guard.mjs, wired in .claude/settings.json): read-only git for the reviewer
const guardWired = (settings.hooks?.PreToolUse ?? []).some(
  (entry) => entry.matcher === "Bash" && entry.hooks.some((h) => (h.args ?? []).some((a) => a.endsWith("/scripts/reviewer-bash-guard.mjs"))),
);
check("reviewer guard is wired as a PreToolUse Bash hook in .claude/settings.json", guardWired);
check("reviewer subagent is named reviewer", /^name: reviewer$/m.test(readFileSync(join(here, ".claude", "agents", "reviewer.md"), "utf8")));
const guard = (command, agentType = "reviewer") =>
  spawnSync(process.execPath, [join(here, "scripts", "reviewer-bash-guard.mjs")], {
    input: JSON.stringify({
      ...base,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command },
      ...(agentType ? { agent_id: "a1", agent_type: agentType } : {}),
    }),
    encoding: "utf8",
  }).status;
check("reviewer guard leaves the main agent alone", guard("rm x", null) === 0);
check("reviewer guard leaves other subagents alone", guard("rm x", "Explore") === 0);
for (const [command, expect] of [
  ["git diff main...HEAD", 0],
  ["git log --oneline main..HEAD", 0],
  ['git log --format="%h %s" -n 5', 0],
  ["git show HEAD:AGENTS.md", 0],
  ["git status", 0],
  ["git diff -- .env.example", 0],
  ["rm x", 2],
  ["git diff; rm x", 2],
  ["git log | head", 2],
  ["git diff > out.txt", 2],
  ["git diff --output=out.txt", 2],
  ["git diff --ext-diff", 2],
  ["git diff --no-index /dev/null .env", 2],
  ["git show HEAD:.env.local", 2],
  ["git checkout main", 2],
  ["git diff /dev/null .en?", 2],
  ["git diff -- .e'nv'", 2],
  ["git diff ../outside.txt README.md", 2],
  ["git diff /dev/null README.md", 2],
  ["git diff -- '*.ts'", 2],
  ["git log --oneline main..HEAD -- src/../README.md", 2],
  ["git diff ./.. .", 2],
  ["git diff . .//..", 2],
  ["git diff --outp=out.txt", 2],
  ["git log --ext", 2],
  ["git diff --no-ind README.md", 2],
  ["git diff --stat --output-indicator-new=x", 0],
]) {
  const status = guard(command);
  check(`reviewer guard "${command}" -> exit ${expect}`, status === expect, status === expect ? "" : `got ${status}`);
}

rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : "\nall hook checks passed");
process.exit(failed ? 1 : 0);
