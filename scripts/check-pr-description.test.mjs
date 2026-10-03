// Unit tests for scripts/check-pr-description.mjs. Run: node --test scripts/check-pr-description.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkPrDescription, TEMPLATE_HEADINGS } from "./check-pr-description.mjs";

const table = [
  "| Check | Command | Exit | Time | Result |",
  "| ----- | ------- | ---- | ---- | ------ |",
  "| Frontend unit tests | `ng test --watch=false (in frontend/)` | 0 | 8.0 s | 79 passed (79) |",
].join("\n");
const body = (evidence, verdict) =>
  `## Summary\n\nA change.\n\n## Evidence (\`dod.mjs\`)\n\n${evidence}\n\n## Reviewer verdict\n\n${verdict}\n\n## Notes\n\nNone.\n`;

test("a filled-in description passes", () => {
  assert.deepEqual(checkPrDescription(body(table, "`reviewer` subagent: APPROVE, no blocking findings.")), []);
});

test("Windows line endings and a result line instead of the table pass", () => {
  const crlf = body("`node scripts/dod.mjs`: exit 0, 51 checks, 25 + 79 tests.", "APPROVE").replace(/\n/g, "\r\n");
  assert.deepEqual(checkPrDescription(crlf), []);
});

test("the untouched template fails on both sections", () => {
  const template = readFileSync(new URL("../.github/pull_request_template.md", import.meta.url), "utf8");
  const problems = checkPrDescription(template);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /Evidence section is empty/);
  assert.match(problems[1], /Reviewer verdict section is empty/);
});

test("a missing Evidence section fails", () => {
  const problems = checkPrDescription("## Summary\n\nx\n\n## Reviewer verdict\n\nAPPROVE\n");
  assert.deepEqual(problems, ['Missing the "## Evidence (`dod.mjs`)" section.']);
});

test("evidence without the dod.mjs table or result fails", () => {
  assert.match(checkPrDescription(body("Tests pass locally.", "APPROVE"))[0], /neither the dod\.mjs table/);
});

test("a missing Reviewer verdict section fails", () => {
  const problems = checkPrDescription(`## Evidence\n\n${table}\n`);
  assert.deepEqual(problems, ['Missing the "## Reviewer verdict" section.']);
});

test("a verdict without APPROVE fails", () => {
  assert.match(checkPrDescription(body(table, "Review: CHANGES REQUESTED"))[0], /does not end on APPROVE/);
});

// What the tools print, pasted as the template asks: both start with their own "## " heading.
const dodOutput = [
  "## Definition of done: green",
  "",
  "HEAD 3bb187c, 2026-10-03T23:47:38.328Z, Node v24.15.0",
  "",
  table,
].join("\n");
const review = (verdict) =>
  [`## Review: ${verdict}`, "", "### Blocking", "- None.", "", "### Non-blocking", "- A nit.", "", "### Checked", "- Tests."].join("\n");

test("pasted dod.mjs output with its own heading counts as evidence", () => {
  assert.deepEqual(checkPrDescription(body(dodOutput, review("APPROVE"))), []);
});

test("a pasted reviewer report that requests changes fails", () => {
  assert.match(checkPrDescription(body(dodOutput, review("CHANGES REQUESTED")))[0], /does not end on APPROVE/);
});

test("earlier rounds may request changes when the final review approves", () => {
  const rounds = `Round 1: CHANGES REQUESTED, the four-place rounding; fixed in 8ed22c8.\n\n${review("APPROVE")}`;
  assert.deepEqual(checkPrDescription(body(dodOutput, rounds)), []);
});

test("the template's format line is not a verdict", () => {
  assert.match(checkPrDescription(body(table, "APPROVE | CHANGES REQUESTED"))[0], /does not end on APPROVE/);
});

test("an approving report may quote CHANGES REQUESTED in its own findings", () => {
  const quoted = review("APPROVE").replace("- Tests.", "- The template's format line `APPROVE | CHANGES REQUESTED` now fails.");
  assert.deepEqual(checkPrDescription(body(dodOutput, quoted)), []);
});

test("a report requesting changes fails even if its text mentions APPROVE later", () => {
  const mentioned = review("CHANGES REQUESTED").replace("- Tests.", "- Re-run after the fix to get APPROVE.");
  assert.match(checkPrDescription(body(dodOutput, mentioned))[0], /does not end on APPROVE/);
});

test("every heading of the template ends the section before it", () => {
  const template = readFileSync(new URL("../.github/pull_request_template.md", import.meta.url), "utf8");
  const headings = [...template.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  assert.equal(headings.length, TEMPLATE_HEADINGS.length);
  for (const heading of headings.filter((h) => !/^(Evidence|Reviewer verdict)/.test(h))) {
    const text = `## Evidence (\`dod.mjs\`)\n\n## ${heading}\n\n${table}\n\n## Reviewer verdict\n\nAPPROVE\n`;
    assert.match(checkPrDescription(text)[0], /Evidence section is empty/, `"## ${heading}" must end the section`);
  }
});

test("APPROVE in another section does not fill the verdict", () => {
  const problems = checkPrDescription(body(table, "Pending.").replace("None.", "Will APPROVE later."));
  assert.match(problems[0], /does not end on APPROVE/);
});

test("only HTML comments count as empty", () => {
  const problems = checkPrDescription(body("<!-- paste the table -->", "<!-- APPROVE -->"));
  assert.match(problems[0], /Evidence section is empty/);
  assert.match(problems[1], /Reviewer verdict section is empty/);
});
