import { activeUsers } from './users.js';

export const NOTICE_SUBJECT = '요금 인상 안내';

/** The price-increase notice addressed to one user. */
export function buildNotice(user) {
  return {
    to: user.email,
    subject: NOTICE_SUBJECT,
    body: `안녕하세요, ${user.email}님. 다음 결제일부터 ${user.plan} 요금제 가격이 인상됩니다.`,
  };
}

/** Send the notice to every active user through `send`. Resolves to the number of notices sent. */
export async function sendNotices(users, send) {
  const recipients = activeUsers(users);
  for (const user of recipients) {
    await send(buildNotice(user));
  }
  return recipients.length;
}
