#!/usr/bin/env node
// Claude Code hook for PreToolUse, PostToolUse and PostToolUseFailure.
// Appends ONE JSON line per event to .agent-log/pending.jsonl (gitignored):
//   PreToolUse         -> { ts, event, id, session, mode, tool, path | cmd | pattern | url, agent?, subagent_type? }
//                                                                                              = "agent proposed"
//   PostToolUse        -> { ..., exit: 0, ms }                                                  = "agent did"
//   PostToolUseFailure -> { ..., exit: N | "error" | "interrupted", ms }                        = "agent tried, it failed"
// A PreToolUse line without a matching Post line (same id) = proposed but never executed (blocked or denied).
// The executed line that carries the `reviewer` subagent's report also records its verdict (see reviewOf below).
// agent-log-fold.mjs moves the buffered lines to the committed .agent-log/actions.jsonl on `git commit`, so the
// working tree stays clean between commits and the lines land in the copy of the project the agent works in (a
// worktree included): see agent-log-lib.mjs for how the root is resolved.
// The hook never blocks the agent: any error -> exit 0 silently.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { logRoot, pendingLog } from "./agent-log-lib.mjs";

// The reviewer's verdict from its own report (.claude/agents/reviewer.md, "Output"), so a pull request's review is the
// reviewer's record (scripts/check-review.mjs), not text pasted into the description. The last "## Review: ..." line
// decides; each bullet under "### Blocking" other than "None" is a blocking finding; the first three findings are kept.
const clip = (text) => text.trim().slice(0, 200);
function reviewOf(text) {
  const report = String(text).replace(/\r\n?/g, "\n");
  const last = [...report.matchAll(/^##[ \t]+Review:[ \t]*(APPROVE|CHANGES REQUESTED)[ \t]*$/gm)].at(-1);
  if (!last) return null;
  const lines = report.slice(last.index).split("\n");
  const bullets = (title) => {
    const start = lines.findIndex((line) => new RegExp(`^###[ \\t]+${title}[ \\t]*$`, "i").test(line));
    const found = [];
    for (const line of start < 0 ? [] : lines.slice(start + 1)) {
      if (/^#{1,3}[ \t]/.test(line)) break;
      const bullet = /^\s*[-*][ \t]+(.*\S)\s*$/.exec(line)?.[1];
      if (bullet && !/^none\b/i.test(bullet)) found.push(bullet);
    }
    return found;
  };
  const blocking = bullets("Blocking");
  const findings = [...blocking.map((b) => `B: ${b}`), ...bullets("Non-blocking").map((n) => `N: ${n}`)].slice(0, 3).map(clip);
  return { verdict: last[1], blocking: blocking.length, findings };
}
// Every string in a tool response, whatever its shape (a foreground Agent call returns the report there).
const strings = (value) =>
  typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let ev = {};
try {
  ev = JSON.parse(raw || "{}");
} catch {
  process.exit(0);
}

const root = logRoot(ev.cwd, process.env.CLAUDE_PROJECT_DIR);
const event = ev.hook_event_name ?? "unknown";
const ti = ev.tool_input ?? {};
const tool = ev.tool_name ?? "unknown";

// Normalize Windows (`D:\x`), POSIX (`/d/x`, Git Bash) and mixed paths so the log stores repo-relative paths.
const norm = (p) =>
  String(p)
    .replace(/\\/g, "/")
    .replace(/^\/([a-zA-Z])\//, (_, d) => `${d.toUpperCase()}:/`)
    .replace(/^([a-zA-Z]):\//, (_, d) => `${d.toUpperCase()}:/`)
    .replace(/\/$/, "");
const roots = [root, ev.cwd].filter(Boolean).map((r) => norm(r) + "/");
const rel = (p) => {
  if (typeof p !== "string") return undefined;
  const n = norm(p);
  const hit = roots.find((r) => n.startsWith(r));
  return hit ? n.slice(hit.length) : n;
};

const entry = {
  ts: new Date().toISOString(),
  event,
  id: ev.tool_use_id,
  session: String(ev.session_id ?? "").slice(0, 8),
  mode: ev.permission_mode,
  tool,
  ...(ti.file_path ? { path: rel(ti.file_path) } : {}),
  ...(ti.notebook_path ? { path: rel(ti.notebook_path) } : {}),
  ...(ti.command ? { cmd: String(ti.command).slice(0, 200) } : {}),
  ...(ti.pattern ? { pattern: ti.pattern } : {}),
  ...(ti.url ? { url: ti.url } : {}),
  // Which subagent made the call (ev.agent_type), and which one an Agent/Task call is spawning (ti.subagent_type),
  // so a reviewer run is provable from the committed log (scripts/check-review.mjs), not just claimed.
  ...(ev.agent_type ? { agent: ev.agent_type } : {}),
  ...(ti.subagent_type ? { subagent_type: ti.subagent_type } : {}),
};

if (event === "PostToolUse") {
  entry.exit = 0;
} else if (event === "PostToolUseFailure") {
  const m = /^Exit code (\d+)/.exec(ev.error ?? "");
  entry.exit = m ? Number(m[1]) : ev.is_interrupt ? "interrupted" : "error";
}
if (typeof ev.duration_ms === "number") entry.ms = ev.duration_ms;

// A background reviewer hands its report back through a SubagentHandback call; a foreground one returns it as the
// response of the Agent call that spawned it. `tree` fingerprints the files it reviewed (scripts/dod-fingerprint.mjs).
if (event === "PostToolUse") {
  const report =
    tool === "SubagentHandback" && ev.agent_type === "reviewer"
      ? ti.message
      : ti.subagent_type === "reviewer"
        ? strings(ev.tool_response).join("\n")
        : undefined;
  const review = report ? reviewOf(report) : null;
  if (review) {
    Object.assign(entry, review);
    try {
      const { treeFingerprint } = await import(pathToFileURL(join(root, "scripts", "dod-fingerprint.mjs")).href);
      entry.tree = treeFingerprint(root);
    } catch {
      /* no fingerprint: check-review then asks for a new review rather than trusting this one */
    }
  }
}

try {
  const pending = pendingLog(root);
  mkdirSync(dirname(pending), { recursive: true });
  appendFileSync(pending, JSON.stringify(entry) + "\n");
} catch {
  /* logging must never fail the session */
}
process.exit(0);
