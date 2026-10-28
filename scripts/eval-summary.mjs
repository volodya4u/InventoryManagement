#!/usr/bin/env node
// Turns the committed eval record (evals/record.json) into the summary scripts/check-eval-ratchet.mjs reads
// (evals/results/latest.json: { dimensions, cases }). The ratchet compares one score per dimension against
// quality/eval-baseline.json, so the cases are grouped by suite: the reviewer cases, the factory-rules cases, and one
// dimension per skill. A dimension is the mean case score on a 0-100 scale. No model is called and the output depends
// only on the record and on where the case folders are, so CI can check it for free.
// Usage (repo root):
//   node scripts/eval-summary.mjs           write evals/results/latest.json from evals/record.json
//   node scripts/eval-summary.mjs --check   exit 1 when the committed latest.json is not what the record gives, or when
//                                           there is no committed baseline: scripts/check-eval-ratchet.mjs would then skip
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const RECORD_PATH = "evals/record.json";
export const LATEST_PATH = "evals/results/latest.json";
export const BASELINE_PATH = "quality/eval-baseline.json";

const dirs = (path) => (existsSync(path) ? readdirSync(path).filter((name) => statSync(join(path, name)).isDirectory()) : []);

// case name -> dimension, from the case folders on disk (a folder with a prompt.md is a case).
export function suitesOf(root) {
  const suites = new Map();
  const add = (dimension, base) => {
    for (const name of dirs(join(root, base))) if (existsSync(join(root, base, name, "prompt.md"))) suites.set(name, dimension);
  };
  add("reviewer", "evals/reviewer");
  add("factory-rules", "evals/factory-rules");
  for (const skill of dirs(join(root, ".agents/skills"))) add(`skill-${skill}`, `.agents/skills/${skill}/evals`);
  return suites;
}

const round = (n) => Math.round(n * 10) / 10;

export function summarize(record, suites) {
  const cases = Object.entries(record.cases ?? {})
    .map(([name, s]) => ({ name, suite: suites.get(name) ?? "unassigned", score: round((Number(s.score) || 0) * 100) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const bySuite = new Map();
  for (const c of cases) bySuite.set(c.suite, [...(bySuite.get(c.suite) ?? []), c.score]);
  const dimensions = Object.fromEntries(
    [...bySuite.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([suite, scores]) => [suite, round(scores.reduce((a, b) => a + b, 0) / scores.length)]),
  );
  return { source: RECORD_PATH, recordGeneratedAt: record.generatedAt, model: record.model, judgeModel: record.judgeModel, dimensions, cases };
}

export const render = (summary) => `${JSON.stringify(summary, null, 2)}\n`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  if (!existsSync(join(root, RECORD_PATH))) {
    console.error(`${RECORD_PATH} not found: run node scripts/eval-record.mjs first`);
    process.exit(1);
  }
  const text = render(summarize(JSON.parse(readFileSync(join(root, RECORD_PATH), "utf8")), suitesOf(root)));
  if (process.argv.includes("--check")) {
    const have = existsSync(join(root, LATEST_PATH)) ? readFileSync(join(root, LATEST_PATH), "utf8").replace(/\r\n/g, "\n") : null;
    if (have !== text) {
      console.error(`${LATEST_PATH} is ${have === null ? "missing" : "not what " + RECORD_PATH + " gives"}: run node scripts/eval-summary.mjs and commit it`);
      process.exit(1);
    }
    if (!existsSync(join(root, BASELINE_PATH))) {
      console.error(`${BASELINE_PATH} is missing: earn it with node scripts/check-eval-ratchet.mjs --update and commit it`);
      process.exit(1);
    }
    console.log(`${LATEST_PATH} matches ${RECORD_PATH}, and ${BASELINE_PATH} is committed`);
  } else {
    mkdirSync(dirname(join(root, LATEST_PATH)), { recursive: true });
    writeFileSync(join(root, LATEST_PATH), text);
    console.log(`wrote ${LATEST_PATH}`);
  }
}
