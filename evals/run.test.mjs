import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const runner = join(dirname(fileURLToPath(import.meta.url)), 'run.mjs');

function harness(t, { layered = false, failingGit = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ruccess-eval-run-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const evals = join(root, 'evals');
  const fixture = join(evals, 'tasks', 'sample', 'fixture');
  const bin = join(root, 'bin');
  mkdirSync(fixture, { recursive: true });
  mkdirSync(bin);
  cpSync(runner, join(evals, 'run.mjs'));
  writeFileSync(join(dirname(fixture), 'task.json'), JSON.stringify({ prompt: 'test prompt', expects_git: layered || Boolean(failingGit) }));
  if (layered) {
    mkdirSync(join(fixture, 'base'));
    mkdirSync(join(fixture, 'change'));
    writeFileSync(join(fixture, 'base', 'value.txt'), 'base\n');
    writeFileSync(join(fixture, 'change', 'value.txt'), 'change\n');
  } else {
    writeFileSync(join(fixture, 'value.txt'), 'fixture\n');
  }

  const claude = join(bin, 'claude');
  writeFileSync(claude, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
if (process.env.CLAUDE_MARKER) fs.writeFileSync(process.env.CLAUDE_MARKER, 'called');
if (process.env.CREATE_CONFLICT_DIR) fs.mkdirSync(path.join(process.cwd(), '..', '..', 'sample-A-2'));
const result = fs.existsSync('agent-output.txt') ? 'dirty' : 'clean';
fs.writeFileSync('agent-output.txt', 'agent');
process.stdout.write(JSON.stringify({ type: 'result', result }));
`);
  chmodSync(claude, 0o755);

  if (failingGit) {
    const git = join(bin, 'git');
    writeFileSync(git, `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
if (process.env.FAIL_GIT === 'all' || (process.env.FAIL_GIT === 'bare' && args.includes('--bare'))) {
  console.error('git unavailable');
  process.exit(42);
}
const proc = spawnSync(process.env.REAL_GIT, args, { stdio: 'inherit' });
process.exit(proc.status ?? 1);
`);
    chmodSync(git, 0o755);
  }

  const clock = join(root, 'fixed-clock.cjs');
  writeFileSync(clock, `const ActualDate = Date;
global.Date = class extends ActualDate {
  constructor(...args) { super(...(args.length ? args : [Date.UTC(2026, 0, 1, 0, 0, 0)])); }
  static now() { return ActualDate.now(); }
};
`);
  const marker = join(root, 'claude-called');
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    NODE_OPTIONS: `--require=${clock}`,
    CLAUDE_MARKER: marker,
    FAIL_GIT: failingGit ?? '',
    REAL_GIT: process.env.PATH.split(':').map((part) => join(part, 'git')).find(existsSync),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  };
  const run = (extra = []) => spawnSync(process.execPath, [join(evals, 'run.mjs'), '--tasks', 'sample', '--arms', 'A', ...extra], {
    cwd: root, env, encoding: 'utf8',
  });
  const results = () => {
    const dirs = join(evals, 'results');
    return existsSync(dirs)
      ? readdirSync(dirs).map((name) => join(dirs, name, 'runs.json')).filter(existsSync).map((file) => JSON.parse(readFileSync(file, 'utf8')))
      : [];
  };
  return { run, results, marker, env };
}

test('same-clock executions use separate clean work and result directories', (t) => {
  const { run, results } = harness(t);
  const first = run();
  const second = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  const records = results();
  assert.equal(records.length, 2);
  assert.equal(new Set(records.map((record) => record.run_id)).size, 2);
  assert.deepEqual(records.map((record) => record.expected_runs), [1, 1]);
  assert.deepEqual(records.map((record) => record.complete), [true, true]);
  assert.deepEqual(records.map((record) => record.runs[0].result), ['clean', 'clean']);
  assert.equal(new Set(records.map((record) => record.runs[0].work_dir)).size, 2);
  assert.equal(new Set(records.map((record) => record.runs[0].result_dir)).size, 2);
});

test('duplicate task or arm input fails before Claude runs', (t) => {
  const { run, marker } = harness(t);
  const duplicateTask = run(['--tasks', 'sample,sample']);
  assert.notEqual(duplicateTask.status, 0);
  assert.match(duplicateTask.stderr, /duplicate/i);
  assert.equal(existsSync(marker), false);
  const duplicateArm = run(['--arms', 'A,A']);
  assert.notEqual(duplicateArm.status, 0);
  assert.match(duplicateArm.stderr, /duplicate/i);
  assert.equal(existsSync(marker), false);
});

test('git failure leaves an incomplete manifest before Claude runs', (t) => {
  const { run, results, marker } = harness(t, { failingGit: 'all' });
  const proc = run();
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /git init/);
  assert.match(proc.stderr, /git unavailable/);
  assert.equal(proc.stderr.trim().split('\n').length, 1);
  assert.equal(existsSync(marker), false);
  assert.deepEqual(results()[0], {
    run_id: results()[0].run_id,
    model: 'sonnet',
    expected_runs: 1,
    complete: false,
    runs: [],
  });
});

test('bare git initialization failure aborts before Claude', (t) => {
  const { run, marker } = harness(t, { layered: true, failingGit: 'bare' });
  const proc = run();
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /git init --bare/);
  assert.match(proc.stderr, /git unavailable/);
  assert.equal(existsSync(marker), false);
});

test('existing result directory is refused before the next repetition', (t) => {
  const { run, results, env } = harness(t);
  env.CREATE_CONFLICT_DIR = '1';
  const proc = run(['--reps', '2']);
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /run directories already exist for sample-A-2/);
  const manifest = results()[0];
  assert.equal(manifest.expected_runs, 2);
  assert.equal(manifest.complete, false);
  assert.equal(manifest.runs.length, 1);
});

test('layered fixture creates main, feature branch, and origin refs', (t) => {
  const { run, results } = harness(t, { layered: true });
  const proc = run();
  assert.equal(proc.status, 0, proc.stderr);
  const workDir = results()[0].runs[0].work_dir;
  const git = (...args) => execFileSync('git', args, { cwd: workDir, encoding: 'utf8' }).trim();
  assert.equal(git('branch', '--show-current'), 'feature/eval');
  assert.equal(git('show', 'main:value.txt'), 'base');
  assert.equal(git('show', 'feature/eval:value.txt'), 'change');
  assert.equal(git('rev-list', '--count', 'main..feature/eval'), '1');
  assert.equal(git('rev-parse', 'refs/remotes/origin/main'), git('rev-parse', 'main'));
  assert.equal(git('rev-parse', 'refs/remotes/origin/feature/eval'), git('rev-parse', 'feature/eval'));
});
