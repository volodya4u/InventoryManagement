import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const script = join(process.cwd(), 'scripts', 'check-acceptance-methods.mjs');
const root = mkdtempSync(join(tmpdir(), 'retro-pd4-'));
after(() => rmSync(root, { recursive: true, force: true }));

function put(rel, body) {
  const file = join(root, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, body);
}

put('docs/requirements.md', '| FR-1 | MVP | A flow | verify: local-verifiable |\n');
put('src/check.test.ts', '// @trace FR-1\n');
put('package.json', JSON.stringify({ scripts: { test: 'node --test' }, devDependencies: { '@playwright/test': '1.0.0' } }));
put('scripts/gate-status.mjs', 'args: ["--release", "--strict-tests", "--strict-recordings"]');

function check() {
  return spawnSync(process.execPath, [script, '--mode=existence'], { cwd: root, encoding: 'utf8' });
}

test('G3 fails when strict recordings have no producer or checker', () => {
  const result = check();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /record-demos/);
  assert.match(result.stdout + result.stderr, /check-recordings/);
});

test('G3 passes when the strict recordings producer and checker exist', () => {
  put('scripts/record-demos.mjs', 'console.log("record");\n');
  put('scripts/check-recordings.mjs', 'console.log("check");\n');
  const result = check();
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
