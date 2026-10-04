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
//   5. scripts/session-start.mjs does nothing outside Claude Code cloud sessions
// Usage: node scripts/hooks-selftest.mjs   (run from the repo root)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { codeFingerprint, markerPath } from "./dod-fingerprint.mjs";

const here = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), "hooks-selftest-"));
mkdirSync(join(tmp, ".git")); // the temp project is the git work tree protect-env resolves paths against
// Folders for the diff -r rule: clean ones it may compare, and one with a (fake) secrets file at its top.
for (const [folder, file] of [["docs", "README.md"], ["src/a", "x.txt"], ["src/b", "x.txt"], [".agents/skills", "s.md"], [".claude/skills", "s.md"], ["withenv", ".env.selftest"], ["a$b", "x.txt"]]) {
  mkdirSync(join(tmp, folder), { recursive: true });
  writeFileSync(join(tmp, folder, file), "FAKE=1\n");
}
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
  ["Read", join(tmp, ".ENV"), 2],
  ["Read", join(tmp, ".Env.Local"), 2],
  ["Edit", join(tmp, ".env.example"), 0],
  ["Read", join(tmp, ".ENV.EXAMPLE"), 0],
  ["Read", join(tmp, ".env."), 2],
  ["Read", join(tmp, ".env "), 2],
  ["Read", join(tmp, ".env::$DATA"), 2],
  ["Read", join(tmp, ".env.example."), 0],
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
// A ! carve-out only applies to the rules listed before it in the same list.
const deny = settings.permissions?.deny ?? [];
check(
  "deny rules keep .env.example readable (Read(!.env.example) after Read(./.env.*))",
  deny.indexOf("Read(./.env.*)") >= 0 && deny.indexOf("Read(!.env.example)") > deny.indexOf("Read(./.env.*)"),
);
// Grep: the path, and globs (a ripgrep glob searches files .gitignore hides)
const guardEnv = (tool, toolInput) =>
  run("protect-env.mjs", { ...base, hook_event_name: "PreToolUse", tool_name: tool, tool_input: toolInput }).status;
for (const [toolInput, expect] of [
  [{ pattern: "KEY", path: ".env" }, 2],
  [{ pattern: "KEY", path: join(tmp, "frontend", ".env.local") }, 2],
  [{ pattern: "KEY", path: ".env.example" }, 0],
  [{ pattern: "KEY", path: "frontend/.ENV" }, 2],
  [{ pattern: "KEY", path: ".env::$DATA" }, 2],
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
  [{ pattern: "KEY", glob: ".en[]v]" }, 2],
  [{ pattern: "KEY", glob: ".en[]v]*" }, 2],
  [{ pattern: "KEY", glob: ".e?v.qa" }, 2],
  [{ pattern: "KEY", glob: "*.{yml,json}" }, 0],
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
  ["cd frontend && cd .. && git diff --stat", 0],
  ["cd frontend && git diff -- ../README.md", 0],
  ["git -C frontend diff -- ../README.md", 0],
  ["git diff -- ../README.md", 2],
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
  ["ls | xargs grep -r x", 2],
  // diff -r: two existing folders inside the project only, plainly named, neither the root nor holding a .env, no -N/-P
  ["diff -r .agents/skills .claude/skills", 0],
  ["node scripts/skills-sync.mjs && diff -rq .agents/skills .claude/skills", 0],
  ["diff -r -x '*.o' src/a src/b", 0],
  ["diff -r docs src/a", 0],
  ["diff -rN .agents/skills .claude/skills", 2],
  ["diff -r --new-file src/a src/b", 2],
  ["diff -rP src/a src/b", 2],
  ["diff -r --unidirectional-new-file src/a src/b", 2],
  ["diff -r --from-file=docs src/a", 2],
  ["diff -r -- -N src/b", 2],
  ['diff -r "$HOME/a" "$HOME/b"', 2],
  ['diff -r "$(echo src/a)" docs', 2],
  ["diff -r src/* docs", 2],
  ["diff -r src/a missing", 2],
  // each of these is caught by a single rule, so it turns green if that rule is dropped
  ["diff -r docs withenv/.env.selftest", 2], // isSecret on a file operand
  ["diff -r docs src/a src/b", 2], // exactly two operands
  ["diff -r --from-file=withenv src/a src/b", 2], // --from-file compares a third path
  ["diff -r a$b docs", 2], // $ in a name that otherwise resolves to a real in-project folder
  ["diff -r . docs", 2],
  ["diff -r docs frontend/..", 2],
  ["diff -r docs ../other", 2],
  ["diff -r withenv docs", 2],
  ["diff -r docs .env.local", 2],
  ["diff -r a b c", 2],
  ["cd ~ && diff -r a b", 2],
  // redirection targets are not arguments, comments are not commands, plain heredoc text is not globbed
  ["git diff --stat main...HEAD 2>/dev/null", 0],
  ["git diff main...HEAD > /tmp/review.diff", 0],
  ["git -C frontend diff --stat", 0],
  ["cat <<EOF\nplain .e* text\nEOF", 0],
  ["ls # .e*", 0],
  ["grep -d skip x *.md", 0],
  ["cat < .e*", 2],
  // command substitutions run inside double quotes, backticks and unquoted heredocs
  ['echo "$(cat .e*)"', 2],
  ['git commit -m "$(cat .e*)"', 2],
  ["echo `cat .e*`", 2],
  ["cat <<EOF\n$(cat .e*)\nEOF", 2],
  ["echo '<<X'\nls .e*\nX", 2],
  ['echo "a \\" b" .e*', 2],
  ["git \\\ndiff --no-index a b", 2],
  // git run outside the project
  ["git -C / diff a b", 2],
  ["git -C .. diff a b", 2],
  ["git --work-tree=/ diff a b", 2],
  ["git -C / -c grep.fallbackToNoIndex=true grep KEY", 2],
  ["cd -P / && git diff a b", 2],
  // GNU long-option prefixes
  ["grep --recur KEY .", 2],
  ["grep --directories recurse KEY .", 2],
  ["grep -d rec KEY .", 2],
  ["grep --dir=rec KEY .", 2],
  ["diff --recur . docs", 2],
  ["grep -r --include=*.ts --inclu=.env x .", 2],
  // rg honours .gitignore unless told not to
  ["rg -n TODO src", 0],
  ["rg -g '*.ts' TODO", 0],
  ["rg --hidden TODO", 0],
  ["rg -uu KEY", 2],
  ["rg --no-ignore KEY", 2],
  ["rg -g '*' KEY", 2],
  ["rg --iglob=.ENV* KEY", 2],
  // bracket expressions and brace sequences
  ["cat .en[]v]", 2],
  ["cat .en[[:alpha:]]", 2],
  ["cat .e?v.qa", 2],
  ["cat .en{u..w}", 2],
  ["ls file{1..3}.txt", 0],
  // a << in a comment, after \< or in a here-string starts no heredoc; a ) in quotes does not close $(
  ["true # <<X\ncat .e*\nX", 2],
  ["echo \\<<X\ncat .e*\nX", 2],
  ["grep x <<<abc\ncat .e*\nabc", 2],
  ['echo "$(echo ")"; cat .e*)"', 2],
  ["git commit -m \"$(cat <<'EOF'\n1) first\n`grep -r` and .e* in a message\nEOF\n)\"", 0],
  ["echo $((1+2)) && git diff --stat", 0],
  // more ways out of the project
  ["git diff '\\\\localhost\\C$\\x' e", 2],
  ["GIT_DIR=x git diff e .", 2],
  ["export GIT_DIR=x; git diff e .", 2],
  ["git --git-dir=../x/.git diff a b", 2],
  ["git --git-dir=.git diff a b", 2],
  ["pushd / && git diff a b", 2],
  ["rgrep x .", 2],
  ["grep.exe -r x .", 2],
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
// The buffer is pending.jsonl (gitignored); actions.jsonl is untouched until a `git commit` folds the buffer in.
const pendingFile = join(tmp, ".agent-log", "pending.jsonl");
check("log-action buffers in pending.jsonl, not actions.jsonl", existsSync(pendingFile) && !existsSync(join(tmp, ".agent-log", "actions.jsonl")));
const lines = readFileSync(pendingFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
check("log has 7 lines", lines.length === 7);
check("PreToolUse line has no exit field", lines[0].event === "PreToolUse" && !("exit" in lines[0]) && lines[0].id === "t1");
check("PostToolUse Bash keeps cmd and exit 0", lines[1].cmd === "mvn -B -ntp verify" && lines[1].exit === 0 && lines[1].ms === 4200);
check("Edit line stores repo-relative path", lines[3].path === "src/main/java/com/flowershop/inventory/InventoryApplication.java", lines[3].path);
check("failure line carries exit code 1", lines[5].exit === 1);

// 2b. log-action writes to the copy of the project the tool runs in: the cwd's git root with this hook, not the
// session's CLAUDE_PROJECT_DIR. That is what a git worktree needs, where CLAUDE_PROJECT_DIR is the main checkout.
const worktree = mkdtempSync(join(tmpdir(), "hooks-selftest-wt-"));
const mainCheckout = mkdtempSync(join(tmpdir(), "hooks-selftest-main-"));
mkdirSync(join(worktree, ".claude", "hooks"), { recursive: true }); // the markers logRoot looks for
writeFileSync(join(worktree, ".git"), "gitdir: /somewhere/.git/worktrees/wt\n"); // a worktree's .git is a file
writeFileSync(join(worktree, ".claude", "hooks", "log-action.mjs"), "");
spawnSync(process.execPath, [join(here, ".claude", "hooks", "log-action.mjs")], {
  input: JSON.stringify({ ...base, cwd: worktree, hook_event_name: "PreToolUse", tool_use_id: "w1", tool_name: "Edit", tool_input: { file_path: join(worktree, "a.txt") } }),
  env: { ...process.env, CLAUDE_PROJECT_DIR: mainCheckout },
  encoding: "utf8",
});
check("log-action logs into the worktree, not CLAUDE_PROJECT_DIR", existsSync(join(worktree, ".agent-log", "pending.jsonl")) && !existsSync(join(mainCheckout, ".agent-log")));
rmSync(worktree, { recursive: true, force: true });
rmSync(mainCheckout, { recursive: true, force: true });

// 3. summary pairs Pre/Post by id
const executedIds = new Set(lines.filter((l) => l.event !== "PreToolUse").map((l) => l.id));
const proposedOnly = lines.filter((l) => l.event === "PreToolUse" && !executedIds.has(l.id));
check("exactly one proposed-but-not-executed action (.env edit)", proposedOnly.length === 1 && proposedOnly[0].path === ".env");
const summary = spawnSync(process.execPath, [join(here, "scripts", "agent-log-summary.mjs"), pendingFile], { encoding: "utf8" });
check("agent-log-summary reports 1 proposed but not executed", summary.status === 0 && /1 proposed but not executed/.test(summary.stdout));

// 3b. agent-log-fold folds pending.jsonl into actions.jsonl and stages it on `git commit`, and leaves other commands alone.
const repo = mkdtempSync(join(tmpdir(), "hooks-selftest-fold-"));
spawnSync("git", ["init", "-q"], { cwd: repo });
spawnSync("git", ["config", "user.email", "t@example.com"], { cwd: repo });
spawnSync("git", ["config", "user.name", "Test"], { cwd: repo });
mkdirSync(join(repo, ".agent-log"), { recursive: true });
writeFileSync(join(repo, ".agent-log", "actions.jsonl"), '{"ts":"2026-01-01T00:00:00.000Z","event":"PostToolUse","id":"old","tool":"Edit"}\n');
const foldPending = join(repo, ".agent-log", "pending.jsonl");
const foldLine = '{"ts":"2026-01-01T00:01:00.000Z","event":"PostToolUse","id":"new","tool":"Bash"}';
writeFileSync(foldPending, foldLine + "\n");
const foldEnv = { ...process.env, CLAUDE_PROJECT_DIR: repo };
const foldPayload = (command) => ({ input: JSON.stringify({ ...base, cwd: repo, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } }), env: foldEnv, encoding: "utf8" });
const foldRun = (command) => spawnSync(process.execPath, [join(here, ".claude", "hooks", "agent-log-fold.mjs")], foldPayload(command));

const nonCommit = foldRun("git status");
check("agent-log-fold leaves pending.jsonl alone on a non-commit command", nonCommit.status === 0 && readFileSync(foldPending, "utf8").includes("new"));

const folded = foldRun('git commit -m "x"');
const foldedActions = readFileSync(join(repo, ".agent-log", "actions.jsonl"), "utf8");
check("agent-log-fold exits 0 on git commit", folded.status === 0);
check("agent-log-fold appends the buffered line to actions.jsonl", foldedActions.includes('"id":"old"') && foldedActions.includes('"id":"new"'));
check("agent-log-fold empties the pending buffer", !existsSync(foldPending) || readFileSync(foldPending, "utf8").trim() === "");
const staged = spawnSync("git", ["diff", "--cached", "--name-only"], { cwd: repo, encoding: "utf8" }).stdout;
check("agent-log-fold stages actions.jsonl", /(^|\n)\.agent-log\/actions\.jsonl(\n|$)/.test(staged), staged.trim());
rmSync(repo, { recursive: true, force: true });

// 3c. .gitignore covers the buffer and the transient fold file, so a fold interrupted mid-write leaves no dirty path.
for (const name of ["pending.jsonl", "pending.jsonl.123.folding"]) {
  const ignored = spawnSync("git", ["check-ignore", "-q", `.agent-log/${name}`], { cwd: here }).status;
  check(`.gitignore ignores .agent-log/${name}`, ignored === 0);
}

// 3d. dod-fresh.mjs (Stop hook): reminds (exit 0, never blocks) when code changed since the last green dod marker.
const fresh = mkdtempSync(join(tmpdir(), "hooks-selftest-fresh-"));
mkdirSync(join(fresh, "src"), { recursive: true });
mkdirSync(join(fresh, "docs"), { recursive: true });
writeFileSync(join(fresh, "src", "App.java"), "class App {}\n");
writeFileSync(join(fresh, "docs", "notes.md"), "# notes\n");
spawnSync("git", ["-C", fresh, "init", "-q"]);
spawnSync("git", ["-C", fresh, "add", "-A"]);
spawnSync("git", ["-C", fresh, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"]);
const freshMarker = markerPath(fresh);
mkdirSync(dirname(freshMarker), { recursive: true });
const runFresh = (payload) =>
  spawnSync(process.execPath, [join(here, ".claude", "hooks", "dod-fresh.mjs")], {
    input: JSON.stringify({ session_id: "selftest", cwd: fresh, permission_mode: "default", hook_event_name: "Stop", ...payload }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: fresh },
    encoding: "utf8",
  });

const noMarker = runFresh({});
check("dod-fresh stays quiet when no green marker exists", noMarker.status === 0 && noMarker.stderr === "");

writeFileSync(freshMarker, JSON.stringify({ fingerprint: "stale-fingerprint" }) + "\n");
const changed = runFresh({});
check("dod-fresh reminds (exit 0) when code changed since the marker", changed.status === 0 && /Re-run it before finishing/.test(changed.stderr));

writeFileSync(freshMarker, JSON.stringify({ fingerprint: codeFingerprint(fresh) }) + "\n");
const unchanged = runFresh({});
check("dod-fresh stays quiet when the fingerprint still matches", unchanged.status === 0 && unchanged.stderr === "");

writeFileSync(join(fresh, "docs", "notes.md"), "# changed, docs are not code\n");
const docOnly = runFresh({});
check("dod-fresh ignores a docs-only change", docOnly.status === 0 && docOnly.stderr === "");

writeFileSync(freshMarker, JSON.stringify({ fingerprint: "stale-fingerprint" }) + "\n");
const active = runFresh({ stop_hook_active: true });
check("dod-fresh respects stop_hook_active (no loop)", active.status === 0 && active.stderr === "");
rmSync(fresh, { recursive: true, force: true });

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

// 5. session start (scripts/session-start.mjs) installs nothing outside Claude Code cloud sessions
const localEnv = { ...env };
delete localEnv.CLAUDE_CODE_REMOTE;
const started = Date.now();
const sessionStart = spawnSync(process.execPath, [join(here, "scripts", "session-start.mjs")], {
  input: JSON.stringify({ ...base, hook_event_name: "SessionStart", source: "startup" }),
  env: localEnv,
  encoding: "utf8",
});
check("session-start is a silent no-op outside cloud sessions", sessionStart.status === 0 && sessionStart.stdout === "" && Date.now() - started < 5000);

rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : "\nall hook checks passed");
process.exit(failed ? 1 : 0);
