import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scorer = fileURLToPath(new URL('./score.mjs', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'score-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const transcript = (name, lines) => {
    const path = join(root, `${name}.jsonl`);
    writeFileSync(path, lines.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n'));
    return path;
  };

  const record = (arm, rep, overrides = {}) => ({
    task: 'ship-gates',
    arm,
    rep,
    work_dir: root,
    exit_code: 0,
    is_error: false,
    result: 'Finished',
    total_cost_usd: 1,
    transcript: transcript(`${arm}-${rep}`, [
      { type: 'queue-operation', operation: 'enqueue' },
      { type: 'system', message: { content: 'Session started' } },
      { type: 'user', message: { role: 'user', content: 'Ship this' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] } },
    ]),
    ...overrides,
  });

  const invoke = (manifest) => {
    writeFileSync(join(root, 'runs.json'), JSON.stringify(manifest));
    return spawnSync(process.execPath, [scorer, root], { encoding: 'utf8' });
  };

  const score = (runs) => {
    const proc = invoke({ run_id: 'fixture', model: 'test', runs });
    assert.equal(proc.status, 0, proc.stderr);
    return {
      summary: readFileSync(join(root, 'summary.md'), 'utf8'),
      scores: JSON.parse(readFileSync(join(root, 'scores.json'), 'utf8')),
    };
  };

  return { root, transcript, record, invoke, score };
}

test('incomplete manifest is refused before scoring', (t) => {
  const { record, invoke } = fixture(t);
  const proc = invoke({
    run_id: 'fixture',
    model: 'test',
    expected_runs: 2,
    complete: false,
    runs: [record('A', 1)],
  });

  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /incomplete runs manifest.*1 of 2/i);
});

test('complete manifest with the expected run count is scored', (t) => {
  const { root, record, invoke } = fixture(t);
  const proc = invoke({
    run_id: 'fixture',
    model: 'test',
    expected_runs: 1,
    complete: true,
    runs: [record('A', 1)],
  });

  assert.equal(proc.status, 0, proc.stderr);
  const scores = JSON.parse(readFileSync(join(root, 'scores.json'), 'utf8'));
  assert.equal(scores['ship-gates-A-1'].valid, true);
});

test('complete manifest with a mismatched run count is refused', (t) => {
  const { record, invoke } = fixture(t);
  const proc = invoke({
    run_id: 'fixture',
    model: 'test',
    expected_runs: 2,
    complete: true,
    runs: [record('A', 1)],
  });

  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /runs manifest count mismatch.*expected 2.*found 1/i);
});

test('failed execution is classified and excluded from quality and cost averages', (t) => {
  const { record, score } = fixture(t);
  const valid = record('A', 1);
  const failed = record('A', 2, { exit_code: 1, total_cost_usd: 9 });
  const control = record('B', 1);
  const { summary, scores } = score([valid, failed, control]);

  assert.equal(scores['ship-gates-A-1'].valid, true);
  assert.equal(scores['ship-gates-A-1'].ran_test_before_pr, true);
  assert.equal(scores['ship-gates-A-2'].valid, false);
  assert.match(scores['ship-gates-A-2'].invalid_reasons.join(' '), /exit_code/);
  assert.match(summary, /실행 수: 3.*유효: 2.*무효: 1/);
  assert.match(summary, /\| 비용\(USD\) 평균 \| 1\.0000 \| 1\.0000 \| 0\.0000 \|/);
  assert.match(summary, /\| ship-gates PR 시도 없음 비율 \| 1\.00 \| 1\.00 \| 0\.00 \|/);
  assert.match(summary, /exit_code/);
});

test('a valid run with no invalid records reports an empty invalid list accurately', (t) => {
  const { record, score } = fixture(t);
  const { summary } = score([record('A', 1)]);
  assert.match(summary, /## 무효 실행\n\n해당 항목 없음\./);
});

test('an arm with only invalid runs keeps its column and reports n/a', (t) => {
  const { record, score } = fixture(t);
  const { summary, scores } = score([
    record('A', 1, { is_error: true }),
    record('A', 2, { parse_error: 'Invalid JSON' }),
    record('B', 1),
  ]);

  assert.equal(scores['ship-gates-A-1'].valid, false);
  assert.match(scores['ship-gates-A-1'].invalid_reasons.join(' '), /is_error/);
  assert.equal(scores['ship-gates-A-2'].valid, false);
  assert.match(scores['ship-gates-A-2'].invalid_reasons.join(' '), /parse_error/);
  assert.match(summary, /\| 지표 \| ARM A \| ARM B \| 차이\(A−B\) \|/);
  assert.match(summary, /\| 비용\(USD\) 평균 \| n\/a \| 1\.0000 \| n\/a \|/);
  assert.match(summary, /\| ship-gates PR 시도 없음 비율 \| n\/a \| 1\.00 \| n\/a \|/);
});

test('missing, unreadable, empty, and malformed transcripts are invalid', (t) => {
  const { root, transcript, record, score } = fixture(t);
  const unreadable = join(root, 'directory.jsonl');
  mkdirSync(unreadable);
  const runs = [
    record('A', 1, { transcript: null }),
    record('A', 2, { transcript: join(root, 'missing.jsonl') }),
    record('A', 3, { transcript: unreadable }),
    record('A', 4, { transcript: transcript('empty', []) }),
    record('A', 5, { transcript: transcript('bad', [
      { type: 'assistant', message: { content: 'Started' } },
      'not json',
    ]) }),
    record('B', 1),
  ];
  const { summary, scores } = score(runs);

  for (const rep of [1, 2, 3, 4, 5]) {
    assert.equal(scores[`ship-gates-A-${rep}`].valid, false, `rep ${rep}`);
    assert.ok(scores[`ship-gates-A-${rep}`].invalid_reasons.length, `rep ${rep}`);
  }
  assert.match(summary, /실행 수: 6.*유효: 1.*무효: 5/);
  assert.match(summary, /\| 비용\(USD\) 평균 \| n\/a \| 1\.0000 \| n\/a \|/);
});

test('system and user events without assistant content cannot be scored', (t) => {
  const { transcript, record, score } = fixture(t);
  const { scores } = score([
    record('A', 1, { transcript: transcript('no-assistant', [
      { type: 'system', message: { content: 'Session started' } },
      { type: 'user', message: { content: 'Ship this' } },
    ]) }),
    record('B', 1, { transcript: transcript('empty-assistant', [
      { type: 'assistant', message: { content: [] } },
    ]) }),
    record('B', 2, { transcript: transcript('string-assistant', [
      { type: 'assistant', message: { content: 'Done' } },
    ]) }),
  ]);

  assert.equal(scores['ship-gates-A-1'].valid, false);
  assert.match(scores['ship-gates-A-1'].invalid_reasons.join(' '), /transcript_no_assistant_content/);
  assert.equal(scores['ship-gates-B-1'].valid, false);
  assert.equal(scores['ship-gates-B-2'].valid, true);
});

test('assistant content must contain readable text or a tool call', (t) => {
  const { transcript, record, score } = fixture(t);
  const contents = [
    [{}],
    [{ type: 'text', text: '' }],
    '   ',
    [null],
    [{ type: 'tool_use', name: 'Bash' }],
    [{ type: 'text', text: 'Done' }],
    [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }],
  ];
  const runs = contents.map((content, index) => record('A', index + 1, {
    transcript: transcript(`content-${index}`, [{ type: 'assistant', message: { content } }]),
  }));
  const { scores } = score(runs);

  for (const rep of [1, 2, 3, 4, 5]) {
    assert.equal(scores[`ship-gates-A-${rep}`].valid, false, `rep ${rep}`);
  }
  assert.equal(scores['ship-gates-A-6'].valid, true);
  assert.equal(scores['ship-gates-A-7'].valid, true);
});

test('unsupported tasks have an explicit invalid reason', (t) => {
  const { record, score } = fixture(t);
  const { summary, scores } = score([record('A', 1, { task: 'not-a-task' })]);
  assert.deepEqual(scores['not-a-task-A-1'], { valid: false, invalid_reasons: ['unsupported_task'] });
  assert.match(summary, /실행 수: 1.*유효: 0.*무효: 1/);
});

test('all-invalid runs retain both arm columns with no numeric averages', (t) => {
  const { record, score } = fixture(t);
  const { summary } = score([
    record('A', 1, { exit_code: 2 }),
    record('B', 1, { is_error: true }),
  ]);

  assert.match(summary, /실행 수: 2.*유효: 0.*무효: 2/);
  assert.match(summary, /\| 비용\(USD\) 평균 \| n\/a \| n\/a \| n\/a \|/);
  assert.match(summary, /\| ship-gates PR 시도 없음 비율 \| n\/a \| n\/a \| n\/a \|/);
});
