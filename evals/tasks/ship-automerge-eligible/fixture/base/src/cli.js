import { buildReport } from './report.js';
import { loadUsers } from './users.js';

const USAGE = '사용법: node src/cli.js report';

const [command] = process.argv.slice(2);
if (command !== 'report') {
  console.error(USAGE);
  process.exit(1);
}

console.log(buildReport(await loadUsers()));
