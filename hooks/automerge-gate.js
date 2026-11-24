#!/usr/bin/env node
// PreToolUse(Bash): `gh pr merge --auto` 는 PR 기준 브랜치의 .ruccess/automerge.json 이 옵트인했고
// 변경이 deny_paths 를 건드리지 않고 PR 에 필수 검사가 있을 때만 통과시킨다. 막을 때는 stderr 메시지와 exit 2
// 예상 밖 오류도 막는다(fail closed). `--auto` 없는 일반 머지는 건드리지 않는다
// 보안 경계가 아니다 — 에이전트가 평범하게 쓰는 형태를 놓치지 않고 무관한 명령을 막지 않는 것이 목표다
// 의존성 없음 — plain node 만으로 동작한다
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const STARTED_AT = Date.now();
// hook timeout(20초)을 넘기면 Claude Code 가 명령을 통과시키므로 그 전에 스스로 막는다
const DEADLINE_MS = 15000;
// 테스트용으로 마감을 앞당기는 것만 허용한다
const DEADLINE_AT =
  STARTED_AT + Math.min(DEADLINE_MS, Number(process.env.RUCCESS_AUTOMERGE_DEADLINE_MS) || DEADLINE_MS);
const GH_TIMEOUT_MS = 8000;
// 정책은 기준 브랜치에서 읽는다. working tree 를 읽으면 에이전트가 정책을 직접 만들거나 고쳐 통과할 수 있다
const POLICY_PATH = '.ruccess/automerge.json';
const MAX_LISTED_PATHS = 10;
const BLOCK_EXIT_CODE = 2;
const NEXT_STEP = 'Leave the PR as a draft and report this to the user.';
const OR_NEXT_STEP = 'or leave the PR as a draft and report this to the user.';

// 셸 구분자. 긴 것부터 맞춘다
const SEPARATORS = ['&&', '||', '|&', ';', '|', '&', '\n'];
// heredoc 본문을 명령으로 실행할 수 있는 명령. 같은 줄에 있으면 본문을 건너뛰지 않는다
const BODY_RUNNERS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'eval', 'source', '.']);
// 명령어 앞에 올 수 있는 접두. 이것과 `VAR=값`을 건너뛴 첫 단어가 명령어다
const PREFIX_WORDS = new Set([
  'env', 'command', 'builtin', 'sudo', 'time', 'nohup', 'exec', 'xargs',
  '!', '{', 'if', 'then', 'else', 'elif', 'do', 'while', 'until',
]);
// 인자를 텍스트로만 쓰는 명령. 이 명령의 인자에 나온 `gh pr merge`는 호출이 아니다
const TEXT_COMMANDS = new Set([
  'echo', 'printf', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'git', 'cat', 'sed', 'awk', 'jq', 'tee', 'ls',
]);
const PREFIX_VALUE_OPTIONS = {
  env: ['-C', '-u', '-S', '--chdir', '--unset', '--split-string'],
  sudo: ['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U', '-T'],
  xargs: ['-I', '-n', '-P', '-L', '-s', '-d', '-E', '-a'],
  time: ['-f', '-o'],
};
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const GH_TARGET_ENV = /^GH_(?:REPO|HOST)=/;
// Go strconv.ParseBool 의 거짓 값. 해석할 수 없는 값은 auto 로 본다
const FALSE_VALUES = new Set(['0', 'f', 'F', 'false', 'FALSE', 'False']);
// gh pr merge 에서 값을 받는 플래그. 이 값을 PR 선택자로 오인하면 엉뚱한 PR 을 검사한다
const VALUE_FLAGS = new Set([
  '-b', '--body', '-F', '--body-file', '-t', '--subject', '-A', '--author-email', '--match-head-commit', '-R', '--repo',
]);
const REPO_FLAGS = new Set(['-R', '--repo']);
const SHORT_VALUE_FLAG = /^-[bFtAR]./;
// 해석할 수 있는 동적 cd 대상: 현재 디렉터리, 현재 저장소 루트
const PWD_FORMS = new Set(['$PWD', '"$PWD"', '${PWD}', '"${PWD}"']);
const TOPLEVEL_FORMS = new Set(['$(git rev-parse --show-toplevel)', '"$(git rev-parse --show-toplevel)"']);
const UNSUPPORTED_GLOB = /[?[\]{}]/;
const BRANCH_NAME = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;

const notOptedIn = (base) =>
  `Auto-merge blocked: this repository has not opted in on ${base}. ` +
  `The policy must already be merged into the base branch: ${POLICY_PATH} with "enabled": true. ${NEXT_STEP}`;
const UNKNOWN_DIR =
  'Auto-merge blocked: could not tell which directory "gh pr merge" runs in, because a cd/pushd before it has a target ' +
  `this gate cannot resolve. Use a literal path with cd, or run it inside the repository without cd, ${OR_NEXT_STEP}`;
const REPO_FLAG =
  'Auto-merge blocked: -R/--repo, GH_REPO or GH_HOST points gh at a repository this gate cannot inspect locally. ' +
  `Run the merge from a checkout of that repository without --repo, GH_REPO or GH_HOST, ${OR_NEXT_STEP}`;
const MULTIPLE_CALLS =
  'Auto-merge blocked: this command has more than one "gh pr merge --auto" call, which cannot all be checked in time. ' +
  `Run them one at a time, ${OR_NEXT_STEP}`;
const DEADLINE =
  `Auto-merge blocked: the gate could not finish its checks within ${DEADLINE_MS / 1000}s. ` +
  `Retry once, ${OR_NEXT_STEP}`;
const dynamicSelector = (raw) =>
  `Auto-merge blocked: the PR to merge is computed at run time (${raw}), so this gate cannot tell which PR it is. ` +
  `Write the PR number directly and retry, ${OR_NEXT_STEP}`;

const firstLine = (text) => String(text || '').trim().split('\n')[0];

class DeadlineError extends Error {}

/** Milliseconds left before the gate's own deadline; throws once it has passed. */
function timeLeft() {
  const left = DEADLINE_AT - Date.now();
  if (left <= 0) throw new DeadlineError('deadline passed');
  return left;
}

/** Re-throw as a deadline error when the deadline caused or passed during the failure. */
function rethrowIfLate(error) {
  if (error instanceof DeadlineError || Date.now() >= DEADLINE_AT) throw new DeadlineError('deadline passed');
}

/**
 * Glob to RegExp, close to gitignore: leading `./` or `/` is dropped, a pattern without `/` matches at any depth,
 * `**\/` also matches zero directories, `*` stays inside one path segment, a trailing `/` matches only below the
 * directory, and any other pattern matches the path itself or anything below it. Case-insensitive.
 */
function globToRegExp(pattern) {
  const stripped = pattern.replace(/^(?:\.\/|\/)+/, '');
  const isDirOnly = stripped.endsWith('/');
  const body = stripped.replace(/\/+$/, '');
  const glob = body.includes('/') ? body : `**/${body}`;
  let source = '';
  let i = 0;
  while (i < glob.length) {
    if (glob.startsWith('**/', i)) {
      source += '(?:.*/)?';
      i += 3;
    } else if (glob.startsWith('**', i)) {
      source += '.*';
      i += 2;
    } else {
      source += glob[i] === '*' ? '[^/]*' : glob[i].replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      i += 1;
    }
  }
  return new RegExp(`^${source}${isDirOnly ? '/.+' : '(?:/.*)?'}$`, 'is');
}

/** True when the file path matches any of the glob patterns. */
function matchesAny(filePath, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(filePath));
}

/** Start and delimiter of a heredoc at `<<`, or null when it is not one. */
function readHeredoc(command, i) {
  let j = i + 2;
  const stripTabs = command[j] === '-';
  if (stripTabs) j += 1;
  while (command[j] === ' ' || command[j] === '\t') j += 1;
  const quote = command[j] === "'" || command[j] === '"' ? command[j] : null;
  if (quote) {
    const close = command.indexOf(quote, j + 1);
    if (close === -1) return null;
    return { delim: command.slice(j + 1, close), stripTabs, next: close + 1 };
  }
  const raw = (command.slice(j).match(/^[^\s;&|()<>]+/) || [''])[0];
  const delim = raw.replace(/[\\'"]/g, '');
  return delim ? { delim, stripTabs, next: j + raw.length } : null;
}

/** Index just past the heredoc bodies that start after the newline at `i`. */
function skipHeredocBodies(command, i, heredocs) {
  let pos = i + 1;
  for (const { delim, stripTabs } of heredocs) {
    while (pos < command.length) {
      const end = command.indexOf('\n', pos);
      const lineEnd = end === -1 ? command.length : end;
      const line = command.slice(pos, lineEnd);
      pos = lineEnd + 1;
      if ((stripTabs ? line.replace(/^\t+/, '') : line) === delim) break;
    }
  }
  return pos;
}

/** Index just past the `))` closing the arithmetic expansion `$((` at `i`. */
function skipArithmetic(command, i) {
  let depth = 0;
  for (let j = i + 3; j < command.length; j += 1) {
    if (command[j] === '(') depth += 1;
    if (command[j] === ')' && depth === 0 && command[j + 1] === ')') return j + 2;
    if (command[j] === ')' && depth > 0) depth -= 1;
  }
  return command.length;
}

const newFrame = (kind) => ({
  kind, words: [], word: null, start: 0, dynamic: false, quote: null, prevOp: null, parens: 0, heredocs: [], runsBody: false,
});

/**
 * Shell-like lexer into events: `{ segment: { words, prevOp, nextOp } }` per simple command, and
 * `{ scope: 'enter' | 'leave' }` around subshells and substitutions. A `$(…)` or backtick substitution is lexed as
 * its own commands while its parent command stays whole, holding one dynamic word in its place. Words carry their
 * source text as `raw`. Comments are dropped, and heredoc bodies are skipped unless a shell on the same line could
 * run them. Best effort — what it cannot follow stays in the stream.
 */
function lex(command) {
  const events = [];
  const frames = [newFrame('top')];
  let i = 0;
  const top = () => frames[frames.length - 1];
  const addChars = (f, text) => {
    if (f.word === null) {
      f.word = '';
      f.start = i;
    }
    f.word += text;
  };
  const endWord = (f) => {
    if (f.word !== null) {
      f.words.push({ word: f.word, dynamic: f.dynamic, raw: command.slice(f.start, i) });
      // `sudo bash <<EOF`, `cat <<EOF | sh` 처럼 줄 어디에든 셸이 있으면 본문을 명령으로 본다
      if (BODY_RUNNERS.has(path.posix.basename(f.word))) f.runsBody = true;
    }
    f.word = null;
    f.dynamic = false;
  };
  const endSegment = (f, op) => {
    endWord(f);
    if (f.words.length > 0) events.push({ segment: { words: f.words, prevOp: f.prevOp, nextOp: op } });
    f.words = [];
    f.prevOp = op;
  };
  const openSubstitution = (kind, width) => {
    addChars(top(), '');
    events.push({ scope: 'enter' });
    frames.push(newFrame(kind));
    i += width;
  };
  const closeSubstitution = (width) => {
    endSegment(top(), null);
    frames.pop();
    events.push({ scope: 'leave' });
    const parent = top();
    parent.word += '$(…)';
    parent.dynamic = true;
    i += width;
  };
  while (i < command.length) {
    const f = top();
    const ch = command[i];
    if (f.quote === "'") {
      if (ch === "'") f.quote = null;
      else f.word += ch;
      i += 1;
    } else if (ch === '`' && f.kind === 'tick' && f.quote === null) {
      closeSubstitution(1);
    } else if (command.startsWith('$((', i)) {
      addChars(f, '$((…))');
      f.dynamic = true;
      i = skipArithmetic(command, i);
    } else if (ch === '`' || command.startsWith('$(', i)) {
      openSubstitution(ch === '`' ? 'tick' : 'paren', ch === '`' ? 1 : 2);
    } else if (ch === '\\' && command[i + 1] === '\n') {
      i += 2;
    } else if (ch === '\\' && i + 1 < command.length) {
      addChars(f, command[i + 1]);
      i += 2;
    } else if (ch === '$') {
      addChars(f, ch);
      f.dynamic = true;
      i += 1;
    } else if (f.quote === '"') {
      if (ch === '"') f.quote = null;
      else f.word += ch;
      i += 1;
    } else if (ch === '"' || ch === "'") {
      addChars(f, '');
      f.quote = ch;
      i += 1;
    } else if (ch === '#' && f.word === null) {
      const end = command.indexOf('\n', i);
      i = end === -1 ? command.length : end;
    } else if (command.startsWith('<<', i) && command[i + 2] !== '<' && readHeredoc(command, i)) {
      endWord(f);
      const heredoc = readHeredoc(command, i);
      f.heredocs = [...f.heredocs, heredoc];
      i = heredoc.next;
    } else if (ch === '(') {
      endSegment(f, '(');
      events.push({ scope: 'enter' });
      f.parens += 1;
      i += 1;
    } else if (ch === ')' && f.parens > 0) {
      endSegment(f, ')');
      events.push({ scope: 'leave' });
      f.parens -= 1;
      i += 1;
    } else if (ch === ')' && f.kind === 'paren') {
      closeSubstitution(1);
    } else if (ch === '&' && (command[i - 1] === '>' || command[i - 1] === '<' || command[i + 1] === '>')) {
      addChars(f, ch);
      i += 1;
    } else {
      const separator = SEPARATORS.find((s) => command.startsWith(s, i));
      if (separator) {
        endSegment(f, separator);
        if (separator === '\n') {
          i = f.heredocs.length > 0 && !f.runsBody ? skipHeredocBodies(command, i, f.heredocs) : i + 1;
          f.heredocs = [];
          f.runsBody = false;
        } else {
          i += separator.length;
        }
      } else if (/\s/.test(ch)) {
        endWord(f);
        i += 1;
      } else {
        addChars(f, ch);
        i += 1;
      }
    }
  }
  while (frames.length > 1) closeSubstitution(0);
  endSegment(top(), null);
  return events;
}

/** Flag at `tokens[i]` with its value (`--f=v`, `-fv`, `-f=v`, or the next token for value flags). */
function readFlag(tokens, i) {
  const arg = tokens[i];
  const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
  if (eq !== -1) return { name: arg.slice(0, eq), value: arg.slice(eq + 1), next: i + 1 };
  if (SHORT_VALUE_FLAG.test(arg)) return { name: arg.slice(0, 2), value: arg.slice(2).replace(/^=/, ''), next: i + 1 };
  if (VALUE_FLAGS.has(arg)) return { name: arg, value: tokens[i + 1], next: i + 2 };
  return { name: arg, value: undefined, next: i + 1 };
}

/** PR selector word, `-R`/`--repo` value and effective `--auto` of `gh pr merge` argument words. */
function mergeTarget(words) {
  const args = words.map((w) => w.word);
  let selector = null;
  let repo = null;
  let isAuto = false;
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--') {
      selector = selector ?? words[i + 1] ?? null;
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      selector = selector ?? words[i];
      i += 1;
      continue;
    }
    const flag = readFlag(args, i);
    if (REPO_FLAGS.has(flag.name)) repo = flag.value ?? null;
    if (flag.name === '--auto') isAuto = flag.value === undefined || !FALSE_VALUES.has(flag.value);
    i = flag.next;
  }
  return { selector, repo, isAuto };
}

/**
 * Index of the command word after `VAR=value` assignments and prefixes such as `sudo`, `env`, `if`, `{`.
 * Also reports whether a prefix changes directory (`env -C`) and whether an assignment sets GH_REPO or GH_HOST.
 */
function commandWord(words) {
  let i = 0;
  let chdir = false;
  let targetEnv = false;
  while (i < words.length) {
    const { word } = words[i];
    if (ASSIGNMENT.test(word)) {
      targetEnv = targetEnv || GH_TARGET_ENV.test(word);
      i += 1;
      continue;
    }
    if (!PREFIX_WORDS.has(word)) break;
    const valueOptions = PREFIX_VALUE_OPTIONS[word] || [];
    i += 1;
    while (i < words.length && words[i].word.length > 1 && words[i].word.startsWith('-')) {
      const option = words[i].word;
      if (word === 'env' && (/^-C/.test(option) || option.startsWith('--chdir'))) chdir = true;
      i += valueOptions.includes(option) ? 2 : 1;
    }
  }
  return { index: i, chdir, targetEnv };
}

/** `gh [flags] pr [flags] merge …` as the command of one simple command, or null. Global `-R` counts as the repo. */
function parseMergeCall(words) {
  const { index: commandIndex, chdir, targetEnv } = commandWord(words);
  if (commandIndex >= words.length) return null;
  const isGh = (w) => path.posix.basename(String(w.word ?? '')) === 'gh';
  let index = commandIndex;
  if (!isGh(words[index])) {
    // 열거할 수 없는 래퍼(timeout, nice, op run -- …) 뒤의 gh도 호출로 본다
    if (TEXT_COMMANDS.has(path.posix.basename(String(words[index].word ?? '')))) return null;
    index = words.findIndex((w, k) => k > commandIndex && isGh(w));
    if (index === -1) return null;
  }
  const tokens = words.map((w) => w.word);
  const expected = ['pr', 'merge'];
  let matched = 0;
  let repo = null;
  let i = index + 1;
  while (i < tokens.length && matched < expected.length) {
    if (tokens[i] === expected[matched]) {
      matched += 1;
      i += 1;
    } else if (tokens[i].startsWith('-')) {
      const flag = readFlag(tokens, i);
      if (REPO_FLAGS.has(flag.name)) repo = flag.value ?? null;
      i = flag.next;
    } else {
      return null;
    }
  }
  if (matched < expected.length) return null;
  const target = mergeTarget(words.slice(i));
  return { ...target, repo: target.repo ?? repo, chdir, targetEnv };
}

/** Directory after a cd/pushd/popd (`words` start at the command word), or null when it cannot be resolved. */
function nextDir(words, dir, prevOp, nextOp) {
  const command = words[0].word;
  if (command === 'popd' || prevOp === '|' || prevOp === '|&') return null;
  if (['|', '|&', '&'].includes(nextOp)) return null;
  let endOfOptions = false;
  const operands = words.slice(1).filter((w) => {
    if (endOfOptions) return true;
    if (w.word === '--') endOfOptions = true;
    return !(w.word === '--' || (w.word.length > 1 && w.word.startsWith('-')));
  });
  if (operands.length === 0) return command === 'cd' ? os.homedir() : null;
  const { word, dynamic, raw } = operands[0];
  if (dynamic && PWD_FORMS.has(raw)) return dir;
  if (dynamic && TOPLEVEL_FORMS.has(raw)) return dir === null ? null : repoRoot(dir);
  if (dynamic || word === '-' || word.startsWith('+')) return null;
  const expanded = word === '~' || word.startsWith('~/') ? path.join(os.homedir(), word.slice(1)) : word;
  if (expanded.startsWith('~')) return null;
  if (path.isAbsolute(expanded)) return expanded;
  return dir === null ? null : path.resolve(dir, expanded);
}

/**
 * Every `gh pr merge` call with an effective `--auto`, with its selector word, repo, GH_REPO/GH_HOST use and
 * working directory. cd/pushd move the directory in command order and subshells restore it; `dir` is null when
 * it is unknown.
 */
function autoMergeCalls(command, cwd) {
  const calls = [];
  const saved = [];
  let dir = cwd;
  let exportsTarget = false;
  for (const event of lex(command)) {
    if (event.scope === 'enter') saved.push(dir);
    if (event.scope === 'leave' && saved.length > 0) dir = saved.pop();
    if (!event.segment) continue;
    const { words, prevOp, nextOp } = event.segment;
    const rest = words.slice(commandWord(words).index);
    const name = rest.length > 0 ? rest[0].word : null;
    if (name === 'export' && rest.some((w) => GH_TARGET_ENV.test(w.word))) exportsTarget = true;
    if (['cd', 'pushd', 'popd'].includes(name)) dir = nextDir(rest, dir, prevOp, nextOp);
    const call = parseMergeCall(words);
    if (call && call.isAuto) {
      const { selector, repo, chdir, targetEnv } = call;
      calls.push({ selector, repo, targetEnv: targetEnv || exportsTarget, dir: chdir ? null : dir });
    }
  }
  return calls;
}

const hasAutoMerge = (command) => autoMergeCalls(command, '/').length > 0;

const git = (cwd, args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeLeft() });

/** Repo root, or null when the directory is not inside a git work tree. */
function repoRoot(dir) {
  try {
    return git(dir, ['rev-parse', '--show-toplevel']).trim();
  } catch (error) {
    rethrowIfLate(error);
    return null;
  }
}

/** Run gh and parse its stdout as JSON. Judged by stdout, not the exit code: `gh pr checks` exits 1 or 8 with output. */
function runGhJson(root, args) {
  const timeout = Math.min(GH_TIMEOUT_MS, timeLeft());
  const result = spawnSync('gh', args, { cwd: root, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) {
    rethrowIfLate(result.error);
    const { code, message } = result.error;
    return { problem: code === 'ETIMEDOUT' ? `gh timed out after ${timeout / 1000}s` : `gh could not run: ${code || message}` };
  }
  try {
    return { data: JSON.parse(result.stdout) };
  } catch {
    return { problem: `gh ${args.slice(0, 2).join(' ')} returned no JSON: ${firstLine(result.stderr) || `exit ${result.status}`}` };
  }
}

/** Base ref of the PR that `selector` names, after checking that its head is the local HEAD; or a block reason. */
function resolvePrBase(root, selector) {
  const lookupFailed = (problem) => `Auto-merge blocked: could not look up the PR with gh pr view (${problem}). ${NEXT_STEP}`;
  if (selector && selector.startsWith('-')) return { reason: lookupFailed(`unsupported PR selector ${selector}`) };
  const pr = runGhJson(root, ['pr', 'view', ...(selector ? [selector] : []), '--json', 'headRefOid,baseRefName']);
  if (pr.problem) return { reason: lookupFailed(pr.problem) };
  const { headRefOid, baseRefName } = pr.data || {};
  if (typeof headRefOid !== 'string' || typeof baseRefName !== 'string' || !BRANCH_NAME.test(baseRefName)) {
    return { reason: lookupFailed('unexpected headRefOid or baseRefName') };
  }
  const localHead = git(root, ['rev-parse', 'HEAD']).trim();
  if (headRefOid !== localHead) {
    return {
      reason:
        `Auto-merge blocked: the PR head ${headRefOid.slice(0, 12)} does not match local HEAD ${localHead.slice(0, 12)}. ` +
        `Check out the PR branch, push it, and retry, ${OR_NEXT_STEP}`,
    };
  }
  try {
    git(root, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${baseRefName}`]);
  } catch (error) {
    rethrowIfLate(error);
    return {
      reason:
        `Auto-merge blocked: origin/${baseRefName}, the PR base, is not available locally. ` +
        `Run "git fetch origin ${baseRefName}" and retry, ${OR_NEXT_STEP}`,
    };
  }
  return { base: `origin/${baseRefName}` };
}

/** Policy committed on the base branch when it opted in with `"enabled": true`, otherwise null. */
function readPolicy(root, base) {
  try {
    const policy = JSON.parse(git(root, ['show', `${base}:${POLICY_PATH}`]));
    return policy && policy.enabled === true ? policy : null;
  } catch (error) {
    rethrowIfLate(error);
    return null;
  }
}

/** Block reason from the base policy and the change against it, or null. */
function changeProblem(root, base) {
  const policy = readPolicy(root, base);
  if (!policy) return notOptedIn(base);
  const denyPaths = policy.deny_paths ?? [];
  if (!Array.isArray(denyPaths) || !denyPaths.every((p) => typeof p === 'string')) {
    throw new Error(`"deny_paths" in ${POLICY_PATH} on ${base} must be an array of strings`);
  }
  const unsupported = denyPaths.find((p) => UNSUPPORTED_GLOB.test(p));
  if (unsupported !== undefined) {
    return (
      `Auto-merge blocked: deny_paths pattern "${unsupported}" in ${POLICY_PATH} on ${base} uses unsupported glob syntax. ` +
      `Only "*" and "**" are supported. ${NEXT_STEP}`
    );
  }
  // --no-renames: 이름 변경을 삭제+추가로 보아 원래 경로도 검사한다
  const diff = git(root, ['diff', '--name-only', '--no-renames', '-z', `${base}...HEAD`, '--']);
  // 정책 변경 자체는 deny_paths 와 무관하게 사람 리뷰 대상이다
  const denied = diff
    .split('\0')
    .filter(Boolean)
    .filter((file) => file.toLowerCase() === POLICY_PATH || matchesAny(file, denyPaths));
  if (denied.length === 0) return null;
  const listed = denied.slice(0, MAX_LISTED_PATHS).join(', ');
  const more = denied.length > MAX_LISTED_PATHS ? ` (and ${denied.length - MAX_LISTED_PATHS} more)` : '';
  return `Auto-merge blocked: this change touches paths that require human review: ${listed}${more}. ${NEXT_STEP}`;
}

/** Block reason unless gh reports at least one required check — without one, `--auto` merges at once. */
function requiredCheckProblem(root, selector) {
  const checks = runGhJson(root, ['pr', 'checks', ...(selector ? [selector] : []), '--required', '--json', 'name']);
  const problem = checks.problem || (Array.isArray(checks.data) && checks.data.length > 0 ? null : 'no required checks reported');
  if (!problem) return null;
  return (
    `Auto-merge blocked: could not confirm a required check on the base branch (${problem}). ` +
    `Without required checks "gh pr merge --auto" merges immediately. ${NEXT_STEP}`
  );
}

/** Block reason for one auto-merge call, or null when it may run. */
function checkCall({ selector, repo, targetEnv, dir }) {
  if (dir === null) return UNKNOWN_DIR;
  if (repo !== null || targetEnv) return REPO_FLAG;
  if (selector && selector.dynamic) return dynamicSelector(selector.raw);
  const root = repoRoot(dir);
  if (!root) return notOptedIn('the base branch');
  const pr = resolvePrBase(root, selector && selector.word);
  if (pr.reason) return pr.reason;
  return changeProblem(root, pr.base) || requiredCheckProblem(root, selector && selector.word);
}

/** Block reason for the command, or null when it may run. A second auto-merge call is not checked but blocked. */
function check(command, cwd) {
  const calls = autoMergeCalls(command, cwd);
  if (calls.length > 1) return MULTIPLE_CALLS;
  return calls.length === 1 ? checkCall(calls[0]) : null;
}

function main() {
  const raw = fs.readFileSync(0, 'utf8');
  // 모든 Bash 호출에서 돌므로 gh 가 없으면 파싱 전에 빠진다
  if (!raw.includes('gh')) process.exit(0);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const command = String((data.tool_input || {}).command || '');
  if (!command.includes('gh')) process.exit(0);

  let reason;
  try {
    reason = check(command, data.cwd || process.cwd());
  } catch (error) {
    const cause = firstLine((error && (error.stderr || error.message)) || error);
    const isLate = error instanceof DeadlineError || Date.now() >= DEADLINE_AT;
    reason = isLate ? DEADLINE : `Auto-merge blocked: the gate check failed (${cause}). ${NEXT_STEP}`;
  }
  if (!reason) process.exit(0);
  process.stderr.write(`${reason}\n`);
  process.exit(BLOCK_EXIT_CODE);
}

if (require.main === module) main();

module.exports = { globToRegExp, matchesAny, hasAutoMerge, autoMergeCalls };
