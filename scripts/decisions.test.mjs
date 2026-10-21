// Tests for scripts/decisions.mjs, plus the check on this repository's own open questions (so CI fails a malformed one).
// Run: node --test scripts/decisions.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { decisionProblems, parseOpenQuestions, repoDecisionProblems } from "./decisions.mjs";

const tmp = mkdtempSync(join(tmpdir(), "decisions-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
const write = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

const HEADER = "| ID | Question | Status | Recommended default | Observed behavior | Owner-approved intent | Decision owner | Date | Reference | Requirements | Tests |\n|---|---|---|---|---|---|---|---|---|---|---|\n";
const row = (cells) => `| ${cells.join(" | ")} |\n`;
const doc = (rows) => `# Requirements\n\n| ID | Phase | Area | Description | Verification |\n|---|---|---|---|---|\n| FR-81 | MVP | Products | Price is stored. | local-verifiable |\n\n## Open questions\n\nIntro.\n\n${HEADER}${rows.join("")}\n## Coverage gaps\n`;
const ANSWERED = [
  "OQ-1",
  "Is the stored price intended?",
  "answered",
  "—",
  "A new batch is costed at the current average cost.",
  "A product keeps the price it was saved with.",
  "volodya4u",
  "2026-10-11",
  "[#80](https://github.com/volodya4u/InventoryManagement/pull/80)",
  "FR-81",
  "`FlowTest#keepsTheStoredPrice`",
];
const OPEN = ["OQ-3", "Should duplicate names be allowed?", "open", "Ratify as is (allowed).", "Duplicate names are accepted.", "", "", "", "", "", ""];

function project(name, rows, { trace = "// @trace FR-81" } = {}) {
  const root = join(tmp, name);
  write(root, "docs/requirements.md", doc(rows.map(row)));
  write(root, "src/test/java/com/x/FlowTest.java", `class FlowTest {\n  ${trace}\n  @Test\n  void keepsTheStoredPrice() {}\n}\n`);
  return root;
}

test("an answered question needs its owner, date, reference, an existing requirement and a test that traces it", () => {
  assert.deepEqual(repoDecisionProblems(project("ok", [ANSWERED, OPEN])), []);
  const broken = (index, value) => repoDecisionProblems(project(`broken-${index}`, [ANSWERED.map((c, i) => (i === index ? value : c))])).join("\n");
  assert.match(broken(6, ""), /OQ-1 is answered but names no decision owner/);
  assert.match(broken(7, "11 October"), /OQ-1 is answered but its date is not YYYY-MM-DD/);
  assert.match(broken(8, ""), /OQ-1 is answered but names no reference/);
  assert.match(broken(9, "FR-999"), /OQ-1 names FR-999, which is not a requirement in docs\/requirements\.md/);
  assert.match(broken(9, ""), /OQ-1 is answered but links no requirement/);
  assert.match(broken(10, ""), /OQ-1 is answered but links no test/);
  assert.match(broken(10, "`FlowTest#missing`"), /OQ-1 names the test FlowTest#missing, which does not exist/);
  // The test exists but does not trace the requirement: the decision is not held by it.
  assert.match(repoDecisionProblems(project("untraced", [ANSWERED], { trace: "// @trace FR-1" })).join("\n"), /FlowTest#keepsTheStoredPrice carries no @trace FR-81/);
});

test("an open question keeps its decision cells empty, so a default is never mistaken for an answer", () => {
  const filled = OPEN.map((c, i) => (i === 5 ? "The owner said yes." : i === 6 ? "volodya4u" : c));
  const text = repoDecisionProblems(project("open-filled", [filled])).join("\n");
  assert.match(text, /OQ-3 is open but has an owner-approved intent/);
  assert.match(text, /OQ-3 is open but names a decision owner/);
  // A recommended default and the observed behavior may stay: they are not decisions.
  assert.deepEqual(repoDecisionProblems(project("open-ok", [OPEN])), []);
});

test("observed behavior and owner-approved intent are separate cells, and a status outside the four is refused", () => {
  const [q] = parseOpenQuestions(doc([row(ANSWERED)]));
  assert.equal(q.observed, "A new batch is costed at the current average cost.");
  assert.equal(q.intent, "A product keeps the price it was saved with.");
  assert.deepEqual(q.requirements, ["FR-81"]);
  assert.deepEqual(q.tests, ["FlowTest#keepsTheStoredPrice"]);
  const odd = decisionProblems([{ ...q, status: "decided" }], { requirementIds: new Set(["FR-81"]), traces: () => ["FR-81"] });
  assert.match(odd.join(" "), /OQ-1 has status "decided": use open, answered, ratified or withdrawn/);
  // An answer without intent leaves only what the code does, which is not a decision.
  assert.match(decisionProblems([{ ...q, intent: "" }], { requirementIds: new Set(["FR-81"]), traces: () => ["FR-81"] }).join(" "), /OQ-1 is answered but records no owner-approved intent/);
  // A table without the structured columns is refused as a whole.
  assert.match(repoDecisionProblems(join(tmp, "none")).join(" "), /docs\/requirements\.md/);
  const legacy = join(tmp, "legacy");
  write(legacy, "docs/requirements.md", "## Open questions\n\n| ID | Question | Recommended default |\n|---|---|---|\n| OQ-1 | Q? | A. |\n");
  assert.match(repoDecisionProblems(legacy).join(" "), /needs the columns .*Status/);
});

test("a test's @trace is read from its own lines, never from the test above it", () => {
  const answered = (name, tests) => ANSWERED.map((c, i) => (i === 10 ? tests : c));
  // A short tagged test right above an untagged one: the untagged one does not hold the decision.
  const java = project("java-neighbour", [answered("java", "`FlowTest#keepsTheStoredPrice`")]);
  write(java, "src/test/java/com/x/FlowTest.java", "class FlowTest {\n  // @trace FR-81\n  @Test\n  void tagged() {}\n\n  @Test\n  void keepsTheStoredPrice() {}\n}\n");
  assert.match(repoDecisionProblems(java).join("\n"), /FlowTest#keepsTheStoredPrice carries no @trace FR-81/);
  const ts = project("ts-neighbour", [answered("ts", "`frontend/src/app/flow.spec.ts › keeps the stored price`")]);
  write(ts, "frontend/src/app/flow.spec.ts", "describe('flow', () => {\n  // @trace FR-81\n  it('tagged', () => {});\n  it('keeps the stored price', () => {});\n});\n");
  assert.match(repoDecisionProblems(ts).join("\n"), /carries no @trace FR-81/);
  // Its own tag still counts across annotations and comments between the tag and the declaration.
  write(java, "src/test/java/com/x/FlowTest.java", "class FlowTest {\n  @Test\n  void tagged() {}\n\n  // @trace FR-81\n  // Kept after a cost change.\n  @Test\n  @DisplayName(\"keeps\")\n  void keepsTheStoredPrice() {}\n}\n");
  assert.deepEqual(repoDecisionProblems(java), []);
  write(ts, "frontend/src/app/flow.spec.ts", "describe('flow', () => {\n  it('tagged', () => {});\n  // @trace FR-81\n  it('keeps the stored price', () => {});\n});\n");
  assert.deepEqual(repoDecisionProblems(ts), []);
});

test("the repository's own open questions are well formed", () => {
  const problems = repoDecisionProblems(process.cwd());
  assert.deepEqual(problems, [], problems.join("\n"));
});
