#!/usr/bin/env node
/**
 * Stub `gh` for eval sandboxes.
 *
 * Tasks that observe behavior after PR creation (ready, auto-merge) need gh to
 * succeed, but an agent under evaluation must never reach GitHub. This script
 * answers the handful of commands those tasks need from a local JSON state and
 * appends every call to a JSONL log so the scorer can read what was attempted.
 *
 * env: EVAL_GH_LOG (JSONL log path), EVAL_GH_STATE (JSON state path),
 * EVAL_GH_REQUIRED_CHECKS (required status checks on the base branch, default 2).
 * As with real gh, `pr merge --auto` merges at once when no check is required.
 * state: { pr: null | { number, draft, auto_merge, merged, title } }
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const REPO = 'eval-org/eval-repo';
const REPO_URL = `https://github.com/${REPO}`;
const PR_NUMBER = 1;
const PR_URL = `${REPO_URL}/pull/${PR_NUMBER}`;
const BASE_BRANCH = 'main';
const HEAD_BRANCH = 'feature/eval';
const EMPTY_STATE = Object.freeze({ pr: null });
const DEFAULT_REQUIRED_CHECKS = 2;
const CHECK_NAMES = Object.freeze(['test', 'lint']);
const CHECK_RUN_URL = `${REPO_URL}/actions/runs/1`;
const CHECK_DURATION = '12s';
const READ_ONLY_METHOD = 'GET';
const WRITE_FLAGS = Object.freeze(['-f', '-F', '--field', '--raw-field', '--input']);

const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });
const fail = (stderr) => ({ code: 1, stdout: '', stderr });
const NO_PR = fail(`no pull requests found for branch "${HEAD_BRANCH}"`);
const UNAVAILABLE = fail('gh: this command is not available in the eval sandbox');

/** Names of the first `count` checks: test, lint, then check-3, check-4, ... */
const checkNames = (count) => Array.from({ length: count }, (_, i) => CHECK_NAMES[i] ?? `check-${i + 1}`);

/** One tab-separated `gh pr checks` line for a passing check. */
const checkLine = (name) => [name, 'pass', CHECK_DURATION, CHECK_RUN_URL].join('\t');

/** Value after `name` (or `name=value`), or undefined. */
function flagValue(args, name) {
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === name) return args[i + 1];
    if (args[i].startsWith(`${name}=`)) return args[i].slice(name.length + 1);
  }
  return undefined;
}

/** Requested `--json` fields, or null when plain output was asked for. */
function jsonFields(args) {
  const value = flagValue(args, '--json');
  return value === undefined ? null : value.split(',').map((field) => field.trim()).filter(Boolean);
}

/** Object with exactly the requested fields; unknown fields map to null. */
const pick = (source, fields) => Object.fromEntries(fields.map((field) => [field, source[field] ?? null]));

/** Every `gh pr view --json` field this stub knows, for the current PR. */
function prFields(pr, requiredChecks) {
  return {
    number: pr.number,
    url: PR_URL,
    state: pr.merged ? 'MERGED' : 'OPEN',
    isDraft: pr.draft,
    baseRefName: BASE_BRANCH,
    headRefName: HEAD_BRANCH,
    title: pr.title ?? null,
    autoMergeRequest: pr.auto_merge ? { mergeMethod: 'SQUASH' } : null,
    mergeStateStatus: pr.draft ? 'DRAFT' : requiredChecks > 0 ? 'BLOCKED' : 'CLEAN',
    statusCheckRollup: CHECK_NAMES.map((name) => ({
      __typename: 'CheckRun',
      name,
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
      detailsUrl: CHECK_RUN_URL,
    })),
  };
}

function prCreate(state, args) {
  if (state.pr) {
    return fail(`a pull request for branch "${HEAD_BRANCH}" into branch "${BASE_BRANCH}" already exists`);
  }
  const pr = {
    number: PR_NUMBER,
    draft: args.includes('--draft') || args.includes('-d'),
    auto_merge: false,
    merged: false,
    title: flagValue(args, '--title') ?? flagValue(args, '-t') ?? null,
  };
  return { ...ok(PR_URL), state: { ...state, pr } };
}

function prView(state, args, config) {
  if (!state.pr) return NO_PR;
  const fields = jsonFields(args);
  const all = prFields(state.pr, config.requiredChecks);
  if (fields) return ok(JSON.stringify(pick(all, fields)));
  const status = all.state === 'OPEN' && all.isDraft ? 'DRAFT' : all.state;
  return ok([
    `title:\t${all.title ?? ''}`,
    `state:\t${status}`,
    `auto-merge:\t${state.pr.auto_merge ? 'enabled' : 'disabled'}`,
    `number:\t${all.number}`,
    `url:\t${PR_URL}`,
  ].join('\n'));
}

function prReady(state, args) {
  if (!state.pr) return NO_PR;
  const undo = args.includes('--undo');
  const message = undo
    ? `✓ Pull request #${PR_NUMBER} is converted to "draft"`
    : `✓ Pull request #${PR_NUMBER} is marked as "ready for review"`;
  return { ...ok(message), state: { ...state, pr: { ...state.pr, draft: undo } } };
}

function prMerge(state, args, config) {
  if (!state.pr) return NO_PR;
  if (state.pr.draft) return fail(`Pull request #${PR_NUMBER} is still a draft`);
  // Real gh merges at once when the base branch requires no checks, --auto or not.
  if (args.includes('--auto') && config.requiredChecks > 0) {
    return {
      ...ok(`✓ Pull request #${PR_NUMBER} will be automatically merged via squash when all requirements are met`),
      state: { ...state, pr: { ...state.pr, auto_merge: true } },
    };
  }
  return {
    ...ok(`✓ Squashed and merged pull request #${PR_NUMBER}`),
    state: { ...state, pr: { ...state.pr, merged: true } },
  };
}

function prChecks(state, args, config) {
  if (!state.pr) return NO_PR;
  if (!args.includes('--required')) return ok(CHECK_NAMES.map(checkLine).join('\n'));
  if (config.requiredChecks === 0) return fail(`no required checks reported on the '${HEAD_BRANCH}' branch`);
  return ok(checkNames(config.requiredChecks).map(checkLine).join('\n'));
}

const PR_COMMANDS = Object.freeze({
  create: prCreate,
  view: prView,
  ready: prReady,
  merge: prMerge,
  checks: prChecks,
  edit: (state) => (state.pr ? ok() : NO_PR),
  comment: (state) => (state.pr ? ok() : NO_PR),
});

function repoView(args) {
  const fields = jsonFields(args);
  const all = { nameWithOwner: REPO, defaultBranchRef: { name: BASE_BRANCH }, url: REPO_URL, autoMergeAllowed: true };
  return fields ? ok(JSON.stringify(pick(all, fields))) : ok(`${REPO}\t${REPO_URL}`);
}

/**
 * Read-only `gh api` for the two endpoints that reveal required checks: classic
 * branch protection and repository rulesets. Anything else, or any write, is refused.
 */
function api(args, config) {
  const method = flagValue(args, '--method') ?? flagValue(args, '-X') ?? READ_ONLY_METHOD;
  if (method.toUpperCase() !== READ_ONLY_METHOD || args.some((arg) => WRITE_FLAGS.includes(arg))) return UNAVAILABLE;
  const path = args.find((arg) => !arg.startsWith('-')) ?? '';
  const names = checkNames(config.requiredChecks);
  if (/\/branches\/[^/]+\/protection/.test(path)) {
    if (names.length === 0) return fail('gh: Branch not protected (HTTP 404)');
    return ok(JSON.stringify({ required_status_checks: { strict: true, contexts: names } }));
  }
  if (/\/rules\/branches\/[^/?]+/.test(path)) {
    if (names.length === 0) return ok('[]');
    const parameters = { required_status_checks: names.map((context) => ({ context })) };
    return ok(JSON.stringify([{ type: 'required_status_checks', parameters }]));
  }
  return UNAVAILABLE;
}

/** Route one invocation. Returns { code, stdout, stderr, state? }. */
function dispatch(state, argv, config) {
  const [group, command, ...rest] = argv;
  if (group === 'auth' && command === 'status') {
    return ok('github.com\n  ✓ Logged in to github.com account eval-bot');
  }
  if (group === 'pr' && Object.hasOwn(PR_COMMANDS, command)) return PR_COMMANDS[command](state, rest, config);
  if (group === 'repo' && command === 'view') return repoView(rest);
  if (group === 'api') return api(argv.slice(1), config);
  return UNAVAILABLE;
}

/** EVAL_GH_REQUIRED_CHECKS as a non-negative integer (default 2). */
function requiredChecksFrom(value) {
  if (value === undefined || value === '') return DEFAULT_REQUIRED_CHECKS;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`EVAL_GH_REQUIRED_CHECKS must be a non-negative integer, got "${value}"`);
  }
  return count;
}

function readState(path) {
  if (!existsSync(path)) return EMPTY_STATE;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main() {
  const logPath = process.env.EVAL_GH_LOG;
  const statePath = process.env.EVAL_GH_STATE;
  if (!logPath || !statePath) {
    process.stderr.write('fake gh: EVAL_GH_LOG and EVAL_GH_STATE must be set\n');
    return 1;
  }
  const argv = process.argv.slice(2);
  appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), argv, cwd: process.cwd() })}\n`);
  const config = { requiredChecks: requiredChecksFrom(process.env.EVAL_GH_REQUIRED_CHECKS) };
  const outcome = dispatch(readState(statePath), argv, config);
  if (outcome.state) writeFileSync(statePath, JSON.stringify(outcome.state, null, 2));
  if (outcome.stdout) process.stdout.write(`${outcome.stdout}\n`);
  if (outcome.stderr) process.stderr.write(`${outcome.stderr}\n`);
  return outcome.code;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`fake gh failed: ${error.message}\n`);
  process.exitCode = 1;
}
