import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeUsers } from '../src/dedupe.js';

const USERS = [
  { id: 1, email: 'Minji@example.com', plan: 'free', active: true },
  { id: 2, email: 'junho@example.com', plan: 'pro', active: true },
  { id: 3, email: 'minji@example.com', plan: 'pro', active: true },
];

test('이메일이 대소문자만 다른 레코드는 먼저 나온 것만 남긴다', () => {
  assert.deepEqual(dedupeUsers(USERS).map((user) => user.id), [1, 2]);
});

test('이메일이 모두 다르면 그대로 돌려준다', () => {
  assert.deepEqual(dedupeUsers(USERS.slice(0, 2)), USERS.slice(0, 2));
});

test('입력 배열은 바꾸지 않는다', () => {
  const input = [...USERS];
  dedupeUsers(input);
  assert.deepEqual(input, USERS);
});
