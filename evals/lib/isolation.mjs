/**
 * Sandbox helpers shared by the eval runners.
 *
 * Every agent run happens in a folder under os.tmpdir(), never inside this
 * repository, and that folder is its own git repository so a stray `git` command
 * cannot climb into the skill repo. The child env keeps Claude auth untouched but
 * drops GitHub tokens and points gh at an empty config folder. A task that sets
 * `fake_gh: true` additionally gets a stub gh (fake-gh.mjs) first on PATH.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GIT_AUTHOR = ['-c', 'user.name=eval', '-c', 'user.email=eval@example.invalid'];
const STANDALONE_BRANCH = 'main';
const FAKE_GH_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'fake-gh.mjs');
const EXECUTABLE_MODE = 0o755;
/** Required status checks the fake gh reports when a task names none. */
export const DEFAULT_REQUIRED_CHECKS = 2;

/** GitHub credentials that must never reach an agent under evaluation. */
export const GH_TOKEN_VARS = Object.freeze([
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
]);

/** A fresh per-invocation root under os.tmpdir(), outside any repository. */
export function createSandboxRoot(label) {
  return mkdtempSync(join(tmpdir(), `ruccess-${label}-`));
}

/**
 * Copy of `base` with GitHub tokens removed and gh pointed at `ghConfigDir`.
 * Everything else, including Claude auth, passes through unchanged.
 */
export function isolatedEnv(ghConfigDir, base = process.env) {
  const env = { ...base, GH_CONFIG_DIR: ghConfigDir };
  for (const name of GH_TOKEN_VARS) delete env[name];
  return env;
}

/** Quote `value` for a POSIX shell double-quoted string. */
const doubleQuote = (value) => `"${String(value).replace(/[\\"$`]/g, '\\$&')}"`;

/**
 * Install the fake gh for one run: <sandbox>/bin/<id>/gh wraps evals/lib/fake-gh.mjs.
 * The call log and PR state both live in the sandbox under the opaque run id, so
 * no path the agent can see names the task or arm. `requiredChecks` is how many
 * required status checks the base branch pretends to have (0 = none).
 */
export function setupFakeGh(sandboxRoot, sandboxId, requiredChecks = DEFAULT_REQUIRED_CHECKS) {
  const binDir = join(sandboxRoot, 'bin', sandboxId);
  const stateDir = join(sandboxRoot, 'gh-state');
  const logDir = join(sandboxRoot, 'gh-log');
  mkdirSync(dirname(binDir), { recursive: true });
  mkdirSync(binDir);
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  const wrapper = join(binDir, 'gh');
  writeFileSync(wrapper, `#!/bin/sh\nexec node ${doubleQuote(FAKE_GH_SCRIPT)} "$@"\n`);
  chmodSync(wrapper, EXECUTABLE_MODE);
  return Object.freeze({
    binDir,
    logFile: join(logDir, `${sandboxId}.jsonl`),
    stateFile: join(stateDir, `${sandboxId}.json`),
    requiredChecks,
  });
}

/** Copy of `env` that resolves `gh` to the fake one. A null `fakeGh` returns `env` as is. */
export function withFakeGh(env, fakeGh) {
  if (!fakeGh) return env;
  const path = env.PATH ? `${fakeGh.binDir}:${env.PATH}` : fakeGh.binDir;
  return {
    ...env,
    PATH: path,
    EVAL_GH_LOG: fakeGh.logFile,
    EVAL_GH_STATE: fakeGh.stateFile,
    EVAL_GH_REQUIRED_CHECKS: String(fakeGh.requiredChecks),
  };
}

/**
 * Shell script that applies isolatedEnv/withFakeGh to an existing shell, for runs
 * executed outside this process. Meant to be sourced before every command.
 */
export function isolationScript(ghConfigDir, fakeGh = null) {
  const lines = [
    `export GH_CONFIG_DIR=${doubleQuote(ghConfigDir)}`,
    `unset ${GH_TOKEN_VARS.join(' ')}`,
  ];
  if (fakeGh) {
    lines.push(
      `export PATH="${doubleQuote(fakeGh.binDir).slice(1, -1)}:$PATH"`,
      `export EVAL_GH_LOG=${doubleQuote(fakeGh.logFile)}`,
      `export EVAL_GH_STATE=${doubleQuote(fakeGh.stateFile)}`,
      `export EVAL_GH_REQUIRED_CHECKS=${fakeGh.requiredChecks}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Run one git command in `cwd`; throw a one-line error on failure. */
export function git(cwd, args) {
  const proc = spawnSync('git', [...GIT_AUTHOR, ...args], { cwd, encoding: 'utf8' });
  if (proc.error || proc.status !== 0) {
    const reason = proc.error?.message ?? proc.stderr?.trim().slice(-500) ?? `exit ${proc.status}`;
    throw new Error(`git ${args.join(' ')} failed: ${reason || `exit ${proc.status}`}`);
  }
}

/** Make `dir` its own repository with one commit and no remote. */
export function initStandaloneRepo(dir, message) {
  git(dir, ['init', '-b', STANDALONE_BRANCH]);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--allow-empty', '-m', message]);
}
