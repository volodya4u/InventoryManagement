// Unit tests for scripts/check-evals.mjs. Run: node --test scripts/check-evals.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { caseProblems, validateEvals } from "./check-evals.mjs";

const tmp = mkdtempSync(join(tmpdir(), "check-evals-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function makeCase(dir, { prompt = "---\nmax_turns: 10\nallowed_tools: [Read]\n---\n\nReview this diff.\n", grader = "---\ntype: llm\nweight: 1\n---\n\nSuccess looks like X.\n" } = {}) {
  mkdirSync(join(dir, "graders"), { recursive: true });
  if (prompt !== null) writeFileSync(join(dir, "prompt.md"), prompt);
  if (grader !== null) writeFileSync(join(dir, "graders", "criteria.md"), grader);
}

test("a well-formed case has no problems", () => {
  const dir = join(tmp, "good");
  makeCase(dir);
  assert.deepEqual(caseProblems(dir), []);
});

test("a case is flagged for a missing prompt, a TODO placeholder, or no grader", () => {
  const noPrompt = join(tmp, "no-prompt");
  makeCase(noPrompt, { prompt: null });
  assert.match(caseProblems(noPrompt).join(" "), /prompt\.md/);

  const todo = join(tmp, "todo");
  makeCase(todo, { prompt: "---\nmax_turns: 10\n---\n\nTODO: describe what the agent should do\n" });
  assert.match(caseProblems(todo).join(" "), /TODO/);

  const noFrontmatter = join(tmp, "no-fm");
  makeCase(noFrontmatter, { prompt: "just a prompt, no frontmatter\n" });
  assert.match(caseProblems(noFrontmatter).join(" "), /frontmatter/);

  const noGrader = join(tmp, "no-grader");
  makeCase(noGrader, { grader: null });
  assert.match(caseProblems(noGrader).join(" "), /grader/);
});

function layout(root, { reviewerCases, skillCases }) {
  for (let i = 0; i < reviewerCases; i++) makeCase(join(root, "evals", "reviewer", `case-${i}`));
  for (const skill of ["test-first-loop", "agent-log-report"]) {
    mkdirSync(join(root, ".agents", "skills", skill), { recursive: true });
    writeFileSync(join(root, ".agents", "skills", skill, "SKILL.md"), "---\nname: x\n---\n");
    for (let i = 0; i < skillCases; i++) makeCase(join(root, ".agents", "skills", skill, "evals", `case-${i}`));
  }
}

test("validateEvals passes with 5 reviewer cases and 2 per skill", () => {
  const root = join(tmp, "full");
  layout(root, { reviewerCases: 5, skillCases: 2 });
  const { ok, problems } = validateEvals(root);
  assert.deepEqual(problems, []);
  assert.equal(ok, true);
});

test("validateEvals fails when the reviewer has too few cases", () => {
  const root = join(tmp, "few-reviewer");
  layout(root, { reviewerCases: 3, skillCases: 2 });
  const { ok, problems } = validateEvals(root);
  assert.equal(ok, false);
  assert.match(problems.join(" "), /reviewer/);
});

test("validateEvals fails when a skill has too few cases", () => {
  const root = join(tmp, "few-skill");
  layout(root, { reviewerCases: 5, skillCases: 1 });
  const { ok, problems } = validateEvals(root);
  assert.equal(ok, false);
  assert.match(problems.join(" "), /test-first-loop|agent-log-report/);
});

test("a results/ output dir under evals/ is ignored, not treated as a case", () => {
  const root = join(tmp, "with-results");
  layout(root, { reviewerCases: 5, skillCases: 2 });
  mkdirSync(join(root, "evals", "reviewer", "results", "2026-run"), { recursive: true }); // eval tool output
  mkdirSync(join(root, ".agents", "skills", "test-first-loop", "evals", "results"), { recursive: true });
  const { ok, problems } = validateEvals(root);
  assert.deepEqual(problems, [], problems.join("\n"));
  assert.equal(ok, true);
});

// Enforcement in CI: the real repo's eval suite must be present and well-formed.
test("the repository's own eval suite is valid", () => {
  const { ok, problems } = validateEvals(process.cwd());
  assert.deepEqual(problems, [], problems.join("\n"));
  assert.equal(ok, true);
});
