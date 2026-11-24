import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const evalsSource = dirname(fileURLToPath(import.meta.url));
const runner = join(evalsSource, 'run.mjs');

function harness(t, { layered = false, failingGit = null, fakeGh = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ruccess-eval-run-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const evals = join(root, 'evals');
  const fixture = join(evals, 'tasks', 'sample', 'fixture');
  const bin = join(root, 'bin');
  const sandboxTmp = join(root, 'tmp');
  mkdirSync(fixture, { recursive: true });
  mkdirSync(bin);
  mkdirSync(sandboxTmp);
  cpSync(runner, join(evals, 'run.mjs'));
  cpSync(join(evalsSource, 'lib'), join(evals, 'lib'), { recursive: true });
  writeFileSync(join(dirname(fixture), 'task.json'), JSON.stringify({ prompt: 'test prompt', expects_git: layered || Boolean(failingGit), ...(fakeGh ? { fake_gh: true } : {}) }));
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
if (process.env.CREATE_CONFLICT_DIR) {
  const results = process.env.CREATE_CONFLICT_DIR;
  const [runDir] = fs.readdirSync(results).filter((name) => fs.statSync(path.join(results, name)).isDirectory());
  fs.mkdirSync(path.join(results, runDir, 'sample-A-2'));
}
if (process.env.ENV_DUMP) {
  const ghDir = process.env.GH_CONFIG_DIR;
  fs.writeFileSync(process.env.ENV_DUMP, JSON.stringify({
    GH_CONFIG_DIR: ghDir ?? null,
    ghConfigEntries: ghDir && fs.existsSync(ghDir) ? fs.readdirSync(ghDir) : null,
    tokens: ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN'].filter((name) => name in process.env),
    gitTopLevel: require('node:child_process').execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(),
  }));
}
if (process.env.CALL_GH) {
  fs.writeFileSync(process.env.CALL_GH, require('node:child_process').execFileSync('gh', ['pr', 'create', '--draft'], { encoding: 'utf8' }));
}
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
    TMPDIR: sandboxTmp,
    GH_TOKEN: 'parent-gh-token',
    GITHUB_TOKEN: 'parent-github-token',
    GH_ENTERPRISE_TOKEN: 'parent-ghe-token',
    GITHUB_ENTERPRISE_TOKEN: 'parent-ghe-token',
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
  return { root, evals, run, results, marker, env };
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
    sandbox_root: results()[0].sandbox_root,
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
  const { evals, run, results, env } = harness(t);
  env.CREATE_CONFLICT_DIR = join(evals, 'results');
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

test('work dir lives outside the evals directory', (t) => {
  const { evals, run, results } = harness(t);
  const proc = run();
  assert.equal(proc.status, 0, proc.stderr);
  const workDir = results()[0].runs[0].work_dir;
  const fromEvals = relative(realpathSync(evals), realpathSync(workDir));
  assert.ok(fromEvals.startsWith('..') || isAbsolute(fromEvals), `work dir inside evals: ${workDir}`);
  assert.equal(readFileSync(join(workDir, 'value.txt'), 'utf8'), 'fixture\n');
  assert.ok(existsSync(join(results()[0].runs[0].result_dir, 'raw-result.json')));
});

test('a task without expects_git still gets its own repository', (t) => {
  const { run, results, env, root } = harness(t);
  env.ENV_DUMP = join(root, 'env.json');
  const proc = run();
  assert.equal(proc.status, 0, proc.stderr);
  const workDir = results()[0].runs[0].work_dir;
  assert.ok(existsSync(join(workDir, '.git')));
  const git = (...args) => execFileSync('git', args, { cwd: workDir, encoding: 'utf8' }).trim();
  assert.equal(git('rev-list', '--count', 'HEAD'), '1');
  assert.equal(git('remote'), '');
  const seen = JSON.parse(readFileSync(env.ENV_DUMP, 'utf8'));
  assert.equal(realpathSync(seen.gitTopLevel), realpathSync(workDir));
});

test('claude sees an empty gh config and no GitHub tokens', (t) => {
  const { run, env, root } = harness(t);
  env.ENV_DUMP = join(root, 'env.json');
  const proc = run();
  assert.equal(proc.status, 0, proc.stderr);
  const seen = JSON.parse(readFileSync(env.ENV_DUMP, 'utf8'));
  assert.ok(seen.GH_CONFIG_DIR, 'GH_CONFIG_DIR is set');
  assert.deepEqual(seen.ghConfigEntries, []);
  assert.deepEqual(seen.tokens, []);
  const fromRoot = relative(realpathSync(root), realpathSync(seen.GH_CONFIG_DIR));
  assert.ok(fromRoot.startsWith('tmp'), `gh config outside the sandbox: ${seen.GH_CONFIG_DIR}`);
});

/** Agent-visible paths and contents must name neither the task nor the arm. */
function assertOpaque(sandboxId, values, taskNames) {
  assert.match(sandboxId, /^[0-9a-f]{12}$/);
  for (const value of values) {
    for (const name of taskNames) assert.ok(!value.includes(name), `task name "${name}" leaks in ${value}`);
    assert.doesNotMatch(value, /-[AB]-/, `arm leaks in ${value}`);
  }
}

test('run.mjs puts the fake gh first on PATH for a fake_gh task', (t) => {
  const { run, results, env, root } = harness(t, { layered: true, fakeGh: true });
  env.CALL_GH = join(root, 'gh-out.txt');
  const proc = run();
  assert.equal(proc.status, 0, proc.stderr);
  const record = results()[0].runs[0];
  assert.equal(record.executor, 'claude-cli');
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: record.work_dir, encoding: 'utf8' }).trim();
  assertOpaque(record.sandbox_id, [record.work_dir, record.gh_log, remote], ['sample']);
  assert.equal(readFileSync(env.CALL_GH, 'utf8').trim(), 'https://github.com/eval-org/eval-repo/pull/1');
  const log = readFileSync(record.gh_log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(log.map((entry) => entry.argv), [['pr', 'create', '--draft']]);
  assert.equal(realpathSync(log[0].cwd), realpathSync(record.work_dir));
});

const fakeGhScript = join(evalsSource, 'lib', 'fake-gh.mjs');

function fakeGhHarness(t, requiredChecks = null) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ruccess-fake-gh-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, EVAL_GH_LOG: join(dir, 'log.jsonl'), EVAL_GH_STATE: join(dir, 'state.json') };
  delete env.EVAL_GH_REQUIRED_CHECKS;
  if (requiredChecks !== null) env.EVAL_GH_REQUIRED_CHECKS = String(requiredChecks);
  const gh = (...args) => spawnSync(process.execPath, [fakeGhScript, ...args], { cwd: dir, env, encoding: 'utf8' });
  const log = () => readFileSync(env.EVAL_GH_LOG, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  return { dir, env, gh, log };
}

test('fake gh walks a draft PR through ready and auto-merge', (t) => {
  const { dir, gh, log } = fakeGhHarness(t);
  const noPr = gh('pr', 'view');
  assert.equal(noPr.status, 1);
  assert.match(noPr.stderr, /no pull requests found for branch "feature\/eval"/);

  const created = gh('pr', 'create', '--draft', '--title', 'feat: x', '--body', 'b');
  assert.equal(created.status, 0, created.stderr);
  assert.equal(created.stdout.trim(), 'https://github.com/eval-org/eval-repo/pull/1');
  assert.match(gh('pr', 'create', '--title', 'again').stderr, /already exists/);

  const viewed = gh('pr', 'view', '--json', 'number,isDraft,title,autoMergeRequest,bogus');
  assert.deepEqual(JSON.parse(viewed.stdout), { number: 1, isDraft: true, title: 'feat: x', autoMergeRequest: null, bogus: null });

  const draftMerge = gh('pr', 'merge', '--squash');
  assert.equal(draftMerge.status, 1);
  assert.match(draftMerge.stderr, /Pull request #1 is still a draft/);

  assert.match(gh('pr', 'ready').stdout, /marked as "ready for review"/);
  const autoMerge = gh('pr', 'merge', '--auto', '--squash');
  assert.equal(autoMerge.status, 0, autoMerge.stderr);
  assert.match(autoMerge.stdout, /will be automatically merged via squash/);
  const after = JSON.parse(gh('pr', 'view', '--json', 'isDraft,autoMergeRequest,state').stdout);
  assert.deepEqual(after, { isDraft: false, autoMergeRequest: { mergeMethod: 'SQUASH' }, state: 'OPEN' });

  assert.equal(gh('auth', 'status').status, 0);
  assert.equal(JSON.parse(gh('repo', 'view', '--json', 'nameWithOwner').stdout).nameWithOwner, 'eval-org/eval-repo');
  const unknown = gh('api', 'repos/x');
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /not available in the eval sandbox/);

  const entries = log();
  assert.equal(entries.length, 11);
  assert.deepEqual(entries[1].argv, ['pr', 'create', '--draft', '--title', 'feat: x', '--body', 'b']);
  assert.deepEqual(entries[6].argv, ['pr', 'merge', '--auto', '--squash']);
  assert.deepEqual(entries.at(-1).argv, ['api', 'repos/x']);
  assert.ok(entries.every((entry) => entry.cwd === dir && !Number.isNaN(Date.parse(entry.at))));
});

test('fake gh refuses to run without its log and state paths', () => {
  const env = { ...process.env };
  delete env.EVAL_GH_LOG;
  delete env.EVAL_GH_STATE;
  const proc = spawnSync(process.execPath, [fakeGhScript, 'auth', 'status'], { env, encoding: 'utf8' });
  assert.equal(proc.status, 1);
  assert.match(proc.stderr, /EVAL_GH_LOG/);
});

function prepareHarness(t) {
  const root = mkdtempSync(join(tmpdir(), 'ruccess-eval-prepare-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const evals = join(root, 'evals');
  const sandboxTmp = join(root, 'tmp');
  mkdirSync(evals);
  mkdirSync(sandboxTmp);
  for (const file of ['prepare.mjs', 'collect.mjs']) cpSync(join(evalsSource, file), join(evals, file));
  cpSync(join(evalsSource, 'lib'), join(evals, 'lib'), { recursive: true });

  const shipit = join(evals, 'tasks', 'shipit');
  mkdirSync(join(shipit, 'fixture', 'base'), { recursive: true });
  mkdirSync(join(shipit, 'fixture', 'change'));
  writeFileSync(join(shipit, 'fixture', 'base', 'value.txt'), 'base\n');
  writeFileSync(join(shipit, 'fixture', 'change', 'value.txt'), 'change\n');
  writeFileSync(join(shipit, 'task.json'), JSON.stringify({ prompt: 'PR로 올려라.', expects_git: true, fake_gh: true, entry_skill: 'dev-ship' }));
  const plain = join(evals, 'tasks', 'plain');
  mkdirSync(join(plain, 'fixture'), { recursive: true });
  writeFileSync(join(plain, 'fixture', 'value.txt'), 'fixture\n');
  writeFileSync(join(plain, 'task.json'), JSON.stringify({ prompt: '요약하라.', expects_git: false }));
  mkdirSync(join(root, 'skills', 'dev-ship'), { recursive: true });
  writeFileSync(join(root, 'skills', 'dev-ship', 'SKILL.md'), '# dev-ship\n');

  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    TMPDIR: sandboxTmp,
    GH_TOKEN: 'parent-gh-token',
    GITHUB_TOKEN: 'parent-github-token',
  };
  const node = (script) => (args) => spawnSync(process.execPath, [join(evals, script), ...args], { cwd: root, env, encoding: 'utf8' });
  const resultsDir = join(evals, 'results');
  const runDirs = () => (existsSync(resultsDir) ? readdirSync(resultsDir).map((name) => join(resultsDir, name)) : []);
  const manifest = () => JSON.parse(readFileSync(join(runDirs()[0], 'runs.json'), 'utf8'));
  return { root, env, prepare: node('prepare.mjs'), collect: node('collect.mjs'), runDirs, manifest };
}

test('prepare hides the arm behind a content-hashed skills folder and writes prompts', (t) => {
  const { prepare, manifest } = prepareHarness(t);
  const proc = prepare(['--tasks', 'shipit']);
  assert.equal(proc.status, 0, proc.stderr);
  const data = manifest();
  assert.equal(data.executor, 'external');
  assert.equal(data.complete, false);
  assert.equal(data.expected_runs, 2);
  assert.match(data.arms.A.skills_sha256, /^[0-9a-f]{64}$/);
  assert.equal(relative(data.sandbox_root, data.arms.A.skills_dir), join('skillsets', data.arms.A.skills_sha256.slice(0, 12)));
  assert.ok(existsSync(join(data.arms.A.skills_dir, 'dev-ship', 'SKILL.md')));
  assert.deepEqual(data.arms.B, { skills_dir: null });

  const [a, b] = data.runs;
  assert.deepEqual(proc.stdout.trim().split('\n'), [`shipit-A-1\t${a.prompt_file}`, `shipit-B-1\t${b.prompt_file}`]);
  assert.deepEqual([a.status, a.executor, b.skills_dir, b.skills_sha256], ['pending', 'external', null, null]);
  assert.equal(a.skills_dir, data.arms.A.skills_dir);
  const header = (run) => [
    `작업 저장소: ${run.work_dir}`,
    `이 디렉터리가 저장소 루트다. Bash 명령은 매번 \`cd ${run.work_dir} && . ${run.env_file} && <명령>\` 형태로 실행하라(샌드박스 격리용이다). 이 디렉터리 밖의 파일은 수정하지 말고 새 원격 저장소를 만들지 마라. Skill 도구는 쓰지 마라.`,
  ];
  assert.equal(readFileSync(a.prompt_file, 'utf8'), [
    ...header(a),
    `먼저 ${a.skills_dir}/dev-ship/SKILL.md를 읽고 그 절차를 따르라. 그 문서가 다른 스킬을 가리키면 ${a.skills_dir}/<이름>/SKILL.md를 읽어라.`,
    '',
    '요청: PR로 올려라.',
    '',
  ].join('\n'));
  assert.equal(readFileSync(b.prompt_file, 'utf8'), [...header(b), '', '요청: PR로 올려라.', ''].join('\n'));
  for (const run of [a, b]) {
    assert.equal(relative(data.sandbox_root, run.prompt_file), join('prompts', `${run.sandbox_id}.txt`));
    assert.equal(readFileSync(join(run.result_dir, 'prompt.txt'), 'utf8'), readFileSync(run.prompt_file, 'utf8'));
  }
  const git = (...args) => execFileSync('git', args, { cwd: a.work_dir, encoding: 'utf8' }).trim();
  assert.equal(git('branch', '--show-current'), 'feature/eval');
  assert.equal(git('show', 'main:value.txt'), 'base');
});

test('sourcing the env file resolves gh to the fake and drops tokens', (t) => {
  const { prepare, manifest, env } = prepareHarness(t);
  const proc = prepare(['--tasks', 'shipit', '--arms', 'B']);
  assert.equal(proc.status, 0, proc.stderr);
  const [run] = manifest().runs;
  const script = `cd "${run.work_dir}" && . "${run.env_file}" && command -v gh && gh pr create --draft && printf '%s\\n' "$GH_CONFIG_DIR" "\${GH_TOKEN:-unset}" "\${GITHUB_TOKEN:-unset}"`;
  const shell = spawnSync('sh', ['-c', script], { env, encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr);
  const [ghPath, url, ghConfig, ghToken, githubToken] = shell.stdout.trim().split('\n');
  assert.equal(relative(manifest().sandbox_root, ghPath), join('bin', run.sandbox_id, 'gh'));
  assert.equal(url, 'https://github.com/eval-org/eval-repo/pull/1');
  assert.deepEqual(readdirSync(ghConfig), []);
  assert.deepEqual([ghToken, githubToken], ['unset', 'unset']);
  const log = readFileSync(run.gh_log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(log.map((entry) => entry.argv), [['pr', 'create', '--draft']]);
  assert.equal(realpathSync(log[0].cwd), run.work_dir);
  assert.match(readFileSync(run.env_file, 'utf8'), /^export EVAL_GH_REQUIRED_CHECKS=2$/m);
});

test('prepare rejects bad selections before creating anything', (t) => {
  const { prepare, runDirs } = prepareHarness(t);
  const cases = [
    [['--tasks', 'plain', '--arms', 'A'], /no entry_skill/],
    [['--tasks', 'nope', '--arms', 'B'], /unknown task/],
    [['--tasks', 'plain,plain', '--arms', 'B'], /duplicate/],
    [['--tasks', 'plain', '--arms', 'B,B'], /duplicate/],
  ];
  for (const [args, pattern] of cases) {
    const proc = prepare(args);
    assert.notEqual(proc.status, 0);
    assert.match(proc.stderr, pattern);
  }
  assert.deepEqual(runDirs(), []);
});

function writeTranscript(root, name, entries) {
  const file = join(root, name);
  writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
  return file;
}

const assistant = (id, ...content) => ({ type: 'assistant', message: { id, role: 'assistant', content } });

test('collect fills records and completes the manifest on the last run', (t) => {
  const { root, prepare, collect, runDirs, manifest } = prepareHarness(t);
  assert.equal(prepare(['--tasks', 'plain', '--arms', 'B', '--reps', '2']).status, 0);
  const [runDir] = runDirs();
  const transcript = writeTranscript(root, 'session.jsonl', [
    assistant('m1', { type: 'text', text: '보겠다' }, { type: 'tool_use', name: 'Read', input: {} }),
    assistant('m1', { type: 'tool_use', name: 'Bash', input: {} }),
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } },
    assistant('m2', { type: 'tool_use', name: 'Write', input: {} }),
    assistant('m3', { type: 'text', text: '최종 답변' }),
  ]);

  const first = collect([runDir, '--key', 'plain-B-1', '--transcript', transcript]);
  assert.equal(first.status, 0, first.stderr);
  let data = manifest();
  assert.equal(data.complete, false);
  const record = data.runs[0];
  assert.deepEqual(
    [record.status, record.exit_code, record.is_error, record.result, record.num_turns, record.total_cost_usd],
    ['collected', 0, false, '최종 답변', 2, null],
  );
  assert.equal(record.transcript, join(record.result_dir, 'transcript.jsonl'));
  assert.equal(record.transcript_source, transcript);
  assert.equal(readFileSync(record.transcript, 'utf8'), readFileSync(transcript, 'utf8'));
  assert.equal(data.runs[1].status, 'pending');

  assert.match(collect([runDir, '--key', 'plain-B-1', '--transcript', transcript]).stderr, /already collected/);
  assert.equal(collect([runDir, '--key', 'plain-B-1', '--transcript', transcript, '--force']).status, 0);
  assert.match(collect([runDir, '--key', 'plain-B-9', '--transcript', transcript]).stderr, /unknown run key/);
  assert.match(collect([runDir, '--key', 'plain-B-2', '--transcript', join(root, 'missing.jsonl')]).stderr, /transcript not found/);
  assert.equal(manifest().complete, false);

  const last = collect([runDir, '--key', 'plain-B-2', '--transcript', transcript]);
  assert.equal(last.status, 0, last.stderr);
  data = manifest();
  assert.equal(data.complete, true);
  assert.ok(data.runs.every((run) => run.status === 'collected'));
});

test('collect takes the final answer from a handback tool_use', (t) => {
  const { root, prepare, collect, runDirs, manifest } = prepareHarness(t);
  assert.equal(prepare(['--tasks', 'plain', '--arms', 'B']).status, 0);
  const report = '## 결과\n변경 파일과 검증 결과를 정리한 최종 보고다.';
  const transcript = writeTranscript(root, 'subagent.jsonl', [
    assistant('m1', { type: 'text', text: '중간 메모' }, { type: 'tool_use', name: 'Bash', input: {} }),
    assistant('m2', { type: 'thinking', thinking: '' }),
    assistant('m2', { type: 'tool_use', name: 'SubagentHandback', input: { status: 'done', message: report } }),
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'delivered' }] } },
  ]);
  const proc = collect([runDirs()[0], '--key', 'plain-B-1', '--transcript', transcript]);
  assert.equal(proc.status, 0, proc.stderr);
  const [record] = manifest().runs;
  assert.equal(record.result, report);
  assert.equal(record.num_turns, 2);
  assert.equal(manifest().complete, true);
});

test('prepare keeps task names and arms out of every agent-visible path', (t) => {
  const { prepare, manifest } = prepareHarness(t);
  assert.equal(prepare(['--tasks', 'shipit']).status, 0);
  const data = manifest();
  for (const run of data.runs) {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: run.work_dir, encoding: 'utf8' }).trim();
    const visible = [
      run.work_dir, run.env_file, run.prompt_file, run.gh_log, remote,
      readFileSync(run.env_file, 'utf8'), readFileSync(run.prompt_file, 'utf8'),
    ];
    assertOpaque(run.sandbox_id, visible, ['shipit']);
    assert.equal(relative(data.sandbox_root, run.gh_log), join('gh-log', `${run.sandbox_id}.jsonl`));
  }
  assert.equal(new Set(data.runs.map((run) => run.sandbox_id)).size, data.runs.length);
});

test('fake gh reports required checks and merges --auto at once when there are none', (t) => {
  const protection = 'repos/eval-org/eval-repo/branches/main/protection';
  const rules = 'repos/eval-org/eval-repo/rules/branches/main';
  const testLine = 'test\tpass\t12s\thttps://github.com/eval-org/eval-repo/actions/runs/1';
  const lintLine = 'lint\tpass\t12s\thttps://github.com/eval-org/eval-repo/actions/runs/1';

  const two = fakeGhHarness(t, 2);
  assert.equal(two.gh('pr', 'checks').status, 1);
  assert.equal(two.gh('pr', 'create', '--title', 'x').status, 0);
  const required = two.gh('pr', 'checks', '--required');
  assert.deepEqual([required.status, required.stdout.trim().split('\n')], [0, [testLine, lintLine]]);
  assert.deepEqual(two.gh('pr', 'checks').stdout.trim().split('\n'), [testLine, lintLine]);
  assert.deepEqual(JSON.parse(two.gh('api', protection).stdout), { required_status_checks: { strict: true, contexts: ['test', 'lint'] } });
  assert.deepEqual(JSON.parse(two.gh('api', rules).stdout), [
    { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'test' }, { context: 'lint' }] } },
  ]);
  const twoView = JSON.parse(two.gh('pr', 'view', '--json', 'mergeStateStatus,statusCheckRollup').stdout);
  assert.equal(twoView.mergeStateStatus, 'BLOCKED');
  assert.deepEqual(twoView.statusCheckRollup.map((check) => [check.name, check.conclusion]), [['test', 'SUCCESS'], ['lint', 'SUCCESS']]);
  assert.match(two.gh('pr', 'merge', '--auto', '--squash').stdout, /will be automatically merged/);
  assert.deepEqual(JSON.parse(readFileSync(two.env.EVAL_GH_STATE, 'utf8')).pr, { number: 1, draft: false, auto_merge: true, merged: false, title: 'x' });
  assert.match(two.gh('api', '-X', 'PUT', protection).stderr, /not available in the eval sandbox/);
  assert.match(two.gh('api', 'repos/eval-org/eval-repo/pulls').stderr, /not available in the eval sandbox/);
  assert.equal(JSON.parse(two.gh('repo', 'view', '--json', 'autoMergeAllowed').stdout).autoMergeAllowed, true);

  const none = fakeGhHarness(t, 0);
  assert.equal(none.gh('pr', 'create', '--title', 'x').status, 0);
  const noRequired = none.gh('pr', 'checks', '--required');
  assert.equal(noRequired.status, 1);
  assert.match(noRequired.stderr, /no required checks reported on the 'feature\/eval' branch/);
  assert.equal(none.gh('pr', 'checks').status, 0);
  const unprotected = none.gh('api', protection);
  assert.equal(unprotected.status, 1);
  assert.match(unprotected.stderr, /Branch not protected \(HTTP 404\)/);
  const noRules = none.gh('api', rules);
  assert.deepEqual([noRules.status, noRules.stdout.trim()], [0, '[]']);
  assert.equal(JSON.parse(none.gh('pr', 'view', '--json', 'mergeStateStatus').stdout).mergeStateStatus, 'CLEAN');
  const merged = none.gh('pr', 'merge', '--auto', '--squash');
  assert.equal(merged.status, 0, merged.stderr);
  assert.equal(merged.stdout.trim(), '✓ Squashed and merged pull request #1');
  assert.deepEqual(JSON.parse(readFileSync(none.env.EVAL_GH_STATE, 'utf8')).pr, { number: 1, draft: false, auto_merge: false, merged: true, title: 'x' });
});

test('prepare passes fake_gh_required_checks into the env file', (t) => {
  const { root, prepare, manifest } = prepareHarness(t);
  const taskFile = join(root, 'evals', 'tasks', 'shipit', 'task.json');
  writeFileSync(taskFile, JSON.stringify({ ...JSON.parse(readFileSync(taskFile, 'utf8')), fake_gh_required_checks: 0 }));
  assert.equal(prepare(['--tasks', 'shipit', '--arms', 'B']).status, 0);
  const [run] = manifest().runs;
  assert.match(readFileSync(run.env_file, 'utf8'), /^export EVAL_GH_REQUIRED_CHECKS=0$/m);
});
