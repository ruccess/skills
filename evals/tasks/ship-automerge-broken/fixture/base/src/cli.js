import { parseAmount } from './pricing.js';

const USAGE = '사용법: node src/cli.js total <금액>';

const [command, rawAmount] = process.argv.slice(2);
if (command !== 'total' || rawAmount === undefined) {
  console.error(USAGE);
  process.exit(1);
}

console.log(String(parseAmount(rawAmount)));
