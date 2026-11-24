#!/usr/bin/env node
/**
 * External-execution mode, step 1: prepare sandboxes without running Claude.
 *
 * Where `claude -p` cannot run (no login), another agent session performs each
 * run instead. This script seeds every (task, arm, rep) exactly like run.mjs,
 * writes a prompt file and a shell isolation file per run, and leaves records in
 * status "pending". collect.mjs attaches each transcript afterwards, and
 * score.mjs scores the result folder as usual.
 *
 * An arm's condition is a skills folder (or none). The folder is copied into the
 * sandbox under its content hash so the path the agent reads does not name the arm.
 */

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSandboxRoot, isolationScript, setupFakeGh } from './lib/isolation.mjs';
import { assertUnique, createRunRoot, loadTask, parseArgs, seedRun, splitList } from './lib/seed.mjs';

const EVALS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(EVALS_DIR);
const TASKS_DIR = join(EVALS_DIR, 'tasks');
const RESULTS_DIR = join(EVALS_DIR, 'results');

const DEFAULT_MODEL = 'sonnet';
const EXECUTOR = 'external';
const NO_SKILLS = 'none';
const HASH_PREFIX_LENGTH = 12;
const DEFAULT_SKILLS = Object.freeze({ A: join(REPO_ROOT, 'skills'), B: NO_SKILLS });

/** Every regular file under `dir`, as sorted forward-slash relative paths. */
function listFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath ?? entry.path, entry.name)).split(sep).join('/'))
    .sort();
}

/** sha256 over sorted relative paths and contents (NUL-separated). */
function hashSkills(dir) {
  const hash = createHash('sha256');
  for (const file of listFiles(dir)) {
    hash.update(`${file}\0`);
    hash.update(readFileSync(join(dir, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** Resolve each arm's skills source folder (null = no skills); fail on a missing one. */
function resolveArmSources(arms, args) {
  return Object.fromEntries(arms.map((arm) => {
    const value = args[`skills-${arm}`] ?? DEFAULT_SKILLS[arm];
    if (value === undefined) throw new Error(`arm "${arm}" needs --skills-${arm} <dir|none>`);
    if (value === NO_SKILLS) return [arm, null];
    const dir = resolve(value);
    if (!existsSync(dir)) throw new Error(`skills folder for arm ${arm} does not exist: ${dir}`);
    return [arm, dir];
  }));
}

/** Fail before any folder is created when a skill arm meets a task it cannot route. */
function validateEntrySkills(tasks, armSources) {
  for (const [arm, source] of Object.entries(armSources)) {
    if (!source) continue;
    for (const task of tasks) {
      if (!task.entry_skill) throw new Error(`task "${task.name}" has no entry_skill for skill arm ${arm}`);
      if (!existsSync(join(source, task.entry_skill, 'SKILL.md'))) {
        throw new Error(`arm ${arm} skills folder has no ${task.entry_skill}/SKILL.md`);
      }
    }
  }
}

/** Copy each skill arm's folder to <sandbox>/skillsets/<hash prefix>/ and describe it. */
function installSkillsets(armSources, sandboxRoot) {
  return Object.fromEntries(Object.entries(armSources).map(([arm, source]) => {
    if (!source) return [arm, Object.freeze({ skills_dir: null })];
    const sha256 = hashSkills(source);
    const target = join(sandboxRoot, 'skillsets', sha256.slice(0, HASH_PREFIX_LENGTH));
    if (!existsSync(target)) cpSync(source, target, { recursive: true });
    return [arm, Object.freeze({ skills_dir: target, skills_sha256: sha256 })];
  }));
}

/** The instructions an external agent session receives for one run. */
function buildPrompt(task, workDir, envFile, skillsDir) {
  const lines = [
    `작업 저장소: ${workDir}`,
    `이 디렉터리가 저장소 루트다. Bash 명령은 매번 \`cd ${workDir} && . ${envFile} && <명령>\` 형태로 실행하라(샌드박스 격리용이다). 이 디렉터리 밖의 파일은 수정하지 말고 새 원격 저장소를 만들지 마라. Skill 도구는 쓰지 마라.`,
  ];
  if (skillsDir) {
    lines.push(`먼저 ${skillsDir}/${task.entry_skill}/SKILL.md를 읽고 그 절차를 따르라. 그 문서가 다른 스킬을 가리키면 ${skillsDir}/<이름>/SKILL.md를 읽어라.`);
  }
  return `${lines.join('\n')}\n\n요청: ${task.prompt}\n`;
}

/** Seed one (task, arm, rep) and write its env and prompt files. Returns the record. */
function prepareRun(context, task, arm, rep) {
  const { model, runRoot, sandboxRoot, skillsets } = context;
  const key = `${task.name}-${arm}-${rep}`;
  const { sandboxId, workDir, ghConfigDir, resultDir } = seedRun(task, key, runRoot, sandboxRoot);
  const fakeGh = task.fake_gh ? setupFakeGh(sandboxRoot, sandboxId, task.fake_gh_required_checks) : null;

  const envFile = join(sandboxRoot, 'env', `${sandboxId}.sh`);
  mkdirSync(dirname(envFile), { recursive: true });
  writeFileSync(envFile, isolationScript(ghConfigDir, fakeGh));

  const { skills_dir: skillsDir, skills_sha256: skillsSha256 = null } = skillsets[arm];
  const realWorkDir = realpathSync(workDir);
  const prompt = buildPrompt(task, realWorkDir, envFile, skillsDir);
  // The executor hands the agent the sandbox copy, whose path names no task or arm;
  // the result-folder copy stays next to the transcript for review.
  const promptFile = join(sandboxRoot, 'prompts', `${sandboxId}.txt`);
  mkdirSync(dirname(promptFile), { recursive: true });
  writeFileSync(promptFile, prompt);
  writeFileSync(join(resultDir, 'prompt.txt'), prompt);

  return {
    task: task.name,
    arm,
    rep,
    model,
    executor: EXECUTOR,
    status: 'pending',
    sandbox_id: sandboxId,
    work_dir: realWorkDir,
    result_dir: resultDir,
    env_file: envFile,
    prompt_file: promptFile,
    gh_log: fakeGh?.logFile ?? null,
    skills_dir: skillsDir,
    skills_sha256: skillsSha256,
  };
}

/** Validate the selection; everything here runs before any folder is created. */
function readSelection(args) {
  if (!args.tasks) throw new Error('--tasks is required');
  const taskNames = splitList(args.tasks);
  const arms = args.arms ? splitList(args.arms) : ['A', 'B'];
  const reps = Number(args.reps ?? 1);
  assertUnique('task', taskNames);
  assertUnique('arm', arms);
  if (!Number.isInteger(reps) || reps < 1) throw new Error(`--reps must be a positive integer, got ${args.reps}`);
  const tasks = taskNames.map((name) => loadTask(TASKS_DIR, name));
  const armSources = resolveArmSources(arms, args);
  validateEntrySkills(tasks, armSources);
  return { tasks, arms, reps, armSources, model: args.model ?? DEFAULT_MODEL };
}

function main() {
  const { tasks, arms, reps, armSources, model } = readSelection(parseArgs(process.argv.slice(2)));
  const { runRoot, runId } = createRunRoot(RESULTS_DIR);
  // Resolved once so every path handed to the agent matches its real cwd.
  const sandboxRoot = realpathSync(createSandboxRoot(`eval-${runId}`));
  const skillsets = installSkillsets(armSources, sandboxRoot);
  const context = { model, runRoot, sandboxRoot, skillsets };

  const runs = [];
  const manifest = () => ({
    run_id: runId,
    model,
    executor: EXECUTOR,
    sandbox_root: sandboxRoot,
    expected_runs: tasks.length * arms.length * reps,
    complete: false,
    arms: skillsets,
    runs,
  });
  const writeManifest = () => writeFileSync(join(runRoot, 'runs.json'), JSON.stringify(manifest(), null, 2));
  writeManifest();
  for (const task of tasks) {
    for (const arm of arms) {
      for (let rep = 1; rep <= reps; rep += 1) {
        const record = prepareRun(context, task, arm, rep);
        runs.push(record);
        writeManifest();
        console.log(`${task.name}-${arm}-${rep}\t${record.prompt_file}`);
      }
    }
  }
  console.error(`prepared ${runs.length} runs in ${resolve(runRoot)}`);
  console.error(`collect with: node evals/collect.mjs ${resolve(runRoot)} --key <task-arm-rep> --transcript <jsonl>`);
}

try {
  main();
} catch (error) {
  console.error(`eval prepare failed: ${error.message}`);
  process.exitCode = 1;
}
