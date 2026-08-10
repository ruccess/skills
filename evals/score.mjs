#!/usr/bin/env node
/**
 * Scorer for an A/B eval run produced by run.mjs.
 *
 * Usage: node evals/score.mjs evals/results/<run-id>
 *
 * Reads runs.json plus each run's transcript.jsonl and work dir, computes one
 * metric block per task, and writes summary.md next to runs.json. Every metric is
 * a proxy — see evals/README.md for what each one can and cannot tell you.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Korean prose smells the korean-docs skill targets. Three families:
 *   - 번역투 (translationese particles lifted from English/Japanese)
 *   - 이중 피동 / 영어식 소유 구문
 *   - AI 상투어 (filler adjectives and hedges that carry no information)
 * These are proxies: a low count does not prove good prose, but a high count
 * reliably marks the machine-translated register the skill tells the agent to avoid.
 */
const PROSE_PATTERNS = [
  { name: '에 대해', pattern: /에 대해/g },
  { name: '을/를 통해', pattern: /[을를] 통해/g },
  { name: '에 있어서', pattern: /에 있어서/g },
  { name: '이중 피동', pattern: /되어진|보여진/g },
  { name: '가지고 있', pattern: /가지고 있/g },
  { name: 'AI 상투어', pattern: /핵심적|효과적|혁신적|원천적/g },
  { name: '결론적으로', pattern: /결론적으로/g },
  { name: '할 수 있을 것', pattern: /할 수 있을 것/g },
];

/**
 * The skill each task is built to pull in. Feeds the arm-averaged
 * "관련 스킬 호출률" row: a treatment run that never loads the matching skill
 * is not evidence for or against that skill.
 */
const RELEVANT_SKILL = {
  'korean-readme': 'korean-docs',
  'ship-gates': 'dev-ship',
  batching: 'context-thrift',
};

const TEST_COMMAND = /node\s+--test|npm\s+(run\s+)?test/;
const PR_CREATE_COMMAND = /gh\s+pr\s+create/;
const DRAFT_FLAG = /--draft/;
const GOVERNANCE_MENTION = /거버넌스|governance/i;
const CHARS_PER_UNIT = 1000;
const MAX_LISTED_COMMANDS = 12;

/** Read a .jsonl file into an array of parsed objects, skipping malformed lines. */
function readJsonl(path) {
  if (!path || !existsSync(path)) return [];
  const out = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // A transcript can be truncated mid-write; a dropped line is not worth failing on.
    }
  }
  return out;
}

/** Every assistant message content array in transcript order. */
function assistantContents(entries) {
  return entries
    .filter((entry) => entry?.type === 'assistant' && Array.isArray(entry?.message?.content))
    .map((entry) => entry.message.content);
}

/** All Bash commands issued in the run, in order. */
function bashCommands(entries) {
  const commands = [];
  for (const content of assistantContents(entries)) {
    for (const block of content) {
      if (block?.type === 'tool_use' && block.name === 'Bash' && block.input?.command) {
        commands.push(String(block.input.command));
      }
    }
  }
  return commands;
}

/**
 * Skill names loaded during the run, in first-seen order.
 *
 * The Skill tool records its target as `input.skill`, e.g. "ruccess:dev-ship".
 * The plugin prefix is stripped so the control arm (which cannot load plugin
 * skills at all) and the treatment arm print comparable names.
 */
function skillInvocations(entries) {
  const seen = [];
  for (const content of assistantContents(entries)) {
    for (const block of content) {
      if (block?.type !== 'tool_use' || block.name !== 'Skill') continue;
      const raw = block.input?.skill ?? block.input?.command ?? block.input?.name;
      if (!raw) continue;
      const name = String(raw).replace(/^ruccess:/, '');
      if (!seen.includes(name)) seen.push(name);
    }
  }
  return seen;
}

/** Drop fenced code blocks so code samples do not count as prose violations. */
const stripCodeFences = (text) => text.replace(/```[\s\S]*?```/g, '');

/** korean-readme: regex violation counts over the produced README.md. */
function scoreKoreanReadme(record) {
  const readmePath = join(record.work_dir, 'README.md');
  if (!existsSync(readmePath)) return { missing: true };

  const prose = stripCodeFences(readFileSync(readmePath, 'utf8'));
  const perPattern = {};
  let total = 0;
  for (const { name, pattern } of PROSE_PATTERNS) {
    const hits = prose.match(pattern)?.length ?? 0;
    perPattern[name] = hits;
    total += hits;
  }
  const chars = prose.replace(/\s/g, '').length;
  return {
    missing: false,
    total,
    chars,
    per_1000: chars === 0 ? 0 : (total * CHARS_PER_UNIT) / chars,
    per_pattern: perPattern,
  };
}

/** ship-gates: did the agent gate the PR on a passing test run? */
function scoreShipGates(record, entries) {
  const commands = bashCommands(entries);
  const firstTest = commands.findIndex((command) => TEST_COMMAND.test(command));
  const firstPr = commands.findIndex((command) => PR_CREATE_COMMAND.test(command));
  const prCommands = commands.filter((command) => PR_CREATE_COMMAND.test(command));

  return {
    // A test ran, and it ran before any PR attempt (or no PR was attempted at all).
    ran_test_before_pr: firstTest !== -1 && (firstPr === -1 || firstTest < firstPr),
    used_draft: prCommands.some((command) => DRAFT_FLAG.test(command)),
    // The fixture's test suite fails, so the correct behavior is to never reach
    // `gh pr create`. Read this together with ran_test_before_pr: stopping without
    // ever running the tests is luck, not judgment.
    stopped_on_failure: firstPr === -1,
    mentioned_governance: GOVERNANCE_MENTION.test(record.result ?? ''),
    bash_count: commands.length,
    commands,
  };
}

/** batching: mean tool_use blocks per tool-carrying assistant message. */
function scoreBatching(entries) {
  let toolUses = 0;
  let messagesWithTools = 0;
  for (const content of assistantContents(entries)) {
    const count = content.filter((block) => block?.type === 'tool_use').length;
    if (count === 0) continue;
    toolUses += count;
    messagesWithTools += 1;
  }
  return {
    tool_uses: toolUses,
    tool_messages: messagesWithTools,
    parallelism: messagesWithTools === 0 ? 0 : toolUses / messagesWithTools,
  };
}

const num = (value, digits = 2) => (typeof value === 'number' ? value.toFixed(digits) : 'n/a');
const cost = (record) => (typeof record.total_cost_usd === 'number' ? record.total_cost_usd.toFixed(4) : 'n/a');
const outTokens = (record) => record.usage?.output_tokens ?? 'n/a';
const turns = (record) => record.num_turns ?? 'n/a';
const yesNo = (value) => (value ? 'O' : 'X');
const skillCell = (score) => (score?.skills?.length ? score.skills.join(', ') : '-');

/** Render a markdown table from a header list and row arrays. */
function table(headers, rows) {
  if (rows.length === 0) return '해당 실행 없음.\n';
  const head = `| ${headers.join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return `${head}\n${rule}\n${body}\n`;
}

/** Mean of the numeric values produced by `pick`, ignoring non-numbers. */
function mean(records, pick) {
  const values = records.map(pick).filter((value) => typeof value === 'number' && !Number.isNaN(value));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sectionKoreanReadme(records, scores) {
  const rows = records.map((record, i) => {
    const s = scores[i];
    if (s.missing) return [record.arm, record.rep, 'README 없음', '-', '-', skillCell(s), cost(record), outTokens(record), turns(record)];
    return [record.arm, record.rep, s.total, num(s.per_1000), s.chars, skillCell(s), cost(record), outTokens(record), turns(record)];
  });

  const detail = records
    .map((record, i) => [record.arm, record.rep, ...PROSE_PATTERNS.map(({ name }) => scores[i].per_pattern?.[name] ?? '-')]);

  return [
    '## korean-readme — 한국어 산문 규칙 위반',
    '',
    '원본 `spec.md`가 번역투로 오염돼 있다. 원문을 베끼면 위반이 올라가고, 교정하면 내려간다.',
    '',
    table(['arm', 'rep', '위반 합계', '1000자당', '공백제외 글자수', '스킬 호출', '비용(USD)', '출력토큰', '턴'], rows),
    '',
    '패턴별 내역:',
    '',
    table(['arm', 'rep', ...PROSE_PATTERNS.map((p) => p.name)], detail),
  ].join('\n');
}

function sectionShipGates(records, scores) {
  const rows = records.map((record, i) => {
    const s = scores[i];
    return [
      record.arm,
      record.rep,
      yesNo(s.ran_test_before_pr),
      yesNo(s.used_draft),
      yesNo(s.stopped_on_failure),
      yesNo(s.mentioned_governance),
      s.bash_count,
      skillCell(s),
      cost(record),
      outTokens(record),
      turns(record),
    ];
  });

  const logs = records
    .map((record, i) => {
      const listed = scores[i].commands
        .slice(0, MAX_LISTED_COMMANDS)
        .map((command) => `  - \`${command.replace(/\n/g, ' ⏎ ').slice(0, 120)}\``)
        .join('\n');
      const extra = scores[i].commands.length > MAX_LISTED_COMMANDS ? `\n  - … 외 ${scores[i].commands.length - MAX_LISTED_COMMANDS}건` : '';
      return `- **arm ${record.arm} rep ${record.rep}**\n${listed || '  - (Bash 호출 없음)'}${extra}`;
    })
    .join('\n');

  return [
    '## ship-gates — 출하 게이트 준수',
    '',
    '테스트가 실패하는 픽스처이므로 `gh pr create` 시도가 없는 쪽이 정답이다. `PR 전 테스트`와 `PR 시도 없음`을 함께 읽어야 판단인지 우연인지 갈린다.',
    '',
    table(['arm', 'rep', 'PR 전 테스트', '--draft', 'PR 시도 없음', '거버넌스 언급', 'Bash 수', '스킬 호출', '비용(USD)', '출력토큰', '턴'], rows),
    '',
    'Bash 호출 순서:',
    '',
    logs,
    '',
  ].join('\n');
}

function sectionBatching(records, scores) {
  const rows = records.map((record, i) => [
    record.arm,
    record.rep,
    scores[i].tool_uses,
    scores[i].tool_messages,
    num(scores[i].parallelism),
    skillCell(scores[i]),
    cost(record),
    outTokens(record),
    turns(record),
  ]);

  return [
    '## batching — 툴 호출 병렬도',
    '',
    '병렬도 = tool_use 블록 총합 / tool_use를 하나 이상 포함한 assistant 메시지 수. 1.00 이면 한 번에 하나씩 호출했다는 뜻이다.',
    '',
    table(['arm', 'rep', 'tool_use 총합', '툴 포함 메시지', '병렬도', '스킬 호출', '비용(USD)', '출력토큰', '턴'], rows),
  ].join('\n');
}

/** Arm-averaged comparison across every task in the run. */
function sectionComparison(runs, scoreByKey) {
  const arms = [...new Set(runs.map((record) => record.arm))].sort();
  const of = (arm) => runs.filter((record) => record.arm === arm);
  const scored = (arm, task) =>
    of(arm)
      .filter((record) => record.task === task)
      .map((record) => scoreByKey.get(`${record.task}-${record.arm}-${record.rep}`));

  // Did the run load the skill its task targets? Averaged over every run in the arm.
  const relevantSkillRate = (arm) =>
    mean(of(arm), (record) => {
      const score = scoreByKey.get(`${record.task}-${record.arm}-${record.rep}`);
      const wanted = RELEVANT_SKILL[record.task];
      if (!wanted) return null;
      return score?.skills?.includes(wanted) ? 1 : 0;
    });

  const metrics = [
    ['관련 스킬 호출률', relevantSkillRate, 2],
    ['비용(USD) 평균', (arm) => mean(of(arm), (r) => r.total_cost_usd), 4],
    ['출력토큰 평균', (arm) => mean(of(arm), (r) => r.usage?.output_tokens), 0],
    ['캐시읽기 토큰 평균', (arm) => mean(of(arm), (r) => r.usage?.cache_read_input_tokens), 0],
    ['턴 수 평균', (arm) => mean(of(arm), (r) => r.num_turns), 1],
    ['소요(초) 평균', (arm) => mean(of(arm), (r) => (r.duration_ms ?? 0) / 1000), 1],
    ['korean-readme 1000자당 위반', (arm) => mean(scored(arm, 'korean-readme'), (s) => s?.per_1000), 2],
    ['batching 병렬도', (arm) => mean(scored(arm, 'batching'), (s) => s?.parallelism), 2],
    ['ship-gates PR 시도 없음 비율', (arm) => mean(scored(arm, 'ship-gates'), (s) => (s?.stopped_on_failure ? 1 : 0)), 2],
  ];

  const rows = metrics.map(([label, compute, digits]) => {
    const values = arms.map((arm) => compute(arm));
    const cells = values.map((value) => (value == null ? 'n/a' : value.toFixed(digits)));
    const diff =
      values.length === 2 && values[0] != null && values[1] != null
        ? (values[0] - values[1]).toFixed(digits)
        : 'n/a';
    return [label, ...cells, diff];
  });

  return [
    '## arm 평균 비교',
    '',
    `A = 스킬 적용(--plugin-dir), B = 대조군. 차이는 A − B.`,
    '',
    table(['지표', ...arms.map((arm) => `ARM ${arm}`), '차이(A−B)'], rows),
  ].join('\n');
}

function main() {
  const runDir = resolve(process.argv[2] ?? '');
  const runsFile = join(runDir, 'runs.json');
  if (!existsSync(runsFile)) {
    console.error(`no runs.json at ${runsFile}`);
    process.exit(1);
  }

  const { run_id: runId, model, runs } = JSON.parse(readFileSync(runsFile, 'utf8'));
  const scoreByKey = new Map();
  for (const record of runs) {
    const entries = readJsonl(record.transcript);
    let score = null;
    if (record.task === 'korean-readme') score = scoreKoreanReadme(record);
    else if (record.task === 'ship-gates') score = scoreShipGates(record, entries);
    else if (record.task === 'batching') score = scoreBatching(entries);
    if (score) score.skills = skillInvocations(entries);
    scoreByKey.set(`${record.task}-${record.arm}-${record.rep}`, score);
  }

  const pick = (task) => runs.filter((record) => record.task === task);
  const scoresFor = (records) => records.map((record) => scoreByKey.get(`${record.task}-${record.arm}-${record.rep}`));

  const sections = [
    `# 평가 요약 — ${runId}`,
    '',
    `- 모델: ${model}`,
    `- 실행 수: ${runs.length}`,
    `- 전사 누락: ${runs.filter((record) => !record.transcript).length}건`,
    '',
  ];

  const korean = pick('korean-readme');
  if (korean.length > 0) sections.push(sectionKoreanReadme(korean, scoresFor(korean)), '');

  const ship = pick('ship-gates');
  if (ship.length > 0) sections.push(sectionShipGates(ship, scoresFor(ship)), '');

  const batching = pick('batching');
  if (batching.length > 0) sections.push(sectionBatching(batching, scoresFor(batching)), '');

  sections.push(sectionComparison(runs, scoreByKey), '');

  const summaryPath = join(runDir, 'summary.md');
  writeFileSync(summaryPath, sections.join('\n'));
  writeFileSync(join(runDir, 'scores.json'), JSON.stringify(Object.fromEntries(scoreByKey), null, 2));
  console.log(`wrote ${summaryPath}`);
}

main();
