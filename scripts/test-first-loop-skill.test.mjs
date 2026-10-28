// Keeps the test-first-loop skill's hardening recipe linked to the scripts it names (ADR-0005, slice 4).
// Run: node --test scripts/test-first-loop-skill.test.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const SKILL = ".agents/skills/test-first-loop/SKILL.md";
const text = () => readFileSync(SKILL, "utf8").replace(/\r\n/g, "\n");

test("the skill sends a test that pins existing behaviour through the recorded controlled break", () => {
  const skill = text();
  for (const needle of [
    "Kind: hardening",
    "node scripts/break-run.mjs start",
    "node scripts/break-run.mjs break",
    "node scripts/break-run.mjs restore",
    "node scripts/break-replay.mjs",
    "docs/evidence/break-runs/",
  ])
    assert.ok(skill.includes(needle), `${SKILL} does not mention "${needle}"`);
  assert.match(skill, /never a test or its fixtures/i, "the skill must say a break never edits a test or its fixtures");
  for (const script of ["scripts/break-run.mjs", "scripts/break-replay.mjs"])
    assert.ok(existsSync(script), `${script} named by the skill does not exist`);
});

test("the Claude copy of the skill is the synced canonical one", () => {
  const claude = readFileSync(".claude/skills/test-first-loop/SKILL.md", "utf8");
  assert.equal(claude.replace(/\r\n/g, "\n"), text(), "run node scripts/skills-sync.mjs");
});
