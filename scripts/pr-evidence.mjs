#!/usr/bin/env node
// The evidence of a pull request, taken from the records the tools wrote and checked against the head commit of the
// pull request, so nothing in it is typed by hand. CI runs it on every pull request (.github/workflows/ci.yml, job
// pr-evidence) and appends the report to the job summary. Run it before pushing: node scripts/pr-evidence.mjs origin/main HEAD
// Each gate reports PASS (it applied and held), FAIL (it applied and did not hold), N/A (it did not apply, and says why)
// or WAIVED (each failure is covered by an open, approved waiver, named in the report). Only FAIL fails the job.
// The gates:
//   Review              the reviewer's last recorded verdict is APPROVE on the head commit's files (check-review.mjs)
//   Human approval      the owner's tag approve/<head-sha>, signed with a hardware key listed in the base's
//                       quality/allowed-signers (signed-approval.mjs); required in CI, N/A locally and until a key
//                       is listed
//   Definition of done  when the branch changes code, a green DodRun record covers exactly the head commit's code
//   Specs               specs agree with the tests they name; a new spec precedes the code; schema + API + page has a
//                       spec (check-specs.mjs)
//   Red -> green        each acceptance criterion the branch adds or changes (in docs/specs/*.md or in an OpenSpec slice's
//                       proposal.md) has a TestRun that failed on an assertion and a later one that passed
//                       (scripts/test-run.mjs); a slice proposal the branch adds must have an acceptance table
//   Autonomy log        a branch that changes the harness, CI, a boundary file or a spec adds a valid row to
//                       docs/autonomy-log.md
//   Docs lookup         a branch that adds an import of a package nothing on main imports yet (src/**/*.java,
//                       frontend/src/**/*.ts) records a docs lookup: context7 or the Angular docs (check-docs-lookup.mjs)
// The report also shows the loop as the records tell it: dod runs, targeted test runs, review rounds, and the agent's
// sessions, permission modes and the proposals that never ran.
// Usage: node scripts/pr-evidence.mjs <base-ref> <head-ref>   (exit 0 = every gate holds, 1 = a gate failed, 2 = usage)
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addedLogLines, reviewProblems, reviewVerdicts } from "./check-review.mjs";
import { docsLookupCount, docsLookupProblems, newImportKeys } from "./check-docs-lookup.mjs";
import { parseSpec, prSpecProblems, tableCells, validateSpecs } from "./check-specs.mjs";
import { codeFingerprintAt, treeFingerprintAt } from "./dod-fingerprint.mjs";
import { INPUT_PATHS, RECORD_PATH, inputsFingerprint, recordProblems } from "./eval-record.mjs";
import { humanApprovalGate, signedApproval } from "./signed-approval.mjs";

const TOOL_EVENTS = new Set(["PreToolUse", "PostToolUse", "PostToolUseFailure"]);
// Work that steers or bounds the agent, or a feature with a spec: always worth a row in the autonomy log.
const SIGNIFICANT =
  /^(\.claude\/|\.agents\/|\.github\/|scripts\/|evals\/|docs\/specs\/|\.mcp\.json$|AGENTS\.md$|CLAUDE\.md$|pom\.xml$|frontend\/package\.json$|frontend\/pnpm-lock\.yaml$|src\/main\/resources\/(schema\.sql|application[^/]*\.yml)$|src\/main\/java\/.*\/(auth\/|SecurityConfig\.java$|InventorySchemaMigration\.java$))/;

export const significant = (path) => SIGNIFICANT.test(path);
const byTime = (a, b) => String(a.ts).localeCompare(String(b.ts));

export function dodProblems(records, { codeChanged, headCode }) {
  if (!codeChanged) return [];
  const green = records.filter((r) => r.event === "DodRun" && r.exit === 0);
  if (!green.length) return ["No green dod run is recorded on this branch: run `node scripts/dod.mjs`, then commit so the record folds in."];
  if (!green.some((r) => r.code === headCode)) {
    return ["Green dod runs are recorded, but none covers the code of the head commit: re-run `node scripts/dod.mjs` after the last code change, then commit."];
  }
  return [];
}

// The one place a gate's status is decided: a problem left fails it, a waived item alone makes it WAIVED, and a gate that
// held is PASS only if it applied to this branch (N/A otherwise), so "nothing to check" never reads as a pass.
export function gateStatus({ applies, problems = [], waived = [] }) {
  if (problems.length) return "FAIL";
  if (waived.length) return "WAIVED";
  return applies ? "PASS" : "N/A";
}

// The files whose acceptance criteria Red -> green checks: specs and OpenSpec slice proposals (active or archived) the
// branch adds or changes, from `git diff --name-status -M` lines. basePath is the version to compare with (the old path
// of a rename), or null for a new file.
const ACCEPTANCE_PATH = /^(docs\/specs\/(?!TEMPLATE\.md$)[^/]+\.md|openspec\/changes\/(archive\/)?[^/]+\/proposal\.md)$/;
const PROPOSAL_PATH = /^openspec\/changes\/(archive\/)?[^/]+\/proposal\.md$/;
export function acceptanceFiles(nameStatusLines) {
  return nameStatusLines.flatMap((line) => {
    const [status, ...paths] = line.split("\t");
    const path = paths.at(-1);
    if (!ACCEPTANCE_PATH.test(path ?? "") || status.startsWith("D")) return [];
    return [{ path, basePath: status.startsWith("R") ? paths[0] : status.startsWith("A") || status.startsWith("C") ? null : path }];
  });
}

// The criteria of one file that are new or changed against its base version (null: the branch adds the file). A changed
// row keeps its number, so it is compared by Given / When / Then text and test cell. A slice proposal the branch adds
// with no criteria is flagged, or leaving the table out would pass the gate.
export function changedCriteria(path, headText, baseText) {
  const head = parseSpec(headText).criteria;
  const before = new Map((baseText == null ? [] : parseSpec(baseText).criteria).map((c) => [c.n, `${c.gwt}\0${c.testCell}`]));
  return {
    path,
    criteria: head.filter((c) => before.get(c.n) !== `${c.gwt}\0${c.testCell}`).map((c) => ({ spec: path, n: c.n, test: c.test, testCell: c.testCell })),
    missingTable: baseText == null && PROPOSAL_PATH.test(path) && head.length === 0,
  };
}

// A gate waiver: a docs/qa/waivers/*.md the branch adds, open, for the Red -> green gate, with an approval, naming the
// criteria it covers as `<path> AC<n>[, AC<m>...]` or `<path>` (every criterion of that file, and a missing table). A
// waiver with no Status line is not open: a gate exception must say so.
const field = (text, name) => new RegExp(`^[ \\t]*(?:-[ \\t]*)?(?:\\*\\*)?${name}:(?:\\*\\*)?[ \\t]*(.*?)[ \\t]*$`, "im").exec(text)?.[1] ?? "";
function waivedCriteria(list) {
  const found = [];
  let path = null;
  let numbered = false;
  for (const m of list.matchAll(/([\w./-]+\.md)|\bAC(\d+)\b/g)) {
    if (m[1]) {
      if (path && !numbered) found.push({ path, n: null });
      path = m[1];
      numbered = false;
    } else if (path) {
      found.push({ path, n: Number(m[2]) });
      numbered = true;
    }
  }
  if (path && !numbered) found.push({ path, n: null });
  return found;
}
export function parseGateWaiver(path, text) {
  const t = String(text).replace(/\r\n?/g, "\n");
  return {
    path,
    open: field(t, "Status").toLowerCase() === "open",
    gate: field(t, "Gate"),
    approval: field(t, "Approval"),
    criteria: waivedCriteria(field(t, "Criteria")),
  };
}

// The gate waivers a branch adds, from its `git diff --name-status` lines: an old waiver, an edited one or a renamed one
// cannot cover new work. read(path) returns the file at the head commit.
export function branchWaivers(nameStatusLines, read) {
  return nameStatusLines
    .map((line) => line.split("\t"))
    .filter(([status, path]) => status === "A" && /^docs\/qa\/waivers\/[^/]+\.md$/.test(path))
    .map(([, path]) => parseGateWaiver(path, read(path) ?? ""));
}

// Does a TestRun selector cover a criterion's test? Backend selectors are `Class`, `Class#method` or a comma list; a
// file reference is a frontend spec or a harness test (scripts/*.test.mjs), run as that file.
function covers(run, test) {
  if (test.file) return run.target === (/\.mjs$/.test(test.file) ? "harness" : "frontend") && run.selector === test.file;
  return run.target === "backend" && String(run.selector).split(",").some((s) => s === test.className || s === `${test.className}#${test.method}`);
}

function howToRun(test) {
  if (!test.file) return `node scripts/test-run.mjs backend ${test.className}#${test.method}`;
  return `node scripts/test-run.mjs ${/\.mjs$/.test(test.file) ? "harness" : "frontend"} ${test.file}`;
}

// Is a per-test result (scripts/test-results.mjs) the criterion's own test? `Class#method` (a parameterized test's cases,
// `Class#method(int)[1]`, count as it); a file's `<file> › <suite > title>` by its whole path or its leaf title.
function isTest(result, test) {
  const id = String(result.id ?? "");
  if (!test.file) return id === `${test.className}#${test.method}` || id.startsWith(`${test.className}#${test.method}(`);
  return id === `${test.file} › ${test.title}` || (id.startsWith(`${test.file} › `) && id.endsWith(` > ${test.title}`));
}

// The criterion's test's status in one structured run: its own results only, never the run's kind, which an
// unrelated test of the same class or file decides. A run without results (unstructured, or recorded before they
// were) says nothing about the test. A file criterion's title that equals a test's whole suite path names that test;
// one that only matches the leaf title of several distinct tests is "ambiguous", and that run counts neither way.
function statusIn(run, test) {
  if (run.structured !== true) return undefined;
  let matched = (run.results ?? []).filter((r) => isTest(r, test));
  if (test.file) {
    const exact = matched.filter((r) => r.id === `${test.file} › ${test.title}`);
    const ids = [...new Set(matched.map((r) => r.id))];
    if (exact.length) matched = exact;
    else if (ids.length > 1) return { ambiguous: ids };
  }
  const mine = matched.map((r) => r.status);
  if (!mine.length) return undefined;
  for (const status of ["assertion", "error"]) if (mine.includes(status)) return status;
  return mine.every((s) => s === "skipped") ? "skipped" : "pass";
}

// Each criterion needs a structured run where its own test failed on an assertion, then a later one where that test
// passed on the head commit's code (headCode); a green on older code is stale.
export function redGreenProblems(records, criteria, headCode) {
  const runs = records.filter((r) => r.event === "TestRun").sort(byTime);
  return criteria.flatMap(({ spec, n, test, testCell }) => {
    if (!test) return [`AC${n} of ${spec} names no test as \`Class\` › \`method\` or \`path\` › "title" (found "${testCell ?? ""}").`];
    const statuses = runs.filter((r) => covers(r, test)).map((r) => ({ run: r, status: statusIn(r, test) }));
    const ambiguous = [...new Set(statuses.flatMap((s) => s.status?.ambiguous ?? []))];
    const seen = statuses.filter((s) => typeof s.status === "string");
    const red = seen.findIndex((s) => s.status === "assertion");
    const greens = red >= 0 ? seen.slice(red + 1).filter((s) => s.status === "pass") : [];
    if (greens.some((s) => s.run.code === headCode)) return [];
    const name = test.file ? `${test.file} › "${test.title}"` : `${test.className} › ${test.method}`;
    if (ambiguous.length) {
      return [
        `AC${n} of ${spec}: no red (assertion) then green TestRun for ${name}: "${test.title}" matches more than one test in ${test.file} ` +
          `(${ambiguous.map((id) => id.slice(test.file.length + 3)).join("; ")}), so no run shows which one went red; give the tests distinct titles, then run \`${howToRun(test)}\` again.`,
      ];
    }
    const why = !seen.length
      ? "no structured TestRun names it (a run without a report, or recorded before per-test results, does not count)"
      : red < 0
        ? `it never failed on an assertion in a structured run (seen: ${[...new Set(seen.map((s) => s.status))].join(", ")})`
        : greens.length
          ? "it went red, then green, but every later green ran on older code than the head commit (stale)"
          : "it failed on an assertion but never passed afterwards";
    const next = greens.length ? `re-run \`${howToRun(test)}\` after the last code change, then commit` : `run \`${howToRun(test)}\` before and after the change`;
    return [`AC${n} of ${spec}: no red (assertion) then green TestRun for ${name}: ${why}; ${next}.`];
  });
}

// The Red -> green gate over the acceptance files the branch touches (changedCriteria), with the gate waivers it adds.
export function redGreenGate(records, sources, waivers, headCode) {
  const usable = waivers.filter((w) => w.open && /^red\s*(->|→)\s*green$/i.test(w.gate) && w.approval);
  const waiverFor = (path, n) => usable.find((w) => w.criteria.some((c) => c.path === path && (c.n === null || c.n === n)));
  const problems = [];
  const waived = [];
  for (const source of sources) {
    if (source.missingTable) {
      const w = waiverFor(source.path, null);
      if (w) waived.push(`${source.path} has no acceptance table (${w.path}, approved: ${w.approval})`);
      else problems.push(`${source.path}: a slice the branch adds has no ## Acceptance criteria table naming its tests (the docs/specs format), so nothing proves it went red, then green.`);
    }
    for (const c of source.criteria) {
      const [problem] = redGreenProblems(records, [c], headCode);
      if (!problem) continue;
      const w = waiverFor(source.path, c.n);
      if (w) waived.push(`AC${c.n} of ${source.path} (${w.path}, approved: ${w.approval})`);
      else problems.push(problem);
    }
  }
  const count = sources.reduce((n, s) => n + s.criteria.length, 0);
  const applies = count > 0 || sources.some((s) => s.missingTable);
  const files = sources.filter((s) => s.criteria.length || s.missingTable).map((s) => s.path);
  const detail = !applies
    ? "no new or changed acceptance criterion on this branch"
    : waived.length
      ? `${waived.length} item(s) waived, the rest of ${files.join(", ")} went red, then green`
      : `every new or changed criterion of ${files.join(", ")} went red, then green`;
  return { applies, problems, waived, detail };
}

// The rows the branch adds: '+' lines of the table whose number the base version does not have. An edited row keeps
// its number, so correcting an old row never counts as recording new work.
const rowNumber = (line) => /^\s*\|\s*(\d+)\s*\|/.exec(line)?.[1];
export function newRows(plusLines, baseText) {
  const before = new Set(String(baseText).split(/\r?\n/).map(rowNumber).filter(Boolean));
  return plusLines.filter((line) => rowNumber(line) && !before.has(rowNumber(line)));
}

export function autonomyProblems(changedFiles, addedRows) {
  const touched = changedFiles.filter(significant);
  if (!touched.length) return [];
  if (!addedRows.length) {
    return [
      `This branch changes ${touched.slice(0, 3).join(", ")}${touched.length > 3 ? ", ..." : ""} but adds no row to docs/autonomy-log.md: ` +
        "add one (work, level, who decided, evidence, why this level) before the final review.",
    ];
  }
  return addedRows.flatMap((row) => {
    const [n, , level, who, evidence, why] = tableCells(row);
    const problems = [];
    if (!/^[1-5]\b/.test(level ?? "")) problems.push(`row ${n}: the level must be 1-5 (found "${level ?? ""}")`);
    if (!who) problems.push(`row ${n}: names no one who decided`);
    if (!/(https?:\/\/|\b[0-9a-f]{7,40}\b|#\d+|`[^`]+`|\b[\w./-]+\.(mjs|js|ts|java|md|yml|yaml|json|sql)\b)/.test(evidence ?? "")) {
      problems.push(`row ${n}: the evidence points nowhere (give a commit, a run, a file or a command)`);
    }
    if (!why) problems.push(`row ${n}: says nothing about why this level`);
    return problems.map((p) => `docs/autonomy-log.md ${p}`);
  });
}

// Evals are checked only when the branch changes an input the scores depend on (the reviewer, a skill, AGENTS.md or a
// case): then evals/record.json must be fresh for those inputs (scripts/eval-record.mjs). Most branches change none.
export function evalsProblems(changedFiles, record, currentInputs) {
  const relevant = changedFiles.some((path) => INPUT_PATHS.some((base) => path === base || path.startsWith(`${base}/`)));
  return relevant ? recordProblems(record, currentInputs) : [];
}

// The Human approval row from an approval result (signed-approval.mjs). GitHub sets GITHUB_ACTIONS=true in every job;
// this job runs the branch's own copy of this script and of ci.yml, so a branch that edits them can fake any row here,
// this one included; only a check run from the base's code can be trusted against that (ADR-0005, slice 3 step B).
export function humanApprovalRow(result, env = process.env) {
  return { name: "Human approval", ...humanApprovalGate(result, { ci: env.GITHUB_ACTIONS === "true" }) };
}

// Proposals that never ran. A `git commit` is the exception that proves nothing: its own result folds into the next
// commit, so the last commit of a branch always looks unexecuted.
export function blockedActions(lines) {
  const executed = new Set(lines.filter((e) => e.event !== "PreToolUse" && e.id).map((e) => e.id));
  return lines
    .filter((e) => e.event === "PreToolUse" && e.id && !executed.has(e.id))
    .map((e) => ({ ...e, commit: /(^|[\s;&|(])git(\s+-\S+(\s+\S+)?)*\s+commit\b/.test(e.cmd ?? "") }));
}

const cell = (text) => String(text ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
const time = (ts) => String(ts ?? "").replace("T", " ").replace(/\.\d+Z$|Z$/, "");

// A run's per-test counts, or why it has none (scripts/test-run.mjs records `results` from the runner's report).
function perTest(run) {
  if (run.structured !== true) return "unstructured (does not count)";
  const counts = {};
  for (const r of run.results ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return Object.entries(counts).map(([status, n]) => `${n} ${status}`).join(", ") || "none";
}

// A gate's cell: its status in words, then the problems (FAIL), the waived items and who approved them (WAIVED), or
// what held or why the gate did not apply (PASS, N/A).
function gateCell(g) {
  const status = gateStatus(g);
  if (status === "FAIL") return `❌ FAIL: ${g.problems.join(" ")}`;
  if (status === "WAIVED") return `⚠️ WAIVED: ${[g.detail, ...g.waived].filter(Boolean).join("; ")}`;
  return `${status === "PASS" ? "✅ PASS" : "➖ N/A"}: ${g.detail}`;
}

export function report({ base, head, gates, dodRuns, testRuns, reviews, evals, headCode, headTree, activity }) {
  const out = [
    "## Pull request evidence",
    "",
    `\`${base}\`...\`${head}\`, from the records the tools wrote (\`.agent-log/actions.jsonl\`), the specs and the repository. Nothing here is typed by hand.`,
    "",
    "| Gate | Result |",
    "| --- | --- |",
    ...gates.map((g) => `| ${g.name} | ${cell(gateCell(g))} |`),
    "",
    "### The loop: dod runs",
    "",
  ];
  if (dodRuns.length) {
    out.push("| Time (UTC) | Result | Stopped at | Covers the head commit's code |", "| --- | --- | --- | --- |");
    for (const r of dodRuns) {
      const failed = (r.checks ?? []).find((c) => c.exit !== 0);
      out.push(`| ${time(r.ts)} | ${r.exit === 0 ? "✅ green" : `❌ exit ${r.exit}`} | ${failed ? cell(`${failed.name}: ${failed.result}`) : "-"} | ${r.code === headCode ? "yes" : "no"} |`);
    }
  } else out.push("No dod run recorded on this branch.");
  out.push("", "### The loop: targeted test runs", "");
  if (testRuns.length) {
    out.push("| Time (UTC) | Test | Result | Per test | First failure | Covers the head commit's code |", "| --- | --- | --- | --- | --- | --- |");
    for (const r of testRuns) {
      out.push(
        `| ${time(r.ts)} | ${cell(`${r.target} ${r.selector}`)} | ${r.kind === "pass" ? "✅ pass" : `❌ ${r.kind}`} | ${cell(perTest(r))} | ${cell(r.firstFailure)} | ${r.code === headCode ? "yes" : "no"} |`,
      );
    }
  } else out.push("No targeted test run recorded on this branch.");
  if (evals) {
    out.push("", `### Evals (recorded ${time(evals.generatedAt)}, model ${evals.model}, judge ${evals.judgeModel})`, "", "| Case | Score | Δ (skill vs baseline) |", "| --- | --- | --- |");
    for (const [name, s] of Object.entries(evals.cases ?? {})) out.push(`| ${name} | ${s.score} | ${s.delta ?? "—"} |`);
  }
  out.push("", "### Review rounds (maker ≠ checker)", "");
  if (reviews.length) {
    out.push("| Time (UTC) | Verdict | Blocking | Findings | On the head commit's files |", "| --- | --- | --- | --- | --- |");
    for (const r of reviews) out.push(`| ${time(r.ts)} | ${r.verdict} | ${r.blocking ?? "?"} | ${cell((r.findings ?? []).join("; ")) || "-"} | ${r.tree === headTree ? "yes" : "no"} |`);
  } else out.push("No reviewer verdict recorded on this branch.");
  const modes = Object.entries(activity.modes).map(([mode, n]) => `${mode} ${n}`).join(", ") || "-";
  out.push(
    "",
    "### Agent activity on this branch",
    "",
    `${activity.sessions} session(s); permission modes: ${modes}; ${activity.executed} tool calls executed, ${activity.failed} failed, ` +
      `${activity.blocked.filter((b) => !b.commit).length} proposed but never executed; docs lookups: ${activity.docsLookups ?? 0}.`,
  );
  for (const b of activity.blocked) {
    out.push(`- ${time(b.ts)} ${b.tool}: \`${cell(b.cmd ?? b.path ?? b.pattern ?? "")}\`${b.commit ? " (a commit: its result folds into the next commit)" : ""}`);
  }
  return out.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.error("Usage: node scripts/pr-evidence.mjs <base-ref> <head-ref>");
    process.exit(2);
  }
  const root = process.cwd();
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
  const short = git("rev-parse", "--short", head);
  const lines = addedLogLines(base, head);
  const entries = lines.flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  const tools = entries.filter((e) => TOOL_EVENTS.has(e.event));
  const records = entries.filter((e) => !TOOL_EVENTS.has(e.event));
  const headCode = codeFingerprintAt(root, head);
  const headTree = treeFingerprintAt(root, head);
  const mergeBase = git("merge-base", base, head);
  const codeChanged = headCode !== codeFingerprintAt(root, mergeBase);
  const changed = git("diff", "--name-only", `${base}...${head}`).split("\n").filter(Boolean);
  let baseLog = "";
  try {
    baseLog = git("show", `${mergeBase}:docs/autonomy-log.md`);
  } catch {
    /* no autonomy log on the base yet */
  }
  const plusRows = git("diff", `${base}...${head}`, "--", "docs/autonomy-log.md")
    .split("\n")
    .filter((l) => /^\+\s*\|\s*\d+\s*\|/.test(l))
    .map((l) => l.slice(1));
  const addedRows = newRows(plusRows, baseLog);
  const nameStatus = git("diff", "--name-status", "-M", `${base}...${head}`).split("\n").filter(Boolean);
  const showAt = (rev, path) => {
    try {
      return git("show", `${rev}:${path}`);
    } catch {
      return null;
    }
  };
  const acceptance = acceptanceFiles(nameStatus).map(({ path, basePath }) =>
    changedCriteria(path, showAt(head, path) ?? "", basePath ? showAt(mergeBase, basePath) : null),
  );
  const waivers = branchWaivers(nameStatus, (path) => showAt(head, path));
  const redGreen = redGreenGate(records, acceptance, waivers, headCode);
  const { specs } = validateSpecs(root);
  const reviews = reviewVerdicts(lines);
  const record = existsSync(join(root, RECORD_PATH)) ? JSON.parse(readFileSync(join(root, RECORD_PATH), "utf8")) : null;
  const evalsRelevant = changed.some((path) => INPUT_PATHS.some((p) => path === p || path.startsWith(`${p}/`)));
  // New library imports vs main's tip, and the docs lookups the branch recorded (shown even when none is required).
  const newKeys = newImportKeys(root, base, head);
  const docsLookups = docsLookupCount(tools);
  const sessions = new Set(tools.map((e) => e.session).filter(Boolean)).size;
  const modes = {};
  for (const e of tools) if (e.mode) modes[e.mode] = (modes[e.mode] ?? 0) + 1;
  const gates = [
    { name: "Review", applies: true, problems: reviewProblems(lines, headTree), detail: `the reviewer's last verdict is APPROVE on the head commit's files (${reviews.length} round(s))` },
    humanApprovalRow(signedApproval(root, { base, head })),
    {
      name: "Definition of done",
      applies: codeChanged,
      problems: dodProblems(records, { codeChanged, headCode }),
      detail: codeChanged ? "a green dod run covers the head commit's code" : "no code changed on this branch",
    },
    {
      name: "Specs",
      applies: true,
      problems: [...validateSpecs(root).problems, ...prSpecProblems(root, base, head)],
      detail: `${specs.length} spec(s) and the active OpenSpec changes agree with the tests they name; spec-first order and the cross-layer rule hold`,
    },
    { name: "Red → green", ...redGreen },
    {
      name: "Autonomy log",
      applies: changed.some(significant),
      problems: autonomyProblems(changed, addedRows),
      detail: changed.some(significant) ? `${addedRows.length} row(s) added` : "no significant change, no row needed",
    },
    {
      name: "Evals",
      applies: evalsRelevant,
      problems: evalsProblems(changed, record, inputsFingerprint(root)),
      detail: evalsRelevant ? `evals/record.json is fresh (model ${record?.model})` : "no reviewer, skill, AGENTS.md or case change on this branch",
    },
    {
      name: "Docs lookup",
      applies: newKeys.length > 0,
      problems: docsLookupProblems(newKeys, tools),
      detail: newKeys.length
        ? `${docsLookups} lookup(s) recorded for ${newKeys.map((k) => k.replace(/^(java|ts):/, "")).join(", ")}`
        : "no new third-party import on this branch",
    },
  ];
  console.log(
    report({
      base,
      head: short,
      gates,
      dodRuns: records.filter((r) => r.event === "DodRun").sort(byTime),
      testRuns: records.filter((r) => r.event === "TestRun").sort(byTime),
      reviews,
      evals: evalsRelevant ? record : null,
      headCode,
      headTree,
      activity: {
        sessions,
        modes,
        executed: tools.filter((e) => e.event !== "PreToolUse").length,
        failed: tools.filter((e) => e.event !== "PreToolUse" && e.exit !== 0).length,
        blocked: blockedActions(tools),
        docsLookups,
      },
    }),
  );
  process.exit(gates.some((g) => gateStatus(g) === "FAIL") ? 1 : 0);
}

