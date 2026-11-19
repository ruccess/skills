#!/usr/bin/env node
/**
 * Blind behavior eval for fixed request cases.
 *
 * Usage: node evals/behavior.mjs --cases <file> [--arms none,skill,plugin]
 *          [--model sonnet] [--judge-model sonnet] [--reps 1] [--ids a,b]
 *
 * The generator never sees a case's checks. Each response is then judged in a
 * separate call that sees the request, the response, and the checks — never the
 * arm, the skill name, or any other response. Arms:
 *   none   = claude -p --setting-sources project,local ... <prompt>
 *   skill  = none + --append-system-prompt <skills/<skill>/SKILL.md>
 *   plugin = none + --plugin-dir <repo>   (natural activation; Skill calls recorded)
 *
 * Every call runs in a fresh tmp folder that is its own git repository, with the
 * same env isolation as run.mjs. Runs are sequential. Zero dependencies by design.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSandboxRoot, initStandaloneRepo, isolatedEnv } from './lib/isolation.mjs';
import { findTranscript, readTranscriptEntries, skillInvocations } from './lib/transcript.mjs';

const EVALS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(EVALS_DIR);
const SKILLS_DIR = join(REPO_ROOT, 'skills');
const RESULTS_DIR = join(EVALS_DIR, 'results');

const ARMS = ['none', 'skill', 'plugin'];
const DEFAULTS = Object.freeze({ arms: ARMS.join(','), model: 'sonnet', 'judge-model': 'sonnet', reps: '1' });
const KNOWN_FLAGS = new Set(['cases', 'arms', 'model', 'judge-model', 'reps', 'ids']);
const GENERATION_MAX_TURNS = '4';
const JUDGE_MAX_TURNS = '1';
const STDOUT_BUFFER_BYTES = 64 * 1024 * 1024;
const SANDBOX_COMMIT = 'chore: empty behavior sandbox';

/** Parse `--key value` pairs strictly: unknown flags and missing values are errors. */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`unexpected argument "${token}"`);
    const key = token.slice(2);
    if (!KNOWN_FLAGS.has(key)) throw new Error(`unknown option --${key}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${key} needs a value`);
    if (Object.hasOwn(args, key)) throw new Error(`--${key} given twice`);
    args[key] = value;
    i += 1;
  }
  return { ...DEFAULTS, ...args };
}

const splitList = (value) =>
  String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function assertUnique(label, values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label} "${value}"`);
    seen.add(value);
  }
}

/** Validate one case and return a normalized copy. */
function normalizeCase(raw, index) {
  const where = `case #${index + 1}`;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${where} is not an object`);
  const { id, skill, prompt, context, checks } = raw;
  if (typeof id !== 'string' || !id.trim()) throw new Error(`${where} needs a non-empty string id`);
  if (typeof skill !== 'string' || !skill.trim()) throw new Error(`case "${id}" needs a skill`);
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error(`case "${id}" needs a prompt`);
  if (context !== undefined && typeof context !== 'string') throw new Error(`case "${id}" context must be a string`);
  if (!Array.isArray(checks) || checks.length === 0 || !checks.every((check) => typeof check === 'string' && check.trim())) {
    throw new Error(`case "${id}" needs a non-empty array of string checks`);
  }
  return { id, skill, prompt, context: context ?? null, checks: [...checks] };
}

/** Accept either `[case, ...]` or `{ cases: [case, ...] }`. */
function loadCases(path) {
  if (!existsSync(path)) throw new Error(`cases file not found: ${path}`);
  const text = readFileSync(path, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`cases file is not valid JSON: ${error.message}`);
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.cases;
  if (!Array.isArray(list) || list.length === 0) throw new Error('cases file must be a non-empty array or { "cases": [...] }');
  const cases = list.map(normalizeCase);
  assertUnique('case id', cases.map((item) => item.id));
  return { cases, sha: sha256(text) };
}

/** Resolve and validate every option before any Claude call. */
function resolveOptions(argv) {
  const args = parseArgs(argv);
  if (!args.cases) throw new Error('--cases <file> is required');
  const arms = splitList(args.arms);
  if (arms.length === 0) throw new Error('--arms needs at least one arm');
  for (const arm of arms) {
    if (!ARMS.includes(arm)) throw new Error(`unknown arm "${arm}" (expected ${ARMS.join(', ')})`);
  }
  assertUnique('arm', arms);
  if (!/^[1-9]\d*$/.test(args.reps)) throw new Error(`--reps must be a positive integer, got "${args.reps}"`);
  const model = args.model.trim();
  const judgeModel = args['judge-model'].trim();
  if (!model || !judgeModel) throw new Error('--model and --judge-model must be non-empty');

  const casesFile = resolve(args.cases);
  const { cases: allCases, sha } = loadCases(casesFile);
  let cases = allCases;
  if (args.ids !== undefined) {
    const ids = splitList(args.ids);
    if (ids.length === 0) throw new Error('--ids needs at least one id');
    assertUnique('id in --ids', ids);
    const known = new Set(allCases.map((item) => item.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) throw new Error(`unknown case id: ${missing.join(', ')}`);
    cases = allCases.filter((item) => ids.includes(item.id));
  }

  const skills = loadSkills(cases, arms.includes('skill'));
  return { arms, reps: Number(args.reps), model, judgeModel, casesFile, casesSha: sha, cases, skills };
}

/** SKILL.md text per referenced skill. Missing files are fatal only for the skill arm. */
function loadSkills(cases, required) {
  const skills = {};
  for (const name of new Set(cases.map((item) => item.skill))) {
    const path = join(SKILLS_DIR, name, 'SKILL.md');
    if (!existsSync(path)) {
      if (required) throw new Error(`skill arm needs ${path}`);
      continue;
    }
    const text = readFileSync(path, 'utf8');
    skills[name] = { path, text, sha256: sha256(text) };
  }
  return skills;
}

/** The user turn the generator and the judge both see. Checks never go in here. */
const userPrompt = (item) => (item.context ? `${item.prompt}\n\n[상황]\n${item.context}` : item.prompt);

function generationArgs(arm, item, model, skills) {
  const args = ['-p', '--setting-sources', 'project,local', '--model', model, '--output-format', 'json', '--max-turns', GENERATION_MAX_TURNS];
  if (arm === 'skill') args.push('--append-system-prompt', skills[item.skill].text);
  if (arm === 'plugin') args.push('--plugin-dir', REPO_ROOT);
  args.push(userPrompt(item));
  return args;
}

/**
 * The judge sees the request, one response, and the checks. Nothing in it may
 * reveal which arm produced the response or which skill the case targets.
 */
function judgePrompt(item, response) {
  const checks = item.checks.map((check, index) => `${index + 1}. ${check}`).join('\n');
  return [
    '당신은 채점자다. 아래 요청에 대한 응답 하나를 판정 기준마다 통과 또는 실패로 판정한다.',
    '응답에 실제로 드러난 내용만 근거로 삼는다. 응답이 하겠다고 말만 한 것은 한 것으로 보지 않는다.',
    '',
    '<요청>',
    item.prompt,
    '</요청>',
    ...(item.context ? ['', '<상황>', item.context, '</상황>'] : []),
    '',
    '<응답>',
    response,
    '</응답>',
    '',
    '<판정 기준>',
    checks,
    '</판정 기준>',
    '',
    `출력은 JSON 배열 하나만 낸다. 원소는 판정 기준과 같은 순서로 정확히 ${item.checks.length}개다.`,
    '각 원소의 형식은 {"criterion": "<기준 문구>", "passed": true 또는 false, "reason": "<한 문장 근거>"} 이다.',
    '배열 밖에 다른 글을 쓰지 않는다.',
  ].join('\n');
}

const judgeArgs = (judgeModel, prompt) =>
  ['-p', '--setting-sources', 'project,local', '--model', judgeModel, '--output-format', 'json', '--max-turns', JUDGE_MAX_TURNS, prompt];

/** Pull the single `result` envelope out of stdout, tolerating array-shaped output. */
function parseEnvelope(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) return parsed.find((item) => item?.type === 'result') ?? null;
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Run `claude` in a fresh sandbox folder and summarize the outcome. The folder
 * name is random on purpose: the model sees its cwd, so a name built from the
 * case, arm, or skill would leak the condition to the judge.
 */
function callClaude(args, sandboxRoot) {
  const callDir = mkdtempSync(join(sandboxRoot, 'call-'));
  const workDir = join(callDir, 'work');
  const ghConfigDir = join(callDir, 'gh');
  mkdirSync(workDir);
  mkdirSync(ghConfigDir);
  initStandaloneRepo(workDir, SANDBOX_COMMIT);

  const startedAt = Date.now();
  const proc = spawnSync('claude', args, {
    cwd: workDir,
    encoding: 'utf8',
    env: isolatedEnv(ghConfigDir),
    maxBuffer: STDOUT_BUFFER_BYTES,
  });
  const envelope = parseEnvelope(proc.stdout ?? '');
  const result = typeof envelope?.result === 'string' ? envelope.result : '';
  let failure = null;
  if (proc.error) failure = `spawn_error=${proc.error.message}`;
  else if (proc.status !== 0) failure = `exit_code=${proc.status ?? 'null'}`;
  else if (!envelope) failure = 'unparseable_output';
  else if (envelope.is_error === true) failure = `is_error (${envelope.subtype ?? 'unknown'})`;
  else if (!result.trim()) failure = 'empty_result';

  return {
    work_dir: workDir,
    exit_code: proc.status,
    is_error: envelope?.is_error ?? null,
    subtype: envelope?.subtype ?? null,
    session_id: envelope?.session_id ?? null,
    total_cost_usd: typeof envelope?.total_cost_usd === 'number' ? envelope.total_cost_usd : null,
    wall_ms: Date.now() - startedAt,
    result,
    failure,
    ...(envelope ? {} : { stderr: (proc.stderr ?? '').slice(-2000), stdout_head: (proc.stdout ?? '').slice(0, 2000) }),
  };
}

/** Candidate texts that may hold the verdict array, most direct first. */
function* jsonArrayCandidates(text) {
  yield text.trim();
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) yield match[1].trim();
  const starts = [];
  for (let i = text.indexOf('['); i !== -1; i = text.indexOf('[', i + 1)) starts.push(i);
  const end = text.lastIndexOf(']');
  for (const start of starts) {
    for (let stop = end; stop > start; stop = text.lastIndexOf(']', stop - 1)) yield text.slice(start, stop + 1);
  }
}

/** First JSON array of objects found in `text`, or null. */
function extractJsonArray(text) {
  for (const candidate of jsonArrayCandidates(String(text ?? ''))) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))) {
        return parsed;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/** Validate the judge output against the case's checks. */
function readVerdicts(text, checks) {
  const parsed = extractJsonArray(text);
  if (!parsed) return { verdicts: null, failure: 'judge_unparseable' };
  if (parsed.length !== checks.length) {
    return { verdicts: null, failure: `judge_length_mismatch (${parsed.length} != ${checks.length})` };
  }
  if (!parsed.every((item) => typeof item.passed === 'boolean')) return { verdicts: null, failure: 'judge_passed_not_boolean' };
  const verdicts = parsed.map((item, index) => ({
    criterion: checks[index],
    judge_criterion: typeof item.criterion === 'string' ? item.criterion : null,
    passed: item.passed,
    reason: typeof item.reason === 'string' ? item.reason : null,
  }));
  return { verdicts, failure: null };
}

/** Generate, then judge, one (case, arm, rep). */
function executeRun(item, arm, rep, options, sandboxRoot) {
  const record = { case_id: item.id, arm, rep, status: 'ok', invalid_reason: null, passed: 0, total: item.checks.length };

  const generation = callClaude(generationArgs(arm, item, options.model, options.skills), sandboxRoot);
  record.generation = { ...generation, result: undefined };
  record.response = generation.result;
  if (arm === 'plugin') {
    const transcript = findTranscript(generation.work_dir, generation.session_id);
    record.transcript_source = transcript;
    record.skills = transcript ? skillInvocations(readTranscriptEntries(transcript)) : null;
  }
  if (generation.failure) {
    return { ...record, status: 'generation_invalid', invalid_reason: generation.failure, judge: null };
  }

  const judge = callClaude(judgeArgs(options.judgeModel, judgePrompt(item, generation.result)), sandboxRoot);
  const { verdicts, failure } = judge.failure ? { verdicts: null, failure: judge.failure } : readVerdicts(judge.result, item.checks);
  record.judge = { ...judge, raw: judge.result, result: undefined, verdicts };
  if (failure) return { ...record, status: 'judge_invalid', invalid_reason: failure };
  return { ...record, passed: verdicts.filter((verdict) => verdict.passed).length };
}

const runCost = (record) => (record.generation?.total_cost_usd ?? 0) + (record.judge?.total_cost_usd ?? 0);
const usd = (value) => `$${value.toFixed(4)}`;

function progressLine(index, total, record) {
  const outcome = record.status === 'ok' ? `${record.passed}/${record.total}` : `${record.status} (${record.invalid_reason})`;
  const skills = record.arm === 'plugin' ? ` skills=${record.skills ? record.skills.join(',') || '-' : '?'}` : '';
  return `[${index}/${total}] ${record.case_id} arm=${record.arm} rep=${record.rep} ${outcome} ${usd(runCost(record))}${skills}`;
}

function table(headers, rows) {
  if (rows.length === 0) return '해당 항목 없음.';
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

const escapeCell = (text) => String(text).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

/** Render summary.md from the finished report. */
function renderSummary(report) {
  const { arms, cases, runs } = report;
  const of = (caseId, arm) => runs.filter((record) => record.case_id === caseId && record.arm === arm);
  const cell = (records, checks) => {
    const passed = records.reduce((sum, record) => sum + record.passed, 0);
    const invalid = records.filter((record) => record.status !== 'ok').length;
    const total = checks * records.length;
    return { passed, total, invalid, text: `${passed}/${total}${invalid ? ` (무효 ${invalid})` : ''}` };
  };

  const caseRows = cases.map((item) => [item.id, ...arms.map((arm) => cell(of(item.id, arm), item.checks.length).text)]);
  const armRows = arms.map((arm) => {
    const records = runs.filter((record) => record.arm === arm);
    const passed = records.reduce((sum, record) => sum + record.passed, 0);
    const total = records.reduce((sum, record) => sum + record.total, 0);
    const invalid = records.filter((record) => record.status !== 'ok').length;
    return [arm, String(passed), String(total), String(invalid)];
  });

  // A criterion splits when arms with valid verdicts reach different pass rates.
  const splitRows = [];
  for (const item of cases) {
    item.checks.forEach((check, index) => {
      const perArm = arms.map((arm) => {
        const judged = of(item.id, arm).filter((record) => record.status === 'ok');
        const passes = judged.filter((record) => record.judge.verdicts[index].passed).length;
        return { passes, judged: judged.length };
      });
      const rates = perArm.filter((entry) => entry.judged > 0).map((entry) => entry.passes / entry.judged);
      if (rates.length >= 2 && new Set(rates).size > 1) {
        splitRows.push([item.id, escapeCell(check), ...perArm.map((entry) => (entry.judged ? `${entry.passes}/${entry.judged}` : 'n/a'))]);
      }
    });
  }

  const invalidRows = runs
    .filter((record) => record.status !== 'ok')
    .map((record) => [record.case_id, record.arm, String(record.rep), record.status, escapeCell(record.invalid_reason)]);
  const generationCost = runs.reduce((sum, record) => sum + (record.generation?.total_cost_usd ?? 0), 0);
  const judgeCost = runs.reduce((sum, record) => sum + (record.judge?.total_cost_usd ?? 0), 0);
  const count = (status) => runs.filter((record) => record.status === status).length;

  const sections = [
    `# 행동 평가 요약 — ${report.run_id}`,
    '',
    `- 생성 모델: ${report.model}`,
    `- 판정 모델: ${report.judge_model}`,
    `- 사례 파일: ${report.cases_file} (sha256 ${report.cases_sha256.slice(0, 12)})`,
    `- 실행 수: ${runs.length} / 예정 ${report.expected_runs} (유효: ${count('ok')}, 생성 무효: ${count('generation_invalid')}, 판정 무효: ${count('judge_invalid')})`,
    `- 총비용(USD): ${usd(generationCost + judgeCost)} (생성 ${usd(generationCost)}, 판정 ${usd(judgeCost)})`,
    '',
    '통과 수는 판정자가 통과로 본 기준 수다. 전체는 기준 수 × 반복 수이고 무효 실행도 분모에 남는다.',
    '',
    '## 사례별 통과 수',
    '',
    table(['사례', ...arms], caseRows),
    '',
    '## arm 합계',
    '',
    table(['arm', '통과', '전체', '무효 실행'], armRows),
    '',
    '## arm 간 판정이 갈린 기준',
    '',
    '갈린 기준은 판정자도 틀릴 수 있으므로 behavior.json의 응답 전문을 직접 읽는다.',
    '',
    table(['사례', '기준', ...arms], splitRows),
    '',
    '## 무효 실행',
    '',
    table(['사례', 'arm', 'rep', '분류', '사유'], invalidRows),
    '',
  ];

  if (arms.includes('plugin')) {
    const skillRows = runs
      .filter((record) => record.arm === 'plugin')
      .map((record) => [record.case_id, String(record.rep), cases.find((item) => item.id === record.case_id).skill,
        record.skills ? record.skills.join(', ') || '없음' : '전사 없음']);
    sections.push('## plugin arm 스킬 호출', '', table(['사례', 'rep', '겨냥 스킬', '호출된 스킬'], skillRows), '');
  }
  return sections.join('\n');
}

function main() {
  const options = resolveOptions(process.argv.slice(2));
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  mkdirSync(RESULTS_DIR, { recursive: true });
  const runRoot = mkdtempSync(join(RESULTS_DIR, `behavior-${timestamp}-`));
  const runId = basename(runRoot);
  const sandboxRoot = createSandboxRoot('behavior');
  const total = options.cases.length * options.arms.length * options.reps;

  const report = {
    run_id: runId,
    model: options.model,
    judge_model: options.judgeModel,
    cases_file: options.casesFile,
    cases_sha256: options.casesSha,
    skill_sha256: Object.fromEntries(Object.entries(options.skills).map(([name, skill]) => [name, skill.sha256])),
    arms: options.arms,
    reps: options.reps,
    sandbox_root: sandboxRoot,
    expected_runs: total,
    complete: false,
    cases: options.cases,
    runs: [],
  };
  const write = () => writeFileSync(join(runRoot, 'behavior.json'), JSON.stringify(report, null, 2));
  write();
  console.log(`run-id ${runId} — ${total} runs (model=${options.model}, judge=${options.judgeModel}, arms=${options.arms.join(',')}, reps=${options.reps})`);

  let index = 0;
  for (const item of options.cases) {
    for (const arm of options.arms) {
      for (let rep = 1; rep <= options.reps; rep += 1) {
        index += 1;
        const record = executeRun(item, arm, rep, options, sandboxRoot);
        report.runs.push(record);
        report.complete = report.runs.length === total;
        write();
        console.log(progressLine(index, total, record));
      }
    }
  }

  writeFileSync(join(runRoot, 'summary.md'), renderSummary(report));
  console.log(`\ndone — ${resolve(runRoot)}`);
}

try {
  main();
} catch (error) {
  console.error(`behavior eval failed: ${error.message}`);
  process.exitCode = 1;
}
