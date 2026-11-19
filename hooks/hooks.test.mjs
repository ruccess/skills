import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));

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
