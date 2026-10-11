// Unit tests for scripts/hooks-commit-msg.mjs. Run: node --test scripts/hooks-commit-msg.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { commitMsgWarning, hasTraceTrailer, touchesProductionCode } from "./hooks-commit-msg.mjs";

test("production code is Java under src/main and the Angular app files, not tests, docs or scripts", () => {
  assert.equal(touchesProductionCode(["src/main/java/com/flowershop/inventory/sales/SaleService.java"]), true);
  assert.equal(touchesProductionCode(["src/main/resources/schema.sql"]), true);
  assert.equal(touchesProductionCode(["frontend/src/app/sales/sales.component.ts"]), true);
  assert.equal(touchesProductionCode(["frontend/src/app/sales/sales.component.html"]), true);
  assert.equal(touchesProductionCode(["frontend/src/app/sales/sales.component.scss"]), true);

  assert.equal(touchesProductionCode(["src/test/java/com/flowershop/inventory/sales/SaleServiceTest.java"]), false);
  assert.equal(touchesProductionCode(["frontend/src/app/sales/sales.component.spec.ts"]), false);
  assert.equal(touchesProductionCode(["docs/requirements.md", "scripts/dod.mjs", ".github/workflows/ci.yml"]), false);
  assert.equal(touchesProductionCode([]), false);
});

test("a trailer is a Slice: or Refs: line of its own, with FR/NFR/TC/BC/BUG/PD ids", () => {
  assert.equal(hasTraceTrailer("Fix it\n\nSlice: harden-frontend-specs\n"), true);
  assert.equal(hasTraceTrailer("Fix it\n\nRefs: FR-12\n"), true);
  assert.equal(hasTraceTrailer("Fix it\n\nRefs: FR-12, NFR-3, BUG-4\n"), true);
  assert.equal(hasTraceTrailer("Gate change\n\nRefs: PD-2\n"), true);

  assert.equal(hasTraceTrailer("Fix it\n"), false);
  assert.equal(hasTraceTrailer("Fix it, see Refs: FR-12 in the plan\n"), false);
  assert.equal(hasTraceTrailer("Fix it\n\nSlice: Not A Slice Name\n"), false);
  assert.equal(hasTraceTrailer("Fix it\n\nRefs: nothing-useful\n"), false);
});

test("the hook warns only for production code without a trailer, and never for anything else", () => {
  const code = ["src/main/java/com/flowershop/inventory/sales/SaleService.java"];
  const warning = commitMsgWarning(code, "Fix a rounding bug\n");
  assert.match(warning, /no Slice: or Refs: trailer/);
  assert.match(warning, /Slice: add-<capability>/);
  assert.match(warning, /Refs: FR-12/);

  assert.equal(commitMsgWarning(code, "Fix a rounding bug\n\nRefs: FR-103\n"), null);
  assert.equal(commitMsgWarning(["docs/requirements.md"], "Reword a row\n"), null);
  assert.equal(commitMsgWarning([], "Empty commit\n"), null);
});
