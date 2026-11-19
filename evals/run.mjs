#!/usr/bin/env node
/**
 * A/B eval runner for the ruccess skill suite.
 *
 * Two arms, identical except for one flag:
 *   ARM A (treatment) = claude -p --setting-sources project,local --plugin-dir <repo> ...
 *   ARM B (control)   = same command without --plugin-dir
 *
 * `--setting-sources project,local` drops the user scope, so neither arm sees the
 * operator's global CLAUDE.md, other plugins, or hooks. Auth is untouched: we never
 * move CLAUDE_CONFIG_DIR or any credentials file.
 *
 * Every run gets a throwaway copy of the task fixture in a sandbox under
 * os.tmpdir() — outside this repository, as its own git repository, with GitHub
 * tokens stripped and gh pointed at an empty config folder. Runs are sequential
 * and land one record in results/<run-id>/runs.json. Zero dependencies by design.
 */

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSandboxRoot, git as runGit, initStandaloneRepo, isolatedEnv } from './lib/isolation.mjs';
import { findTranscript } from './lib/transcript.mjs';

const EVALS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(EVALS_DIR);
const TASKS_DIR = join(EVALS_DIR, 'tasks');
const RESULTS_DIR = join(EVALS_DIR, 'results');

const DEFAULT_MODEL = 'sonnet';
const DEFAULT_MAX_TURNS = '25';
const STDOUT_BUFFER_BYTES = 64 * 1024 * 1024;
const BASE_BRANCH = 'main';
const FEATURE_BRANCH = 'feature/eval';
// Fallback commit subjects for a task.json that names none. A fixture whose diff
// is not self-describing should set base_commit_message / change_commit_message,
// because the agent reads `git log` before it reads the diff.
const DEFAULT_BASE_COMMIT = 'feat: 바이트 포맷 유틸 추가';
const DEFAULT_CHANGE_COMMIT = 'feat: 구간 합 sumRange 추가';
const FLAT_COMMIT = 'chore: initial fixture state';

/** Parse `--key value` pairs; unknown keys are ignored on purpose. */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    args[argv[i].slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

/** Split a comma list into trimmed non-empty items. */
const splitList = (value) =>
  String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/** Load tasks/<name>/task.json plus its fixture path. */
function loadTask(name) {
  const taskFile = join(TASKS_DIR, name, 'task.json');
  if (!existsSync(taskFile)) throw new Error(`unknown task "${name}" (no ${taskFile})`);
  const spec = JSON.parse(readFileSync(taskFile, 'utf8'));
  return { ...spec, name, fixture: join(TASKS_DIR, name, 'fixture') };
}

/** Build the arm command. The only difference between arms is --plugin-dir. */
function buildCommand(arm, model, prompt, maxTurns) {
  const args = ['-p', '--setting-sources', 'project,local'];
  if (arm === 'A') args.push('--plugin-dir', REPO_ROOT);
  args.push(
    '--model',
    model,
    '--output-format',
    'json',
    '--max-turns',
    maxTurns,
    '--permission-mode',
    'acceptEdits',
    prompt,
  );
  return args;
}

/**
 * Seed a git repo that makes the "ship it" scenario real.
 *
 * A layered fixture (fixture/base + fixture/change) becomes two commits: `main`
 * holds the base state, `feature/eval` holds the change under review. A local bare
 * repo is registered as `origin` and both branches are pushed, so `git push`
 * succeeds while `gh pr create` still fails for want of a GitHub remote — the
 * agent has to reach the verification gate on its own.
 *
 * A flat fixture (no base/) falls back to a single commit on `feature/eval`.
 */
function initGitRepo(workDir, task, remoteDir) {
  const git = (args) => runGit(workDir, args);
  const base = join(task.fixture, 'base');
  const change = join(task.fixture, 'change');
  const isLayered = existsSync(base);

  git(['init', '-b', isLayered ? BASE_BRANCH : FEATURE_BRANCH]);
  git(['add', '-A']);
  git(['commit', '-m', isLayered ? (task.base_commit_message ?? DEFAULT_BASE_COMMIT) : FLAT_COMMIT]);

  if (isLayered) {
    git(['checkout', '-b', FEATURE_BRANCH]);
    cpSync(change, workDir, { recursive: true, force: true });
    git(['add', '-A']);
    git(['commit', '-m', task.change_commit_message ?? DEFAULT_CHANGE_COMMIT]);
  }

  mkdirSync(dirname(remoteDir), { recursive: true });
  mkdirSync(remoteDir);
  git(['init', '--bare', '-b', BASE_BRANCH, remoteDir]);
  git(['remote', 'add', 'origin', remoteDir]);
  git(['push', '-u', 'origin', ...(isLayered ? [BASE_BRANCH, FEATURE_BRANCH] : [FEATURE_BRANCH])]);
  git(['checkout', FEATURE_BRANCH]);
}

/** Pull the single `result` envelope out of stdout, tolerating array-shaped output. */
function parseResultJson(stdout) {
  const parsed = JSON.parse(stdout);
  if (Array.isArray(parsed)) return parsed.find((item) => item?.type === 'result') ?? null;
  return parsed;
}

/** Run one (task, arm, rep) triple and return its record. */
function executeRun(task, arm, rep, model, runRoot, sandboxRoot, maxTurns) {
  const key = `${task.name}-${arm}-${rep}`;
  const workDir = join(sandboxRoot, 'work', key);
  const ghConfigDir = join(sandboxRoot, 'gh', key);
  const resultDir = join(runRoot, key);
  if (existsSync(workDir) || existsSync(ghConfigDir) || existsSync(resultDir)) {
    throw new Error(`run directories already exist for ${key}`);
  }
  mkdirSync(resultDir);
  for (const dir of [workDir, ghConfigDir]) {
    mkdirSync(dirname(dir), { recursive: true });
    mkdirSync(dir);
  }
  // A layered fixture starts from base/; initGitRepo lays change/ on top as a commit.
  const seed = existsSync(join(task.fixture, 'base')) ? join(task.fixture, 'base') : task.fixture;
  cpSync(seed, workDir, { recursive: true });
  // Without a repo of its own, an agent's git commands would reach whatever
  // repository encloses the work dir, so even no-git tasks get one (no remote).
  if (task.expects_git) initGitRepo(workDir, task, join(sandboxRoot, 'remotes', `${key}.git`));
  else initStandaloneRepo(workDir, FLAT_COMMIT);

  const startedAt = Date.now();
  const proc = spawnSync('claude', buildCommand(arm, model, task.prompt, maxTurns), {
    cwd: workDir,
    encoding: 'utf8',
    env: isolatedEnv(ghConfigDir),
    maxBuffer: STDOUT_BUFFER_BYTES,
  });

  const record = {
    task: task.name,
    arm,
    rep,
    model,
    work_dir: realpathSync(workDir),
    result_dir: resultDir,
    exit_code: proc.status,
    wall_ms: Date.now() - startedAt,
  };

  let envelope = null;
  try {
    envelope = parseResultJson(proc.stdout ?? '');
  } catch (error) {
    record.parse_error = error.message;
  }

  if (envelope) {
    record.result = envelope.result ?? null;
    record.is_error = envelope.is_error ?? null;
    record.subtype = envelope.subtype ?? null;
    record.total_cost_usd = envelope.total_cost_usd ?? null;
    record.usage = envelope.usage ?? null;
    record.num_turns = envelope.num_turns ?? null;
    record.duration_ms = envelope.duration_ms ?? null;
    record.session_id = envelope.session_id ?? null;
  } else {
    record.stderr = (proc.stderr ?? '').slice(-2000);
    record.stdout_head = (proc.stdout ?? '').slice(0, 2000);
  }

  const source = findTranscript(workDir, record.session_id);
  if (source) {
    const destination = join(resultDir, 'transcript.jsonl');
    cpSync(source, destination);
    record.transcript = destination;
    record.transcript_source = source;
  } else {
    record.transcript = null;
  }

  writeFileSync(join(resultDir, 'raw-result.json'), JSON.stringify(envelope ?? {}, null, 2));
  return record;
}

/** Format one progress line so a long matrix is readable while it runs. */
function progressLine(index, total, record) {
  const cost = record.total_cost_usd == null ? 'n/a' : `$${record.total_cost_usd.toFixed(4)}`;
  const status = record.is_error ? 'ERROR' : record.result ? 'ok' : 'no-result';
  const transcript = record.transcript ? 'transcript:yes' : 'transcript:NO';
  return `[${index}/${total}] ${record.task} arm=${record.arm} rep=${record.rep} ${status} ${cost} turns=${record.num_turns ?? '?'} ${(record.wall_ms / 1000).toFixed(1)}s ${transcript}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const taskNames = args.tasks
    ? splitList(args.tasks)
    : readdirSync(TASKS_DIR).filter((name) => !name.startsWith('.')).sort();
  const arms = args.arms ? splitList(args.arms) : ['A', 'B'];
  const reps = Number(args.reps ?? 1);
  const model = args.model ?? DEFAULT_MODEL;
  const maxTurns = String(args["max-turns"] ?? DEFAULT_MAX_TURNS);

  for (const [label, values] of [['task', taskNames], ['arm', arms]]) {
    if (new Set(values).size !== values.length) {
      throw new Error(`duplicate ${label} in run selection`);
    }
  }

  const tasks = taskNames.map(loadTask);
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15);
  mkdirSync(RESULTS_DIR, { recursive: true });
  const runRoot = mkdtempSync(join(RESULTS_DIR, `${timestamp}-`));
  const runId = basename(runRoot);
  // Work dirs, bare remotes, and gh config live outside the repository.
  const sandboxRoot = createSandboxRoot(`eval-${runId}`);

  const total = tasks.length * arms.length * reps;
  console.log(`run-id ${runId} — ${total} runs (model=${model}, arms=${arms.join(',')}, reps=${reps}, max-turns=${maxTurns})`);
  console.log(`sandbox ${sandboxRoot}`);

  const runs = [];
  const writeManifest = (complete) => writeFileSync(
    join(runRoot, 'runs.json'),
    JSON.stringify({ run_id: runId, model, sandbox_root: sandboxRoot, expected_runs: total, complete, runs }, null, 2),
  );
  writeManifest(false);
  let index = 0;
  for (const task of tasks) {
    for (const arm of arms) {
      for (let rep = 1; rep <= reps; rep += 1) {
        index += 1;
        const record = executeRun(task, arm, rep, model, runRoot, sandboxRoot, maxTurns);
        runs.push(record);
        writeManifest(runs.length === total);
        console.log(progressLine(index, total, record));
      }
    }
  }

  console.log(`\ndone — ${resolve(runRoot)}`);
  console.log(`score with: node evals/score.mjs evals/results/${runId}`);
}

try {
  main();
} catch (error) {
  console.error(`eval run failed: ${error.message}`);
  process.exitCode = 1;
}
