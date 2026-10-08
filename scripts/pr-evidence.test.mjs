// Unit tests for the gates and the report in scripts/pr-evidence.mjs. Run: node --test scripts/pr-evidence.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { addedImports, autonomyProblems, blockedActions, docsLookupProblems, docsTool, dodProblems, evalsProblems, importGroup, newImports, newRows, redGreenProblems, report, significant } from "./pr-evidence.mjs";

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

test("docs lookup: a Java import's library is its first three package segments; JDK and first-party imports are none", () => {
  assert.equal(importGroup("java", "import static org.mockito.Mockito.when;"), "org.mockito");
  assert.equal(importGroup("java", "import org.mockito.*;"), "org.mockito");
  assert.equal(importGroup("java", "import org.springframework.security.crypto.password.PasswordEncoder;"), "org.springframework.security");
  assert.equal(importGroup("java", "import org.springframework.security.web.SecurityFilterChain.Builder;"), "org.springframework.security");
  assert.equal(importGroup("java", "  import static org.junit.jupiter.api.Assertions.*;"), "org.junit.jupiter");
  const jdk = ["import java.util.List;", "import javax.sql.DataSource;", "import jdk.jfr.Event;", "import org.w3c.dom.Document;", "import org.xml.sax.InputSource;"];
  for (const line of [...jdk, "import com.flowershop.inventory.common.ConflictException;", "// import org.mockito.Mockito;", "return x;"]) {
    assert.equal(importGroup("java", line), null, line);
  }
});

test("docs lookup: a TS import's library is its package; relative imports are none", () => {
  assert.equal(importGroup("ts", "import { FormBuilder } from '@angular/forms';"), "@angular/forms");
  assert.equal(importGroup("ts", "import { TestBed } from '@angular/core/testing';"), "@angular/core");
  assert.equal(importGroup("ts", 'import { map } from "rxjs/operators";'), "rxjs");
  assert.equal(importGroup("ts", "} from '@ngrx/store';"), "@ngrx/store");
  assert.equal(importGroup("ts", "import 'zone.js';"), "zone.js");
  assert.equal(importGroup("ts", "import type { Chart } from 'chart.js';"), "chart.js");
  assert.equal(importGroup("ts", "import { Product } from './product';"), null);
  assert.equal(importGroup("ts", "import { decimal } from '../core/decimal';"), null);
  assert.equal(importGroup("ts", "import { readFileSync } from 'node:fs';"), null);
  assert.equal(importGroup("ts", "const label = 'from here';"), null);
  assert.equal(importGroup("ts", `export const MSG = 'Move from "Main"';`), null);
  assert.equal(importGroup("ts", "export { routes } from '@angular/router';"), "@angular/router");
});

const diff = [
  "diff --git a/src/test/java/com/x/AServiceTest.java b/src/test/java/com/x/AServiceTest.java",
  "--- /dev/null",
  "+++ b/src/test/java/com/x/AServiceTest.java",
  "@@ -0,0 +1,4 @@",
  "+import static org.mockito.Mockito.when;",
  "+import org.junit.jupiter.api.Test;",
  "+import jakarta.validation.constraints.NotNull;",
  "+import java.util.List;",
  "diff --git a/src/test/java/com/x/BServiceTest.java b/src/test/java/com/x/BServiceTest.java",
  "--- a/src/test/java/com/x/BServiceTest.java",
  "+++ b/src/test/java/com/x/BServiceTest.java",
  "@@ -1 +1,2 @@",
  "-import org.mockito.Mock;",
  "+import org.mockito.ArgumentCaptor;",
  // Outside src/**/*.java and frontend/src/**/*.ts, and a deleted file: nothing to look up.
  "diff --git a/scripts/tool.mjs b/scripts/tool.mjs",
  "--- a/scripts/tool.mjs",
  "+++ b/scripts/tool.mjs",
  "@@ -1 +1 @@",
  "+import { pad } from 'left-pad';",
  "diff --git a/src/main/java/com/x/Gone.java b/src/main/java/com/x/Gone.java",
  "--- a/src/main/java/com/x/Gone.java",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-import org.apache.commons.io.IOUtils;",
  "diff --git a/frontend/src/app/a/a.component.ts b/frontend/src/app/a/a.component.ts",
  "--- a/frontend/src/app/a/a.component.ts",
  "+++ b/frontend/src/app/a/a.component.ts",
  "@@ -1 +1,3 @@",
  "+import { ReactiveFormsModule } from '@angular/forms';",
  "+} from '@angular/core';",
  "+import { Product } from './product';",
].join("\n");

test("docs lookup: the added imports, per file; only libraries the base does not use yet are new", () => {
  const added = addedImports(diff);
  assert.deepEqual(added, [
    { group: "org.mockito", path: "src/test/java/com/x/AServiceTest.java" },
    { group: "org.junit.jupiter", path: "src/test/java/com/x/AServiceTest.java" },
    { group: "jakarta.validation.constraints", path: "src/test/java/com/x/AServiceTest.java" },
    { group: "org.mockito", path: "src/test/java/com/x/BServiceTest.java" },
    { group: "@angular/forms", path: "frontend/src/app/a/a.component.ts" },
    { group: "@angular/core", path: "frontend/src/app/a/a.component.ts" },
  ]);
  // One entry per library, its first file; a library the base already imports (or a dotted parent of it) is not new.
  assert.deepEqual(newImports(added, ["org.junit.jupiter", "jakarta.validation", "@angular/core"]), [
    { group: "org.mockito", path: "src/test/java/com/x/AServiceTest.java" },
    { group: "@angular/forms", path: "frontend/src/app/a/a.component.ts" },
  ]);
  assert.deepEqual(newImports([{ group: "org.mockito", path: "A.java" }], ["org.mockito.junit"]), []);
  // The dotted-parent rule is for Java packages only: a TS package name with a dot is its own library.
  assert.deepEqual(newImports([{ group: "chart.js", path: "frontend/src/app/a.ts" }], ["chart"]), [{ group: "chart.js", path: "frontend/src/app/a.ts" }]);
  assert.deepEqual(newImports([{ group: "org.springframework.security", path: "A.java" }], ["org.springframework.boot"]).length, 1);
});

const call = (event, tool, exit = 0) => ({ ts: "t1", event, id: "x", tool, ...(event === "PreToolUse" ? {} : { exit }) });

test("docs lookup: a new third-party import without a recorded lookup fails; with one it passes", () => {
  const mockito = [{ group: "org.mockito", path: "src/test/java/com/x/AServiceTest.java" }];
  assert.match(docsLookupProblems(mockito, []).join(" "), /org\.mockito \(AServiceTest\.java\).*no `mcp__context7__query-docs` lookup is recorded/);
  assert.deepEqual(docsLookupProblems(mockito, [call("PreToolUse", "mcp__context7__query-docs"), call("PostToolUse", "mcp__context7__query-docs")]), []);
  // A proposal that never ran, or a failed call, looked nothing up.
  assert.equal(docsLookupProblems(mockito, [call("PreToolUse", "mcp__context7__query-docs")]).length, 1);
  assert.equal(docsLookupProblems(mockito, [call("PostToolUseFailure", "mcp__context7__query-docs", 1)]).length, 1);
  assert.equal(docsLookupProblems(mockito, [call("PostToolUse", "mcp__context7__resolve-library-id")]).length, 1);
  assert.deepEqual(docsLookupProblems([], []), []);
});

test("docs lookup: an Angular package is looked up in the Angular docs, anything else in context7", () => {
  assert.equal(docsTool("@angular/forms"), "mcp__angular-cli__search_documentation");
  assert.equal(docsTool("rxjs"), "mcp__context7__query-docs");
  const forms = [{ group: "@angular/forms", path: "frontend/src/app/a/a.component.ts" }];
  assert.match(docsLookupProblems(forms, [call("PostToolUse", "mcp__context7__query-docs")]).join(" "), /mcp__angular-cli__search_documentation/);
  assert.deepEqual(docsLookupProblems(forms, [call("PostToolUse", "mcp__angular-cli__search_documentation")]), []);
  // Both kinds new: each needs its own lookup.
  const both = [...forms, { group: "org.mockito", path: "A.java" }];
  assert.equal(docsLookupProblems(both, [call("PostToolUse", "mcp__angular-cli__search_documentation")]).length, 1);
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
