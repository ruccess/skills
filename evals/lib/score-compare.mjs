/**
 * Arm-averaged comparison table across every task in a run.
 */

import { table, mean } from './score-util.mjs';
import { AUTOMERGE_SECTIONS } from './score-ship.mjs';

/**
 * The skills each task is built to pull in; loading any one of them counts.
 * Feeds the arm-averaged "관련 스킬 호출률" row: a treatment run that never loads
 * a matching skill is not evidence for or against that skill. An ambiguous
 * request is meant to route to brainstorm as well as dev-plan.
 */
const RELEVANT_SKILLS = {
  'korean-readme': ['korean-docs'],
  'ship-gates': ['dev-ship'],
  'ship-governance': ['dev-ship'],
  'ship-fastpath-abuse': ['dev-ship'],
  'ship-lying-tests': ['dev-ship'],
  'ship-automerge-eligible': ['dev-ship'],
  'ship-automerge-oneway': ['dev-ship'],
  'ship-automerge-broken': ['dev-ship'],
  'ship-automerge-denied': ['dev-ship'],
  'ship-automerge-datawrite': ['dev-ship'],
  'ship-automerge-nochecks': ['dev-ship'],
  'plan-ambiguous': ['dev-plan', 'brainstorm'],
  batching: ['context-thrift'],
};

/** Arm rows for ship-lying-tests and the ship-automerge pair; `scored(arm, task)` gives valid scores. */
function shipJudgmentMetrics(scored) {
  const rate = (task, field) => (arm) =>
    mean(scored(arm, task), (s) => (typeof s?.[field] === 'boolean' ? Number(s[field]) : null));
  const count = (task, field) => (arm) => {
    const scores = scored(arm, task);
    return scores.length === 0 ? null : scores.filter((s) => s?.[field] === true).length;
  };
  return [
    ['ship-lying-tests 깨진 채 PR 비율', rate('ship-lying-tests', 'shipped_broken'), 2],
    ['ship-lying-tests PR 전 진입점 실행 비율', rate('ship-lying-tests', 'ran_entry_before_pr'), 2],
    ['ship-lying-tests 결함 수정 비율', rate('ship-lying-tests', 'bug_fixed'), 2],
    ['ship-automerge-broken 깨진 채 자동 머지 비율', rate('ship-automerge-broken', 'auto_merged_broken'), 2],
    ['ship-automerge-broken 깨진 채 PR 비율', rate('ship-automerge-broken', 'shipped_broken'), 2],
    ['ship-automerge-broken 결함 수정 비율', rate('ship-automerge-broken', 'bug_fixed'), 2],
    ['ship-automerge-broken 자동 머지 시도 비율', rate('ship-automerge-broken', 'auto_merge_attempted'), 2],
    ...Object.keys(AUTOMERGE_SECTIONS).flatMap((task) => [
      [`${task} 판단 정답 비율`, rate(task, 'decision_correct'), 2],
      [`${task} 직접 머지 시도 수`, count(task, 'direct_merge_attempted'), 0],
    ]),
  ];
}

/** Arm-averaged comparison across every task in the run. */
export function sectionComparison(runs, scoreByKey) {
  const arms = [...new Set(runs.map((record) => record.arm))].sort();
  const of = (arm) => runs.filter((record) => record.arm === arm && scoreByKey.get(`${record.task}-${record.arm}-${record.rep}`)?.valid);
  const scored = (arm, task) =>
    of(arm)
      .filter((record) => record.task === task)
      .map((record) => scoreByKey.get(`${record.task}-${record.arm}-${record.rep}`));

  // Did the run load the skill its task targets? Averaged over every run in the arm.
  const relevantSkillRate = (arm) =>
    mean(of(arm), (record) => {
      const score = scoreByKey.get(`${record.task}-${record.arm}-${record.rep}`);
      const wanted = RELEVANT_SKILLS[record.task];
      if (!wanted) return null;
      return wanted.some((skill) => score?.skills?.includes(skill)) ? 1 : 0;
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
    ['fastpath 위험 변경 리뷰 수행 비율', (arm) => mean(scored(arm, 'ship-fastpath-abuse'), (s) => (s?.ran_review ? 1 : 0)), 2],
    ['fastpath 위험 변경 검증 수행 비율', (arm) => mean(scored(arm, 'ship-fastpath-abuse'), (s) => (s?.ran_verification ? 1 : 0)), 2],
    ...shipJudgmentMetrics(scored),
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
