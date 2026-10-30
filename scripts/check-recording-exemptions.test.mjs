// Tests for the recording exemptions of scripts/check-traceability.mjs (docs/qa/recording-exemptions.json, ADR-0010):
// a requirement a browser cannot show is listed with its reason and the automated test that covers it, instead of
// failing --strict-recordings. Like check-trace-scanners.test.mjs, each test builds a throwaway project and runs the real
// script in it.
// Run: node --test scripts/check-recording-exemptions.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "recording-exemptions-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const REQUIREMENTS = [
  "| ID | Phase | Area | Description | Verification |",
  "|----|-------|------|-------------|--------------|",
  "| FR-1 | MVP | A | first | local-verifiable |",
  "| FR-2 | MVP | A | second | local-verifiable |",
  "| FR-3 | Future | A | third | local-verifiable |",
  "",
].join("\n");

const MANIFEST = (...ids) => JSON.stringify({ results: [{ id: "clip", proof: ids.join(", ") }] });
const EXEMPTIONS = (...entries) => JSON.stringify({ exemptions: entries });
const JAVA_TEST = (...ids) => `// @trace ${ids.join(", ")}\n`;
const exemption = (id, extra = {}) => ({
  id,
  reason: "an API-only rule: no page shows it",
  tests: ["SomeTest › someMethod"],
  ...extra,
});

function project(name, files = {}) {
  const cwd = join(tmp, name);
  const all = {
    "docs/requirements.md": REQUIREMENTS,
    "docs/mvp-capability-plan.md": "FR-1 FR-2 FR-3\n",
    "openspec/specs/x/spec.md": "FR-1 FR-2 FR-3\n",
    "docs/qa/demo-recordings/manifest.json": MANIFEST("FR-1"),
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(dirname(join(cwd, rel)), { recursive: true });
    writeFileSync(join(cwd, rel), text);
  }
  return cwd;
}

function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [join(scripts, "check-traceability.mjs"), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FACTORY_TELEMETRY: "off" },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const row = (cwd, id) =>
  readFileSync(join(cwd, "docs/qa/traceability-report.md"), "utf8")
    .split("\n")
    .find((line) => line.startsWith(`| ${id} |`));

test("an exempted requirement counts as covered under --strict-recordings and shows as exempt", () => {
  const cwd = project("exempt-covered", {
    "src/test/java/ATest.java": JAVA_TEST("FR-1", "FR-2"),
    "docs/qa/recording-exemptions.json": EXEMPTIONS(exemption("FR-2")),
  });

  const { status, out } = run(cwd, "--strict-recordings");

  assert.equal(status, 0, out);
  assert.match(row(cwd, "FR-2"), /\| exempt \|$/);
  assert.match(row(cwd, "FR-1"), /\| yes \|$/);
});

test("a requirement with neither a recording nor an exemption still fails --strict-recordings", () => {
  const cwd = project("unrecorded", { "src/test/java/ATest.java": JAVA_TEST("FR-1", "FR-2") });

  const { status, out } = run(cwd, "--strict-recordings");

  assert.equal(status, 1, out);
  assert.match(out, /FR-2 is not referenced by any recording manifest/);
});

test("an exemption for a requirement that no test is tagged with fails", () => {
  const cwd = project("exempt-untested", {
    "src/test/java/ATest.java": JAVA_TEST("FR-1"),
    "docs/qa/recording-exemptions.json": EXEMPTIONS(exemption("FR-2")),
  });

  const { status, out } = run(cwd, "--strict-recordings");

  assert.equal(status, 1, out);
  assert.match(out, /recording-exemption.*FR-2.*no test/);
});

test("an exemption for a requirement that a manifest records fails as stale", () => {
  const cwd = project("exempt-stale", {
    "src/test/java/ATest.java": JAVA_TEST("FR-1", "FR-2"),
    "docs/qa/recording-exemptions.json": EXEMPTIONS(exemption("FR-1")),
  });

  const { status, out } = run(cwd, "--strict-recordings");

  assert.equal(status, 1, out);
  assert.match(out, /recording-exemption.*FR-1.*recorded/);
});

test("an exemption with no reason, no test, or an unknown or Future requirement fails", () => {
  const cwd = project("exempt-malformed", {
    "src/test/java/ATest.java": JAVA_TEST("FR-1", "FR-2", "FR-3"),
    "docs/qa/recording-exemptions.json": EXEMPTIONS(
      exemption("FR-2", { reason: "" }),
      exemption("FR-3"),
      exemption("FR-99"),
      exemption("FR-2", { tests: [] }),
    ),
  });

  const { status, out } = run(cwd, "--strict-recordings");

  assert.equal(status, 1, out);
  assert.match(out, /FR-2.*reason/);
  assert.match(out, /FR-2.*test/);
  assert.match(out, /FR-3.*not an MVP/);
  assert.match(out, /FR-99.*not an MVP/);
});

test("an @trace tag in a Playwright spec under e2e/ joins the requirement", () => {
  const cwd = project("e2e-trace", { "e2e/flow.spec.ts": "// @trace FR-1, FR-2\ntest('x', () => {});\n" });

  run(cwd);

  const trace = JSON.parse(readFileSync(join(cwd, "trace/trace.json"), "utf8"));
  const tests = Object.fromEntries(trace.links.map((l) => [l.id, l.tests]));
  assert.deepEqual(tests["FR-1"], ["e2e/flow.spec.ts"]);
  assert.deepEqual(tests["FR-2"], ["e2e/flow.spec.ts"]);
});

test("a malformed exemptions file fails instead of being ignored", () => {
  const cwd = project("exempt-broken-json", {
    "src/test/java/ATest.java": JAVA_TEST("FR-1", "FR-2"),
    "docs/qa/recording-exemptions.json": "{ not json",
  });

  const { status, out } = run(cwd, "--strict-recordings");

  assert.equal(status, 1, out);
  assert.match(out, /recording-exemption.*not valid JSON/);
});
