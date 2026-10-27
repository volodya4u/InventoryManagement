#!/usr/bin/env node
// Converts the JaCoCo XML report that `mvn verify` writes into the json-summary shape scripts/check-coverage-ratchet.mjs
// reads (istanbul's `{ total: { lines, statements, functions, branches } }`), so the backend has a coverage summary like the
// frontend's (ADR-0006). JaCoCo's report-level counters map LINE -> lines, INSTRUCTION -> statements, METHOD -> functions
// and BRANCH -> branches. A missing report or one without totals is an error: a summary that read 0 or 100 would arm a
// wrong baseline.
// Usage (from the repo root): node scripts/jacoco-summary.mjs [report] [summary]
//   defaults: target/site/jacoco/jacoco.xml -> target/site/jacoco/coverage-summary.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [report = "target/site/jacoco/jacoco.xml", out = "target/site/jacoco/coverage-summary.json"] = process.argv.slice(2);
const METRICS = { lines: "LINE", statements: "INSTRUCTION", functions: "METHOD", branches: "BRANCH" };

if (!existsSync(report)) {
  console.error(`FAIL  ${report} not found — run \`mvn -B -ntp verify\` first (the JaCoCo report goal writes it)`);
  process.exit(1);
}
const xml = readFileSync(report, "utf8");
// The report's own counters (its totals) follow its last package or group; the counters before are per package, class,
// source file or method.
const tail = xml.slice(Math.max(xml.lastIndexOf("</package>"), xml.lastIndexOf("</group>"), 0));
const counters = Object.fromEntries(
  [...tail.matchAll(/<counter\s+type="(\w+)"\s+missed="(\d+)"\s+covered="(\d+)"\s*\/>/g)].map(([, type, missed, covered]) => [
    type,
    { missed: Number(missed), covered: Number(covered) },
  ]),
);
// Every class with debug information has lines and instructions, so a report without them covered no code.
const missing = ["LINE", "INSTRUCTION"].find((type) => !counters[type]);
if (missing) {
  console.error(`FAIL  ${report} has no report-level ${missing} counter — not a JaCoCo report of any code`);
  process.exit(1);
}

// JaCoCo leaves a counter out when there is nothing of its kind to cover (a report with no branches has no BRANCH
// counter); istanbul reads such a metric as 100%.
const total = Object.fromEntries(
  Object.entries(METRICS).map(([metric, type]) => {
    const { missed = 0, covered = 0 } = counters[type] ?? {};
    const all = missed + covered;
    return [metric, { total: all, covered, skipped: 0, pct: all ? Math.round((covered / all) * 10000) / 100 : 100 }];
  }),
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ total }, null, 2)}\n`);
console.log(`${out}: ${Object.entries(total).map(([m, { pct }]) => `${m} ${pct}%`).join(", ")}`);
