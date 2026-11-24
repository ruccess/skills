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
 * tokens stripped and gh pointed at an empty config folder (or, for a task with
 * `fake_gh: true`, at the stub in lib/fake-gh.mjs). Runs are sequential
 * and land one record in results/<run-id>/runs.json. Zero dependencies by design.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSandboxRoot, isolatedEnv, setupFakeGh, withFakeGh } from './lib/isolation.mjs';
import { assertUnique, createRunRoot, loadTask, parseArgs, seedRun, splitList } from './lib/seed.mjs';
import { findTranscript } from './lib/transcript.mjs';

const EVALS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(EVALS_DIR);
const TASKS_DIR = join(EVALS_DIR, 'tasks');
const RESULTS_DIR = join(EVALS_DIR, 'results');

const DEFAULT_MODEL = 'sonnet';
const DEFAULT_MAX_TURNS = '25';
const STDOUT_BUFFER_BYTES = 64 * 1024 * 1024;

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

/** Pull the single `result` envelope out of stdout, tolerating array-shaped output. */
function parseResultJson(stdout) {
  const parsed = JSON.parse(stdout);
  if (Array.isArray(parsed)) return parsed.find((item) => item?.type === 'result') ?? null;
  return parsed;
}

/** Run one (task, arm, rep) triple and return its record. */
function executeRun(task, arm, rep, model, runRoot, sandboxRoot, maxTurns) {
  const key = `${task.name}-${arm}-${rep}`;
  const { sandboxId, workDir, ghConfigDir, resultDir } = seedRun(task, key, runRoot, sandboxRoot);
  const fakeGh = task.fake_gh ? setupFakeGh(sandboxRoot, sandboxId, task.fake_gh_required_checks) : null;

  const startedAt = Date.now();
  const proc = spawnSync('claude', buildCommand(arm, model, task.prompt, maxTurns), {
    cwd: workDir,
    encoding: 'utf8',
    env: withFakeGh(isolatedEnv(ghConfigDir), fakeGh),
    maxBuffer: STDOUT_BUFFER_BYTES,
  });

  const record = {
    task: task.name,
    arm,
    rep,
    model,
    executor: 'claude-cli',
    sandbox_id: sandboxId,
    work_dir: realpathSync(workDir),
    result_dir: resultDir,
    exit_code: proc.status,
    wall_ms: Date.now() - startedAt,
    gh_log: fakeGh?.logFile ?? null,
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

  assertUnique('task', taskNames);
  assertUnique('arm', arms);

  const tasks = taskNames.map((name) => loadTask(TASKS_DIR, name));
  const { runRoot, runId } = createRunRoot(RESULTS_DIR);
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
