#!/usr/bin/env node
// Summarize .agent-log/actions.jsonl (written by the Claude Code hooks) per tool:
//   proposed  = PreToolUse lines ("the agent asked to do X")
//   executed  = PostToolUse + PostToolUseFailure lines ("X actually ran")
//   blocked   = proposed lines with no matching executed line (same id) — denied by a hook, a rule or the human
//   failed    = executed lines with a non-zero exit
// Usage: node scripts/agent-log-summary.mjs [path/to/actions.jsonl]   (run from the repo root)
// Reads the committed log and, next to it, the pending buffer the hooks fold in on `git commit`, so this session's
// not-yet-committed actions show too.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const file = process.argv[2] ?? join(process.cwd(), ".agent-log", "actions.jsonl");
const pending = join(process.cwd(), ".agent-log", "pending.jsonl");
const sources = [file, ...(process.argv[2] ? [] : [pending])].filter(existsSync);
if (!sources.length) {
  console.error(`No log at ${file}. Are the hooks in .claude/settings.json active? Run one Edit and check again.`);
  process.exit(2);
}
const entries = sources
  .flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/))
  .filter(Boolean)
  .flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
// Tool calls come from the hooks; the loop records (DodRun from dod.mjs, TestRun from test-run.mjs) share the log but
// are not tool calls, so they are counted apart. The reviewer's verdict is not its own event: the hook records it on
// the reviewer's PostToolUse (SubagentHandback) line, which is a tool call, so it is read from `lines` below.
const TOOL_EVENTS = new Set(["PreToolUse", "PostToolUse", "PostToolUseFailure"]);
const lines = entries.filter((e) => TOOL_EVENTS.has(e.event));
const records = entries.filter((e) => !TOOL_EVENTS.has(e.event));

const executedIds = new Set(lines.filter((e) => e.event !== "PreToolUse" && e.id).map((e) => e.id));
const byTool = {};
const blocked = [];
const failed = [];
for (const e of lines) {
  const s = (byTool[e.tool] ??= { proposed: 0, executed: 0, blocked: 0, failed: 0, ms: 0, files: new Set() });
  if (e.event === "PreToolUse") {
    s.proposed++;
    if (e.id && !executedIds.has(e.id)) {
      s.blocked++;
      blocked.push(e);
    }
  } else {
    s.executed++;
    s.ms += e.ms ?? 0;
    if (e.exit !== 0) {
      s.failed++;
      failed.push(e);
    }
  }
  if (e.path) s.files.add(e.path);
}
const rows = Object.entries(byTool)
  .sort((a, b) => b[1].proposed + b[1].executed - (a[1].proposed + a[1].executed))
  .map(([tool, s]) => ({ tool, proposed: s.proposed, executed: s.executed, blocked: s.blocked, failed: s.failed, "time (s)": +(s.ms / 1000).toFixed(1), files: s.files.size }));

const sessions = new Set(lines.map((e) => e.session).filter(Boolean));
const executedTotal = lines.filter((e) => e.event !== "PreToolUse").length;
console.log(
  `Agent actions: ${executedTotal} executed, ${blocked.length} proposed but not executed, ${failed.length} failed — ${sessions.size} session(s), ${lines[0]?.ts ?? "-"} .. ${lines.at(-1)?.ts ?? "-"}`,
);
const modes = {};
for (const e of lines) if (e.mode) modes[e.mode] = (modes[e.mode] ?? 0) + 1;
console.log(`Permission modes: ${Object.entries(modes).map(([mode, n]) => `${mode} ${n}`).join(", ") || "-"}`);
const dod = records.filter((e) => e.event === "DodRun");
const runs = records.filter((e) => e.event === "TestRun");
const verdicts = lines.filter((e) => e.verdict === "APPROVE" || e.verdict === "CHANGES REQUESTED");
if (dod.length || runs.length || verdicts.length) {
  console.log(
    `Loop records: ${dod.length} dod run(s), ${dod.filter((e) => e.exit === 0).length} green; ` +
      `${runs.length} test run(s), ${runs.filter((e) => e.exit !== 0).length} red; ${verdicts.length} reviewer verdict(s)`,
  );
}
console.table(rows);
if (blocked.length) {
  console.log("Proposed but not executed (blocked by a hook, a rule or you):");
  for (const b of blocked) console.log(`  ${b.ts}  ${b.tool}  ${b.cmd ?? b.path ?? b.pattern ?? ""}`);
}
if (failed.length) {
  console.log("Failed:");
  for (const f of failed) console.log(`  ${f.ts}  ${f.tool}  exit=${f.exit}  ${f.cmd ?? f.path ?? ""}`);
}
