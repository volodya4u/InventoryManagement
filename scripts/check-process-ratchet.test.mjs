// Tests for scripts/check-process-ratchet.mjs on this repository's layout: Java tests under src/test/java and Angular
// specs under frontend/src (ADR-0008).
// Run: node --test scripts/check-process-ratchet.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

const script = join(process.cwd(), "scripts", "check-process-ratchet.mjs");
const tmp = mkdtempSync(join(tmpdir(), "process-ratchet-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

// A throwaway project with the given files, then the ratchet run in it.
function ratchet(name, files) {
  const root = join(tmp, name);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const r = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
const links = (...ids) => JSON.stringify({ links: ids.map((id) => ({ id, tests: ["t"] })) });

test("counts @trace tags in Java tests, so the dead-@trace guard runs", () => {
  const { status, out } = ratchet("java", {
    "src/test/java/com/x/AppTest.java": "class AppTest {\n  // @trace FR-1\n  void t() {}\n}\n",
    "trace/trace.json": links("FR-1"),
  });
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /no @trace annotations yet/);
  assert.match(out, /Scope: 1 guard\(s\)/);
});

test("counts @trace tags in frontend specs, so the dead-@trace guard runs", () => {
  const { status, out } = ratchet("spec", {
    "frontend/src/app/app.routes.spec.ts": "// @trace FR-34\nit('routes', () => {});\n",
    "trace/trace.json": links("FR-34"),
  });
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /no @trace annotations yet/);
  assert.match(out, /Scope: 1 guard\(s\)/);
});

test("fails when the tags in Java tests join nothing in the traceability chain", () => {
  const { status, out } = ratchet("dead", {
    "src/test/java/com/x/AppTest.java": "class AppTest {\n  // @trace FR-9\n  void t() {}\n}\n",
    "trace/trace.json": links(),
  });
  assert.equal(status, 1, out);
  assert.match(out, /dead-trace/);
});

test("counts frontend/src as product code", () => {
  const { out } = ratchet("product", { "frontend/src/app/app.ts": "export const app = 1;\n" });
  assert.match(out, /product code: yes/);
});
