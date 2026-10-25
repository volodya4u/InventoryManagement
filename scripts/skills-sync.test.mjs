import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = join(dirname(fileURLToPath(import.meta.url)), 'skills-sync.mjs');

const write = (root, path, content) => {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
};

test('sync preserves OpenSpec target instructions and mirrors their evals', () => {
  const root = mkdtempSync(join(tmpdir(), 'openspec-skills-sync-'));
  try {
    const shared = '.agents/skills/openspec-propose';
    const claude = '.claude/skills/openspec-propose';
    const codexInstruction = 'generatedBy: "1.15.0"\nUse $openspec-propose.\n';
    const claudeInstruction = 'generatedBy: "1.15.0"\nUse /opsx:propose.\n';
    write(root, `${shared}/SKILL.md`, codexInstruction);
    write(root, `${claude}/SKILL.md`, claudeInstruction);
    write(root, `${shared}/evals/plan-only/prompt.md`, 'Plan only.\n');
    write(root, `${shared}/evals/plan-only/graders/criteria.md`, 'Check planning.\n');
    write(root, `${claude}/evals/removed-case/prompt.md`, 'This case was removed.\n');

    const run = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(join(root, shared, 'SKILL.md'), 'utf8'), codexInstruction);
    assert.equal(readFileSync(join(root, claude, 'SKILL.md'), 'utf8'), claudeInstruction);
    assert.equal(readFileSync(join(root, claude, 'evals/plan-only/prompt.md'), 'utf8'), 'Plan only.\n');
    assert.ok(existsSync(join(root, claude, 'evals/plan-only/graders/criteria.md')));
    assert.ok(!existsSync(join(root, claude, 'evals/removed-case')), 'stale eval case survived sync');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
