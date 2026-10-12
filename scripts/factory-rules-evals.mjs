#!/usr/bin/env node
// Keeps the copy of AGENTS.md's "Project Factory" section inside each evals/factory-rules case equal to the real one.
// The eval sandbox has no repository, so a case embeds the section between two markers and asks what an agent that read
// it would do; scripts/factory-rules-evals.test.mjs fails when the copy drifts. Run after editing that section:
//   node scripts/factory-rules-evals.mjs
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const SECTION_START = "<!-- agents-md:project-factory:start -->";
export const SECTION_END = "<!-- agents-md:project-factory:end -->";
const FENCE_OPEN = "````markdown";
const FENCE_CLOSE = "````";

const lf = (text) => text.replace(/\r\n/g, "\n");

// The "## Project Factory" section of AGENTS.md, from its heading to the next "## " heading, without trailing blanks.
export function agentsSection(agentsText) {
  const text = lf(agentsText);
  const start = text.indexOf("## Project Factory\n");
  if (start === -1) throw new Error('AGENTS.md has no "## Project Factory" section');
  const rest = text.slice(start);
  const next = rest.indexOf("\n## ", 1);
  return (next === -1 ? rest : rest.slice(0, next)).trimEnd();
}

// The section text a prompt embeds between the markers, or null when it has none.
export function embeddedSection(promptText) {
  const text = lf(promptText);
  const from = text.indexOf(SECTION_START);
  const to = text.indexOf(SECTION_END);
  if (from === -1 || to === -1 || to < from) return null;
  const block = text.slice(from + SECTION_START.length, to).trim();
  const opened = block.startsWith(`${FENCE_OPEN}\n`) ? block.slice(FENCE_OPEN.length + 1) : block;
  return opened.endsWith(`\n${FENCE_CLOSE}`) ? opened.slice(0, -(FENCE_CLOSE.length + 1)) : opened;
}

// The prompt with the block between the markers replaced by the given section.
export function embedSection(promptText, section) {
  const text = lf(promptText);
  const from = text.indexOf(SECTION_START);
  const to = text.indexOf(SECTION_END);
  if (from === -1 || to === -1 || to < from) throw new Error(`prompt has no ${SECTION_START} / ${SECTION_END} marker pair`);
  return `${text.slice(0, from + SECTION_START.length)}\n${FENCE_OPEN}\n${section}\n${FENCE_CLOSE}\n${text.slice(to)}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  const casesDir = join(root, "evals", "factory-rules");
  const section = agentsSection(readFileSync(join(root, "AGENTS.md"), "utf8"));
  const names = existsSync(casesDir) ? readdirSync(casesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
  for (const name of names) {
    const path = join(casesDir, name, "prompt.md");
    const before = readFileSync(path, "utf8");
    const after = embedSection(before, section);
    if (lf(before) !== after) writeFileSync(path, after);
    console.log(`${lf(before) === after ? "unchanged" : "updated  "} ${name}`);
  }
  console.log(`${names.length} case(s) in evals/factory-rules`);
}
