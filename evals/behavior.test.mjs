import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const evalsSource = dirname(fileURLToPath(import.meta.url));
const SKILL_NAME = 'alpha-guide';
const SKILL_BODY = '# alpha guide\n\n지침 본문 표식 Q7.\n';
const ARM_NAMES = ['none', 'skill', 'plugin'];
const CASES = [
  { id: 'c1', skill: SKILL_NAME, prompt: '보고서 정리 요청 P1', context: '상황 문맥 X1', checks: ['기준문구-하나', '기준문구-둘'] },
  { id: 'c2', skill: SKILL_NAME, prompt: '요청 P2', checks: ['기준문구-셋', '기준문구-넷'] },
];
const CHECK_TEXTS = CASES.flatMap((item) => item.checks);

// Generation answers depend only on flags; the judge answers depend only on the response.
const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const argv = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({ argv }) + '\\n');
const turns = argv[argv.indexOf('--max-turns') + 1];
const prompt = argv[argv.length - 1];
const out = (body) => process.stdout.write(JSON.stringify({ type: 'result', is_error: false, total_cost_usd: 0.01, ...body }));
if (turns === '1') {
  const verdicts = (flags) => JSON.stringify(flags.map((passed) => ({ criterion: 'x', passed, reason: 'r' })));
  if (prompt.includes('응답 알파')) out({ result: verdicts([true, false]) });
  else if (prompt.includes('응답 베타')) out({ result: verdicts([true, true]) });
  else if (process.env.JUDGE_BREAK_PLUGIN) out({ result: '판정을 내릴 수 없습니다.' });
  else out({ result: '판정 결과다.\\n\\n\`\`\`json\\n' + verdicts([true, true]) + '\\n\`\`\`\\n끝.' });
} else {
  const sessionId = 'sess-' + Math.random().toString(36).slice(2);
  let result = '응답 알파';
  if (argv.includes('--append-system-prompt')) result = '응답 베타';
  if (argv.includes('--plugin-dir')) {
    result = '응답 감마';
    const slug = process.cwd().replace(/[^a-zA-Z0-9]/g, '-');
    const dir = path.join(process.env.HOME, '.claude', 'projects', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, sessionId + '.jsonl'), JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'ruccess:${SKILL_NAME}' } }] },
    }) + '\\n');
  }
  out({ result, session_id: sessionId });
}
`;

function harness(t, { cases = CASES } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ruccess-behavior-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const evals = join(root, 'evals');
  const bin = join(root, 'bin');
  for (const dir of [evals, bin, join(root, 'tmp'), join(root, 'home'), join(root, 'skills', SKILL_NAME)]) {
    mkdirSync(dir, { recursive: true });
  }
  cpSync(join(evalsSource, 'behavior.mjs'), join(evals, 'behavior.mjs'));
  cpSync(join(evalsSource, 'lib'), join(evals, 'lib'), { recursive: true });
  writeFileSync(join(root, 'skills', SKILL_NAME, 'SKILL.md'), SKILL_BODY);
  const casesFile = join(root, 'cases.json');
  writeFileSync(casesFile, JSON.stringify(cases));
  writeFileSync(join(bin, 'claude'), FAKE_CLAUDE);
  chmodSync(join(bin, 'claude'), 0o755);

  const callLog = join(root, 'calls.jsonl');
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    HOME: join(root, 'home'),
    TMPDIR: join(root, 'tmp'),
    CALL_LOG: callLog,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  };
  const run = (extra = []) => spawnSync(process.execPath, [join(evals, 'behavior.mjs'), '--cases', casesFile, ...extra], {
    cwd: root, env, encoding: 'utf8',
  });
  const calls = () => (existsSync(callLog)
    ? readFileSync(callLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line).argv)
    : []);
  const output = () => {
    const results = join(evals, 'results');
    const [runDir] = readdirSync(results).filter((name) => name.startsWith('behavior-'));
    return {
      report: JSON.parse(readFileSync(join(results, runDir, 'behavior.json'), 'utf8')),
      summary: readFileSync(join(results, runDir, 'summary.md'), 'utf8'),
    };
  };
  return { root, env, run, calls, output };
}

const isJudge = (argv) => argv[argv.indexOf('--max-turns') + 1] === '1';
const flagValue = (argv, flag) => argv[argv.indexOf(flag) + 1];

test('generation calls never receive the checks', (t) => {
  const { run, calls } = harness(t);
  const proc = run();
  assert.equal(proc.status, 0, proc.stderr);
  const generations = calls().filter((argv) => !isJudge(argv));
  assert.equal(generations.length, 6);
  for (const argv of generations) {
    const joined = argv.join('\n');
    for (const check of CHECK_TEXTS) assert.ok(!joined.includes(check), `generation saw "${check}"`);
    assert.equal(flagValue(argv, '--max-turns'), '4');
    assert.deepEqual(argv.slice(0, 3), ['-p', '--setting-sources', 'project,local']);
  }
  const prompts = generations.map((argv) => argv[argv.length - 1]);
  assert.ok(prompts.includes('보고서 정리 요청 P1\n\n[상황]\n상황 문맥 X1'));
  assert.ok(prompts.includes('요청 P2'));
});

test('judge calls see the checks but no arm or skill name', (t) => {
  const { run, calls } = harness(t);
  const proc = run();
  assert.equal(proc.status, 0, proc.stderr);
  const judges = calls().filter(isJudge);
  assert.equal(judges.length, 6);
  for (const argv of judges) {
    const joined = argv.join('\n');
    for (const name of [...ARM_NAMES, SKILL_NAME]) assert.ok(!joined.includes(name), `judge saw "${name}"`);
    assert.ok(!argv.includes('--append-system-prompt'));
    assert.ok(!argv.includes('--plugin-dir'));
    assert.ok(CHECK_TEXTS.some((check) => joined.includes(check)));
  }
});

test('only the skill arm gets the SKILL.md body and only the plugin arm gets --plugin-dir', (t) => {
  const { root, run, calls, output } = harness(t);
  const proc = run();
  assert.equal(proc.status, 0, proc.stderr);
  const generations = calls().filter((argv) => !isJudge(argv));
  const appended = generations.filter((argv) => argv.includes('--append-system-prompt'));
  const plugged = generations.filter((argv) => argv.includes('--plugin-dir'));
  assert.equal(appended.length, 2);
  assert.equal(plugged.length, 2);
  for (const argv of appended) {
    assert.equal(flagValue(argv, '--append-system-prompt'), SKILL_BODY);
    assert.ok(!argv.includes('--plugin-dir'));
  }
  for (const argv of plugged) assert.equal(realpathSync(flagValue(argv, '--plugin-dir')), realpathSync(root));

  const { report } = output();
  const responseOf = (arm) => report.runs.filter((record) => record.arm === arm).map((record) => record.response);
  assert.deepEqual(responseOf('none'), ['응답 알파', '응답 알파']);
  assert.deepEqual(responseOf('skill'), ['응답 베타', '응답 베타']);
  assert.deepEqual(responseOf('plugin'), ['응답 감마', '응답 감마']);
  for (const record of report.runs) {
    assert.deepEqual(record.skills, record.arm === 'plugin' ? [SKILL_NAME] : undefined);
  }
  assert.equal(report.skill_sha256[SKILL_NAME].length, 64);
  assert.equal(report.cases_sha256.length, 64);
  assert.equal(report.complete, true);
});

test('a broken judge output is judge_invalid and adds no passes', (t) => {
  const { env, run, output } = harness(t);
  env.JUDGE_BREAK_PLUGIN = '1';
  const proc = run();
  assert.equal(proc.status, 0, proc.stderr);
  const { report, summary } = output();
  for (const record of report.runs.filter((item) => item.arm === 'plugin')) {
    assert.equal(record.status, 'judge_invalid');
    assert.equal(record.passed, 0);
    assert.match(record.invalid_reason, /judge_unparseable/);
  }
  assert.match(summary, /\| c1 \| 1\/2 \| 2\/2 \| 0\/2 \(무효 1\) \|/);
  assert.match(summary, /\| plugin \| 0 \| 4 \| 2 \|/);
  assert.match(summary, /판정 무효: 2/);
});

test('summary totals, split criteria, and cost add up', (t) => {
  const { run, output } = harness(t);
  const proc = run();
  assert.equal(proc.status, 0, proc.stderr);
  const { summary } = output();
  assert.match(summary, /\| c1 \| 1\/2 \| 2\/2 \| 2\/2 \|/);
  assert.match(summary, /\| c2 \| 1\/2 \| 2\/2 \| 2\/2 \|/);
  assert.match(summary, /\| none \| 2 \| 4 \| 0 \|/);
  assert.match(summary, /\| skill \| 4 \| 4 \| 0 \|/);
  assert.match(summary, /\| plugin \| 4 \| 4 \| 0 \|/);
  assert.match(summary, /\| c1 \| 기준문구-둘 \| 0\/1 \| 1\/1 \| 1\/1 \|/);
  assert.match(summary, /\| c2 \| 기준문구-넷 \| 0\/1 \| 1\/1 \| 1\/1 \|/);
  assert.doesNotMatch(summary, /\| c1 \| 기준문구-하나 \|/);
  assert.match(summary, /## 무효 실행\n\n해당 항목 없음\./);
  assert.match(summary, /총비용\(USD\): \$0\.1200 \(생성 \$0\.0600, 판정 \$0\.0600\)/);
});

test('argument errors and duplicate case ids fail before any Claude call', (t) => {
  const { run, calls } = harness(t);
  for (const extra of [['--arms', 'none,bogus'], ['--arms', 'none,none'], ['--reps', '0'], ['--ids', 'missing'], ['--model'], ['--wat', '1']]) {
    const proc = run(extra);
    assert.notEqual(proc.status, 0, extra.join(' '));
    assert.match(proc.stderr, /behavior eval failed/);
  }
  assert.deepEqual(calls(), []);

  const duplicate = harness(t, { cases: { cases: [CASES[0], { ...CASES[1], id: 'c1' }] } });
  const proc = duplicate.run();
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /duplicate case id "c1"/);
  assert.deepEqual(duplicate.calls(), []);

  const missingSkill = harness(t, { cases: [{ ...CASES[0], skill: 'absent' }] });
  const skillProc = missingSkill.run(['--arms', 'skill']);
  assert.notEqual(skillProc.status, 0);
  assert.match(skillProc.stderr, /skill arm needs/);
  assert.deepEqual(missingSkill.calls(), []);
});

test('--ids narrows the run and the object case format is accepted', (t) => {
  const { run, calls, output } = harness(t, { cases: { description: 'fixture', cases: CASES } });
  const proc = run(['--ids', 'c2', '--arms', 'none', '--reps', '2']);
  assert.equal(proc.status, 0, proc.stderr);
  assert.equal(calls().length, 4);
  const { report } = output();
  assert.deepEqual(report.runs.map((record) => [record.case_id, record.arm, record.rep]), [['c2', 'none', 1], ['c2', 'none', 2]]);
});
