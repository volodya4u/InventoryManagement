// Tests for the options ADR-0006 added to scripts/check-coverage-ratchet.mjs (one baseline per side).
// Run: node --test scripts/check-coverage-ratchet.test.mjs
// Each test runs the real script in a throwaway directory, which it reads its relative paths from.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "coverage-ratchet-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function project(name, files = {}) {
  const cwd = join(tmp, name);
  mkdirSync(cwd, { recursive: true });
  for (const [rel, value] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, rel)), { recursive: true });
    writeFileSync(join(cwd, rel), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
  }
  return cwd;
}

function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [join(scripts, "check-coverage-ratchet.mjs"), ...args], { cwd, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const summary = (lines, rest = 80) => ({
  total: Object.fromEntries(
    ["lines", "statements", "functions", "branches"].map((m) => [m, { total: 10, covered: 8, skipped: 0, pct: m === "lines" ? lines : rest }]),
  ),
});
const baseline = (lines, rest = 80) => ({ lines, statements: rest, functions: rest, branches: rest });
const read = (cwd, rel) => JSON.parse(readFileSync(join(cwd, rel), "utf8"));

test("ratchets the summary and baseline it is given", () => {
  const cwd = project("given", {
    "side/summary.json": summary(70),
    "quality/side.json": baseline(75),
    // The default files say nothing dropped; a run that read them would pass.
    "coverage/coverage-summary.json": summary(90),
    "quality/coverage-baseline.json": baseline(75),
  });
  const args = ["--summary=side/summary.json", "--baseline=quality/side.json", "--label=side"];

  const drop = run(cwd, ...args);
  assert.equal(drop.status, 1, drop.out);
  assert.match(drop.out, /side: FAIL\s+coverage ratchet: lines dropped 75% -> 70%/);
  assert.match(drop.out, /Result: FAIL/);

  // A waiver for that side's lines lets --update lower that side's baseline, and only that one.
  mkdirSync(join(cwd, "docs", "qa", "waivers"), { recursive: true });
  writeFileSync(
    join(cwd, "docs", "qa", "waivers", "other-side.json"),
    JSON.stringify({ check: "coverage-ratchet:other", metrics: ["lines"], reason: "another side" }),
  );
  const refused = run(cwd, ...args, "--update");
  assert.equal(refused.status, 1, `a waiver for another side does not loosen this one\n${refused.out}`);
  writeFileSync(
    join(cwd, "docs", "qa", "waivers", "side.json"),
    JSON.stringify({ check: "coverage-ratchet:side", metrics: ["lines"], reason: "test" }),
  );
  const update = run(cwd, ...args, "--update");
  assert.equal(update.status, 0, update.out);
  assert.equal(read(cwd, "quality/side.json").lines, 70);
  assert.equal(read(cwd, "quality/coverage-baseline.json").lines, 75, "the default baseline is untouched");

  const pass = run(cwd, ...args);
  assert.equal(pass.status, 0, pass.out);
  assert.match(pass.out, /side: OK\s+lines 70% \(baseline 70%\)/);
});

test("fails a required run without coverage", () => {
  const noSummary = project("no-summary", { "quality/side.json": baseline(75) });
  const a = run(noSummary, "--summary=side/summary.json", "--baseline=quality/side.json", "--require");
  assert.equal(a.status, 1, a.out);
  assert.match(a.out, /FAIL\s+side\/summary\.json not found/);
  assert.match(a.out, /Result: FAIL/);

  const noBaseline = project("no-baseline", { "side/summary.json": summary(70) });
  const b = run(noBaseline, "--summary=side/summary.json", "--baseline=quality/side.json", "--require");
  assert.equal(b.status, 1, b.out);
  assert.match(b.out, /FAIL\s+quality\/side\.json not found/);
  assert.match(b.out, /Result: FAIL/);
  assert.equal(existsSync(join(noBaseline, "quality", "side.json")), false, "a compare run never mints a baseline");
});

test("keeps the default paths without options", () => {
  const empty = project("defaults-empty");
  const skip = run(empty);
  assert.equal(skip.status, 0, skip.out);
  assert.match(skip.out, /SKIP\s+coverage\/coverage-summary\.json not found/);
  assert.match(skip.out, /Result: SKIP-pending/);

  const cwd = project("defaults", {
    "coverage/coverage-summary.json": summary(70),
    "quality/coverage-baseline.json": baseline(75),
  });
  const drop = run(cwd);
  assert.equal(drop.status, 1, drop.out);
  assert.match(drop.out, /^FAIL\s+coverage ratchet: lines dropped 75% -> 70%/m);
  mkdirSync(join(cwd, "docs", "qa", "waivers"), { recursive: true });
  writeFileSync(
    join(cwd, "docs", "qa", "waivers", "loosen.json"),
    JSON.stringify({ check: "coverage-ratchet", metrics: ["lines"], reason: "test" }),
  );
  const update = run(cwd, "--update");
  assert.equal(update.status, 0, update.out);
  assert.equal(read(cwd, "quality/coverage-baseline.json").lines, 70);
});
