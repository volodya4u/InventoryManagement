// Unit tests for the pure parts of scripts/eval-record.mjs. Run: node --test scripts/eval-record.test.mjs
// Running the evals themselves costs money and is non-deterministic, so only parsing and the freshness check are tested.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRecord, parseRun, recordProblems } from "./eval-record.mjs";

// The shape `claude plugin eval --json` writes (trimmed to what the record keeps).
const reviewerRun = {
  claudeVersion: "2.1.289",
  suite: { judgeModel: "haiku" },
  cases: [
    { name: "jpa-not-jdbctemplate", aggregates: { score: 1, delta: null } },
    { name: "schema-without-migration", aggregates: { score: 1, delta: null } },
  ],
};
const skillRun = {
  claudeVersion: "2.1.289",
  suite: { judgeModel: "haiku" },
  cases: [
    { name: "bugfix-starts-red", aggregates: { score: 1, scoreWithout: 0, delta: 1 } },
    { name: "no-expected-value-cheating", aggregates: { score: 1, scoreWithout: 1, delta: 0 } },
  ],
};

test("parseRun keeps each case's score and delta", () => {
  assert.deepEqual(parseRun(skillRun), {
    cli: "2.1.289",
    judgeModel: "haiku",
    cases: {
      "bugfix-starts-red": { score: 1, scoreWithout: 0, delta: 1 },
      "no-expected-value-cheating": { score: 1, scoreWithout: 1, delta: 0 },
    },
  });
});

test("buildRecord stamps the model and the inputs fingerprint over the one aggregate run", () => {
  const inputs = { "AGENTS.md": "aaa", ".claude/agents/reviewer.md": "bbb" };
  const record = buildRecord({ model: "claude-opus-4-8", run: parseRun({ ...reviewerRun, cases: [...reviewerRun.cases, ...skillRun.cases] }), inputs });
  assert.equal(record.model, "claude-opus-4-8");
  assert.equal(record.judgeModel, "haiku");
  assert.deepEqual(record.inputs, inputs);
  assert.equal(record.cases["jpa-not-jdbctemplate"].score, 1);
  assert.equal(record.cases["bugfix-starts-red"].delta, 1);
  assert.match(record.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

const record = buildRecord({
  model: "claude-opus-4-8",
  run: parseRun(reviewerRun),
  inputs: { "AGENTS.md": "aaa", ".claude/agents/reviewer.md": "bbb" },
});

test("recordProblems passes when the inputs still hash the same", () => {
  assert.deepEqual(recordProblems(record, { "AGENTS.md": "aaa", ".claude/agents/reviewer.md": "bbb" }), []);
});

test("recordProblems names an input that changed, was added or was removed", () => {
  assert.match(recordProblems(record, { "AGENTS.md": "ZZZ", ".claude/agents/reviewer.md": "bbb" }).join(" "), /AGENTS\.md changed/);
  assert.match(recordProblems(record, { "AGENTS.md": "aaa" }).join(" "), /\.claude\/agents\/reviewer\.md is no longer covered/);
  const added = recordProblems(record, { "AGENTS.md": "aaa", ".claude/agents/reviewer.md": "bbb", "evals/reviewer/new/prompt.md": "ccc" });
  assert.match(added.join(" "), /evals\/reviewer\/new\/prompt\.md is new/);
});

test("recordProblems reports a missing record", () => {
  assert.match(recordProblems(null, { "AGENTS.md": "aaa" }).join(" "), /no evals\/record\.json/);
});
