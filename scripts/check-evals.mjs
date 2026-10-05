#!/usr/bin/env node
// Presence-and-format check for the evals suite (the local gate's CI half: no API, no cost). It does NOT run evals;
// it only enforces that the reviewer and each skill have enough cases and that every case is well-formed, so a
// change to reviewer.md / a skill / AGENTS.md cannot land with a stale or empty suite. Running the cases
// (`claude plugin eval ...`) is the documented local step; see evals/README.md.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MIN_REVIEWER_CASES = 5;
const MIN_SKILL_CASES = 2;

const dirs = (p) => (existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);

// Problems with one eval case directory: a prompt.md with YAML frontmatter and no TODO placeholder, and a grader.
export function caseProblems(caseDir) {
  const problems = [];
  const promptPath = join(caseDir, "prompt.md");
  if (!existsSync(promptPath)) {
    problems.push(`${caseDir}: no prompt.md`);
  } else {
    const prompt = readFileSync(promptPath, "utf8");
    if (!/^---\r?\n.*?\r?\n---\r?\n/s.test(prompt)) problems.push(`${promptPath}: no YAML frontmatter`);
    if (/\bTODO\b/.test(prompt)) problems.push(`${promptPath}: still has a TODO placeholder`);
    if (prompt.replace(/^---\r?\n.*?\r?\n---\r?\n/s, "").trim() === "") problems.push(`${promptPath}: empty body`);
  }
  const gradersDir = join(caseDir, "graders");
  const graders = existsSync(gradersDir) ? readdirSync(gradersDir).filter((f) => f.endsWith(".md")) : [];
  if (!graders.length) problems.push(`${caseDir}: no grader under graders/`);
  return problems;
}

function targetProblems(label, evalsDir, min) {
  const problems = [];
  // `results` is where `claude plugin eval` writes run output (gitignored), not a case.
  const cases = dirs(evalsDir).filter((name) => name !== "results");
  if (cases.length < min) problems.push(`${label}: ${cases.length} eval case(s), need at least ${min} (${evalsDir})`);
  for (const name of cases) problems.push(...caseProblems(join(evalsDir, name)));
  return problems;
}

export function validateEvals(root) {
  const problems = [];
  problems.push(...targetProblems("reviewer", join(root, "evals", "reviewer"), MIN_REVIEWER_CASES));
  const skillsDir = join(root, ".agents", "skills");
  const skills = dirs(skillsDir).filter((name) => existsSync(join(skillsDir, name, "SKILL.md")));
  if (!skills.length) problems.push(`no skills found under ${skillsDir}`);
  for (const skill of skills) problems.push(...targetProblems(`skill ${skill}`, join(skillsDir, skill, "evals"), MIN_SKILL_CASES));
  return { ok: problems.length === 0, problems };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, problems } = validateEvals(process.cwd());
  if (ok) {
    console.log("Evals suite: present and well-formed.");
    process.exit(0);
  }
  console.error("Evals suite problems:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
