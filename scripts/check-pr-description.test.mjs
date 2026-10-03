// Unit tests for scripts/check-pr-description.mjs. Run: node --test scripts/check-pr-description.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkPrDescription } from "./check-pr-description.mjs";

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
  assert.match(checkPrDescription(body(table, "Review: CHANGES REQUESTED"))[0], /does not say APPROVE/);
});

test("only HTML comments count as empty", () => {
  const problems = checkPrDescription(body("<!-- paste the table -->", "<!-- APPROVE -->"));
  assert.match(problems[0], /Evidence section is empty/);
  assert.match(problems[1], /Reviewer verdict section is empty/);
});
