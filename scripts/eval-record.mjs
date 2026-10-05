#!/usr/bin/env node
// Records an evals run so a pull request that changes the reviewer, a skill or AGENTS.md carries the scores, and CI
// can tell the record is fresh without spending money. The evals run the model and an LLM judge, so they are
// non-deterministic and cost money (evals/README.md); CI never runs them. This script runs them locally once and
// writes evals/record.json: the model used, the judge model, the CLI version, the per-case scores (with / without the
// plugin, and the delta), and the fingerprint of the inputs the scores depend on (reviewer.md, each SKILL.md,
// AGENTS.md and the eval cases). scripts/pr-evidence.mjs fails the Evals gate when those inputs changed on the branch
// but the record does not match them, so stale scores cannot pass.
// Usage (from the repo root): node scripts/eval-record.mjs [--model <id>]
//   --model pins the agent model (the default is the CLI's logged-in model, recorded as "default").
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { blobsOf } from "./dod-fingerprint.mjs";

// The files the scores depend on. A change to any of them makes the record stale.
export const INPUT_PATHS = [".claude/agents/reviewer.md", "AGENTS.md", ".agents/skills", "evals/reviewer"];
export const RECORD_PATH = "evals/record.json";
export const inputsFingerprint = (root) => blobsOf(root, INPUT_PATHS);

// One `claude plugin eval --json` result -> the scores the record keeps.
export function parseRun(run) {
  const cases = {};
  for (const c of run.cases ?? []) {
    const a = c.aggregates ?? {};
    cases[c.name] = { score: a.score, ...(a.scoreWithout !== undefined ? { scoreWithout: a.scoreWithout } : {}), ...(a.delta !== null && a.delta !== undefined ? { delta: a.delta } : {}) };
  }
  return { cli: run.claudeVersion, judgeModel: run.suite?.judgeModel, cases };
}

export function buildRecord({ model, runs, inputs }) {
  const anyRun = Object.values(runs)[0] ?? {};
  return {
    generatedAt: new Date().toISOString(),
    model: model || "default",
    judgeModel: anyRun.judgeModel ?? "haiku",
    cli: anyRun.cli,
    inputs,
    suites: Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, { cases: run.cases }])),
  };
}

// What is stale between a record and the current inputs; [] when the record still covers them.
export function recordProblems(record, currentInputs) {
  if (!record) return [`no ${RECORD_PATH}: run \`node scripts/eval-record.mjs\` and commit it`];
  const problems = [];
  const recorded = record.inputs ?? {};
  for (const [path, blob] of Object.entries(recorded)) {
    if (!(path in currentInputs)) problems.push(`${path} is no longer covered by ${RECORD_PATH} (re-run the evals)`);
    else if (currentInputs[path] !== blob) problems.push(`${path} changed since ${RECORD_PATH} was written (re-run the evals)`);
  }
  for (const path of Object.keys(currentInputs)) {
    if (!(path in recorded)) problems.push(`${path} is new since ${RECORD_PATH} was written (re-run the evals)`);
  }
  return problems;
}

function runEval(root, args, model) {
  const out = join(mkdtempSync(join(tmpdir(), "eval-record-")), "run.json");
  const full = [...args, "--judge-model", "haiku", "--trust-plugin", "--no-publish", "--json", out, ...(model ? ["--model", model] : [])];
  console.error(`claude plugin eval ${full.join(" ")}`);
  const r = spawnSync("claude", ["plugin", "eval", ...full], { cwd: root, encoding: "utf8", stdio: ["ignore", "inherit", "inherit"], shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024 });
  if (!existsSync(out)) throw new Error(`claude plugin eval wrote no JSON (exit ${r.status}); is the CLI logged in?`);
  const parsed = parseRun(JSON.parse(readFileSync(out, "utf8")));
  rmSync(join(out, ".."), { recursive: true, force: true });
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const model = process.argv.includes("--model") ? process.argv[process.argv.indexOf("--model") + 1] : null;
  const root = process.cwd();
  const runs = {
    reviewer: runEval(root, ["--eval-dir", "evals", "."], model),
    "test-first-loop": runEval(root, [".agents/skills/test-first-loop"], model),
    "agent-log-report": runEval(root, [".agents/skills/agent-log-report"], model),
  };
  const record = buildRecord({ model, runs, inputs: inputsFingerprint(root) });
  writeFileSync(join(root, RECORD_PATH), JSON.stringify(record, null, 2) + "\n");
  console.error(`\nWrote ${RECORD_PATH} (model ${record.model}, judge ${record.judgeModel}).`);
  for (const [suite, { cases }] of Object.entries(record.suites)) {
    for (const [name, s] of Object.entries(cases)) {
      console.error(`  ${suite}/${name}: ${s.score}${s.delta !== undefined ? ` (Δ ${s.delta})` : ""}`);
    }
  }
}
