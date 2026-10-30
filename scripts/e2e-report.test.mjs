// Tests for e2e/support/e2e-summary.mjs: docs/qa/e2e-report.json may say "passed" only for a whole run, with every
// supported browser, and never for a run that failed, was interrupted or ran fewer browsers.
// Run: node --test scripts/e2e-report.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { browsers } from "../e2e/support/run-settings.mjs";
import { summarize, supportedBrowsers } from "../e2e/support/e2e-summary.mjs";

const results = (overrides = {}) =>
  supportedBrowsers.flatMap((project) => [
    { project, status: overrides[project] ?? "passed" },
    { project, status: "passed" },
    { project, status: "skipped" },
  ]);

test("a passing run of every supported browser is passed, with a count per browser", () => {
  const summary = summarize(results(), "passed");
  assert.equal(summary.status, "passed");
  assert.deepEqual(summary.browsers.chromium, { passed: 2, failed: 0, skipped: 1 });
  assert.deepEqual(Object.keys(summary.browsers), supportedBrowsers);
});

test("one failed test makes the run failed", () => {
  const summary = summarize(results({ webkit: "failed" }), "failed");
  assert.equal(summary.status, "failed");
  assert.equal(summary.browsers.webkit.failed, 1);
});

test("a timed out or interrupted test is a failure, not a skip", () => {
  assert.equal(summarize(results({ firefox: "timedOut" }), "failed").browsers.firefox.failed, 1);
  assert.equal(summarize(results({ firefox: "interrupted" }), "interrupted").status, "failed");
});

test("a run that did not include every supported browser is incomplete, never passed", () => {
  const onlyChromium = results().filter((r) => r.project === "chromium");
  const summary = summarize(onlyChromium, "passed");
  assert.equal(summary.status, "incomplete");
  assert.match(summary.note, /firefox/);
  assert.match(summary.note, /webkit/);
});

test("a run whose runner status is not passed is failed even when every counted test passed", () => {
  assert.equal(summarize(results(), "timedout").status, "failed");
});

test("a browser that only skipped its tests did not run", () => {
  const skippedFirefox = results().map((r) => (r.project === "firefox" ? { ...r, status: "skipped" } : r));
  assert.equal(summarize(skippedFirefox, "passed").status, "incomplete");
});

test("the browsers the report requires are the browsers the configuration runs", () => {
  assert.deepEqual(supportedBrowsers, browsers);
});
