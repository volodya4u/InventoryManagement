// Unit tests for the gates and the report in scripts/pr-evidence.mjs. Run: node --test scripts/pr-evidence.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptanceFiles,
  autonomyProblems,
  branchWaivers,
  blockedActions,
  changedCriteria,
  dodProblems,
  evalsProblems,
  gateStatus,
  humanApprovalRow,
  newRows,
  parseGateWaiver,
  redGreenGate,
  redGreenProblems,
  report,
  significant,
} from "./pr-evidence.mjs";

const dod = (ts, exit, code, checks = []) => ({ ts, event: "DodRun", exit, code, checks });
// A structured TestRun (scripts/test-run.mjs): each test the selector ran, with the run's status unless results are given.
// The fixture classes and files contain the tests below.
const HEAD = "head";
const TESTS = {
  FlowTest: ["flagsLowStock", "flagsEmptyStock", "m"],
  InventoryFlowIntegrationTest: ["rejectsAnUnauthenticatedRequest"],
  "frontend/src/app/dash/dash.component.spec.ts": ["shows it"],
  "scripts/pr-evidence.test.mjs": ["status: works"],
  "scripts/a.test.mjs": ["a"],
};
const run = (ts, target, selector, kind, { results, code = HEAD, structured = true } = {}) => {
  const ids = selector.includes("#") ? [selector] : (TESTS[selector] ?? []).map((t) => (target === "backend" ? `${selector}#${t}` : `${selector} › ${t}`));
  const status = { pass: "pass", assertion: "assertion" }[kind] ?? "error";
  return { ts, event: "TestRun", target, selector, exit: kind === "pass" ? 0 : 1, kind, structured, code, results: results ?? (kind === "compile" ? [] : ids.map((id) => ({ id, status }))) };
};
const gateOf = (records, sources, waivers = []) => redGreenGate(records, sources, waivers, HEAD);
const problemsOf = (records, criteria) => redGreenProblems(records, criteria, HEAD);

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
  assert.deepEqual(problemsOf(records, criteria), []);
});

test("red-green: green only, red on a compile error, or green before red fails", () => {
  const greenOnly = [run("t1", "backend", "FlowTest#flagsLowStock", "pass"), run("t2", "frontend", "frontend/src/app/dash/dash.component.spec.ts", "pass")];
  assert.equal(problemsOf(greenOnly, criteria).length, 2);
  const compile = [run("t1", "backend", "FlowTest", "compile"), run("t2", "backend", "FlowTest", "pass")];
  assert.match(problemsOf(compile, criteria.slice(0, 1)).join(" "), /AC1 of docs\/specs\/x\.md: no red \(assertion\) then green TestRun for FlowTest › flagsLowStock/);
  const wrongOrder = [run("t1", "backend", "FlowTest", "pass"), run("t2", "backend", "FlowTest", "assertion")];
  assert.equal(problemsOf(wrongOrder, criteria.slice(0, 1)).length, 1);
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
  const bare = gateOf([], [noTable]);
  assert.equal(gateStatus(bare), "FAIL");
  assert.match(bare.problems.join(" "), /harden-security-tests\/proposal\.md.*no ## Acceptance criteria table/);

  // With a table but only the green runs #72 recorded after the fix: still no red, so it fails.
  const withTable = changedCriteria(PROPOSAL, table([["1", "Given no session, when the API is called, then 401", SECURITY]]), null);
  assert.equal(withTable.missingTable, false);
  const green = [run("t1", "backend", "InventoryFlowIntegrationTest", "pass")];
  const gate = gateOf(green, [withTable]);
  assert.equal(gateStatus(gate), "FAIL");
  assert.match(gate.problems.join(" "), /AC1 of openspec\/changes\/harden-security-tests\/proposal\.md: no red \(assertion\) then green TestRun/);

  // Red on an assertion, then green: it passes.
  const loop = [run("t1", "backend", "InventoryFlowIntegrationTest#rejectsAnUnauthenticatedRequest", "assertion"), ...green.map((r) => ({ ...r, ts: "t2" }))];
  assert.equal(gateStatus(gateOf(loop, [withTable])), "PASS");

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
  const gate = gateOf([], [source]);
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
  const gate = gateOf([run("t1", "backend", "FlowTest", "pass")], []);
  assert.equal(gate.applies, false);
  assert.equal(gateStatus(gate), "N/A");
  assert.match(gate.detail, /no new or changed acceptance criterion/);
  const unchanged = changedCriteria("docs/specs/x.md", table([["1", "a", "`FlowTest` › `m`"]]), table([["1", "a", "`FlowTest` › `m`"]]));
  assert.equal(gateStatus(gateOf([], [unchanged])), "N/A");
});

const WAIVER = (status, criteria, approval = "volodya4u in chat on 2026-10-20") =>
  `# Waiver: red-green for an absence test\n\nStatus: ${status}\n\n- **Gate:** Red → green\n- **Criteria:** ${criteria}\n- **Reason:** the test pins an absence, so it cannot fail first.\n- **Approval:** ${approval}\n`;

test("red-green: a criterion an open, approved waiver names is WAIVED; an unwaived one still fails", () => {
  const source = changedCriteria(PROPOSAL, table([["1", "Given no lockout, when signing in, then no lock", SECURITY], ["2", "Given a session, when read, then 200", "`FlowTest` › `m`"]]), null);
  const waiver = parseGateWaiver("docs/qa/waivers/2026-10-20-absence.md", WAIVER("open", `${PROPOSAL} AC1`));
  assert.deepEqual(waiver.criteria, [{ path: PROPOSAL, n: 1 }]);
  const partly = gateOf([], [source], [waiver]);
  assert.equal(gateStatus(partly), "FAIL");
  assert.equal(partly.problems.length, 1);
  assert.match(partly.problems[0], /AC2/);
  assert.match(partly.waived.join(" "), /AC1 of openspec\/changes\/harden-security-tests\/proposal\.md.*volodya4u in chat on 2026-10-20/);

  const whole = gateOf([], [source], [parseGateWaiver("docs/qa/waivers/w.md", WAIVER("open", PROPOSAL))]);
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
    assert.equal(gateStatus(gateOf([], [source], [parseGateWaiver("docs/qa/waivers/w.md", text)])), "FAIL", text);
  }
});

test("red-green: a harness test is covered by a harness TestRun of that file", () => {
  const source = changedCriteria(PROPOSAL, table([["1", "Given a gate, when computed, then a status", '`scripts/pr-evidence.test.mjs` › "status: works"']]), null);
  assert.deepEqual(source.criteria[0].test, { file: "scripts/pr-evidence.test.mjs", title: "status: works" });
  const loop = [run("t1", "harness", "scripts/pr-evidence.test.mjs", "assertion"), run("t2", "harness", "scripts/pr-evidence.test.mjs", "pass")];
  assert.equal(gateStatus(gateOf(loop, [source])), "PASS");
  const otherTarget = [run("t1", "frontend", "scripts/pr-evidence.test.mjs", "assertion"), run("t2", "frontend", "scripts/pr-evidence.test.mjs", "pass")];
  assert.equal(gateStatus(gateOf(otherTarget, [source])), "FAIL");
});

const FLOW = [{ spec: "docs/specs/x.md", n: 1, test: { className: "FlowTest", method: "flagsLowStock" } }];
const DASH = [{ spec: "docs/specs/x.md", n: 2, test: { file: "frontend/src/app/dash/dash.component.spec.ts", title: "shows it" } }];
const r = (id, status) => ({ id, status });

test("red-green: a title that two tests in one file share is ambiguous and does not count", () => {
  const file = "frontend/src/app/dash/dash.component.spec.ts";
  const both = (a, b) => [r(`${file} › DashboardComponent > on load > shows it`, a), r(`${file} › DashboardComponent > on error > shows it`, b)];
  // The other block's assertion must not stand in for the criterion's red, nor its pass for the green.
  const records = [run("t1", "frontend", file, "assertion", { results: both("pass", "assertion") }), run("t2", "frontend", file, "pass", { results: both("pass", "pass") })];
  const text = problemsOf(records, DASH).join(" ");
  assert.match(text, /"shows it" matches more than one test in frontend\/src\/app\/dash\/dash\.component\.spec\.ts/);
  assert.match(text, /DashboardComponent > on load > shows it/);
  assert.match(text, /DashboardComponent > on error > shows it/);
  assert.match(text, /give the tests distinct titles/);
  // Named by its whole suite path, the criterion matches one test only, so the same runs count.
  const exact = [{ ...DASH[0], test: { file, title: "DashboardComponent > on error > shows it" } }];
  assert.deepEqual(problemsOf(records, exact), []);
  // The same id listed twice (a runner reporting a retry) is one test, not two.
  const retried = [r(`${file} › DashboardComponent > shows it`, "assertion"), r(`${file} › DashboardComponent > shows it`, "assertion")];
  const once = [run("t1", "frontend", file, "assertion", { results: retried }), run("t2", "frontend", file, "pass", { results: [r(`${file} › DashboardComponent > shows it`, "pass")] })];
  assert.deepEqual(problemsOf(once, DASH), []);
});

test("red-green: only the criterion's own test counts; a failure of another test in the same class or file does not", () => {
  const otherMethod = [
    run("t1", "backend", "FlowTest", "assertion", { results: [r("FlowTest#flagsLowStock", "pass"), r("FlowTest#flagsEmptyStock", "assertion")] }),
    run("t2", "backend", "FlowTest", "pass"),
  ];
  assert.match(problemsOf(otherMethod, FLOW).join(" "), /for FlowTest › flagsLowStock: it never failed on an assertion/);
  const otherTitle = "frontend/src/app/dash/dash.component.spec.ts › DashboardComponent > shows another thing";
  const otherFileTest = [
    run("t1", "frontend", "frontend/src/app/dash/dash.component.spec.ts", "assertion", {
      results: [r("frontend/src/app/dash/dash.component.spec.ts › DashboardComponent > shows it", "pass"), r(otherTitle, "assertion")],
    }),
    run("t2", "frontend", "frontend/src/app/dash/dash.component.spec.ts", "pass"),
  ];
  assert.equal(problemsOf(otherFileTest, DASH).length, 1);
  // The criterion's own test, by its leaf title under a describe block or by its id, does count.
  const own = [
    run("t1", "frontend", "frontend/src/app/dash/dash.component.spec.ts", "assertion", { results: [r("frontend/src/app/dash/dash.component.spec.ts › DashboardComponent > shows it", "assertion")] }),
    run("t2", "frontend", "frontend/src/app/dash/dash.component.spec.ts", "pass", { results: [r("frontend/src/app/dash/dash.component.spec.ts › DashboardComponent > shows it", "pass")] }),
  ];
  assert.deepEqual(problemsOf(own, DASH), []);
  const parameterized = [
    run("t1", "backend", "FlowTest", "assertion", { results: [r("FlowTest#flagsLowStock(int)[1]", "pass"), r("FlowTest#flagsLowStock(int)[2]", "assertion")] }),
    run("t2", "backend", "FlowTest", "pass", { results: [r("FlowTest#flagsLowStock(int)[1]", "pass"), r("FlowTest#flagsLowStock(int)[2]", "pass")] }),
  ];
  assert.deepEqual(problemsOf(parameterized, FLOW), [], "a parameterized test's cases count as that test");
});

test("red-green: a skipped target test, an error or an unstructured run is not red", () => {
  const green = run("t9", "backend", "FlowTest", "pass");
  for (const status of ["skipped", "error"]) {
    const records = [run("t1", "backend", "FlowTest", "error", { results: [r("FlowTest#flagsLowStock", status)] }), green];
    assert.match(problemsOf(records, FLOW).join(" "), new RegExp(`it never failed on an assertion in a structured run \\(seen: ${status}`), status);
  }
  // A run recorded without a report (or before results were recorded) does not count, whatever its kind says.
  const unstructured = [{ ...run("t1", "backend", "FlowTest#flagsLowStock", "assertion"), structured: false }, green];
  assert.match(problemsOf(unstructured, FLOW).join(" "), /never failed on an assertion/);
  const legacy = [{ ts: "t1", event: "TestRun", target: "backend", selector: "FlowTest", kind: "assertion", exit: 1 }, green];
  assert.match(problemsOf(legacy, FLOW).join(" "), /never failed on an assertion/);
  // No structured run of the test at all.
  assert.match(problemsOf([], FLOW).join(" "), /for FlowTest › flagsLowStock: no structured TestRun names it/);
});

test("red-green: a green run on older code is stale; the last green must cover the head commit's code", () => {
  const red = run("t1", "backend", "FlowTest#flagsLowStock", "assertion", { code: "c1" });
  const staleGreen = run("t2", "backend", "FlowTest#flagsLowStock", "pass", { code: "c2" });
  assert.match(problemsOf([red, staleGreen], FLOW).join(" "), /stale.*re-run `node scripts\/test-run\.mjs backend FlowTest#flagsLowStock` after the last code change/);
  const greenOnHead = run("t3", "backend", "FlowTest", "pass");
  assert.deepEqual(problemsOf([red, staleGreen, greenOnHead], FLOW), []);
  // A green on the head code that came before the red does not count either.
  assert.equal(problemsOf([run("t0", "backend", "FlowTest", "pass"), red, staleGreen], FLOW).length, 1);
});

test("red-green: a criterion that names no test fails", () => {
  const source = changedCriteria("docs/specs/x.md", table([["1", "Given x, then y", "the integration test"]]), null);
  const gate = gateOf([], [source]);
  assert.equal(gateStatus(gate), "FAIL");
  assert.match(gate.problems.join(" "), /AC1 of docs\/specs\/x\.md names no test .*found "the integration test"/);
});

test("waivers: only a waiver the branch adds counts", () => {
  const text = WAIVER("open", PROPOSAL);
  const read = (path) => (path.startsWith("docs/qa/waivers/") ? text : null);
  const lines = [
    "A\tdocs/qa/waivers/2026-10-20-new.md",
    "M\tdocs/qa/waivers/2026-10-11-baseline-NFR-15.md",
    "R100\tdocs/qa/waivers/old.md\tdocs/qa/waivers/renamed.md",
    "A\tdocs/qa/waivers/nested/deeper.md",
    "A\tdocs/qa/other.md",
  ];
  assert.deepEqual(branchWaivers(lines, read).map((w) => w.path), ["docs/qa/waivers/2026-10-20-new.md"]);
  assert.equal(branchWaivers(lines, read)[0].approval, "volodya4u in chat on 2026-10-20");
});

// A break run (scripts/break-run.mjs): start green, break red, restore green, each a BreakRun record with the code
// fingerprint and per-test results; the patch is committed under docs/evidence/break-runs/<run>/mutation.patch.
const FLOW_TEST = "src/test/java/com/x/FlowTest.java";
const breakRec = (run, step, kind, code, extra = {}) => ({
  ts: `${run}-${["start", "break", "restore"].indexOf(step)}`,
  event: "BreakRun",
  run,
  step,
  target: "backend",
  selector: "FlowTest#flagsLowStock",
  structured: true,
  kind,
  code,
  results: [r("FlowTest#flagsLowStock", kind === "pass" ? "pass" : "assertion")],
  testFiles: { [FLOW_TEST]: "blob-test" },
  ...(step === "start" ? {} : { patchSha256: "sha-1", patchFiles: ["src/main/java/com/x/Flow.java"] }),
  ...extra,
});
const fullBreakRun = (run = "r1") => [breakRec(run, "start", "pass", HEAD), breakRec(run, "break", "assertion", "broken"), breakRec(run, "restore", "pass", HEAD)];
const HARDENING = [{ ...FLOW[0], hardening: true }];
const breaks = (records, criteria = HARDENING, patches = { r1: "sha-1" }) => redGreenProblems(records, criteria, HEAD, patches);

test("hardening: a criterion passes with a break run: green, red on its own test, restored to the head commit's code", () => {
  assert.deepEqual(breaks(fullBreakRun()), []);
  // The table in a slice marked Kind: hardening carries the flag on each criterion.
  const hard = changedCriteria(PROPOSAL, `Kind: hardening\n\n${table([["1", "Given x, then y", "`FlowTest` › `flagsLowStock`"]])}`, null);
  assert.equal(hard.criteria[0].hardening, true);
  assert.equal(changedCriteria(PROPOSAL, table([["1", "Given x, then y", "`FlowTest` › `flagsLowStock`"]]), null).criteria[0].hardening, false);
});

test("hardening: a break run without a restore, restored to other code, red on another test, touching the test file, or whose patch is not committed does not count", () => {
  const [start, broken, restore] = fullBreakRun();
  const cases = {
    "no restore": [start, broken],
    "restored to other code": [start, broken, { ...restore, code: "other" }],
    "a start on other code than the restore": [{ ...start, code: "older" }, broken, restore],
    "a restore to the start's code, older than the head commit's (stale)": [{ ...start, code: "older" }, broken, { ...restore, code: "older" }],
    "a break that changed no code": [start, { ...broken, code: HEAD }, restore],
    "red on another test": [start, { ...broken, results: [r("FlowTest#flagsLowStock", "pass"), r("FlowTest#other", "assertion")] }, restore],
    "an error, not an assertion": [start, { ...broken, results: [r("FlowTest#flagsLowStock", "error")] }, restore],
    "a patch that edits the test file": [start, { ...broken, patchFiles: [FLOW_TEST] }, { ...restore, patchFiles: [FLOW_TEST] }],
    "a restore of another patch": [start, broken, { ...restore, patchSha256: "sha-2" }],
  };
  for (const [name, records] of Object.entries(cases)) {
    assert.match(breaks(records).join(" "), /no red \(assertion\) then green TestRun or complete break run for FlowTest › flagsLowStock/, name);
  }
  assert.match(breaks([{ ...start, code: "older" }, broken, { ...restore, code: "older" }]).join(" "), /older code than the head commit \(stale\)/);
  assert.match(breaks(fullBreakRun(), HARDENING, {}).join(" "), /docs\/evidence\/break-runs\/r1\/mutation\.patch/, "the patch must be committed");
  assert.equal(breaks(fullBreakRun(), HARDENING, { r1: "sha-other" }).length, 1, "the committed patch must be the one that ran");
});

test("hardening: only a slice marked Kind: hardening accepts break runs, and it still accepts red then green", () => {
  assert.equal(breaks(fullBreakRun(), FLOW).length, 1, "a break run does not satisfy a criterion of a slice that is not hardening");
  const redGreen = [run("t1", "backend", "FlowTest#flagsLowStock", "assertion"), run("t2", "backend", "FlowTest#flagsLowStock", "pass")];
  assert.deepEqual(breaks(redGreen), []);
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
    testRuns: [
      { ...run("2026-10-05T14:38:00Z", "harness", "scripts/a.test.mjs", "assertion", { code: "y" }), firstFailure: "AssertionError: a | b" },
      { ts: "2026-10-05T14:39:00Z", event: "TestRun", target: "backend", selector: "FlowTest", kind: "pass", code: "old" },
    ],
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
  assert.match(text, /\| harness scripts\/a\.test\.mjs \| ❌ assertion \| 1 assertion \| AssertionError: a \\\| b \| yes \|/);
  assert.match(text, /\| backend FlowTest \| ✅ pass \| unstructured \(does not count\) \|  \| no \|/);
});

test("the report shows the Human approval row after Review: FAIL in CI without a signature, N/A locally, PASS when signed", () => {
  const missing = { state: "missing", tag: "approve/abc", ignored: [] };
  const valid = { state: "valid", tag: "approve/abc", signer: "owner@example.com", ignored: [] };
  const table = (row) =>
    report({
      base: "origin/main",
      head: "abc1234",
      gates: [{ name: "Review", applies: true, problems: [], detail: "APPROVE on the head commit's files" }, row],
      dodRuns: [],
      testRuns: [],
      reviews: [],
      headCode: "y",
      headTree: "z",
      activity: { sessions: 1, modes: {}, executed: 0, failed: 0, blocked: [] },
    });
  // GitHub sets GITHUB_ACTIONS=true in every job; anything else is a local run.
  const ci = table(humanApprovalRow(missing, { GITHUB_ACTIONS: "true" }));
  assert.match(ci, /\| Review \| ✅ PASS: [^\n]*\|\n\| Human approval \| ❌ FAIL: No signed approval of the head commit \(approve\/abc\): [^\n]*node scripts\/approve-pr\.mjs <pr>/);
  assert.match(table(humanApprovalRow(missing, {})), /\| Human approval \| ➖ N\/A: checked in CI: /);
  assert.match(table(humanApprovalRow(missing, { GITHUB_ACTIONS: "false" })), /\| Human approval \| ➖ N\/A: /);
  assert.match(table(humanApprovalRow(valid, { GITHUB_ACTIONS: "true" })), /\| Human approval \| ✅ PASS: approve\/abc signed by owner@example\.com \|/);
  assert.match(table(humanApprovalRow({ state: "invalid", tag: "approve/abc", reason: "no signature found", ignored: [] }, {})), /\| Human approval \| ❌ FAIL: approve\/abc is not a valid signed approval: no signature found\. \|/);
});
