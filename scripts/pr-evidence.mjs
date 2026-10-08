#!/usr/bin/env node
// The evidence of a pull request, taken from the records the tools wrote and checked against the head commit of the
// pull request, so nothing in it is typed by hand. CI runs it on every pull request (.github/workflows/ci.yml, job
// pr-evidence) and appends the report to the job summary. Run it before pushing: node scripts/pr-evidence.mjs origin/main HEAD
// Gates, each of which must hold:
//   Review              the reviewer's last recorded verdict is APPROVE on the head commit's files (check-review.mjs)
//   Definition of done  when the branch changes code, a green DodRun record covers exactly the head commit's code
//   Specs               specs agree with the tests they name; a new spec precedes the code; schema + API + page has a
//                       spec (check-specs.mjs)
//   Red -> green        each acceptance criterion of a spec the branch adds has a TestRun that failed on an assertion
//                       and a later one that passed (scripts/test-run.mjs)
//   Autonomy log        a branch that changes the harness, CI, a boundary file or a spec adds a valid row to
//                       docs/autonomy-log.md
//   Docs lookup         a branch that imports a third-party library the base does not use yet (src/**/*.java,
//                       frontend/src/**/*.ts) records a docs lookup: context7, or the Angular docs for @angular/*
// The report also shows the loop as the records tell it: dod runs, targeted test runs, review rounds, and the agent's
// sessions, permission modes and the proposals that never ran.
// Usage: node scripts/pr-evidence.mjs <base-ref> <head-ref>   (exit 0 = every gate holds, 1 = a gate failed, 2 = usage)
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addedLogLines, reviewProblems, reviewVerdicts } from "./check-review.mjs";
import { parseSpec, prSpecProblems, tableCells, validateSpecs } from "./check-specs.mjs";
import { codeFingerprintAt, treeFingerprintAt } from "./dod-fingerprint.mjs";
import { INPUT_PATHS, RECORD_PATH, inputsFingerprint, recordProblems } from "./eval-record.mjs";

const TOOL_EVENTS = new Set(["PreToolUse", "PostToolUse", "PostToolUseFailure"]);
const SPEC_PATH = /^docs\/specs\/(?!TEMPLATE\.md$)[^/]+\.md$/;
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

// Does a TestRun selector cover a criterion's test? Backend selectors are `Class`, `Class#method` or a comma list.
function covers(run, test) {
  if (test.file) return run.target === "frontend" && run.selector === test.file;
  return run.target === "backend" && String(run.selector).split(",").some((s) => s === test.className || s === `${test.className}#${test.method}`);
}

export function redGreenProblems(records, criteria) {
  const runs = records.filter((r) => r.event === "TestRun").sort(byTime);
  return criteria.flatMap(({ spec, n, test }) => {
    const mine = runs.filter((r) => covers(r, test));
    const red = mine.findIndex((r) => r.kind === "assertion");
    const green = red >= 0 && mine.slice(red + 1).some((r) => r.kind === "pass");
    if (green) return [];
    const name = test.file ? `${test.file} › "${test.title}"` : `${test.className} › ${test.method}`;
    const how = test.file ? `node scripts/test-run.mjs frontend ${test.file}` : `node scripts/test-run.mjs backend ${test.className}#${test.method}`;
    return [`AC${n} of ${spec}: no red (assertion) then green TestRun for ${name}. Run \`${how}\` before and after the change.`];
  });
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

// The library an import line pulls in, or null for no import, the JDK or a Node built-in, our own code or a relative
// path. Java: the
// first three package segments (org.mockito, org.springframework.security); class names, static members and `*` are
// dropped. TS: the package (@angular/forms, rxjs), from a one-line import or the `} from '…'` line of a multi-line one.
// Three segments is a trade-off: every org.springframework.boot.* module (or org.apache.commons.*) counts as one library,
// while a first org.springframework.dao import counts as a new one. Not seen at all: a fully qualified name used without
// an import, `import module …;` and a dynamic `import('…')`.
const JAVA_IMPORT = /^\s*import\s+(?:static\s+)?([\w.]+?)(?:\.\*)?\s*;/;
// The JDK's own packages: java.*, javax.*, jdk.* and the XML/GSS APIs it ships under org.*.
const JDK = /^(java|javax|jdk|org\.w3c\.dom|org\.xml\.sax|org\.ietf\.jgss)\./;
// No quote before `from`, so a string such as 'Move from "Main"' is not an import.
const TS_IMPORT = /^\s*(?:(?:import|export)\b[^'"]*?\bfrom\s*|\}\s*from\s*|import\s*)['"]([^'"]+)['"]/;
export function importGroup(lang, line) {
  if (lang === "java") {
    const name = JAVA_IMPORT.exec(line)?.[1];
    if (!name || JDK.test(name) || name.startsWith("com.flowershop.")) return null;
    const segments = name.split(".");
    const upper = segments.findIndex((s) => /^[A-Z]/.test(s));
    return segments.slice(0, upper < 0 ? segments.length : upper).slice(0, 3).join(".") || null;
  }
  const spec = TS_IMPORT.exec(line)?.[1];
  if (!spec || /^([./]|node:)/.test(spec)) return null;
  return spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/");
}

const langOf = (path) => (/^src\/.*\.java$/.test(path) ? "java" : /^frontend\/src\/.*\.ts$/.test(path) ? "ts" : null);

// The third-party imports on the `+` lines of a diff, with the file each one is in.
export function addedImports(diffText) {
  let path = null;
  return String(diffText)
    .split(/\r?\n/)
    .flatMap((line) => {
      if (line.startsWith("+++ ")) path = line.replace(/^\+\+\+ (b\/)?/, "");
      if (!path || !langOf(path) || !line.startsWith("+") || line.startsWith("+++")) return [];
      const group = importGroup(langOf(path), line.slice(1));
      return group ? [{ group, path }] : [];
    });
}

// One entry per library the base does not use yet, with the first file that imports it. A Java library the base
// imports under a dotted parent or child package (jakarta.validation vs jakarta.validation.constraints) is the same
// library; a TS package is only itself (chart.js is not chart).
const sameLibrary = (java, a, b) => a === b || (java && (a.startsWith(`${b}.`) || b.startsWith(`${a}.`)));
export function newImports(added, baseGroups) {
  const seen = new Set();
  return added.filter(({ group, path }) => {
    if (seen.has(group) || baseGroups.some((b) => sameLibrary(path.endsWith(".java"), group, b))) return false;
    seen.add(group);
    return true;
  });
}

// Where AGENTS.md says to look an API up: the Angular docs for @angular/*, context7 for everything else.
export const docsTool = (group) => (group.startsWith("@angular/") ? "mcp__angular-cli__search_documentation" : "mcp__context7__query-docs");
const basename = (path) => path.split("/").pop();

// A new third-party library needs a lookup that ran (not a proposal, not a failure) in the agent log of the branch.
export function docsLookupProblems(imports, tools) {
  const ran = new Set(tools.filter((e) => e.event === "PostToolUse" && e.exit === 0).map((e) => e.tool));
  const missing = new Map();
  for (const i of imports.filter((i) => !ran.has(docsTool(i.group)))) missing.set(docsTool(i.group), [...(missing.get(docsTool(i.group)) ?? []), i]);
  return [...missing].map(
    ([tool, list]) =>
      `This branch adds imports from ${list.map((i) => `${i.group} (${basename(i.path)})`).join(", ")}, new to the code, but no \`${tool}\` ` +
      "lookup is recorded on it: look the API up for the version in pom.xml / frontend/package.json (AGENTS.md, Docs), then commit so the record folds in.",
  );
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

export function report({ base, head, gates, dodRuns, testRuns, reviews, evals, headCode, headTree, activity }) {
  const out = [
    "## Pull request evidence",
    "",
    `\`${base}\`...\`${head}\`, from the records the tools wrote (\`.agent-log/actions.jsonl\`), the specs and the repository. Nothing here is typed by hand.`,
    "",
    "| Gate | Result |",
    "| --- | --- |",
    ...gates.map((g) => `| ${g.name} | ${g.problems.length ? `❌ ${cell(g.problems.join(" "))}` : `✅ ${cell(g.ok)}`} |`),
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
    out.push("| Time (UTC) | Test | Result | First failure |", "| --- | --- | --- | --- |");
    for (const r of testRuns) out.push(`| ${time(r.ts)} | ${cell(`${r.target} ${r.selector}`)} | ${r.kind === "pass" ? "✅ pass" : `❌ ${r.kind}`} | ${cell(r.firstFailure)} |`);
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
      `${activity.blocked.filter((b) => !b.commit).length} proposed but never executed.`,
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
  const newSpecs = git("diff", "--name-only", "--diff-filter=A", `${base}...${head}`).split("\n").filter((p) => SPEC_PATH.test(p));
  const criteria = newSpecs.flatMap((spec) =>
    parseSpec(git("show", `${head}:${spec}`)).criteria.filter((c) => c.test).map((c) => ({ spec, n: c.n, test: c.test })),
  );
  const { specs } = validateSpecs(root);
  const reviews = reviewVerdicts(lines);
  const record = existsSync(join(root, RECORD_PATH)) ? JSON.parse(readFileSync(join(root, RECORD_PATH), "utf8")) : null;
  const evalsRelevant = changed.some((path) => INPUT_PATHS.some((p) => path === p || path.startsWith(`${p}/`)));
  const CODE = [":(glob)src/**/*.java", ":(glob)frontend/src/**/*.ts"];
  const grepImports = (lang, pathspec) => {
    try {
      return git("grep", "-h", "-E", `^[[:space:]]*import[[:space:]]|from[[:space:]]*['"]`, mergeBase, "--", pathspec).split("\n").map((l) => importGroup(lang, l)).filter(Boolean);
    } catch (error) {
      if (error.status === 1) return []; // git grep exits 1 when nothing matches
      throw error;
    }
  };
  const baseGroups = [...new Set([...grepImports("java", CODE[0]), ...grepImports("ts", CODE[1])])];
  const imports = newImports(addedImports(git("diff", "-U0", `${base}...${head}`, "--", ...CODE)), baseGroups);
  const lookupCounts = {};
  for (const e of tools) {
    if (e.event === "PostToolUse" && e.exit === 0 && /^mcp__(context7__query-docs|angular-cli__search_documentation)$/.test(e.tool)) lookupCounts[e.tool] = (lookupCounts[e.tool] ?? 0) + 1;
  }
  const lookups = Object.entries(lookupCounts).map(([tool, n]) => `${n} × \`${tool}\``);
  const sessions = new Set(tools.map((e) => e.session).filter(Boolean)).size;
  const modes = {};
  for (const e of tools) if (e.mode) modes[e.mode] = (modes[e.mode] ?? 0) + 1;
  const gates = [
    { name: "Review", problems: reviewProblems(lines, headTree), ok: `the reviewer's last verdict is APPROVE on the head commit's files (${reviews.length} round(s))` },
    { name: "Definition of done", problems: dodProblems(records, { codeChanged, headCode }), ok: codeChanged ? "a green dod run covers the head commit's code" : "no code changed on this branch" },
    { name: "Specs", problems: [...validateSpecs(root).problems, ...prSpecProblems(root, base, head)], ok: `${specs.length} spec(s) agree with the tests they name; spec-first order and the cross-layer rule hold` },
    { name: "Red → green", problems: redGreenProblems(records, criteria), ok: newSpecs.length ? `every criterion of ${newSpecs.join(", ")} went red, then green` : "no new spec on this branch" },
    { name: "Autonomy log", problems: autonomyProblems(changed, addedRows), ok: addedRows.length ? `${addedRows.length} row(s) added` : "no significant change, no row needed" },
    { name: "Evals", problems: evalsProblems(changed, record, inputsFingerprint(root)), ok: evalsRelevant ? `evals/record.json is fresh (model ${record?.model})` : "no reviewer, skill, AGENTS.md or case change on this branch" },
    {
      name: "Docs lookup",
      problems: docsLookupProblems(imports, tools),
      ok: imports.length
        ? `new third-party imports ${imports.map((i) => i.group).join(", ")}; looked up: ${lookups.join(", ")}`
        : `no new third-party import on this branch (docs lookups recorded: ${lookups.join(", ") || "none"})`,
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
      },
    }),
  );
  process.exit(gates.some((g) => g.problems.length) ? 1 : 0);
}
