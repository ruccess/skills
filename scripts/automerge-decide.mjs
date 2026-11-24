#!/usr/bin/env node
/**
 * Decide whether a ready pull request may have auto-merge enabled, and enable or disable it.
 *
 * Runs from .github/workflows/automerge.yml on pull_request_target, so this file and the policy it reads come
 * from the base branch, never from the PR. Path rules only: marking the PR ready is the human merge decision.
 *
 * Zero dependencies on purpose: Node built-ins and the `gh` CLI on the runner.
 *
 * Exit 0 = decided (auto-merge enabled, disabled, or left off with a printed reason).
 * Exit 1 = bad input or a gh call that had to succeed failed.
 */

import { appendFileSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Reuse the hook's glob matcher so the workflow and the hook agree on what a deny path covers.
const { matchesAny } = createRequire(import.meta.url)('../hooks/automerge-gate.js');

const POLICY_PATH = '.ruccess/automerge.json';
const MAX_LISTED_PATHS = 10;
// Same rule as the hook: only `*` and `**` are supported, anything else fails closed.
const UNSUPPORTED_GLOB = /[?[\]{}]/;
const MERGE_METHODS = new Set(['merge', 'squash', 'rebase']);
const DEFAULT_METHOD = 'merge';
const DEFAULT_CHECK_ATTEMPTS = 6;
const DEFAULT_CHECK_INTERVAL_MS = 10000;
const PR_NUMBER_PATTERN = /^[1-9][0-9]*$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const NO_REQUIRED_CHECK = 'no required check found; auto-merge would merge immediately';

const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Problem with the deny_paths patterns, or null when they are usable. */
function denyPathsProblem(denyPaths) {
  if (!isStringArray(denyPaths)) return `"deny_paths" in ${POLICY_PATH} must be an array of strings`;
  const unsupported = denyPaths.find((pattern) => UNSUPPORTED_GLOB.test(pattern));
  if (unsupported !== undefined) {
    return `deny_paths pattern "${unsupported}" in ${POLICY_PATH} uses unsupported glob syntax`;
  }
  return null;
}

/**
 * Whether auto-merge may be enabled for a PR, from the base branch policy, its draft state and changed paths.
 * Fails closed: anything unreadable or malformed is not eligible.
 */
export function decide({ policy, isDraft, files }) {
  const no = (reason) => ({ eligible: false, reason });
  if (!policy || typeof policy !== 'object' || policy.enabled !== true) return no('repository has not opted in');
  if (isDraft) return no('pull request is a draft');
  if (!Array.isArray(files) || files.length === 0) return no('changed files could not be read');
  const denyPaths = policy.deny_paths ?? [];
  const problem = denyPathsProblem(denyPaths);
  if (problem) return no(`policy is invalid: ${problem}`);
  let denied;
  try {
    // The policy file itself always needs human review, whatever deny_paths says.
    denied = files.filter((file) => file.toLowerCase() === POLICY_PATH || matchesAny(file, denyPaths));
  } catch (error) {
    return no(`policy is invalid: ${error.message}`);
  }
  if (denied.length === 0) return { eligible: true, reason: 'eligible' };
  const listed = denied.slice(0, MAX_LISTED_PATHS).join(', ');
  const more = denied.length > MAX_LISTED_PATHS ? ` (and ${denied.length - MAX_LISTED_PATHS} more)` : '';
  return no(`touches paths that require human review: ${listed}${more}`);
}

/** Merge method from the policy, or `merge` when it is missing or unknown. */
export function mergeMethod(policy) {
  const method = policy && typeof policy === 'object' ? policy.method : undefined;
  return MERGE_METHODS.has(method) ? method : DEFAULT_METHOD;
}

/** Positive integer from the environment, or the fallback when unset or invalid. */
function envInt(name, fallback, min) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min ? value : fallback;
}

/** Run gh without a shell; returns the spawnSync result. */
function gh(args) {
  const proc = spawnSync('gh', args, { encoding: 'utf8' });
  if (proc.error) throw new Error(`gh could not run: ${proc.error.message}`);
  return proc;
}

/** Run gh and return stdout, throwing with its stderr when it fails. */
function ghOk(args) {
  const proc = gh(args);
  if (proc.status !== 0) throw new Error(`gh ${args.join(' ')} failed: ${proc.stderr.trim()}`);
  return proc.stdout;
}

/** Policy from the checked-out base branch, or null when it is missing or not valid JSON. */
function readPolicy() {
  try {
    return JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Changed files from the REST API, one `[filename, previous_filename]` pair per file. A rename is one file but
 * both paths count, so moving a file out of a denied path is still caught.
 */
function readChangedFiles(number) {
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  if (!REPOSITORY_PATTERN.test(repo)) throw new Error(`GITHUB_REPOSITORY must be "owner/repo", got "${repo}"`);
  const jq = '.[] | [.filename, (.previous_filename // "")] | @tsv';
  const output = ghOk(['api', '--paginate', `repos/${repo}/pulls/${number}/files`, '--jq', jq]);
  const rows = output.split('\n').filter(Boolean).map((line) => line.split('\t'));
  return { count: rows.length, paths: rows.flat().filter(Boolean) };
}

/** Draft state, auto-merge state and changed paths; a truncated file list becomes empty. */
function readPullRequest(number) {
  const data = JSON.parse(ghOk(['pr', 'view', number, '--json', 'isDraft,autoMergeRequest,changedFiles']));
  const changed = readChangedFiles(number);
  const isComplete = !(data.changedFiles > changed.count);
  return {
    isDraft: data.isDraft !== false,
    hasAutoMerge: data.autoMergeRequest != null,
    files: isComplete ? changed.paths : [],
  };
}

/** True when the PR has at least one required check. gh exits 8 while checks are pending, so stdout decides. */
function hasRequiredCheck(number) {
  try {
    const checks = JSON.parse(gh(['pr', 'checks', number, '--required', '--json', 'name']).stdout);
    return Array.isArray(checks) && checks.length > 0;
  } catch {
    return false;
  }
}

/** Poll for a required check up to the configured number of attempts. */
async function waitForRequiredCheck(number) {
  const attempts = envInt('AUTOMERGE_CHECK_ATTEMPTS', DEFAULT_CHECK_ATTEMPTS, 1);
  const intervalMs = envInt('AUTOMERGE_CHECK_INTERVAL_MS', DEFAULT_CHECK_INTERVAL_MS, 0);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (hasRequiredCheck(number)) return true;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** Print the outcome and append it to the job summary when there is one. */
function report(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

/** Decide for PR_NUMBER and enable or disable auto-merge accordingly; returns the exit code. */
async function main() {
  const number = process.env.PR_NUMBER ?? '';
  if (!PR_NUMBER_PATTERN.test(number)) {
    console.error(`PR_NUMBER must be a positive integer, got "${number}"`);
    return 1;
  }
  const policy = readPolicy();
  const pr = readPullRequest(number);
  const { eligible, reason } = decide({ policy, isDraft: pr.isDraft, files: pr.files });
  if (!eligible) {
    // A new commit touched a denied path or the PR went back to draft: drop the auto-merge it already has.
    if (pr.hasAutoMerge) ghOk(['pr', 'merge', number, '--disable-auto']);
    report(`PR #${number}: auto-merge not enabled — ${reason}`);
    return 0;
  }
  if (!(await waitForRequiredCheck(number))) {
    report(`PR #${number}: auto-merge not enabled — ${NO_REQUIRED_CHECK}`);
    return 0;
  }
  const method = mergeMethod(policy);
  const merge = gh(['pr', 'merge', number, '--auto', `--${method}`]);
  if (merge.status !== 0) {
    console.error(merge.stderr.trim());
    return 1;
  }
  report(`PR #${number}: auto-merge enabled (${method})`);
  return 0;
}

/** True only when this file is the entry point. A non-path argv[1] (e.g. under `node -e`) is not an error. */
function isEntryPoint() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`automerge-decide failed: ${error && error.message ? error.message : error}`);
      process.exit(1);
    },
  );
}
