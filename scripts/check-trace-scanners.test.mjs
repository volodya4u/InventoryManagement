// Tests for the `@trace` scanners adapted in ADR-0001: scripts/check-traceability.mjs and
// scripts/check-acceptance-methods.mjs must find JUnit classes (src/test/java) and Angular specs (frontend/src) as tests.
// Run: node --test scripts/check-trace-scanners.test.mjs
// Each test builds a throwaway project with a requirements table, one spec and a plan, adds test files, and runs the real
// scripts in it (both read their root from the working directory).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "trace-scanners-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const REQUIREMENTS = [
  "| ID | Phase | Area | Description | Verification |",
  "|----|-------|------|-------------|--------------|",
  "| FR-1 | MVP | A | first | local-verifiable |",
  "| FR-2 | MVP | A | second | local-verifiable |",
  "| FR-10 | MVP | A | tenth | local-verifiable |",
  "",
].join("\n");

// A project whose three requirements are cited by a spec and owned by the plan, plus the given extra files.
function project(name, files = {}) {
  const cwd = join(tmp, name);
  const all = {
    "docs/requirements.md": REQUIREMENTS,
    "docs/mvp-capability-plan.md": "FR-1 FR-2 FR-10 are owned here\n",
    "openspec/specs/x/spec.md": "FR-1 FR-2 FR-10\n",
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(dirname(join(cwd, rel)), { recursive: true });
    writeFileSync(join(cwd, rel), text);
  }
  return cwd;
}

function run(cwd, script, ...args) {
  const r = spawnSync(process.execPath, [join(scripts, script), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FACTORY_TELEMETRY: "off" },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

// requirement id -> test files that check-traceability joined to it
function joined(cwd) {
  const trace = JSON.parse(readFileSync(join(cwd, "trace", "trace.json"), "utf8"));
  return Object.fromEntries(trace.links.map((l) => [l.id, l.tests]));
}

const tagged = (...ids) => `// @trace ${ids.join(", ")}\n`;

test("check-traceability joins JUnit classes and Angular specs to the requirements they tag", () => {
  const cwd = project("joins", {
    "src/test/java/com/shop/AuthTest.java": `${tagged("FR-1")}class AuthTest {}\n`,
    "src/test/java/com/shop/FlowTests.java": `${tagged("FR-2")}class FlowTests {}\n`,
    "frontend/src/app/login/login.component.spec.ts": `/** @trace FR-10 */\n`,
  });
  const r = run(cwd, "check-traceability.mjs", "--strict-tests");
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(joined(cwd), {
    "FR-1": ["src/test/java/com/shop/AuthTest.java"],
    "FR-2": ["src/test/java/com/shop/FlowTests.java"],
    "FR-10": ["frontend/src/app/login/login.component.spec.ts"],
  });
});

test("check-traceability reads a comma list of ids and repeated tags in one file", () => {
  const cwd = project("lists", {
    "src/test/java/com/shop/BothTest.java": `${tagged("FR-1", "FR-2")}${tagged("FR-10")}class BothTest {}\n`,
  });
  const r = run(cwd, "check-traceability.mjs", "--strict-tests");
  assert.equal(r.status, 0, r.out);
  const links = joined(cwd);
  for (const id of ["FR-1", "FR-2", "FR-10"]) assert.deepEqual(links[id], ["src/test/java/com/shop/BothTest.java"], id);
});

test("check-traceability does not count a tag outside a test file", () => {
  const cwd = project("not-tests", {
    "src/main/java/com/shop/Service.java": `${tagged("FR-1")}class Service {}\n`,
    "src/test/java/com/shop/Helper.java": `${tagged("FR-2")}class Helper {}\n`,
    "frontend/src/app/login/login.component.ts": `${tagged("FR-10")}export class Login {}\n`,
    "frontend/src/app/node_modules/pkg/x.spec.ts": tagged("FR-1"),
    "frontend/src/.hidden/y.spec.ts": tagged("FR-2"),
    "docs/notes.md": "@trace FR-10\n",
  });
  const r = run(cwd, "check-traceability.mjs", "--strict-tests");
  assert.equal(r.status, 1, r.out);
  for (const id of ["FR-1", "FR-2", "FR-10"]) assert.match(r.out, new RegExp(`${id} has no test annotated "@trace ${id}"`));
  assert.deepEqual(joined(cwd), { "FR-1": [], "FR-2": [], "FR-10": [] });
});

test("check-traceability only warns about an untagged requirement unless --strict-tests is given", () => {
  const cwd = project("untagged", {
    "src/test/java/com/shop/AuthTest.java": `${tagged("FR-1", "FR-2")}class AuthTest {}\n`,
  });
  const lenient = run(cwd, "check-traceability.mjs");
  assert.equal(lenient.status, 0, lenient.out);
  assert.match(lenient.out, /FR-10 has no test annotated "@trace FR-10"/);
  const strict = run(cwd, "check-traceability.mjs", "--strict-tests");
  assert.equal(strict.status, 1, strict.out);
});

test("check-acceptance-methods accepts a requirement traced from a JUnit class or an Angular spec", () => {
  const cwd = project("acceptance-ok", {
    "src/test/java/com/shop/AuthTest.java": `${tagged("FR-1", "FR-10")}class AuthTest {}\n`,
    "frontend/src/app/login/login.component.spec.ts": tagged("FR-2"),
  });
  const r = run(cwd, "check-acceptance-methods.mjs", "--mode=artifact");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /Result: PASS/);
});

test("check-acceptance-methods fails a local-verifiable requirement that no test tags", () => {
  const cwd = project("acceptance-missing", {
    "src/test/java/com/shop/AuthTest.java": `${tagged("FR-1")}class AuthTest {}\n`,
    "frontend/src/app/login/login.component.spec.ts": tagged("FR-2"),
  });
  const r = run(cwd, "check-acceptance-methods.mjs", "--mode=artifact");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FR-10/);
  assert.match(r.out, /no test annotated "@trace FR-10"/);
});

test("check-acceptance-methods matches whole ids and ignores non-test files", () => {
  const cwd = project("acceptance-boundaries", {
    // FR-10 is not FR-1, and a tag in production code or in a non-test class proves nothing.
    "src/test/java/com/shop/AuthTest.java": `${tagged("FR-10")}class AuthTest {}\n`,
    "src/main/java/com/shop/Service.java": `${tagged("FR-1")}class Service {}\n`,
    "src/test/java/com/shop/Helper.java": `${tagged("FR-2")}class Helper {}\n`,
  });
  const r = run(cwd, "check-acceptance-methods.mjs", "--mode=artifact");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /no test annotated "@trace FR-1"/);
  assert.match(r.out, /no test annotated "@trace FR-2"/);
  assert.doesNotMatch(r.out, /no test annotated "@trace FR-10"/);
});
