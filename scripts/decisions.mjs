#!/usr/bin/env node
// Owner decisions as records, not prose (ADR-0005, slice 6). The Open questions table in docs/requirements.md has one row
// per OQ-n with these columns:
//   Status                 open | answered | ratified | withdrawn
//   Recommended default    what the baseline suggests; not a decision
//   Observed behavior      what the code does today, as found; not a decision
//   Owner-approved intent  what the owner decided the behaviour should be (empty while open)
//   Decision owner, Date (YYYY-MM-DD), Reference (a PR, a commit or the chat it came from)
//   Requirements           FR-n / NFR-n ids the decision governs, which must exist in docs/requirements.md
//   Tests                  `Class#method` or `frontend/...spec.ts › title`, each carrying @trace for one of those ids
// So an answer follows the OQ-1 path: owner decision -> the requirement and its spec -> a regression test that traces it.
// An open question keeps its decision cells empty: a default or an observation never reads as an answer.
// Usage (from the repo root): node scripts/decisions.mjs   (exit 0 = well formed, 1 = problems)
// scripts/decisions.test.mjs checks this repository's table too, so CI fails a malformed one.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tableCells } from "./check-specs.mjs";
import { findFiles } from "./dod-checks.mjs";

export const STATUSES = ["open", "answered", "ratified", "withdrawn"];
const COLUMNS = {
  id: "ID",
  question: "Question",
  status: "Status",
  defaultAnswer: "Recommended default",
  observed: "Observed behavior",
  intent: "Owner-approved intent",
  owner: "Decision owner",
  date: "Date",
  reference: "Reference",
  requirements: "Requirements",
  tests: "Tests",
};
const EMPTY = /^(|—|-|–)$/;
const blank = (text) => EMPTY.test(String(text ?? "").trim());

// The rows of the "## Open questions" table, by column name; null when the section has no table with those columns.
export function parseOpenQuestions(markdown) {
  const text = String(markdown).replace(/\r\n?/g, "\n");
  const start = text.search(/^##[ \t]+Open questions[ \t]*$/m);
  if (start < 0) return null;
  const section = text.slice(start).split("\n").slice(1).join("\n").split(/^##[ \t]/m)[0];
  const lines = section.split("\n").filter((l) => /^\s*\|/.test(l));
  if (lines.length < 2) return null;
  const header = tableCells(lines[0]);
  const index = Object.fromEntries(Object.entries(COLUMNS).map(([key, name]) => [key, header.indexOf(name)]));
  if (Object.values(index).some((i) => i < 0)) return null;
  return lines
    .slice(1)
    .map(tableCells)
    .filter((cells) => /^OQ-\d+$/.test(cells[index.id] ?? ""))
    .map((cells) => {
      const get = (key) => (cells[index[key]] ?? "").trim();
      return {
        id: get("id"),
        question: get("question"),
        status: get("status").toLowerCase(),
        defaultAnswer: get("defaultAnswer"),
        observed: get("observed"),
        intent: get("intent"),
        owner: get("owner"),
        date: get("date"),
        reference: get("reference"),
        requirements: [...get("requirements").matchAll(/\b(?:FR|NFR|TC|BC)-\d+\b/g)].map((m) => m[0]),
        tests: [...get("tests").matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()),
      };
    });
}

// What is wrong with the questions. requirementIds: the ids docs/requirements.md defines; traces(test): the ids a test's
// @trace tags name, or null when the test does not exist.
export function decisionProblems(questions, { requirementIds, traces }) {
  return questions.flatMap((q) => {
    const problems = [];
    if (!STATUSES.includes(q.status)) return [`${q.id} has status "${q.status}": use open, answered, ratified or withdrawn.`];
    for (const id of q.requirements) {
      if (!requirementIds.has(id)) problems.push(`${q.id} names ${id}, which is not a requirement in docs/requirements.md.`);
    }
    if (q.status === "open") {
      if (!blank(q.intent)) problems.push(`${q.id} is open but has an owner-approved intent: record the answer and set its status, or move the text to Observed behavior.`);
      if (!blank(q.owner)) problems.push(`${q.id} is open but names a decision owner.`);
      if (!blank(q.date)) problems.push(`${q.id} is open but has a decision date.`);
      return problems;
    }
    if (q.status === "withdrawn") {
      if (blank(q.reference)) problems.push(`${q.id} is withdrawn but names no reference saying why.`);
      return problems;
    }
    // answered or ratified: the owner's decision, where it came from, and the requirement and test that hold it.
    if (blank(q.owner)) problems.push(`${q.id} is ${q.status} but names no decision owner.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date)) problems.push(`${q.id} is ${q.status} but its date is not YYYY-MM-DD (found "${q.date}").`);
    if (blank(q.reference)) problems.push(`${q.id} is ${q.status} but names no reference (a PR, a commit or the chat).`);
    if (blank(q.intent)) problems.push(`${q.id} is ${q.status} but records no owner-approved intent.`);
    if (!q.requirements.length) problems.push(`${q.id} is ${q.status} but links no requirement.`);
    if (!q.tests.length) problems.push(`${q.id} is ${q.status} but links no test that holds the decision.`);
    for (const t of q.tests) {
      const ids = traces(t);
      if (ids === null) problems.push(`${q.id} names the test ${t}, which does not exist.`);
      else if (q.requirements.length && !q.requirements.some((r) => ids.includes(r))) {
        problems.push(`${q.id}: ${t} carries no @trace ${q.requirements.join(" or ")}, so it does not hold the decision.`);
      }
    }
    return problems;
  });
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The lines above a test's declaration (at most 8), up to the end or the declaration of the test above it, so a
// neighbour's tag never counts for this test. A comment line never ends one, even when it mentions a test( in prose.
const ENDS_PREVIOUS = /^\s*}|\bvoid\s+\w+\s*\(|\b(?:it|test)(?:\.\w+)*\(/;
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;
const endsPrevious = (line) => !COMMENT.test(line) && ENDS_PREVIOUS.test(line);
function traceIds(lines, declaration) {
  let from = declaration;
  while (from > Math.max(0, declaration - 8) && !endsPrevious(lines[from - 1])) from--;
  return lines
    .slice(from, declaration + 1)
    .flatMap((l) => [...(/@trace\s+([\w\s,-]+)/.exec(l)?.[1] ?? "").matchAll(/\b(?:FR|NFR|TC|BC)-\d+\b/g)].map((m) => m[0]));
}

// The @trace ids above a test, found the way scripts/check-specs.mjs finds tests; null when there is no such test.
function testTraces(root, ref) {
  const file = /^(\S+\.(?:spec|test)\.(?:ts|mjs))\s*›\s*(.+)$/.exec(ref);
  if (file) {
    const path = join(root, file[1]);
    if (!existsSync(path)) return null;
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    const title = file[2].replace(/^["“](.*)["”]$/, "$1");
    const at = lines.findIndex((l) => ["'", '"', "`"].some((q) => new RegExp(`\\b(?:it|test)\\(\\s*${q}${escape(title)}${q}`).test(l)));
    return at < 0 ? null : traceIds(lines, at);
  }
  const method = /^([\w$]+)#(\w+)$/.exec(ref);
  if (!method) return null;
  const [found] = findFiles(join(root, "src", "test", "java"), new RegExp(`^${escape(method[1])}\\.java$`));
  if (!found) return null;
  const lines = readFileSync(found, "utf8").split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp(`\\bvoid\\s+${escape(method[2])}\\s*\\(`).test(l));
  return at < 0 ? null : traceIds(lines, at);
}

export function repoDecisionProblems(root) {
  const path = join(root, "docs", "requirements.md");
  if (!existsSync(path)) return ["docs/requirements.md does not exist."];
  const text = readFileSync(path, "utf8");
  const questions = parseOpenQuestions(text);
  if (!questions) {
    return [`The "## Open questions" table in docs/requirements.md needs the columns ${Object.values(COLUMNS).join(", ")} (scripts/decisions.mjs).`];
  }
  const requirementIds = new Set([...text.matchAll(/^\|\s*((?:FR|NFR|TC|BC)-\d+)\s*\|/gm)].map((m) => m[1]));
  return decisionProblems(questions, { requirementIds, traces: (ref) => testTraces(root, ref) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = repoDecisionProblems(process.cwd());
  if (!problems.length) {
    console.log("Open questions: every row has a status; answered ones name their owner, date, reference, requirement and test.");
    process.exit(0);
  }
  console.error(`Open questions problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
