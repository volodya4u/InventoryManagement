import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const script = join(process.cwd(), 'scripts', 'check-traceability.mjs');
const root = mkdtempSync(join(tmpdir(), 'retro-pd7-'));
after(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'requirements.md'), '| FR-1 | MVP | One flow |\n');

function run(...args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
}
function events() {
  const path = join(root, 'trace', 'ledger.jsonl');
  assert.ok(existsSync(path), 'traceability should emit a ledger event');
  return readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse);
}

test('a failing traceability run emits one event with per-class counts', () => {
  const result = run('--release');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const emitted = events();
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].check, 'traceability');
  assert.equal(emitted[0].exitCode, 1);
  assert.equal(emitted[0].scope_n, 1);
  assert.ok(emitted[0].warningsByClass['recording-evidence'] >= 1);
  assert.ok(Object.values(emitted[0].failuresByClass).some((count) => count >= 1));
});

test('a freshness run emits exactly one additional event', () => {
  const before = events().length;
  run('--check-fresh');
  assert.equal(events().length, before + 1);
});

test('traceability still reports requirements when the telemetry helper is unavailable', () => {
  const isolated = join(root, 'isolated');
  mkdirSync(join(isolated, 'scripts'), { recursive: true });
  mkdirSync(join(isolated, 'docs'), { recursive: true });
  copyFileSync(script, join(isolated, 'scripts', 'check-traceability.mjs'));
  writeFileSync(join(isolated, 'docs', 'requirements.md'), '| FR-1 | MVP | One flow |\n');
  const result = spawnSync(process.execPath, [join(isolated, 'scripts', 'check-traceability.mjs'), '--release'], { cwd: isolated, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /traceability: 1 MVP FRs checked/);
  assert.doesNotMatch(result.stdout + result.stderr, /ERR_MODULE_NOT_FOUND/);
});
