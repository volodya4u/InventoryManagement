// Unit tests for the pure helpers in scripts/check-docs-lookup.mjs. Run: node --test scripts/check-docs-lookup.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { addedImports, docsLookupCount, docsLookupProblems, importKeys } from "./check-docs-lookup.mjs";

test("importKeys (Java): a package is the segments before the first class; JDK and first-party imports are dropped", () => {
  assert.deepEqual(importKeys("A.java", "import static org.mockito.Mockito.when;"), ["java:org.mockito"]);
  assert.deepEqual(importKeys("A.java", "import org.mockito.*;"), ["java:org.mockito"]);
  assert.deepEqual(importKeys("A.java", "  import org.springframework.security.web.session.HttpSessionEventPublisher;"), ["java:org.springframework.security.web.session"]);
  for (const line of ["import java.util.List;", "import javax.sql.DataSource;", "import jdk.jfr.Event;", "import com.flowershop.inventory.common.ConflictException;", "// import org.mockito.Mockito;", "return x;"]) {
    assert.deepEqual(importKeys("A.java", line), [], line);
  }
});

test("importKeys (TS): the key is the whole specifier; relative paths are dropped", () => {
  assert.deepEqual(importKeys("a.ts", "import { HttpClient } from '@angular/common/http';"), ["ts:@angular/common/http"]);
  assert.deepEqual(importKeys("a.ts", "} from '@angular/core';"), ["ts:@angular/core"]); // closing line of a multi-line import
  assert.deepEqual(importKeys("a.ts", "export { routes } from '@angular/router';"), ["ts:@angular/router"]);
  assert.deepEqual(importKeys("a.ts", "import 'zone.js';"), ["ts:zone.js"]); // side-effect import
  assert.deepEqual(importKeys("a.ts", `export const MSG = 'Move from "Main"';`), []); // a string, not an import
  for (const line of ["import { Product } from './product';", "import { decimal } from '../core/decimal';"]) {
    assert.deepEqual(importKeys("a.ts", line), [], line);
  }
  assert.deepEqual(importKeys("README.md", "import org.mockito.Mockito;"), []); // not a .java/.ts file
});

const diff = [
  "diff --git a/src/test/java/com/x/AServiceTest.java b/src/test/java/com/x/AServiceTest.java",
  "--- /dev/null",
  "+++ b/src/test/java/com/x/AServiceTest.java",
  "@@ -0,0 +1,3 @@",
  "+import static org.mockito.Mockito.when;",
  "+import org.junit.jupiter.api.Test;",
  "+import java.util.List;",
  "diff --git a/frontend/src/app/a/a.component.ts b/frontend/src/app/a/a.component.ts",
  "--- a/frontend/src/app/a/a.component.ts",
  "+++ b/frontend/src/app/a/a.component.ts",
  "@@ -1 +1,3 @@",
  "+import { ReactiveFormsModule } from '@angular/forms';",
  "+import { Product } from './product';",
  "diff --git a/scripts/tool.mjs b/scripts/tool.mjs", // outside src / frontend/src
  "--- a/scripts/tool.mjs",
  "+++ b/scripts/tool.mjs",
  "@@ -1 +1 @@",
  "+import { pad } from 'left-pad';",
  "diff --git a/src/main/java/com/x/Gone.java b/src/main/java/com/x/Gone.java", // a deletion
  "--- a/src/main/java/com/x/Gone.java",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-import org.apache.commons.io.IOUtils;",
].join("\n");

test("addedImports: the third-party keys on + lines of .java/.ts files; other files and deletions are ignored", () => {
  assert.deepEqual(addedImports(diff), ["java:org.mockito", "java:org.junit.jupiter.api", "ts:@angular/forms"]);
});

const call = (event, tool, exit = 0) => ({ ts: "t1", event, id: "x", tool, ...(event === "PreToolUse" ? {} : { exit }) });

test("docsLookupProblems: a new library without a recorded lookup fails; a recorded lookup of either tool passes", () => {
  assert.deepEqual(docsLookupProblems([], []), []); // nothing new
  const mockito = ["java:org.mockito"];
  assert.match(docsLookupProblems(mockito, []).join(" "), /org\.mockito, new to main, but records no docs lookup/);
  assert.deepEqual(docsLookupProblems(mockito, [call("PostToolUse", "mcp__context7__query-docs")]), []);
  // Either tool satisfies any new import, @angular included.
  assert.deepEqual(docsLookupProblems(["ts:@angular/forms"], [call("PostToolUse", "mcp__context7__query-docs")]), []);
  assert.deepEqual(docsLookupProblems(mockito, [call("PostToolUse", "mcp__angular-cli__search_documentation")]), []);
  // A proposal with no result, a failure, or a different tool is not a lookup.
  assert.equal(docsLookupProblems(mockito, [call("PreToolUse", "mcp__context7__query-docs")]).length, 1);
  assert.equal(docsLookupProblems(mockito, [call("PostToolUseFailure", "mcp__context7__query-docs", 1)]).length, 1);
  assert.equal(docsLookupProblems(mockito, [call("PostToolUse", "mcp__context7__resolve-library-id")]).length, 1);
  // The message names @angular's tool only when an @angular import is new.
  assert.match(docsLookupProblems(["ts:@angular/forms"], []).join(" "), /angular-cli__search_documentation/);
  assert.doesNotMatch(docsLookupProblems(mockito, []).join(" "), /angular-cli__search_documentation/);
});

test("docsLookupCount: executed docs-lookup calls only", () => {
  const lines = [call("PostToolUse", "mcp__context7__query-docs"), call("PostToolUse", "mcp__angular-cli__search_documentation"), call("PreToolUse", "mcp__context7__query-docs"), call("PostToolUse", "Read")];
  assert.equal(docsLookupCount(lines), 2);
});
