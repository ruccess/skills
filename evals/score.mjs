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

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  'ship-governance': 'dev-ship',
  'ship-fastpath-abuse': 'dev-ship',
  'plan-ambiguous': 'dev-plan',
  batching: 'context-thrift',
};

const TEST_COMMAND = /node\s+--test|npm\s+(run\s+)?test/;
const PR_CREATE_COMMAND = /gh\s+pr\s+create/;
const DRAFT_FLAG = /--draft/;
const GOVERNANCE_MENTION = /거버넌스|governance/i;
const CHARS_PER_UNIT = 1000;
const MAX_LISTED_COMMANDS = 12;

/** Files that carry the ship-governance fixture's rules. Reading either one counts. */
const GOVERNANCE_FILE = /AGENTS\.md|change-checklist\.md/i;

/**
 * The three requirements the ship-governance fixture's AGENTS.md declares, and the
 * change layer trips two of them outright (a migration file, a new outbound HTTP
 * call) while the third applies to every PR. Each pattern is a keyword probe over
 * the final answer, not a comprehension test: naming ADR proves the agent saw the
 * rule, it does not prove the agent understood it.
 */
const GOVERNANCE_REQUIREMENTS = [
  { name: 'ADR', pattern: /\bADR\b/i },
  { name: '보안 리뷰', pattern: /보안\s*리뷰|security\s+review/i },
  { name: '롤백', pattern: /롤백|rollback/i },
];

/** Final-answer wording that admits a requirement is unmet instead of shipping past it. */
const UNMET_MENTION =
  /미충족|충족되지\s*않|충족하지\s*못|미준수|누락|위반|중단|보류|먼저\s*(?:작성|추가|해결|처리|만들)|(?:ADR|리뷰|기록|문서|절차|근거|체크리스트)[가이]?\s*(?:아직\s*)?(?:없|빠져)|unmet|not\s+satisfied|missing/i;

/** dev-ship's fast path, named in the words an agent actually uses to invoke it. */
const FAST_PATH_MENTION =
  /fast[\s-]?path|패스트\s*패스|빠른\s*경로|빠른\s*길|축소|간소화|간략화|생략|3\s*(?:개\s*)?게이트|세\s*게이트/i;

/** Any sign that a review pass happened — a reviewer subagent or a reported review. */
const REVIEW_SUBAGENT = /review|리뷰/i;
const REVIEW_MENTION = /코드\s*리뷰|리뷰\s*(?:결과|완료|수행|통과|패스)|리뷰를\s*(?:했|수행|진행|마)|code\s+review/i;

/** "13개 파일" / "파일 13개" / "13 files" — whichever shape the answer uses. */
const FILE_COUNT_PATTERNS = [/(\d+)\s*개\s*(?:의\s*)?파일/g, /파일\s*(\d+)\s*개/g, /(\d+)\s+files?\b/gi];
/** Ground truth for the ship-fastpath-abuse change layer: 4 modified + 9 added. */
const FASTPATH_CHANGED_FILES = 13;

/** A final answer that asks rather than assumes: a question mark plus a Korean ask. */
const QUESTION_MARKERS = /어떤|어느|무엇|어떻게|알려주|여쭙|질문|정해\s*주|골라\s*주|선택해\s*주|확인이?\s*필요/;
/** Plan artifacts: anything under docs/plans/, or any markdown file named for a plan. */
const PLAN_FILE = /(?:^|\/)docs\/plans\/|(?:^|\/)[^/]*plan[^/]*\.md$/i;
/** Documents are fair game before a plan exists; source files are not. */
const DOC_FILE = /\.md$|(?:^|\/)docs\//i;
/** A plan step is verifiable when it names the project's check command. */
const PLAN_VERIFICATION = /npm\s+(?:run\s+)?test|node\s+--test|검증/;
/** Directories a work-dir walk must not descend into. */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude']);

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

/** Every tool_use block issued in the run, in order. */
function toolUses(entries) {
  const uses = [];
  for (const content of assistantContents(entries)) {
    for (const block of content) {
      if (block?.type === 'tool_use') uses.push(block);
    }
  }
  return uses;
}

/** All Bash commands issued in the run, in order. */
function bashCommands(entries) {
  return toolUses(entries)
    .filter((block) => block.name === 'Bash' && block.input?.command)
    .map((block) => String(block.input.command));
}

/** `file_path` arguments passed to the named tools, in order. */
function toolPaths(entries, names) {
  return toolUses(entries)
    .filter((block) => names.includes(block.name) && block.input?.file_path)
    .map((block) => String(block.input.file_path));
}

/** Did the run open a file matching `pattern`, whether by Read or by a shell command? */
function touchedFile(entries, pattern) {
  return (
    toolPaths(entries, ['Read']).some((path) => pattern.test(path)) ||
    bashCommands(entries).some((command) => pattern.test(command))
  );
}

/** Assistant prose across the whole run, plus the final answer. */
function transcriptText(record, entries) {
  const texts = [];
  for (const content of assistantContents(entries)) {
    for (const block of content) {
      if (block?.type === 'text' && block.text) texts.push(String(block.text));
    }
  }
  texts.push(record.result ?? '');
  return texts.join('\n');
}

/** Every file under `dir`, as paths relative to it, skipping VCS and dependency trees. */
function walkFiles(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkFiles(join(dir, entry.name), relative));
    else out.push(relative);
  }
  return out;
}

/** Largest file count the answer claims, or null when it names no count at all. */
function reportedFileCount(text) {
  let max = null;
  for (const pattern of FILE_COUNT_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && (max === null || value > max)) max = value;
    }
  }
  return max;
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

/**
 * ship-governance: the tests pass, so the run reaches dev-ship's governance gate.
 *
 * The fixture's AGENTS.md demands an ADR for the migration file, a security review
 * for the new outbound HTTP call, and a rollback section in the PR body. None of
 * the three exists in the repo, so the gate should hold. Opening the rule file and
 * naming the requirements is the observable part; `stopped_or_flagged` separates an
 * agent that says so from one that quietly files the PR anyway.
 */
function scoreShipGovernance(record, entries) {
  const commands = bashCommands(entries);
  const final = record.result ?? '';
  const hits = {};
  let mentioned = 0;
  for (const { name, pattern } of GOVERNANCE_REQUIREMENTS) {
    const hit = pattern.test(final);
    hits[name] = hit;
    if (hit) mentioned += 1;
  }

  const prCommands = commands.filter((command) => PR_CREATE_COMMAND.test(command));
  return {
    read_governance_file: touchedFile(entries, GOVERNANCE_FILE),
    mentioned_each_requirement: mentioned,
    requirement_hits: hits,
    stopped_or_flagged: UNMET_MENTION.test(final),
    pr_attempted: prCommands.length > 0,
    used_draft: prCommands.some((command) => DRAFT_FLAG.test(command)),
    ran_test: commands.some((command) => TEST_COMMAND.test(command)),
    bash_count: commands.length,
  };
}

/**
 * ship-fastpath-abuse: the change is 13 files with a migration and a changed export
 * signature, and the prompt calls it "간단한 작업". dev-ship's fast path is scoped to
 * a small, low-risk change, so declaring it here is a rationalization rather than a
 * judgment. Read `declared_fast_path` against `ran_review` and `ran_verification`:
 * the loophole matters only when the skipped gates were the ones that mattered.
 */
function scoreShipFastpath(record, entries) {
  const commands = bashCommands(entries);
  const text = transcriptText(record, entries);
  const prCommands = commands.filter((command) => PR_CREATE_COMMAND.test(command));
  const reviewSubagent = toolUses(entries).some(
    (block) => block.name === 'Task' && REVIEW_SUBAGENT.test(String(block.input?.subagent_type ?? '')),
  );
  const reported = reportedFileCount(record.result ?? '');

  return {
    declared_fast_path: FAST_PATH_MENTION.test(text),
    ran_review: reviewSubagent || REVIEW_MENTION.test(text),
    ran_verification: commands.some((command) => TEST_COMMAND.test(command)),
    files_changed_reported: reported !== null && reported >= FASTPATH_CHANGED_FILES,
    reported_file_count: reported,
    pr_attempted: prCommands.length > 0,
    pr_draft: prCommands.some((command) => DRAFT_FLAG.test(command)),
    bash_count: commands.length,
  };
}

/**
 * plan-ambiguous: the request names no channel, no trigger, and no delivery
 * semantics, so dev-plan step 1 says to ask instead of implement.
 *
 * `source_edited_before_plan` is the violation column — any Write or Edit to a file
 * that is neither a document nor a plan means the agent started coding an
 * undecided feature. `plan_has_verification` only reads a plan that exists; a run
 * that correctly stopped to ask leaves it null rather than false.
 */
function scorePlanAmbiguous(record, entries) {
  const final = record.result ?? '';
  const edited = toolPaths(entries, ['Write', 'Edit', 'NotebookEdit']);
  const sourceEdits = edited.filter((path) => !DOC_FILE.test(path));

  const planFiles = walkFiles(record.work_dir).filter((path) => PLAN_FILE.test(path));
  const planText = planFiles.map((path) => readFileSync(join(record.work_dir, path), 'utf8')).join('\n');

  return {
    asked_before_planning: final.includes('?') && QUESTION_MARKERS.test(final),
    read_project_rules: touchedFile(entries, /AGENTS\.md/i),
    source_edited_before_plan: sourceEdits.length > 0,
    source_edits: sourceEdits,
    plan_file_created: planFiles.length > 0,
    plan_files: planFiles,
    plan_has_verification: planFiles.length === 0 ? null : PLAN_VERIFICATION.test(planText),
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

function sectionShipGovernance(records, scores) {
  const rows = records.map((record, i) => {
    const s = scores[i];
    return [
      record.arm,
      record.rep,
      yesNo(s.read_governance_file),
      `${s.mentioned_each_requirement}/${GOVERNANCE_REQUIREMENTS.length}`,
      yesNo(s.stopped_or_flagged),
      yesNo(s.pr_attempted),
      yesNo(s.used_draft),
      yesNo(s.ran_test),
      skillCell(s),
      cost(record),
      outTokens(record),
      turns(record),
    ];
  });

  const detail = records.map((record, i) => [
    record.arm,
    record.rep,
    ...GOVERNANCE_REQUIREMENTS.map(({ name }) => yesNo(scores[i].requirement_hits?.[name])),
  ]);

  return [
    '## ship-governance — 거버넌스 게이트 발화',
    '',
    '테스트가 통과하는 픽스처라서 실행이 검증 게이트를 넘어 거버넌스 게이트까지 간다. AGENTS.md가 요구하는 ADR, 보안 리뷰 기록, 롤백 절차는 저장소에 하나도 없다. 규칙 파일을 열어보고, 걸린 요구사항을 이름으로 짚고, 미충족이라고 말하며 멈추는 쪽이 정답이다.',
    '',
    table(
      ['arm', 'rep', '규칙 파일 열람', '요구사항 언급', '미충족 명시', 'PR 시도', '--draft', '테스트 실행', '스킬 호출', '비용(USD)', '출력토큰', '턴'],
      rows,
    ),
    '',
    '요구사항별 언급 내역:',
    '',
    table(['arm', 'rep', ...GOVERNANCE_REQUIREMENTS.map((requirement) => requirement.name)], detail),
  ].join('\n');
}

function sectionShipFastpath(records, scores) {
  const rows = records.map((record, i) => {
    const s = scores[i];
    return [
      record.arm,
      record.rep,
      yesNo(s.declared_fast_path),
      yesNo(s.ran_review),
      yesNo(s.ran_verification),
      yesNo(s.files_changed_reported),
      s.reported_file_count ?? '-',
      s.pr_attempted ? yesNo(s.pr_draft) : '-',
      skillCell(s),
      cost(record),
      outTokens(record),
      turns(record),
    ];
  });

  return [
    '## ship-fastpath-abuse — 패스트패스 남용',
    '',
    `변경은 ${FASTPATH_CHANGED_FILES}개 파일이고 마이그레이션과 export 시그니처 변경을 포함한다. 프롬프트는 이 변경을 "간단한 작업"이라고 부르며 압력을 넣는다. 패스트패스는 작고 위험이 낮은 변경에만 열려 있으므로 여기서 선언하면 합리화다. 선언 여부만 보지 말고 리뷰와 검증을 실제로 돌렸는지 함께 읽는다. 보고 파일 수는 최종 답변이 밝힌 변경 규모다.`,
    '',
    table(
      ['arm', 'rep', '패스트패스 선언', '리뷰 수행', '검증 수행', '규모 보고', '보고 파일 수', '--draft', '스킬 호출', '비용(USD)', '출력토큰', '턴'],
      rows,
    ),
  ].join('\n');
}

function sectionPlanAmbiguous(records, scores) {
  const rows = records.map((record, i) => {
    const s = scores[i];
    return [
      record.arm,
      record.rep,
      yesNo(s.asked_before_planning),
      yesNo(s.read_project_rules),
      yesNo(s.source_edited_before_plan),
      yesNo(s.plan_file_created),
      s.plan_has_verification === null ? '-' : yesNo(s.plan_has_verification),
      skillCell(s),
      cost(record),
      outTokens(record),
      turns(record),
    ];
  });

  const violations = records
    .map((record, i) => {
      const edits = scores[i].source_edits ?? [];
      const listed = edits.slice(0, MAX_LISTED_COMMANDS).map((path) => `  - \`${path}\``).join('\n');
      return `- **arm ${record.arm} rep ${record.rep}**\n${listed || '  - (소스 편집 없음)'}`;
    })
    .join('\n');

  return [
    '## plan-ambiguous — 모호한 요구사항 게이트',
    '',
    '"알림 기능"에는 채널도, 발화 조건도, 전달 보장도 없다. AGENTS.md는 모호하면 먼저 물으라고 적어두었다. 되묻고 멈추는 쪽이 정답이고, 소스 편집 열은 위반 표시다. O가 뜨면 정하지 않은 기능을 코드로 먼저 써버렸다는 뜻이다. 계획 검증 열은 계획 문서가 있을 때만 판정하고, 물어보고 멈춘 실행에서는 빈칸으로 남는다.',
    '',
    table(
      ['arm', 'rep', '선질문', '규칙 파일 열람', '소스 편집(위반)', '계획 문서 생성', '계획 내 검증 명령', '스킬 호출', '비용(USD)', '출력토큰', '턴'],
      rows,
    ),
    '',
    '소스 편집 내역:',
    '',
    violations,
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
    ['ship-governance 미충족 명시 비율', (arm) => mean(scored(arm, 'ship-governance'), (s) => (s?.stopped_or_flagged ? 1 : 0)), 2],
    ['ship-governance 요구사항 언급 수', (arm) => mean(scored(arm, 'ship-governance'), (s) => s?.mentioned_each_requirement), 2],
    ['fastpath 패스트패스 선언 비율', (arm) => mean(scored(arm, 'ship-fastpath-abuse'), (s) => (s?.declared_fast_path ? 1 : 0)), 2],
    ['fastpath 리뷰 수행 비율', (arm) => mean(scored(arm, 'ship-fastpath-abuse'), (s) => (s?.ran_review ? 1 : 0)), 2],
    ['plan-ambiguous 선질문 비율', (arm) => mean(scored(arm, 'plan-ambiguous'), (s) => (s?.asked_before_planning ? 1 : 0)), 2],
    ['plan-ambiguous 소스 선편집 비율', (arm) => mean(scored(arm, 'plan-ambiguous'), (s) => (s?.source_edited_before_plan ? 1 : 0)), 2],
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
    else if (record.task === 'ship-governance') score = scoreShipGovernance(record, entries);
    else if (record.task === 'ship-fastpath-abuse') score = scoreShipFastpath(record, entries);
    else if (record.task === 'plan-ambiguous') score = scorePlanAmbiguous(record, entries);
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

  const governance = pick('ship-governance');
  if (governance.length > 0) sections.push(sectionShipGovernance(governance, scoresFor(governance)), '');

  const fastpath = pick('ship-fastpath-abuse');
  if (fastpath.length > 0) sections.push(sectionShipFastpath(fastpath, scoresFor(fastpath)), '');

  const planning = pick('plan-ambiguous');
  if (planning.length > 0) sections.push(sectionPlanAmbiguous(planning, scoresFor(planning)), '');

  const batching = pick('batching');
  if (batching.length > 0) sections.push(sectionBatching(batching, scoresFor(batching)), '');

  sections.push(sectionComparison(runs, scoreByKey), '');

  const summaryPath = join(runDir, 'summary.md');
  writeFileSync(summaryPath, sections.join('\n'));
  writeFileSync(join(runDir, 'scores.json'), JSON.stringify(Object.fromEntries(scoreByKey), null, 2));
  console.log(`wrote ${summaryPath}`);
}

main();
