import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const project = process.cwd();
const script = join(project, 'scripts', 'gate-status.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'retro-pd6-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

function fixture(name, ratified) {
  const root = join(tmp, name);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, '.githooks'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'App.java'), 'class App {}\n');
  writeFileSync(join(root, 'docs', 'requirements.md'), ratified
    ? '| BC-4 | baseline ratified as written by volodya4u on 2026-10-11 |\n'
    : '| BC-4 | baseline draft |\n');
  writeFileSync(join(root, 'docs', 'mvp-capability-plan.md'), ratified
    ? '> Inputs: `docs/requirements.md` (ratified by volodya4u on 2026-10-11, defaults included).\n'
    : '> Inputs: `docs/requirements.md` (draft).\n');
  copyFileSync(join(project, 'scripts', 'ledger.mjs'), join(root, 'scripts', 'ledger.mjs'));
  for (const file of ['check-traceability', 'check-trajectory', 'check-recordings', 'check-coverage-ratchet', 'check-eval-ratchet', 'check-acceptance-methods', 'check-visual-fidelity', 'check-process-ratchet', 'check-factory-integrity']) {
    writeFileSync(join(root, 'scripts', `${file}.mjs`), 'console.log("Scope: 1 item\\nResult: PASS");\n');
  }
  return root;
}

function run(root) {
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}

test('recorded owner ratification earns G1 and G3', () => {
  const stdout = run(fixture('ratified', true));
  assert.match(stdout, /G1\s+PASS\s+requirements signed off/);
  assert.match(stdout, /G3\s+PASS\s+capability plan/);
});

test('missing ratification leaves sign-off pending and records downstream divergence', () => {
  const root = fixture('draft', false);
  const stdout = run(root);
  assert.match(stdout, /G1\s+needs sign-off/);
  assert.match(stdout, /G3\s+needs sign-off/);
  assert.match(stdout, /frontier.*G0/i);
  const ledger = join(root, 'trace', 'ledger.jsonl');
  assert.ok(existsSync(ledger));
  const events = readFileSync(ledger, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(events.some((e) => e.event === 'claim-divergence' && e.meta?.unsignedGates?.includes('G1')));
});
