/**
 * Sandbox helpers shared by the eval runners.
 *
 * Every agent run happens in a folder under os.tmpdir(), never inside this
 * repository, and that folder is its own git repository so a stray `git` command
 * cannot climb into the skill repo. The child env keeps Claude auth untouched but
 * drops GitHub tokens and points gh at an empty config folder.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GIT_AUTHOR = ['-c', 'user.name=eval', '-c', 'user.email=eval@example.invalid'];
const STANDALONE_BRANCH = 'main';

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
