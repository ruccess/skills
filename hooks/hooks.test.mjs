import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));
const gate = createRequire(import.meta.url)('./automerge-gate.js');

/** Run a hook script with a JSON payload on stdin and return its parsed stdout, or null when silent. */
function runHook(script, payload) {
  const proc = spawnSync(process.execPath, [join(HOOKS_DIR, script)], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
  });
  assert.equal(proc.status, 0, proc.stderr);
  return proc.stdout.trim() ? JSON.parse(proc.stdout) : null;
}

/** A session id no real session uses, with its debounce markers removed before and after. */
function session(t, prefix) {
  const id = `hooks-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
  const marker = join(tmpdir(), `${prefix}-${id}`);
  const clear = () => existsSync(marker) && rmSync(marker);
  clear();
  t.after(clear);
  return id;
}

test('chat reminder fires once per session for a Korean prompt', (t) => {
  const id = session(t, 'korean-chat-reminder');
  const first = runHook('korean-chat-reminder.js', { session_id: id, prompt: '캐시가 뭐예요?' });
  assert.equal(first.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(first.hookSpecificOutput.additionalContext, /korean-chat/);
  assert.equal(runHook('korean-chat-reminder.js', { session_id: id, prompt: '하나 더 물어볼게요' }), null);
});

test('chat reminder stays silent for a prompt without Hangul or with broken input', (t) => {
  const id = session(t, 'korean-chat-reminder');
  assert.equal(runHook('korean-chat-reminder.js', { session_id: id, prompt: 'what is a cache?' }), null);
  assert.equal(runHook('korean-chat-reminder.js', 'not json'), null);
});

test('document reminder fires for Korean prose in a document file and debounces', (t) => {
  const id = session(t, 'korean-writing-reminder');
  const payload = { session_id: id, tool_input: { file_path: '/repo/docs/plan.md', content: '계획 문서다.' } };
  const first = runHook('korean-writing-reminder.js', payload);
  assert.equal(first.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(first.hookSpecificOutput.additionalContext, /korean-docs/);
  assert.equal(runHook('korean-writing-reminder.js', payload), null);
});

test('document reminder ignores code files, settings paths, and non-Korean text', (t) => {
  const id = session(t, 'korean-writing-reminder');
  const silent = [
    { file_path: '/repo/src/total.test.ts', new_string: "it('할인율 0% 주문', () => {})" },
    { file_path: '/home/u/.claude/notes.md', content: '설정 메모' },
    { file_path: '/repo/memory/fact.md', content: '기억' },
    { file_path: '/repo/README.md', content: 'English only' },
  ];
  for (const toolInput of silent) {
    assert.equal(runHook('korean-writing-reminder.js', { session_id: id, tool_input: toolInput }), null, toolInput.file_path);
  }
});

/** Run the auto-merge gate for a Bash command and return its exit status and stderr. */
function runGate(command, cwd, env = {}) {
  const proc = spawnSync(process.execPath, [join(HOOKS_DIR, 'automerge-gate.js')], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd }),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: proc.status, stderr: proc.stderr };
}

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'hooks-test',
  GIT_AUTHOR_EMAIL: 'hooks-test@example.com',
  GIT_COMMITTER_NAME: 'hooks-test',
  GIT_COMMITTER_EMAIL: 'hooks-test@example.com',
};

function git(cwd, ...args) {
  const proc = spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  assert.equal(proc.status, 0, proc.stderr);
  return proc.stdout;
}

/** A throwaway directory removed after the test. */
function tempDir(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'automerge-gate-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Write and commit files; nothing to commit is a no-op. */
function commitFiles(root, files) {
  if (Object.keys(files).length === 0) return;
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'change');
}

/**
 * A git repo whose main commits `base` files, checked out on a feature branch that commits `feature` files.
 * With `remote`, refs/remotes/origin/main points at main, the PR base the fake gh reports by default.
 */
function makeRepo(t, { base = {}, feature = {}, remote = true } = {}) {
  const root = tempDir(t);
  git(root, 'init', '--quiet', '-b', 'main');
  commitFiles(root, { 'README.md': 'base\n', ...base });
  if (remote) git(root, 'update-ref', 'refs/remotes/origin/main', 'main');
  git(root, 'checkout', '--quiet', '-b', 'feature');
  commitFiles(root, feature);
  return root;
}

/** Files entry for a policy object or raw policy text. */
const policyFile = (policy) => ({
  '.ruccess/automerge.json': typeof policy === 'string' ? policy : JSON.stringify(policy),
});

const OPTED_IN = { enabled: true, method: 'squash', deny_paths: ['migrations/**', 'src/auth/'] };
const REQUIRED = '[{"name":"test"}]';

/**
 * Env with a fake `gh` first on PATH. `gh pr view` prints `view` (default: the repo's HEAD with base main);
 * `gh pr checks` prints `stdout`/`stderr` and exits with `exit`. `argv('view' | 'checks')` returns what it received.
 */
function fakeGh(t, root, { view, viewExit = 0, stdout = REQUIRED, stderr = '', exit = 0, sleep = 0 } = {}) {
  const bin = tempDir(t);
  const record = join(bin, 'argv');
  writeFileSync(
    join(bin, 'gh'),
    [
      '#!/bin/sh',
      // exec: 타임아웃이 보낸 신호를 sleep 이 직접 받게 해 파이프가 늦게 닫히지 않게 한다
      'if [ "$FAKE_GH_SLEEP" != 0 ]; then exec sleep "$FAKE_GH_SLEEP"; fi',
      'printf \'%s\\n\' "$@" > "$FAKE_GH_ARGV.$2"',
      'if [ "$2" = view ]; then printf \'%s\' "$FAKE_GH_VIEW"; exit "$FAKE_GH_VIEW_EXIT"; fi',
      'printf \'%s\' "$FAKE_GH_STDOUT"',
      'printf \'%s\' "$FAKE_GH_STDERR" >&2',
      'exit "$FAKE_GH_EXIT"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  const head = root ? git(root, 'rev-parse', 'HEAD').trim() : '0';
  const env = {
    PATH: `${bin}${delimiter}${process.env.PATH}`,
    FAKE_GH_ARGV: record,
    FAKE_GH_VIEW: view ?? JSON.stringify({ headRefOid: head, baseRefName: 'main' }),
    FAKE_GH_VIEW_EXIT: String(viewExit),
    FAKE_GH_STDOUT: stdout,
    FAKE_GH_STDERR: stderr,
    FAKE_GH_EXIT: String(exit),
    FAKE_GH_SLEEP: String(sleep),
  };
  const argv = (sub) => readFileSync(`${record}.${sub}`, 'utf8').trim().split('\n');
  return { env, argv };
}

const calls = (command, cwd = '/cwd') => gate.autoMergeCalls(command, cwd);

// 이 명령 문구를 인자·본문에 담았을 뿐인 평범한 명령. 막으면 안 된다
const PLAIN_COMMANDS = [
  `git commit -m "$(cat <<'EOF'\nfeat: docs\n\nMention gh pr merge --auto in README\nEOF\n)"`,
  `gh pr create --draft --title t --body "$(cat <<'EOF'\n- gh pr merge --auto is gated\nEOF\n)"`,
  'echo gh pr merge --auto',
  'grep -rn gh pr merge --auto docs',
];

test('glob: gitignore-like matching with ** spanning zero or more directories', () => {
  const cases = [
    ['migrations/001.sql', 'migrations/**', true],
    ['migrations/a/b/002.sql', 'migrations/**', true],
    ['db/migrations/001.sql', 'migrations/**', false],
    ['src/a/b/auth.ts', 'src/**/auth.ts', true],
    ['src/auth.ts', 'src/**/auth.ts', true],
    ['auth.ts', '**/auth.ts', true],
    ['config/app.json', 'config/*.json', true],
    ['config/env/app.json', 'config/*.json', false],
    ['config/appXjson', 'config/*.json', false],
    ['src/auth/token.ts', 'src/auth/', true],
    ['src/auth/deep/token.ts', 'src/auth/', true],
    ['src/authz.ts', 'src/auth/', false],
    ['db/x.sql', '*.sql', true],
    ['migrations/x.sql', 'migrations', true],
    ['db/migrations/x.sql', 'migrations', true],
    ['src/auth', 'src/auth', true],
    ['src/auth/x.ts', 'src/auth', true],
    ['src/authz.ts', 'src/auth', false],
    ['src/auth/a.ts', './src/auth/', true],
    ['migrations/a.sql', '/migrations/**', true],
    ['Migrations/001.SQL', 'migrations/**', true],
    ['migrations/a\nb.sql', 'migrations/**', true],
    ['src/x\n/auth.ts', 'src/**/auth.ts', true],
  ];
  for (const [file, pattern, expected] of cases) {
    assert.equal(gate.matchesAny(file, [pattern]), expected, `${pattern} vs ${file}`);
  }
  assert.ok(!gate.matchesAny('README.md', []));
});

test('command parsing finds every gh pr merge call that carries --auto', () => {
  const auto = [
    'gh pr merge --auto --squash',
    'cd /x && gh pr merge 3 --auto',
    'git push\ngh pr merge 3 --auto --squash',
    'git push; gh pr merge --squash --auto',
    'git push && gh pr merge "12" --auto=true',
    '/opt/homebrew/bin/gh pr merge --auto',
    'gh -R o/r pr merge --auto',
    'gh --repo o/r pr merge 3 --auto',
    '(gh pr merge --auto)',
    'echo $(gh pr merge --auto)',
    'echo `gh pr merge --auto`',
    'echo "$(gh pr merge --auto)"',
    'gh pr merge --auto=1',
    'gh pr merge --auto=yes',
    'echo "a # b" && gh pr merge --auto',
    'echo x#y; gh pr merge --auto',
    'bash <<EOF\ngh pr merge --auto\nEOF',
    'cat <<EOF | sh\ngh pr merge --auto\nEOF',
    'cat <<EOF\nx\nEOF\ngh pr merge --auto',
    'echo $((1<<2))\ngh pr merge --auto',
    'gh pr merge $(echo 3) --auto',
    'gh pr merge "$(git branch --show-current)" --auto --squash',
    'gh pr merge `echo 3` --auto',
    'gh pr merge 3 --body "$(cat msg.txt)" --auto',
    'gh pr merge 3 -t "$(git log -1 --format=%s)" --squash --auto',
    'xargs gh pr merge --auto',
    'timeout 60 gh pr merge --auto',
    'timeout -k 5 30 gh pr merge --auto',
    'nice -n 5 gh pr merge --auto',
    'op run -- gh pr merge --auto',
    'npx gh pr merge --auto',
    'xargs -I {} gh pr merge {} --auto',
    'sudo -u me gh pr merge --auto',
    'GH_DEBUG=1 gh pr merge --auto',
    'if true; then gh pr merge --auto; fi',
  ];
  const manual = [
    'gh pr merge 12 --squash',
    'gh pr merge 12 --squash && echo --auto',
    'gh pr merge 12 --squash; gh pr create --fill --auto',
    'gh pr merge 12 --squash | grep --auto',
    'gh pr view 3 --auto',
    'ls -la',
    'gh pr merge -- --auto',
    'gh pr merge --auto=false',
    'gh pr merge --auto=0',
    'gh pr merge --auto=F',
    'gh pr merge --auto=False',
    'gh pr merge 3 --auto --auto=false',
    '# gh pr merge --auto',
    'git commit -m x # gh pr merge --auto',
    'cat <<EOF\ngh pr merge --auto\nEOF',
    "cat <<-'EOF' > notes.md\n\tgh pr merge --auto\n\tEOF\ngh pr merge 3 --squash",
    'gh pr create --body-file - <<"END"\nrun gh pr merge --auto later\nEND',
    ...PLAIN_COMMANDS,
  ];
  for (const command of auto) assert.ok(gate.hasAutoMerge(command), command);
  for (const command of manual) assert.ok(!gate.hasAutoMerge(command), command);
});

test('command parsing tracks the directory and the PR target of each call', () => {
  assert.equal(calls('cd "/a b" && gh pr merge --auto')[0].dir, '/a b');
  assert.equal(calls("cd 'sub' && gh pr merge --auto")[0].dir, '/cwd/sub');
  assert.equal(calls('gh pr merge --auto')[0].dir, '/cwd');
  assert.equal(calls('(cd /bad) && gh pr merge --auto')[0].dir, '/cwd');
  assert.equal(calls('cd /bad || gh pr merge --auto')[0].dir, '/bad');
  assert.equal(calls('pushd /bad && gh pr merge --auto')[0].dir, '/bad');
  assert.equal(calls('cd /a\ncd b\ngh pr merge --auto')[0].dir, '/a/b');
  assert.equal(calls('cd "$PWD" && gh pr merge --auto')[0].dir, '/cwd');
  assert.equal(calls('cd /x && gh pr merge $(cd /bad; echo 3) --auto')[0].dir, '/x');
  for (const command of [
    '{ cd /bad; gh pr merge --auto; }',
    'if cd /bad; then gh pr merge --auto; fi',
    '! cd /bad; gh pr merge --auto',
    'command cd /bad && gh pr merge --auto',
    'builtin cd /bad && gh pr merge --auto',
  ]) {
    assert.equal(calls(command)[0].dir, '/bad', command);
  }
  for (const command of [
    'cd - && gh pr merge --auto',
    'cd $HOME/x && gh pr merge --auto',
    'cd "$(pwd)/x" && gh pr merge --auto',
    'cd `pwd` && gh pr merge --auto',
    'cd /x | gh pr merge --auto',
    'popd && gh pr merge --auto',
    'env -C /x gh pr merge --auto',
  ]) {
    assert.equal(calls(command)[0].dir, null, command);
  }
  assert.equal(calls('gh pr merge 1 --auto; cd /bad; gh pr merge 2 --auto').length, 2);
  assert.equal(calls('GH_REPO=o/r gh pr merge --auto')[0].targetEnv, true);
  assert.equal(calls('export GH_HOST=example.com; gh pr merge --auto')[0].targetEnv, true);
  assert.equal(calls('env GH_REPO=o/r gh pr merge --auto')[0].targetEnv, true);
  assert.equal(calls('GH_DEBUG=1 gh pr merge --auto')[0].targetEnv, false);

  const target = (command) => {
    const { selector, repo } = calls(command)[0];
    return { selector: selector && selector.word, repo };
  };
  assert.equal(calls('gh pr merge $(echo 3) --auto')[0].selector.dynamic, true);
  assert.equal(calls('gh pr merge 3 --body "$(cat m)" --auto')[0].selector.dynamic, false);
  assert.deepEqual(target('gh pr merge --auto -t "a b" --body=c -F f.md -A me@x -R o/r feat'), { selector: 'feat', repo: 'o/r' });
  assert.deepEqual(target('gh pr merge --auto --repo=o/r --match-head-commit abc'), { selector: null, repo: 'o/r' });
  assert.deepEqual(target("gh pr merge --auto -bbody -Ro/r 'https://x/pull/7'"), { selector: 'https://x/pull/7', repo: 'o/r' });
  assert.deepEqual(target('gh pr merge --auto --body "a; b" 9'), { selector: '9', repo: null });
  assert.deepEqual(target('gh pr merge --auto -R=o/r'), { selector: null, repo: 'o/r' });
  assert.deepEqual(target('gh -R o/r pr merge 5 --auto'), { selector: '5', repo: 'o/r' });
});

test('gate lets non-gh commands and merges without --auto through, even without a policy', (t) => {
  const root = makeRepo(t, { feature: { 'migrations/001.sql': 'x' } });
  for (const command of ['ls -la', 'gh pr merge 12 --squash', 'gh pr merge 12 --squash && echo --auto', ...PLAIN_COMMANDS]) {
    const { status, stderr } = runGate(command, root);
    assert.equal(status, 0, `${command}: ${stderr}`);
    assert.equal(stderr, '');
  }
});

test('gate blocks auto-merge when the base branch has not opted in', (t) => {
  const cases = [null, { enabled: false }, { enabled: 'true' }, '{ broken json'];
  for (const policy of cases) {
    const base = policy === null ? {} : policyFile(policy);
    const root = makeRepo(t, { base, feature: { 'src/app.js': 'x' } });
    const { status, stderr } = runGate('gh pr merge --auto --squash', root, fakeGh(t, root).env);
    assert.equal(status, 2, JSON.stringify(policy));
    assert.match(stderr, /has not opted in on origin\/main/);
    assert.match(stderr, /must already be merged into the base branch/);
    assert.match(stderr, /"enabled": true/);
  }
  const notRepo = runGate('gh pr merge --auto', tempDir(t));
  assert.equal(notRepo.status, 2);
  assert.match(notRepo.stderr, /has not opted in/);
});

test('gate ignores a policy that exists only on the feature branch or in the working tree', (t) => {
  const committed = makeRepo(t, { feature: { ...policyFile(OPTED_IN), 'src/app.js': 'x' } });
  const blocked = runGate('gh pr merge --auto', committed, fakeGh(t, committed).env);
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /has not opted in on origin\/main/);

  const uncommitted = makeRepo(t, { feature: { 'src/app.js': 'x' } });
  mkdirSync(join(uncommitted, '.ruccess'));
  writeFileSync(join(uncommitted, '.ruccess', 'automerge.json'), JSON.stringify(OPTED_IN));
  const stillBlocked = runGate('gh pr merge --auto', uncommitted, fakeGh(t, uncommitted).env);
  assert.equal(stillBlocked.status, 2);
  assert.match(stillBlocked.stderr, /has not opted in/);
});

test('gate blocks a change to the policy file itself even when deny_paths would allow it', (t) => {
  const root = makeRepo(t, {
    base: policyFile(OPTED_IN),
    feature: { ...policyFile({ ...OPTED_IN, deny_paths: [] }), 'migrations/001.sql': 'x' },
  });
  const { status, stderr } = runGate('gh pr merge --auto', root, fakeGh(t, root).env);
  assert.equal(status, 2);
  assert.match(stderr, /require human review: .*\.ruccess\/automerge\.json/);
  // 기준 브랜치의 deny_paths 가 적용된다 — feature 브랜치가 비운 목록이 아니다
  assert.match(stderr, /migrations\/001\.sql/);
});

test('gate sees renames and deletions of deny paths and of the policy file', (t) => {
  const base = { ...policyFile(OPTED_IN), 'migrations/001.sql': 'x' };
  const cases = [
    [['mv', 'migrations/001.sql', 'docs/001.sql'], /migrations\/001\.sql/],
    [['mv', '.ruccess/automerge.json', '.ruccess/old.json'], /\.ruccess\/automerge\.json/],
    [['rm', '--quiet', '.ruccess/automerge.json'], /\.ruccess\/automerge\.json/],
  ];
  for (const [gitArgs, path] of cases) {
    const root = makeRepo(t, { base });
    if (gitArgs[0] === 'mv') mkdirSync(dirname(join(root, gitArgs[2])), { recursive: true });
    git(root, ...gitArgs);
    git(root, 'commit', '--quiet', '-m', 'move');
    const { status, stderr } = runGate('gh pr merge --auto', root, fakeGh(t, root).env);
    assert.equal(status, 2, gitArgs.join(' '));
    assert.match(stderr, /require human review/);
    assert.match(stderr, path);
  }
});

test('gate blocks a base policy with unsupported glob syntax', (t) => {
  const root = makeRepo(t, {
    base: policyFile({ enabled: true, deny_paths: ['migrations/?.sql'] }),
    feature: { 'src/app.js': 'x' },
  });
  const { status, stderr } = runGate('gh pr merge --auto', root, fakeGh(t, root).env);
  assert.equal(status, 2);
  assert.match(stderr, /"migrations\/\?\.sql"/);
  assert.match(stderr, /Only "\*" and "\*\*" are supported/);
});

test('gate allows auto-merge when the base policy is on, no deny path changed, and checks are required', (t) => {
  const root = makeRepo(t, { base: policyFile(OPTED_IN), feature: { 'src/app.js': 'x', 'docs/auth.md': 'y' } });
  const gh = fakeGh(t, root);
  const { status, stderr } = runGate('gh pr merge 3 --auto --squash', root, gh.env);
  assert.equal(status, 0, stderr);
  assert.deepEqual(gh.argv('view'), ['pr', 'view', '3', '--json', 'headRefOid,baseRefName']);
  assert.deepEqual(gh.argv('checks'), ['pr', 'checks', '3', '--required', '--json', 'name']);
});

test('gate blocks auto-merge that touches a deny path and names it', (t) => {
  const root = makeRepo(t, {
    base: policyFile(OPTED_IN),
    feature: { 'migrations/001.sql': 'x', 'src/auth/token.ts': 'y', 'src/app.js': 'z' },
  });
  const { status, stderr } = runGate('git push && gh pr merge --auto', root, fakeGh(t, root).env);
  assert.equal(status, 2);
  assert.match(stderr, /require human review: .*migrations\/001\.sql/);
  assert.match(stderr, /src\/auth\/token\.ts/);
  assert.doesNotMatch(stderr, /src\/app\.js/);
  assert.match(stderr, /Leave the PR as a draft/);
});

test('gate judges the directory each merge call runs in, not just the hook cwd', (t) => {
  const elsewhere = tempDir(t);
  const risky = makeRepo(t, { base: policyFile(OPTED_IN), feature: { 'migrations/001.sql': 'x' } });
  const blocked = runGate(`cd "${risky}" && gh pr merge 3 --auto`, elsewhere, fakeGh(t, risky).env);
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /migrations\/001\.sql/);

  const safe = makeRepo(t, { base: policyFile(OPTED_IN), feature: { 'src/app.js': 'x' } });
  const env = fakeGh(t, safe).env;
  assert.equal(runGate(`cd ${safe} && gh pr merge 3 --auto`, elsewhere, env).status, 0);
  assert.equal(runGate(`(cd ${elsewhere}) && gh pr merge --auto`, safe, env).status, 0);

  const bad = tempDir(t);
  for (const command of [
    `cd ${bad}; gh pr merge --auto`,
    `git status && cd ${bad} && gh pr merge --auto`,
    `(cd ${bad} && gh pr merge --auto)`,
    `cd ${bad}\ngh pr merge --auto`,
    `cd ${bad} || gh pr merge --auto`,
    `pushd ${bad} && gh pr merge --auto`,
    `{ cd ${bad}; gh pr merge --auto; }`,
    `if cd ${bad}; then gh pr merge --auto; fi`,
    `! cd ${bad}; gh pr merge --auto`,
    `command cd ${bad} && gh pr merge --auto`,
  ]) {
    const { status, stderr } = runGate(command, safe, env);
    assert.equal(status, 2, command);
    assert.match(stderr, /has not opted in/, command);
  }
  for (const command of [
    'cd - && gh pr merge --auto',
    'cd "$(mktemp -d)" && gh pr merge --auto',
    'cd $TMPDIR && gh pr merge --auto',
    `env -C ${bad} gh pr merge --auto`,
  ]) {
    const { status, stderr } = runGate(command, safe, env);
    assert.equal(status, 2, command);
    assert.match(stderr, /could not tell which directory/, command);
    assert.match(stderr, /Use a literal path with cd/, command);
  }
});

test('gate resolves cd to the current repository root or $PWD', (t) => {
  const safe = makeRepo(t, { base: { ...policyFile(OPTED_IN), 'src/keep.txt': 'k' }, feature: { 'src/app.js': 'x' } });
  const env = fakeGh(t, safe).env;
  for (const [command, cwd] of [
    ['cd "$(git rev-parse --show-toplevel)" && gh pr merge --auto --squash', join(safe, 'src')],
    ['cd $(git rev-parse --show-toplevel) && gh pr merge --auto', safe],
    ['cd "$PWD" && gh pr merge --auto', safe],
  ]) {
    const { status, stderr } = runGate(command, cwd, env);
    assert.equal(status, 0, `${command}: ${stderr}`);
  }
});

test('gate blocks a PR selector computed at run time but allows dynamic flag values', (t) => {
  const bare = makeRepo(t, { feature: { 'src/app.js': 'x' } });
  const bareEnv = fakeGh(t, bare).env;
  for (const command of [
    'gh pr merge $(echo 3) --auto',
    'gh pr merge "$(git branch --show-current)" --auto --squash',
    'gh pr merge `echo 3` --auto',
  ]) {
    const { status, stderr } = runGate(command, bare, bareEnv);
    assert.equal(status, 2, command);
    assert.match(stderr, /computed at run time/, command);
    assert.match(stderr, /Write the PR number directly/, command);
  }
  for (const command of [
    'gh pr merge 3 --body "$(cat msg.txt)" --auto',
    'gh pr merge 3 -t "$(git log -1 --format=%s)" --squash --auto',
  ]) {
    const { status, stderr } = runGate(command, bare, bareEnv);
    assert.equal(status, 2, command);
    assert.match(stderr, /has not opted in/, command);
  }

  const safe = makeRepo(t, { base: policyFile(OPTED_IN), feature: { 'src/app.js': 'x' } });
  const allowed = runGate('gh pr merge 3 --body "$(cat msg.txt)" --auto', safe, fakeGh(t, safe).env);
  assert.equal(allowed.status, 0, allowed.stderr);
});

test('gate blocks more than one auto-merge call in a command, and stops at its deadline', (t) => {
  const safe = makeRepo(t, { base: policyFile(OPTED_IN), feature: { 'src/app.js': 'x' } });
  const multiple = runGate('gh pr merge 1 --auto && gh pr merge 2 --auto', safe, fakeGh(t, safe).env);
  assert.equal(multiple.status, 2);
  assert.match(multiple.stderr, /more than one/);
  assert.match(multiple.stderr, /one at a time/);

  const slow = { ...fakeGh(t, safe, { sleep: 3 }).env, RUCCESS_AUTOMERGE_DEADLINE_MS: '1000' };
  const started = Date.now();
  const late = runGate('gh pr merge --auto', safe, slow);
  assert.equal(late.status, 2);
  assert.match(late.stderr, /could not finish its checks within/);
  assert.ok(Date.now() - started < 2500, 'the gate gave up at its deadline');
});

test('gate blocks --repo, since the target repository cannot be inspected locally', (t) => {
  const root = makeRepo(t, { base: policyFile(OPTED_IN), feature: { 'src/app.js': 'x' } });
  const env = fakeGh(t, root).env;
  for (const command of [
    'gh -R o/r pr merge --auto',
    'gh pr merge 3 --auto --repo o/r',
    'GH_REPO=o/r gh pr merge --auto',
    'export GH_HOST=example.com; gh pr merge --auto',
    'env GH_REPO=o/r gh pr merge --auto',
  ]) {
    const { status, stderr } = runGate(command, root, env);
    assert.equal(status, 2, command);
    assert.match(stderr, /without --repo/);
  }
});

test('gate checks the PR that gh reports, not a guessed branch', (t) => {
  const root = makeRepo(t, { base: policyFile(OPTED_IN), feature: { 'src/app.js': 'x' } });

  const otherHead = runGate('gh pr merge --auto', root, fakeGh(t, root, { view: '{"headRefOid":"abc123","baseRefName":"main"}' }).env);
  assert.equal(otherHead.status, 2);
  assert.match(otherHead.stderr, /does not match local HEAD/);
  assert.match(otherHead.stderr, /Check out the PR branch, push it/);

  const head = git(root, 'rev-parse', 'HEAD').trim();
  const develop = JSON.stringify({ headRefOid: head, baseRefName: 'develop' });
  const noRef = runGate('gh pr merge --auto', root, fakeGh(t, root, { view: develop }).env);
  assert.equal(noRef.status, 2);
  assert.match(noRef.stderr, /git fetch origin develop/);

  git(root, 'update-ref', 'refs/remotes/origin/develop', 'main');
  const allowed = runGate('gh pr merge --auto', root, fakeGh(t, root, { view: develop }).env);
  assert.equal(allowed.status, 0, allowed.stderr);

  for (const gh of [{ view: '', viewExit: 1 }, { view: 'not json' }, { view: '{"headRefOid":1}' }]) {
    const { status, stderr } = runGate('gh pr merge --auto', root, fakeGh(t, root, gh).env);
    assert.equal(status, 2, JSON.stringify(gh));
    assert.match(stderr, /could not look up the PR with gh pr view/);
  }
});

test('gate requires at least one required check reported by gh, whatever its exit code', (t) => {
  const root = makeRepo(t, { base: policyFile(OPTED_IN), feature: { 'src/app.js': 'x' } });
  const pending = runGate('gh pr merge --auto', root, fakeGh(t, root, { exit: 8 }).env);
  assert.equal(pending.status, 0, pending.stderr);

  const blockedCases = [
    [{ stdout: '[]' }, /no required checks reported/],
    [{ stdout: '', stderr: 'no required checks reported\n', exit: 1 }, /returned no JSON: no required checks reported\)/],
    [{ stdout: 'not json' }, /returned no JSON/],
  ];
  for (const [output, reason] of blockedCases) {
    const { status, stderr } = runGate('gh pr merge --auto', root, fakeGh(t, root, output).env);
    assert.equal(status, 2, JSON.stringify(output));
    assert.match(stderr, /could not confirm a required check on the base branch/);
    assert.match(stderr, reason);
    assert.match(stderr, /merges immediately/);
  }
});

test('gate blocks when gh is not on PATH', (t) => {
  // gh 가 git 과 같은 디렉터리에 있을 수 있으므로 git 하나만 링크한 PATH 를 만든다
  const bin = tempDir(t);
  symlinkSync(spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim(), join(bin, 'git'));
  const root = makeRepo(t, { base: policyFile(OPTED_IN), feature: { 'src/app.js': 'x' } });
  const { status, stderr } = runGate('gh pr merge --auto', root, { PATH: bin });
  assert.equal(status, 2);
  assert.match(stderr, /gh could not run: ENOENT/);
});

test('gate passes the PR selector to gh, not values of other flags', (t) => {
  const root = makeRepo(t, { base: policyFile(OPTED_IN), feature: { 'src/app.js': 'x' } });
  const gh = fakeGh(t, root);
  const { status, stderr } = runGate('gh pr merge 12 --auto --squash -b "x 34"', root, gh.env);
  assert.equal(status, 0, stderr);
  for (const sub of ['view', 'checks']) {
    const argv = gh.argv(sub);
    assert.equal(argv[2], '12');
    assert.ok(!argv.includes('34') && !argv.includes('x 34'), argv.join(' '));
  }
});

test('gate fails closed when the base policy is malformed beyond opt-in', (t) => {
  const root = makeRepo(t, {
    base: policyFile({ enabled: true, deny_paths: 'migrations/**' }),
    feature: { 'src/app.js': 'x' },
  });
  const { status, stderr } = runGate('gh pr merge --auto', root, fakeGh(t, root).env);
  assert.equal(status, 2);
  assert.match(stderr, /gate check failed/);
});
