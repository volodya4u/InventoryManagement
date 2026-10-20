// Unit tests for the gates and the report in scripts/pr-evidence.mjs. Run: node --test scripts/pr-evidence.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptanceFiles,
  autonomyProblems,
  blockedActions,
  changedCriteria,
  dodProblems,
  evalsProblems,
  gateStatus,
  newRows,
  parseGateWaiver,
  redGreenGate,
  redGreenProblems,
  report,
  significant,
} from "./pr-evidence.mjs";

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

test("status: FAIL with problems, WAIVED when every problem is waived, N/A when the gate does not apply, PASS otherwise", () => {
  assert.equal(gateStatus({ applies: true, problems: ["x"], waived: ["y"] }), "FAIL");
  assert.equal(gateStatus({ applies: false, problems: ["x"] }), "FAIL");
  assert.equal(gateStatus({ applies: true, problems: [], waived: ["AC1 of a.md"] }), "WAIVED");
  assert.equal(gateStatus({ applies: false, problems: [] }), "N/A");
  assert.equal(gateStatus({ applies: true, problems: [] }), "PASS");
});

// An acceptance table in the docs/specs format, with one row per [n, given/when/then, test cell].
const table = (rows) =>
  `# Slice\n\n## Why\nx\n\n## Acceptance criteria\n\n| # | Given / When / Then | Test |\n| - | --- | --- |\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n\n## Impact\n- none\n`;
const SECURITY = "`InventoryFlowIntegrationTest` › `rejectsAnUnauthenticatedRequest`";
const PROPOSAL = "openspec/changes/harden-security-tests/proposal.md";

test("red-green: an OpenSpec slice the branch adds with no acceptance table, or no red then green TestRun, fails (the #72 replay)", () => {
  // #72: the slice's proposal had no acceptance table, so the old gate saw no new spec and showed a pass.
  const noTable = changedCriteria(PROPOSAL, "# Harden security tests\n\n## Why\nGaps.\n\n## What Changes\n- tests\n", null);
  assert.equal(noTable.missingTable, true);
  const bare = redGreenGate([], [noTable]);
  assert.equal(gateStatus(bare), "FAIL");
  assert.match(bare.problems.join(" "), /harden-security-tests\/proposal\.md.*no ## Acceptance criteria table/);

  // With a table but only the green runs #72 recorded after the fix: still no red, so it fails.
  const withTable = changedCriteria(PROPOSAL, table([["1", "Given no session, when the API is called, then 401", SECURITY]]), null);
  assert.equal(withTable.missingTable, false);
  const green = [run("t1", "backend", "InventoryFlowIntegrationTest", "pass")];
  const gate = redGreenGate(green, [withTable]);
  assert.equal(gateStatus(gate), "FAIL");
  assert.match(gate.problems.join(" "), /AC1 of openspec\/changes\/harden-security-tests\/proposal\.md: no red \(assertion\) then green TestRun/);

  // Red on an assertion, then green: it passes.
  const loop = [run("t1", "backend", "InventoryFlowIntegrationTest#rejectsAnUnauthenticatedRequest", "assertion"), ...green.map((r) => ({ ...r, ts: "t2" }))];
  assert.equal(gateStatus(redGreenGate(loop, [withTable])), "PASS");

  // An archived slice the branch adds is held to the same rule.
  assert.deepEqual(acceptanceFiles(["A\topenspec/changes/archive/2026-10-12-harden-security-tests/proposal.md", "A\topenspec/changes/archive/2026-10-12-harden-security-tests/tasks.md"]), [
    { path: "openspec/changes/archive/2026-10-12-harden-security-tests/proposal.md", basePath: null },
  ]);
});

test("red-green: a changed criterion of an existing spec needs new evidence; an unchanged one does not", () => {
  const before = table([
    ["1", "Given stock at the level, when read, then flagged", "`FlowTest` › `flagsLowStock`"],
    ["2", "Given a summary, when shown, then a card", '`frontend/src/app/dash/dash.component.spec.ts` › "shows it"'],
  ]);
  const after = table([
    ["1", "Given stock at the level, when read, then flagged", "`FlowTest` › `flagsLowStock`"],
    ["2", "Given a summary, when shown, then a card with the count", '`frontend/src/app/dash/dash.component.spec.ts` › "shows it"'],
    ["3", "Given no stock, when read, then flagged too", "`FlowTest` › `flagsEmptyStock`"],
  ]);
  const source = changedCriteria("docs/specs/x.md", after, before);
  assert.deepEqual(source.criteria.map((c) => c.n), [2, 3]);
  const gate = redGreenGate([], [source]);
  assert.equal(gateStatus(gate), "FAIL");
  assert.equal(gate.problems.length, 2);
  assert.doesNotMatch(gate.problems.join(" "), /AC1/);
  // A modified spec and a rename both compare with the base version.
  assert.deepEqual(acceptanceFiles(["M\tdocs/specs/x.md", "R100\topenspec/changes/s/proposal.md\topenspec/changes/archive/2026-10-20-s/proposal.md", "M\tdocs/specs/TEMPLATE.md", "D\tdocs/specs/old.md"]), [
    { path: "docs/specs/x.md", basePath: "docs/specs/x.md" },
    { path: "openspec/changes/archive/2026-10-20-s/proposal.md", basePath: "openspec/changes/s/proposal.md" },
  ]);
  // Archiving a slice (a rename with the same table) asks for no new evidence, and an old proposal is not asked for a table.
  assert.deepEqual(changedCriteria("openspec/changes/archive/2026-10-20-s/proposal.md", after, after).criteria, []);
  assert.equal(changedCriteria(PROPOSAL, "# Old slice\n", "# Old slice\n").missingTable, false);
});

test("red-green: a branch with no new or changed criterion is N/A, never PASS", () => {
  const gate = redGreenGate([run("t1", "backend", "FlowTest", "pass")], []);
  assert.equal(gate.applies, false);
  assert.equal(gateStatus(gate), "N/A");
  assert.match(gate.detail, /no new or changed acceptance criterion/);
  const unchanged = changedCriteria("docs/specs/x.md", table([["1", "a", "`FlowTest` › `m`"]]), table([["1", "a", "`FlowTest` › `m`"]]));
  assert.equal(gateStatus(redGreenGate([], [unchanged])), "N/A");
});

const WAIVER = (status, criteria, approval = "volodya4u in chat on 2026-10-20") =>
  `# Waiver: red-green for an absence test\n\nStatus: ${status}\n\n- **Gate:** Red → green\n- **Criteria:** ${criteria}\n- **Reason:** the test pins an absence, so it cannot fail first.\n- **Approval:** ${approval}\n`;

test("red-green: a criterion an open, approved waiver names is WAIVED; an unwaived one still fails", () => {
  const source = changedCriteria(PROPOSAL, table([["1", "Given no lockout, when signing in, then no lock", SECURITY], ["2", "Given a session, when read, then 200", "`FlowTest` › `m`"]]), null);
  const waiver = parseGateWaiver("docs/qa/waivers/2026-10-20-absence.md", WAIVER("open", `${PROPOSAL} AC1`));
  assert.deepEqual(waiver.criteria, [{ path: PROPOSAL, n: 1 }]);
  const partly = redGreenGate([], [source], [waiver]);
  assert.equal(gateStatus(partly), "FAIL");
  assert.equal(partly.problems.length, 1);
  assert.match(partly.problems[0], /AC2/);
  assert.match(partly.waived.join(" "), /AC1 of openspec\/changes\/harden-security-tests\/proposal\.md.*volodya4u in chat on 2026-10-20/);

  const whole = redGreenGate([], [source], [parseGateWaiver("docs/qa/waivers/w.md", WAIVER("open", PROPOSAL))]);
  assert.equal(gateStatus(whole), "WAIVED");
  assert.match(whole.detail, /waived/);

  // One path can list several criteria.
  assert.deepEqual(parseGateWaiver("docs/qa/waivers/w.md", WAIVER("open", `${PROPOSAL} AC1, AC2; docs/specs/x.md`)).criteria, [
    { path: PROPOSAL, n: 1 },
    { path: PROPOSAL, n: 2 },
    { path: "docs/specs/x.md", n: null },
  ]);

  // A closed waiver, one with no Status line, one with no approval, or one for another gate waives nothing.
  const noStatus = WAIVER("open", PROPOSAL).replace("Status: open\n", "");
  for (const text of [WAIVER("closed", PROPOSAL), noStatus, WAIVER("open", PROPOSAL, ""), WAIVER("open", PROPOSAL).replace("Red → green", "Docs lookup")]) {
    assert.equal(gateStatus(redGreenGate([], [source], [parseGateWaiver("docs/qa/waivers/w.md", text)])), "FAIL", text);
  }
});

test("red-green: a harness test is covered by a harness TestRun of that file", () => {
  const source = changedCriteria(PROPOSAL, table([["1", "Given a gate, when computed, then a status", '`scripts/pr-evidence.test.mjs` › "status: works"']]), null);
  assert.deepEqual(source.criteria[0].test, { file: "scripts/pr-evidence.test.mjs", title: "status: works" });
  const loop = [run("t1", "harness", "scripts/pr-evidence.test.mjs", "assertion"), run("t2", "harness", "scripts/pr-evidence.test.mjs", "pass")];
  assert.equal(gateStatus(redGreenGate(loop, [source])), "PASS");
  const otherTarget = [run("t1", "frontend", "scripts/pr-evidence.test.mjs", "assertion"), run("t2", "frontend", "scripts/pr-evidence.test.mjs", "pass")];
  assert.equal(gateStatus(redGreenGate(otherTarget, [source])), "FAIL");
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

test("autonomy: an edited row is not a new row, so editing an old one cannot satisfy the gate", () => {
  const base = "| # | Work |\n|---|---|\n| 8 | Old work | 1 | Human | a.md | why |\n| 27 | Feature | 2 | Human | b.md | why |\n";
  const plus = ["| 8 | Old work, corrected | 1 | Human | a.md | why |", "| 28 | New work | 1 | Human | c.md | why |"];
  assert.deepEqual(newRows(plus, base), ["| 28 | New work | 1 | Human | c.md | why |"]);
  assert.deepEqual(newRows(plus.slice(0, 1), base), []);
  assert.deepEqual(newRows(plus, ""), plus);
});

test("autonomy: a row needs a level from 1 to 5, who decided, evidence that points somewhere, and why", () => {
  const text = autonomyProblems(["scripts/dod.mjs"], [row(7, "", "it went well", "")]).join(" ");
  assert.match(text, /level must be 1-5/);
  assert.match(text, /names no one who decided/);
  assert.match(text, /evidence points nowhere/);
  assert.match(text, /says nothing about why/);
});

test("evals: the gate fires only when an eval-relevant input changed on the branch", () => {
  const record = { inputs: { "AGENTS.md": "aaa" } };
  // No reviewer/skill/AGENTS/case change: no eval run needed, even without a record.
  assert.deepEqual(evalsProblems(["src/main/java/com/x/Service.java", "README.md"], null, { "AGENTS.md": "aaa" }), []);
  // AGENTS.md changed, record still matches: passes.
  assert.deepEqual(evalsProblems(["AGENTS.md"], record, { "AGENTS.md": "aaa" }), []);
  // reviewer.md changed, record stale: fails.
  assert.match(evalsProblems([".claude/agents/reviewer.md"], record, { "AGENTS.md": "bbb" }).join(" "), /changed since|is no longer covered|is new/);
  // A skill case changed, no record at all: fails.
  assert.match(evalsProblems([".agents/skills/test-first-loop/evals/x/prompt.md"], null, { "AGENTS.md": "aaa" }).join(" "), /no evals\/record\.json/);
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

test("the report shows PASS, FAIL, N/A and WAIVED in their own words", () => {
  const text = report({
    base: "origin/main",
    head: "abc1234",
    gates: [
      { name: "Review", applies: true, problems: [], detail: "APPROVE on the head commit's files" },
      { name: "Definition of done", applies: true, problems: ["No green dod run | twice"], detail: "" },
      { name: "Docs lookup", applies: false, problems: [], detail: "no new third-party import on this branch" },
      { name: "Red → green", applies: true, problems: [], waived: ["AC1 of a.md (approved: volodya4u)"], detail: "1 criterion waived" },
    ],
    dodRuns: [dod("2026-10-05T14:31:00Z", 1, "x", [{ name: "Frontend formatting", exit: 1, result: "unformatted files" }])],
    testRuns: [{ ...run("2026-10-05T14:38:00Z", "harness", "scripts/a.test.mjs", "assertion"), firstFailure: "AssertionError: a | b" }],
    reviews: [],
    headCode: "y",
    headTree: "z",
    activity: { sessions: 1, modes: { auto: 3 }, executed: 3, failed: 0, blocked: [] },
  });
  assert.match(text, /\| Review \| ✅ PASS: APPROVE on the head commit's files \|/);
  assert.match(text, /\| Definition of done \| ❌ FAIL: No green dod run \\\| twice \|/);
  assert.match(text, /\| Docs lookup \| ➖ N\/A: no new third-party import on this branch \|/);
  assert.match(text, /\| Red → green \| ⚠️ WAIVED: 1 criterion waived; AC1 of a\.md \(approved: volodya4u\) \|/);
  assert.doesNotMatch(text, /\| Docs lookup \| ✅/, "a gate that does not apply is never shown as a pass");
  assert.match(text, /Frontend formatting: unformatted files/);
  assert.match(text, /AssertionError: a \\\| b/);
});
