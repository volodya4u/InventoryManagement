import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const project = process.cwd();
const script = join(project, 'scripts', 'correct.mjs');
const root = mkdtempSync(join(tmpdir(), 'retro-pd8-'));
after(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, 'retro', 'corrections'), { recursive: true });

const correction = {
  id: 'COR-8', ts: '2026-10-30T12:00:00Z', utterance: 'Owner correction',
  contradictedClaim: null, mappedReqIds: [], gateThatShouldHaveCaught: null,
  failureMode: 'wrong-claim', source: 'human', autoKey: null,
  disposition: { status: 'waived', by: 'volodya4u', ts: '2026-10-30T12:01:00Z', note: 'Decision' },
};
const file = join(root, 'retro', 'corrections', '008-human.correction.json');
function check(cwd) {
  return spawnSync(process.execPath, [script, '--check'], { cwd, encoding: 'utf8' });
}

test('new waived correction without owner approval fails', () => {
  writeFileSync(file, JSON.stringify(correction));
  const result = check(root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /approvalRef/);
});

test('a typed but unverified approval reference does not pass', () => {
  writeFileSync(file, JSON.stringify({ ...correction, disposition: { ...correction.disposition, approvalRef: 'approve/' + '0'.repeat(40) } }));
  const result = check(root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /approvalRef|signed approval/);
});

test('preexisting dispositions remain warnings until backfilled', () => {
  const result = check(project);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /LEGACY-APPROVAL/);
});
