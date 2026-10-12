// Unit tests for scripts/factory-rules-evals.mjs and the evals/factory-rules cases. Run: node --test scripts/factory-rules-evals.test.mjs
// The cases embed the "Project Factory" section of AGENTS.md, because the eval sandbox has no repository to read. These
// tests keep that copy equal to the real section, so the scores always judge the rules the repository states.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { caseProblems } from "./check-evals.mjs";
import { INPUT_PATHS } from "./eval-record.mjs";
import { SECTION_END, SECTION_START, agentsSection, caseNames, embedSection, embeddedSection } from "./factory-rules-evals.mjs";

const root = process.cwd();
const casesDir = join(root, "evals", "factory-rules");
const agents = readFileSync(join(root, "AGENTS.md"), "utf8");

test("agentsSection returns the Project Factory section up to the next heading", () => {
  const text = "# T\n\n## Before\n\nx\n\n## Project Factory\n\nrule one\n- rule two\n\n## After\n\ny\n";
  assert.equal(agentsSection(text), "## Project Factory\n\nrule one\n- rule two");
});

test("a CRLF checkout gives the same section and embedded block as LF", () => {
  const text = "# T\n\n## Project Factory\n\nrule one\n- rule two\n\n## After\n\ny\n";
  const crlf = text.replace(/\n/g, "\r\n");
  assert.equal(agentsSection(crlf), agentsSection(text));
  const prompt = embedSection(`a\n${SECTION_START}\n${SECTION_END}\nb\n`, agentsSection(text));
  assert.equal(embeddedSection(prompt.replace(/\n/g, "\r\n")), embeddedSection(prompt));
});

test("agentsSection throws when AGENTS.md has no such section", () => {
  assert.throws(() => agentsSection("# T\n\n## Other\n"), /Project Factory/);
});

test("embedSection replaces the block between the markers and keeps the rest", () => {
  const prompt = `before\n${SECTION_START}\nold\n${SECTION_END}\nafter\n`;
  const next = embedSection(prompt, "## Project Factory\n\nnew");
  assert.equal(embeddedSection(next), "## Project Factory\n\nnew");
  assert.ok(next.startsWith("before\n") && next.endsWith("after\n"));
});

test("embedSection refuses a prompt without the markers", () => {
  assert.throws(() => embedSection("no markers here", "x"), /marker/);
});

test("there are at least three factory-rules cases and each is well-formed", () => {
  const names = caseNames(casesDir);
  assert.ok(names.length >= 3, `found ${names.length} case(s) in evals/factory-rules`);
  for (const name of names) assert.deepEqual(caseProblems(join(casesDir, name)), []);
});

test("every factory-rules case embeds the current Project Factory section of AGENTS.md", () => {
  const section = agentsSection(agents);
  for (const name of caseNames(casesDir)) {
    const prompt = readFileSync(join(casesDir, name, "prompt.md"), "utf8");
    assert.equal(embeddedSection(prompt), section, `${name}: the embedded section differs from AGENTS.md; run node scripts/factory-rules-evals.mjs`);
  }
});

test("the eval record covers the factory-rules cases", () => {
  assert.ok(INPUT_PATHS.includes("evals/factory-rules"));
});
