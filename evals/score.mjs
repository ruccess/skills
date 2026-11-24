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
import { skillInvocations } from './lib/transcript.mjs';
import { readJsonl, cost, table } from './lib/score-util.mjs';
import { readGhLog } from './lib/score-gh.mjs';
import { scoreKoreanReadme, scoreShipGates, scoreShipGovernance, scoreShipFastpath, scorePlanAmbiguous, scoreBatching, sectionKoreanReadme, sectionShipGates, sectionShipGovernance, sectionShipFastpath, sectionPlanAmbiguous, sectionBatching } from './lib/score-legacy.mjs';
import { scoreShipLyingTests, scoreShipAutomerge, scoreShipAutomergeBroken, sectionShipLyingTests, sectionShipAutomergeBroken, AUTOMERGE_SECTIONS, sectionShipAutomerge } from './lib/score-ship.mjs';
import { sectionComparison } from './lib/score-compare.mjs';

/** Why a recorded run cannot be scored; empty when it can. `readErrors` are file-read failures. */
function runInvalidReasons(record, readErrors) {
  const reasons = [];
  if (record.exit_code !== 0) reasons.push(`exit_code=${record.exit_code ?? 'null'}`);
  if (record.is_error === true) reasons.push('is_error=true');
  if (record.parse_error != null) reasons.push(`parse_error=${record.parse_error}`);
  return [...reasons, ...readErrors.filter(Boolean)];
}

/** Dispatch a scorable run to its task's scorer; null for a task this scorer does not know. */
function scoreTask(record, entries, ghCalls) {
  switch (record.task) {
    case 'korean-readme': return scoreKoreanReadme(record);
    case 'ship-gates': return scoreShipGates(record, entries);
    case 'ship-governance': return scoreShipGovernance(record, entries);
    case 'ship-fastpath-abuse': return scoreShipFastpath(record, entries);
    case 'ship-lying-tests': return scoreShipLyingTests(record, entries, ghCalls);
    case 'ship-automerge-broken': return scoreShipAutomergeBroken(record, entries, ghCalls);
    case 'ship-automerge-eligible':
    case 'ship-automerge-oneway':
    case 'ship-automerge-denied':
    case 'ship-automerge-datawrite':
    case 'ship-automerge-nochecks': return scoreShipAutomerge(record, entries, ghCalls);
    case 'plan-ambiguous': return scorePlanAmbiguous(record, entries);
    case 'batching': return scoreBatching(entries);
    default: return null;
  }
}

function main() {
  const runDir = resolve(process.argv[2] ?? '');
  const runsFile = join(runDir, 'runs.json');
  if (!existsSync(runsFile)) {
    console.error(`no runs.json at ${runsFile}`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(runsFile, 'utf8'));
  const { run_id: runId, model, runs } = manifest;
  const hasCompletionMetadata = Object.hasOwn(manifest, 'expected_runs') || Object.hasOwn(manifest, 'complete');
  if (hasCompletionMetadata && manifest.complete !== true) {
    console.error(`incomplete runs manifest: ${runs.length} of ${manifest.expected_runs} runs recorded`);
    process.exit(1);
  }
  if (hasCompletionMetadata && manifest.expected_runs !== runs.length) {
    console.error(`runs manifest count mismatch: expected ${manifest.expected_runs}, found ${runs.length}`);
    process.exit(1);
  }
  const runKeys = new Set();
  for (const record of runs) {
    const key = `${record.task}-${record.arm}-${record.rep}`;
    if (runKeys.has(key)) {
      console.error(`duplicate run identity: ${key}`);
      process.exit(1);
    }
    runKeys.add(key);
  }
  const scoreByKey = new Map();
  for (const record of runs) {
    const key = `${record.task}-${record.arm}-${record.rep}`;
    // An external run nobody collected has nothing to score yet.
    if (record.status === 'pending') {
      scoreByKey.set(key, { valid: false, invalid_reasons: ['not_collected'] });
      continue;
    }
    const { entries, error } = readJsonl(record.transcript);
    const ghLog = readGhLog(record.gh_log);
    const invalidReasons = runInvalidReasons(record, [error, ghLog.error]);
    if (invalidReasons.length > 0) {
      scoreByKey.set(key, { valid: false, invalid_reasons: invalidReasons });
      continue;
    }
    let score = scoreTask(record, entries, ghLog.calls);
    if (!score) score = { valid: false, invalid_reasons: ['unsupported_task'] };
    else {
      score.valid = true;
      // An external executor loads skills by reading SKILL.md, not through the Skill tool.
      const skillsDir = record.executor === 'external' ? record.skills_dir : null;
      score.skills = skillInvocations(entries, { skillsDir });
    }
    scoreByKey.set(key, score);
  }

  const pick = (task) => runs.filter((record) => record.task === task && scoreByKey.get(`${record.task}-${record.arm}-${record.rep}`)?.valid);
  const scoresFor = (records) => records.map((record) => scoreByKey.get(`${record.task}-${record.arm}-${record.rep}`));
  const invalid = runs.filter((record) => scoreByKey.get(`${record.task}-${record.arm}-${record.rep}`)?.valid === false);

  const sections = [
    `# 평가 요약 — ${runId}`,
    '',
    `- 모델: ${model}`,
    `- 실행 수: ${runs.length} (유효: ${runs.length - invalid.length}, 무효: ${invalid.length})`,
    '',
    '## 무효 실행',
    '',
    table(['과제', 'arm', 'rep', '사유', '비용(USD)'], invalid.map((record) => [
      record.task,
      record.arm,
      record.rep,
      scoreByKey.get(`${record.task}-${record.arm}-${record.rep}`).invalid_reasons.join(', '),
      cost(record),
    ])),
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

  const lying = pick('ship-lying-tests');
  if (lying.length > 0) sections.push(sectionShipLyingTests(lying, scoresFor(lying)), '');

  const broken = pick('ship-automerge-broken');
  if (broken.length > 0) sections.push(sectionShipAutomergeBroken(broken, scoresFor(broken)), '');

  for (const task of Object.keys(AUTOMERGE_SECTIONS)) {
    const automerge = pick(task);
    if (automerge.length > 0) sections.push(sectionShipAutomerge(task, automerge, scoresFor(automerge)), '');
  }

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
