import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), 'utf8');
const workflows = ['apply-change', 'archive-change', 'explore', 'propose', 'sync-specs', 'update-change'];
const commands = ['apply', 'archive', 'explore', 'propose', 'sync', 'update'];

test("OpenSpec config carries the project's Factory workflow", () => {
  const config = read('openspec/config.yaml');
  assert.match(config, /^schema: spec-driven$/m);
  assert.match(config, /^context: \|$/m);
  assert.match(config, /AGENTS\.md/);
  assert.match(config, /docs\/requirements\.md/);
  assert.match(config, /openspec\/project\.md/);
  assert.match(config, /^  proposal:$/m);
  assert.match(config, /Acceptance criteria/);
  assert.match(config, /^  tasks:$/m);
  assert.match(config, /red.*green/i);
  assert.match(config, /^  apply:$/m);
  assert.match(config, /scripts\/dod\.mjs/);
  assert.match(config, /^  archive:$/m);
  assert.match(config, /unchecked task/i);
  assert.match(read('openspec/project.md'), /^## Owner decisions \(the OQ-1 path\)$/m);
});

test('OpenSpec workflows do not preapprove CLI commands', () => {
  const paths = [
    ...workflows.flatMap((name) => [
      `.agents/skills/openspec-${name}/SKILL.md`,
      `.claude/skills/openspec-${name}/SKILL.md`,
    ]),
    ...commands.map((name) => `.claude/commands/opsx/${name}.md`),
  ];
  for (const path of paths) {
    const content = read(path);
    assert.doesNotMatch(content, /^allowed-tools:\s*Bash\(openspec:\*\)\s*$/m, path);
  }
});

test('OpenSpec skills have eval cases and target-specific instructions', () => {
  for (const name of workflows) {
    const shared = `.agents/skills/openspec-${name}`;
    const claude = `.claude/skills/openspec-${name}`;
    assert.match(read(`${shared}/SKILL.md`), /generatedBy: "1\.15\.0"/);
    assert.match(read(`${claude}/SKILL.md`), /generatedBy: "1\.15\.0"/);
    assert.ok(existsSync(join(root, shared, 'evals')), `${name} lacks eval cases`);
    const cases = readdirSync(join(root, shared, 'evals'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'results')
      .map((entry) => entry.name);
    assert.ok(cases.length >= 2, `${name} needs at least two eval cases`);
    for (const caseName of cases) {
      const base = `${shared}/evals/${caseName}`;
      assert.ok(existsSync(join(root, base, 'prompt.md')), `${base} lacks prompt.md`);
      assert.ok(existsSync(join(root, base, 'graders/criteria.md')), `${base} lacks grader`);
      assert.equal(read(`${claude}/evals/${caseName}/prompt.md`), read(`${base}/prompt.md`));
      assert.equal(read(`${claude}/evals/${caseName}/graders/criteria.md`), read(`${base}/graders/criteria.md`));
    }
  }
  assert.match(read('.agents/skills/openspec-apply-change/SKILL.md'), /\$openspec-archive-change/);
  assert.match(read('.claude/skills/openspec-apply-change/SKILL.md'), /\/opsx:archive/);
});

test('OpenSpec archive refuses unchecked tasks in every target', () => {
  const paths = [
    '.agents/skills/openspec-archive-change/SKILL.md',
    '.claude/skills/openspec-archive-change/SKILL.md',
    '.claude/commands/opsx/archive.md',
  ];
  for (const path of paths) {
    const content = read(path);
    assert.match(content, /\*\*If incomplete tasks found:\*\*[\s\S]*?stop before archiving/, path);
    assert.doesNotMatch(content, /Archived with \d+ incomplete tasks/, path);
    assert.doesNotMatch(content, /incomplete artifacts\/tasks/, path);
  }
});
