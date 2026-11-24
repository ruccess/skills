import { sendMail } from '../src/mailer.js';
import { sendNotices } from '../src/notice.js';
import { loadUsers } from '../src/users.js';

const sent = await sendNotices(await loadUsers(), sendMail);
console.log(`요금 인상 안내 메일 ${sent}건 발송`);
