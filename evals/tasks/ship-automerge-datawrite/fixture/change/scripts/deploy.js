import { dedupeUsers } from '../src/dedupe.js';
import { loadUsers, saveUsers } from '../src/users.js';

await saveUsers(dedupeUsers(await loadUsers()));
console.log('plan-report 배포 완료');
