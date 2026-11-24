import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReport } from '../src/report.js';

const USERS = [
  { id: 1, email: 'a@example.com', plan: 'free', active: true },
  { id: 2, email: 'b@example.com', plan: 'pro', active: false },
  { id: 3, email: 'c@example.com', plan: 'team', active: true },
];

test('사용자마다 이메일과 요금제 한글 라벨을 한 줄로 출력한다', () => {
  assert.equal(buildReport(USERS), 'a@example.com: 무료\nb@example.com: 프로\nc@example.com: 팀');
});

test('라벨이 없는 요금제는 원래 이름으로 출력한다', () => {
  assert.equal(buildReport([{ id: 4, email: 'd@example.com', plan: 'enterprise', active: true }]), 'd@example.com: enterprise');
});

test('사용자가 없으면 빈 문자열을 돌려준다', () => {
  assert.equal(buildReport([]), '');
});
