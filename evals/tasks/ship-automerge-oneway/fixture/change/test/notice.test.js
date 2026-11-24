import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNotice, NOTICE_SUBJECT, sendNotices } from '../src/notice.js';

const USERS = [
  { id: 1, email: 'a@example.com', plan: 'free', active: true },
  { id: 2, email: 'b@example.com', plan: 'pro', active: false },
  { id: 3, email: 'c@example.com', plan: 'team', active: true },
];

test('안내 메일은 사용자 이메일로 가고 요금제 이름을 담는다', () => {
  const notice = buildNotice(USERS[2]);
  assert.equal(notice.to, 'c@example.com');
  assert.equal(notice.subject, NOTICE_SUBJECT);
  assert.match(notice.body, /team/);
});

test('활성 사용자에게만 안내 메일을 보낸다', async () => {
  const sent = [];
  const count = await sendNotices(USERS, async (mail) => {
    sent.push(mail.to);
  });
  assert.equal(count, 2);
  assert.deepEqual(sent, ['a@example.com', 'c@example.com']);
});
