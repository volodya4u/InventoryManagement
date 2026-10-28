// Tests for scripts/correct.mjs --detect: what an auto-waiver correction records about its waiver (PD-9).
// Run: node --test scripts/correct.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const script = join(process.cwd(), "scripts", "correct.mjs");
const tmp = mkdtempSync(join(tmpdir(), "correct-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

// A throwaway project with one waiver file, `--detect` run in it, and the corrections it wrote.
function detect(name, waiverText) {
  const root = join(tmp, name);
  mkdirSync(join(root, "docs", "qa", "waivers"), { recursive: true });
  writeFileSync(join(root, "docs", "qa", "waivers", "waiver.md"), waiverText);
  const r = spawnSync(process.execPath, [script, "--detect"], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const dir = join(root, "retro", "corrections");
  return readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

test("maps a no-mechanism waiver to its id and the existence gate", () => {
  const [c] = detect(
    "mechanism",
    "# Waiver: NFR-17\n\nStatus: open\n\n- NFR-17 declares `e2e` verification, which has no mechanism in this repository.\n",
  );
  assert.deepEqual(c.mappedReqIds, ["NFR-17"]);
  assert.equal(c.failureMode, "missing-check");
  assert.equal(c.gateThatShouldHaveCaught, "G3");
});

test("maps a missing-test waiver to the artifact gate", () => {
  const [c] = detect("test", "# Waiver: NFR-15\n\nStatus: open\n\n- NFR-15 is `local-verifiable`, but no test asserts it.\n");
  assert.deepEqual(c.mappedReqIds, ["NFR-15"]);
  assert.equal(c.failureMode, "skipped-convention");
  assert.equal(c.gateThatShouldHaveCaught, "G4");
});

test("maps every id a waiver names", () => {
  const [c] = detect("two", "# Waiver: NFR-15 and NFR-16\n\nStatus: open\n\n- NFR-16 and NFR-15 have no test; TC-3 is unrelated.\n");
  assert.deepEqual(c.mappedReqIds, ["NFR-15", "NFR-16"]);
});

test("drops ids the correction schema does not accept", () => {
  const [c] = detect("schema", "# Waiver\n\nStatus: open\n\n- TC-3 and BC-2 are named here.\n");
  assert.deepEqual(c.mappedReqIds, ["BC-2"]);
});

// A control that holds before and after the fix: a waiver with no requirement id keeps the old values.
test("keeps the old values for a waiver that names no requirement", () => {
  const [c] = detect("none", "# Waiver\n\nStatus: open\n\n- Something was waived, with no requirement id in the text.\n");
  assert.deepEqual(c.mappedReqIds, []);
  assert.equal(c.failureMode, "skipped-convention");
  assert.equal(c.gateThatShouldHaveCaught, null);
});
