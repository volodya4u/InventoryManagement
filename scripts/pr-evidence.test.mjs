// Unit tests for the gates and the report in scripts/pr-evidence.mjs. Run: node --test scripts/pr-evidence.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { autonomyProblems, blockedActions, dodProblems, redGreenProblems, report, significant } from "./pr-evidence.mjs";

const dod = (ts, exit, code, checks = []) => ({ ts, event: "DodRun", exit, code, checks });
const run = (ts, target, selector, kind) => ({ ts, event: "TestRun", target, selector, exit: kind === "pass" ? 0 : 1, kind });

test("dod: a green run on the head commit's code passes; a branch without code changes needs none", () => {
  assert.deepEqual(dodProblems([dod("t1", 1, "c0"), dod("t2", 0, "head")], { codeChanged: true, headCode: "head" }), []);
  assert.deepEqual(dodProblems([], { codeChanged: false, headCode: "head" }), []);
});

test("dod: no green run, or a green run on other code, fails", () => {
  assert.match(dodProblems([dod("t1", 1, "head")], { codeChanged: true, headCode: "head" }).join(" "), /No green dod run/);
  assert.match(dodProblems([dod("t1", 0, "older")], { codeChanged: true, headCode: "head" }).join(" "), /none covers the code of the head commit/);
});

const criteria = [
  { spec: "docs/specs/x.md", n: 1, test: { className: "FlowTest", method: "flagsLowStock" } },
  { spec: "docs/specs/x.md", n: 2, test: { file: "frontend/src/app/dash/dash.component.spec.ts", title: "shows it" } },
];

test("red-green: each new criterion's test failed on an assertion, then passed", () => {
  const records = [
    run("t1", "backend", "FlowTest#flagsLowStock", "assertion"),
    run("t2", "frontend", "frontend/src/app/dash/dash.component.spec.ts", "assertion"),
    run("t3", "backend", "FlowTest", "pass"),
    run("t4", "frontend", "frontend/src/app/dash/dash.component.spec.ts", "pass"),
  ];
  assert.deepEqual(redGreenProblems(records, criteria), []);
});

test("red-green: green only, red on a compile error, or green before red fails", () => {
  const greenOnly = [run("t1", "backend", "FlowTest#flagsLowStock", "pass"), run("t2", "frontend", "frontend/src/app/dash/dash.component.spec.ts", "pass")];
  assert.equal(redGreenProblems(greenOnly, criteria).length, 2);
  const compile = [run("t1", "backend", "FlowTest", "compile"), run("t2", "backend", "FlowTest", "pass")];
  assert.match(redGreenProblems(compile, criteria.slice(0, 1)).join(" "), /AC1 of docs\/specs\/x\.md: no red \(assertion\) then green TestRun for FlowTest › flagsLowStock/);
  const wrongOrder = [run("t1", "backend", "FlowTest", "pass"), run("t2", "backend", "FlowTest", "assertion")];
  assert.equal(redGreenProblems(wrongOrder, criteria.slice(0, 1)).length, 1);
});

const row = (level, who, evidence, why = "Harness change") => `| 29 | Some work | ${level} | ${who} | ${evidence} | ${why} |`;

test("autonomy: a harness or boundary change needs an added row; product code alone does not", () => {
  assert.equal(significant("scripts/dod.mjs"), true);
  assert.equal(significant(".github/workflows/ci.yml"), true);
  assert.equal(significant("src/main/java/com/flowershop/inventory/auth/AuthService.java"), true);
  assert.equal(significant("src/main/java/com/flowershop/inventory/inventory/RawMaterialService.java"), false);
  assert.match(autonomyProblems(["scripts/dod.mjs"], []).join(" "), /adds no row to docs\/autonomy-log\.md/);
  assert.deepEqual(autonomyProblems(["src/main/java/com/flowershop/inventory/inventory/X.java"], []), []);
  assert.deepEqual(autonomyProblems(["scripts/dod.mjs"], [row(1, "Human approved the plan", "`pr-evidence` job; 205a5b7 red")]), []);
});

test("autonomy: a row needs a level from 1 to 5, who decided, evidence that points somewhere, and why", () => {
  const text = autonomyProblems(["scripts/dod.mjs"], [row(7, "", "it went well", "")]).join(" ");
  assert.match(text, /level must be 1-5/);
  assert.match(text, /names no one who decided/);
  assert.match(text, /evidence points nowhere/);
  assert.match(text, /says nothing about why/);
});

test("blocked actions: a proposal without a result, except the last commit, whose result folds into the next one", () => {
  const lines = [
    { event: "PreToolUse", id: "a", tool: "Bash", cmd: "rm -rf target", ts: "t1" },
    { event: "PreToolUse", id: "b", tool: "Read", path: "README.md", ts: "t2" },
    { event: "PostToolUse", id: "b", tool: "Read", exit: 0, ts: "t3" },
    { event: "PreToolUse", id: "c", tool: "Bash", cmd: 'git add -A && git commit -m "x"', ts: "t4" },
  ];
  assert.deepEqual(blockedActions(lines).map((b) => [b.id, b.commit]), [["a", false], ["c", true]]);
});

test("the report lists the gates and escapes table pipes", () => {
  const text = report({
    base: "origin/main",
    head: "abc1234",
    gates: [
      { name: "Review", problems: [], ok: "APPROVE on the head commit's files" },
      { name: "Definition of done", problems: ["No green dod run | twice"], ok: "" },
    ],
    dodRuns: [dod("2026-10-05T14:31:00Z", 1, "x", [{ name: "Frontend formatting", exit: 1, result: "unformatted files" }])],
    testRuns: [{ ...run("2026-10-05T14:38:00Z", "harness", "scripts/a.test.mjs", "assertion"), firstFailure: "AssertionError: a | b" }],
    reviews: [],
    headCode: "y",
    headTree: "z",
    activity: { sessions: 1, modes: { auto: 3 }, executed: 3, failed: 0, blocked: [] },
  });
  assert.match(text, /\| Review \| ✅ APPROVE on the head commit's files \|/);
  assert.match(text, /\| Definition of done \| ❌ No green dod run \\\| twice \|/);
  assert.match(text, /Frontend formatting: unformatted files/);
  assert.match(text, /AssertionError: a \\\| b/);
});
