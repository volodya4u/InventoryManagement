// Unit tests for scripts/test-results.mjs. Run: node --test scripts/test-results.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { junitTests, vitestTests } from "./test-results.mjs";

const SUREFIRE = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="com.flowershop.inventory.InventoryFlowIntegrationTest" tests="5" errors="1" skipped="1" failures="1">
  <properties><property name="java.version" value="21"/></properties>
  <testcase name="flagsLowStock" classname="com.flowershop.inventory.InventoryFlowIntegrationTest" time="0.4"/>
  <testcase name="rejectsAnUnauthenticatedRequest" classname="com.flowershop.inventory.InventoryFlowIntegrationTest" time="0.2">
    <failure message="Status expected:&lt;401&gt; but was:&lt;200&gt;" type="java.lang.AssertionError"><![CDATA[java.lang.AssertionError: Status expected:<401> but was:<200>
	at org.springframework.test.util.AssertionErrors.fail(AssertionErrors.java:61)]]></failure>
  </testcase>
  <testcase name="readsTheDashboard" classname="com.flowershop.inventory.InventoryFlowIntegrationTest" time="0.1">
    <error message="Cannot invoke &quot;Object.toString()&quot;" type="java.lang.NullPointerException">java.lang.NullPointerException</error>
  </testcase>
  <testcase name="notYet" classname="com.flowershop.inventory.InventoryFlowIntegrationTest" time="0">
    <skipped message="disabled"/>
  </testcase>
  <testcase name="checksTheInnerCase" classname="com.flowershop.inventory.InventoryFlowIntegrationTest$Nested" time="0.1"/>
</testsuite>`;

test("junit: Surefire reports give each test as Class#method, with a failure as assertion, an error as error and a skipped test as skipped", () => {
  assert.deepEqual(junitTests(SUREFIRE, { kind: "surefire" }), [
    { id: "InventoryFlowIntegrationTest#flagsLowStock", status: "pass" },
    { id: "InventoryFlowIntegrationTest#rejectsAnUnauthenticatedRequest", status: "assertion" },
    { id: "InventoryFlowIntegrationTest#readsTheDashboard", status: "error" },
    { id: "InventoryFlowIntegrationTest#notYet", status: "skipped" },
    { id: "InventoryFlowIntegrationTest$Nested#checksTheInnerCase", status: "pass" },
  ]);
});

// The shape node --test --test-reporter=junit writes (Node 24): the failure's text names its cause.
const NODE = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testcase name="passes" time="0.001" classname="test" file="C:\\repo\\scripts\\x.test.mjs"/>
	<testcase name="fails on an assertion" time="0.006" classname="test" file="C:\\repo\\scripts\\x.test.mjs" failure="Expected values to be strictly equal:&#10;&#10;1 !== 2&#10;">
		<failure type="testCodeFailure" message="Expected values to be strictly equal:&#10;&#10;1 !== 2">
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
      at TestContext.&lt;anonymous> (file:///C:/repo/scripts/x.test.mjs:4:44)
}
		</failure>
	</testcase>
	<testcase name="throws a TypeError" time="0.0004" classname="test" file="C:\\repo\\scripts\\x.test.mjs" failure="Cannot read properties of null (reading 'x')">
		<failure type="testCodeFailure" message="Cannot read properties of null (reading 'x')">
[Error [ERR_TEST_FAILURE]: Cannot read properties of null (reading 'x')] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: TypeError: Cannot read properties of null (reading 'x')
}
		</failure>
	</testcase>
	<testcase name="is skipped" time="0.0004" classname="test" file="C:\\repo\\scripts\\x.test.mjs">
		<skipped type="skipped" message="true"/>
	</testcase>
	<testcase name="todo one" time="0.0003" classname="test" file="C:\\repo\\scripts\\x.test.mjs">
		<skipped type="todo" message="true"/>
	</testcase>
	<testsuite name="group" time="0.0015" disabled="0" errors="0" tests="1" failures="0" skipped="0">
		<testcase name="nested passes" time="0.0005" classname="test" file="C:\\repo\\scripts\\x.test.mjs"/>
	</testsuite>
	<!-- tests 6 -->
</testsuites>`;

test("junit: node:test reports name each test by file and title, nested under its suites, and tell an AssertionError from another error", () => {
  assert.deepEqual(junitTests(NODE, { kind: "node", file: "scripts/x.test.mjs" }), [
    { id: "scripts/x.test.mjs › passes", status: "pass" },
    { id: "scripts/x.test.mjs › fails on an assertion", status: "assertion" },
    { id: "scripts/x.test.mjs › throws a TypeError", status: "error" },
    { id: "scripts/x.test.mjs › is skipped", status: "skipped" },
    { id: "scripts/x.test.mjs › todo one", status: "skipped" },
    { id: "scripts/x.test.mjs › group > nested passes", status: "pass" },
  ]);
  // A file that fails to import reports one failing case: an error, not an assertion.
  const broken = `<testsuites><testcase name="C:\\repo\\scripts\\x.test.mjs" classname="test"><failure type="testCodeFailure" message="x">cause: SyntaxError: The requested module './a.mjs' does not provide an export named 'b'</failure></testcase></testsuites>`;
  assert.deepEqual(junitTests(broken, { kind: "node", file: "scripts/x.test.mjs" }).map((t) => t.status), ["error"]);
});

const VITEST = JSON.stringify({
  numTotalTests: 5,
  testResults: [
    {
      name: "C:/repo/frontend/src/app/dash/dash.component.spec.ts",
      status: "failed",
      assertionResults: [
        { ancestorTitles: ["DashboardComponent"], title: "shows the low-stock count", status: "passed", failureMessages: [] },
        { ancestorTitles: ["DashboardComponent"], title: "shows the sales count", status: "failed", failureMessages: ["AssertionError: expected 'Sales 3' to contain 'Sales 4'\n    at dash.component.spec.ts:40:5"] },
        { ancestorTitles: ["DashboardComponent", "on error"], title: "shows a message", status: "failed", failureMessages: ["TypeError: Cannot read properties of undefined (reading 'subscribe')"] },
        { ancestorTitles: [], title: "later", status: "pending", failureMessages: [] },
        { ancestorTitles: [], title: "someday", status: "todo", failureMessages: [] },
      ],
    },
  ],
});

test("vitest: the JSON report names each test by file and title and tells an AssertionError from another error", () => {
  assert.deepEqual(vitestTests(VITEST, "C:\\repo"), [
    { id: "frontend/src/app/dash/dash.component.spec.ts › DashboardComponent > shows the low-stock count", status: "pass" },
    { id: "frontend/src/app/dash/dash.component.spec.ts › DashboardComponent > shows the sales count", status: "assertion" },
    { id: "frontend/src/app/dash/dash.component.spec.ts › DashboardComponent > on error > shows a message", status: "error" },
    { id: "frontend/src/app/dash/dash.component.spec.ts › later", status: "skipped" },
    { id: "frontend/src/app/dash/dash.component.spec.ts › someday", status: "skipped" },
  ]);
});

test("a report that cannot be read gives no results, so the run is unstructured", () => {
  // Vitest: not JSON at all, cut off mid-write, or JSON with no testResults.
  for (const text of ["not json", VITEST.slice(0, 80), "{}", ""]) assert.equal(vitestTests(text, "C:\\repo"), null, JSON.stringify(text));
  // A valid report with no test file in it is readable: it says no test ran.
  assert.deepEqual(vitestTests(JSON.stringify({ testResults: [] }), "C:\\repo"), []);
  // JUnit: empty, cut off before any element, or not JUnit at all.
  for (const text of ["", '<?xml version="1.0" encoding="utf-8"?>\n', "TAP version 13\nok 1 - passes\n"]) {
    assert.equal(junitTests(text, { kind: "node", file: "scripts/x.test.mjs" }), null, JSON.stringify(text));
    assert.equal(junitTests(text, { kind: "surefire" }), null, JSON.stringify(text));
  }
  // A readable JUnit document with no test case says no test ran.
  assert.deepEqual(junitTests("<testsuites></testsuites>", { kind: "node", file: "scripts/x.test.mjs" }), []);
});
