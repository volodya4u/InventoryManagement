// Tests for scripts/eval-summary.mjs, plus the check that the committed evals/results/latest.json matches the record.
// Run: node --test scripts/eval-summary.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { BASELINE_PATH, LATEST_PATH, RECORD_PATH, render, suitesOf, summarize } from "./eval-summary.mjs";

const tmp = mkdtempSync(join(tmpdir(), "eval-summary-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
const write = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
const tree = (name) => {
  const root = join(tmp, name);
  for (const path of [
    "evals/reviewer/jpa/prompt.md",
    "evals/reviewer/schema/prompt.md",
    "evals/factory-rules/trace-tag/prompt.md",
    ".agents/skills/test-first-loop/evals/bugfix/prompt.md",
    ".agents/skills/test-first-loop/evals/results/ignored.json",
  ])
    write(root, path, "x");
  return root;
};

test("groups the case scores by suite and averages each dimension on a 0-100 scale", () => {
  const root = tree("groups");
  const record = {
    generatedAt: "2026-10-27T00:00:00.000Z",
    model: "m",
    judgeModel: "haiku",
    cases: { jpa: { score: 1 }, schema: { score: 0.5 }, "trace-tag": { score: 1 }, bugfix: { score: 0.75, scoreWithout: 0, delta: 0.75 } },
  };
  const summary = summarize(record, suitesOf(root));
  assert.deepEqual(summary.dimensions, { "factory-rules": 100, reviewer: 75, "skill-test-first-loop": 75 });
  assert.deepEqual(summary.cases.map((c) => c.name), ["bugfix", "jpa", "schema", "trace-tag"]);
});

test("a case with no folder is reported as unassigned, not dropped", () => {
  const summary = summarize({ cases: { ghost: { score: 1 } } }, suitesOf(tree("ghost")));
  assert.deepEqual(summary.dimensions, { unassigned: 100 });
});

test("--check fails when latest.json or the baseline is missing or stale, and passes when both are there", () => {
  const root = tree("check");
  const record = { generatedAt: "t", model: "m", judgeModel: "haiku", cases: { jpa: { score: 1 } } };
  write(root, RECORD_PATH, JSON.stringify(record));
  const run = (...args) => spawnSync(process.execPath, [join(process.cwd(), "scripts", "eval-summary.mjs"), ...args], { cwd: root, encoding: "utf8" });
  assert.equal(run("--check").status, 1, "missing latest.json");
  assert.equal(run().status, 0);
  assert.equal(run("--check").status, 1, "latest.json is fresh but there is no committed baseline to ratchet against");
  write(root, BASELINE_PATH, "{}");
  assert.equal(run("--check").status, 0, "latest.json fresh and a baseline present");
  write(root, LATEST_PATH, render({ ...summarize(record, suitesOf(root)), dimensions: { reviewer: 1 } }));
  assert.equal(run("--check").status, 1, "stale latest.json");
});

test("the committed latest.json is what the committed record gives", () => {
  assert.ok(existsSync(LATEST_PATH), `${LATEST_PATH} is committed`);
  assert.ok(existsSync(BASELINE_PATH), `${BASELINE_PATH} is committed`);
  const record = JSON.parse(readFileSync(RECORD_PATH, "utf8"));
  const have = readFileSync(LATEST_PATH, "utf8").replaceAll("\r\n", "\n");
  assert.equal(have, render(summarize(record, suitesOf(process.cwd()))), "run node scripts/eval-summary.mjs and commit evals/results/latest.json");
});
