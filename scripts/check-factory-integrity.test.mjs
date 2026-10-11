// Tests for the tiers of scripts/check-factory-integrity.mjs (ADR-0002). Run: node --test scripts/check-factory-integrity.test.mjs
// Each test builds a throwaway git repository with a locked gate script and a locked workflow, then changes one of them
// the way a real commit would, and runs a copy of the check in it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const checkScript = join(dirname(fileURLToPath(import.meta.url)), "check-factory-integrity.mjs");
const tmp = mkdtempSync(join(tmpdir(), "factory-integrity-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function run(cwd, command, args) {
  return spawnSync(command, args, { cwd, encoding: "utf8", env: { ...process.env, FACTORY_TELEMETRY: "off" } });
}
const git = (cwd, ...args) => run(cwd, "git", ["-c", "user.name=probe", "-c", "user.email=probe@example.com", ...args]);

function write(cwd, rel, text) {
  mkdirSync(dirname(join(cwd, rel)), { recursive: true });
  writeFileSync(join(cwd, rel), text);
}

// A repository whose gate script and workflow are locked, with the lock committed.
function setup(name) {
  const cwd = join(tmp, name);
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  git(cwd, "init", "-q");
  copyFileSync(checkScript, join(cwd, "scripts", "check-factory-integrity.mjs"));
  write(cwd, "scripts/check-demo.mjs", "console.log('gate v1');\n");
  write(cwd, ".github/workflows/ci.yml", "name: ci\nsteps:\n  - uses: actions/checkout@v7\n");
  write(cwd, "package.json", "{}\n");
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", "baseline");
  run(cwd, process.execPath, ["scripts/check-factory-integrity.mjs", "--init-lock", "--adaptation", "test"]);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", "lock");
  return cwd;
}

const check = (cwd) => {
  const result = run(cwd, process.execPath, ["scripts/check-factory-integrity.mjs"]);
  return { exit: result.status, output: `${result.stdout}${result.stderr}` };
};

test("a repository with an untouched lock passes", () => {
  assert.equal(check(setup("untouched")).exit, 0);
});

test("a workflow change, such as a Dependabot actions bump, is a warning and does not fail", () => {
  const cwd = setup("workflow");
  write(cwd, ".github/workflows/ci.yml", "name: ci\nsteps:\n  - uses: actions/checkout@v8\n");
  git(cwd, "commit", "-qam", "Bump actions/checkout from 7 to 8");

  const { exit, output } = check(cwd);
  assert.equal(exit, 0, output);
  assert.match(output, /WARN {2}\[\.github\/workflows\/ci\.yml\] workflow-tier drift/);
  assert.match(output, /Dependabot/);
});

test("a gate script changed without a Refs: PD-n commit still fails", () => {
  const cwd = setup("script");
  write(cwd, "scripts/check-demo.mjs", "console.log('gate v2, weakened');\n");
  git(cwd, "commit", "-qam", "Quietly edit a gate script");

  const { exit, output } = check(cwd);
  assert.equal(exit, 1, output);
  assert.match(output, /FAIL {2}\[scripts\/check-demo\.mjs\] gate-bearing file drift/);
});

test("the same change passes when a commit touching the script says Refs: PD-n", () => {
  const cwd = setup("approved");
  write(cwd, "scripts/check-demo.mjs", "console.log('gate v2, approved');\n");
  git(cwd, "commit", "-qam", "Tighten the gate\n\nRefs: PD-1");

  const { exit, output } = check(cwd);
  assert.equal(exit, 0, output);
  assert.match(output, /covered by an approved improvement/);
});
