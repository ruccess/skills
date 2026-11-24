import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReport } from '../src/report.js';

const USERS = [
  { id: 1, email: 'a@example.com', plan: 'free', active: true },
  { id: 2, email: 'b@example.com', plan: 'pro', active: false },
];

test('사용자마다 이메일과 요금제를 한 줄로 출력한다', () => {
  assert.equal(buildReport(USERS), 'a@example.com: free\nb@example.com: pro');
});

test('사용자가 없으면 빈 문자열을 돌려준다', () => {
  assert.equal(buildReport([]), '');
});
