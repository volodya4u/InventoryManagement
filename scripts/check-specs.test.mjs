// Unit tests for scripts/check-specs.mjs, plus the check on this repository's own specs.
// Run: node --test scripts/check-specs.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { parseSpec, prSpecProblems, validateSpecs } from "./check-specs.mjs";

const tmp = mkdtempSync(join(tmpdir(), "check-specs-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const write = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
const git = (root, ...args) => execFileSync("git", ["-C", root, "-c", "user.email=t@t", "-c", "user.name=t", ...args], { encoding: "utf8" });

const SPEC = (status, ac2 = 'then a "Low Stock" card shows 2') => `# Spec: Low stock

Status: ${status}

<!-- a hint left by the template -->

## Acceptance criteria

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 1 | Given \`quantity <= reorder_level\`, when the DTO is read, then it is flagged | \`FlowTest\` › \`flagsLowStock\` |
| 2 | Given a summary, when the dashboard renders, ${ac2} | \`frontend/src/app/dash/dash.component.spec.ts\` › "shows the low-stock count" |

## Changes

- none
`;

function project(name, { status = "Approved by volodya4u on 2026-10-05", ac2 } = {}) {
  const root = join(tmp, name);
  write(root, "docs/specs/TEMPLATE.md", "Status: Draft | Approved by <who> on <date>\n");
  write(root, "docs/specs/low-stock.md", SPEC(status, ac2));
  write(root, "src/test/java/com/x/FlowTest.java", "class FlowTest {\n  @Test\n  void flagsLowStock() {}\n}\n");
  write(root, "frontend/src/app/dash/dash.component.spec.ts", "it('shows the low-stock count', () => {\n  expect(text).toContain('Low Stock');\n});\n");
  return root;
}

test("a spec whose criteria name existing tests that hold its quoted text passes", () => {
  assert.deepEqual(validateSpecs(project("ok")).problems, []);
});

test("quoted text that the named test does not contain fails: the AC5 drift", () => {
  const { problems } = validateSpecs(project("drift", { ac2: 'then a "Low stock" card shows 2' }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /AC2 quotes "Low stock", which frontend\/src\/app\/dash\/dash\.component\.spec\.ts does not contain/);
});

test("a criterion that names a missing test method or title fails", () => {
  const root = project("missing");
  write(root, "src/test/java/com/x/FlowTest.java", "class FlowTest {\n  @Test\n  void somethingElse() {}\n}\n");
  write(root, "frontend/src/app/dash/dash.component.spec.ts", "it('another title', () => { expect(t).toContain('Low Stock'); });\n");
  const text = validateSpecs(root).problems.join("\n");
  assert.match(text, /AC1 names FlowTest › flagsLowStock, but FlowTest has no method flagsLowStock/);
  assert.match(text, /AC2 names .*dash\.component\.spec\.ts › "shows the low-stock count", but that file has no test with this title/);
});

test("an unapproved status or a template placeholder left in the spec fails", () => {
  assert.match(validateSpecs(project("draft", { status: "Draft" })).problems.join(" "), /Status must read "Approved by <who> on <YYYY-MM-DD>"/);
  const placeholder = validateSpecs(project("placeholder", { status: "Approved by volodya4u on 2026-10-05 | Done in <PR link>" }));
  assert.match(placeholder.problems.join(" "), /template placeholder <PR link>/);
});

test("code spans and HTML comments are not placeholders, and the template itself is not checked", () => {
  const parsed = parseSpec(SPEC("Approved by volodya4u on 2026-10-05"));
  assert.deepEqual(parsed.placeholders, []);
  assert.equal(parsed.criteria.length, 2);
  assert.deepEqual(parsed.criteria[1].quotes, ["Low Stock"]);
});

test("in a pull request, a new spec must be committed before the first commit that touches code", () => {
  const before = project("order-ok");
  git(before, "init", "-q");
  git(before, "commit", "-q", "--allow-empty", "-m", "base");
  git(before, "add", "docs");
  git(before, "commit", "-qm", "spec");
  git(before, "add", "-A");
  git(before, "commit", "-qm", "code");
  assert.deepEqual(prSpecProblems(before, "HEAD~2", "HEAD"), []);

  const afterCode = project("order-bad");
  git(afterCode, "init", "-q");
  git(afterCode, "commit", "-q", "--allow-empty", "-m", "base");
  git(afterCode, "add", "src", "frontend");
  git(afterCode, "commit", "-qm", "code");
  git(afterCode, "add", "-A");
  git(afterCode, "commit", "-qm", "spec");
  assert.match(prSpecProblems(afterCode, "HEAD~2", "HEAD").join(" "), /docs\/specs\/low-stock\.md was committed after code/);
});

test("in a pull request, schema + controller + page together need a spec", () => {
  const root = join(tmp, "cross-layer");
  write(root, "README.md", "x\n");
  git(root, "init", "-q");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  write(root, "src/main/resources/schema.sql", "CREATE TABLE t (id INTEGER);\n");
  write(root, "src/main/java/com/x/ThingController.java", "class ThingController {}\n");
  write(root, "frontend/src/app/thing/thing.component.html", "<p>thing</p>\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "feature without a spec");
  assert.match(prSpecProblems(root, "HEAD~1", "HEAD").join(" "), /schema\.sql, a controller and a page together, but adds or edits no spec/);
});

// Enforcement: CI runs this file through `node --test scripts/*.test.mjs`, so a spec in this repository that drifts
// from its tests fails the build.
test("the repository's own specs are consistent with their tests", () => {
  const { problems } = validateSpecs(process.cwd());
  assert.deepEqual(problems, [], problems.join("\n"));
});
