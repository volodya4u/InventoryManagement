import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import * as correctionModule from './correct.mjs';

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

test('a signed owner decision with matching annotation verifies a historical by value', () => {
  assert.equal(typeof correctionModule.approvalProblem, 'function');
  const repo = join(root, 'signed-repo');
  const key = join(root, 'owner-key');
  mkdirSync(join(repo, 'quality'), { recursive: true });
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
  const publicKey = readFileSync(`${key}.pub`, 'utf8').trim();
  writeFileSync(join(repo, 'quality', 'allowed-signers'), `volodya4u namespaces="git" ${publicKey}\n`);
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=Owner', '-c', 'user.email=owner@example.com', ...args], { encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'baseline');
  const head = git('rev-parse', 'HEAD');
  const ref = `approve/${head}`;
  const sign = (decision) => git('-c', 'gpg.format=ssh', '-c', `user.signingkey=${key}`, 'tag', '-s', '-m', 'Correction: COR-8', '-m', `Decision: ${decision}`, ref, head);
  sign('waived');
  const item = { data: { id: 'COR-8', disposition: { status: 'waived', by: 'volodya4u (confirmed in chat)', approvalRef: ref } } };
  const verify = (value) => correctionModule.approvalProblem(repo, value, { base: 'main', keyTypes: ['ssh-ed25519'] });
  assert.equal(verify(item), null);
  assert.match(verify({ data: { ...item.data, disposition: { ...item.data.disposition, by: 'someone-else' } } }), /not someone-else/);
  git('tag', '-d', ref);
  sign('resolved');
  assert.match(verify(item), /Decision: waived/);
});
